import { app, BrowserWindow, net } from 'electron'
import { launch, MinecraftFolder, Version } from '@xmcl/core'
import { open, readEntry, walkEntriesGenerator } from '@xmcl/unzip'
import {
  fetchJavaRuntimeManifest,
  getLoaderArtifactListFor,
  getVersionList,
  install,
  installDependencies,
  installFabric,
  installJavaRuntimeTask,
} from '@xmcl/installer'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getMinecraftAccessToken, getMinecraftAccount } from './auth.js'
import type { LauncherSettings } from './settings.js'

export type GameConfig = {
  minecraftVersion: string
  fabricLoaderVersion?: string
  serverHost: string
  serverPort: number
  modpackUrl?: string
  modpackVersion?: string
}

type GameStatus = {
  state: 'preparing' | 'running' | 'stopped' | 'error'
  phase: string
  progress?: number
  message?: string
}

let gameStarting = false
let gameRunning = false

function report(window: BrowserWindow, status: GameStatus) {
  if (!window.isDestroyed()) window.webContents.send('game:status', status)
}

function javaExecutable(runtimePath: string) {
  if (process.platform === 'win32') return path.join(runtimePath, 'bin', 'javaw.exe')
  return path.join(runtimePath, 'bin', 'java')
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

type ModrinthIndex = {
  files: Array<{
    path: string
    hashes?: { sha1?: string; sha512?: string }
    downloads: string[]
    env?: { client?: 'required' | 'optional' | 'unsupported' }
  }>
}

function safeRelativePath(input: string) {
  const normalized = input.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').includes('..')) throw new Error(`Chemin interdit dans le modpack : ${input}`)
  return normalized
}

async function downloadFile(urls: string[], destination: string, hashes?: { sha1?: string; sha512?: string }) {
  let lastError: unknown
  for (const url of urls) {
    try {
      const response = await net.fetch(url)
      if (!response.ok) throw new Error(`Téléchargement refusé (${response.status})`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const algorithm = hashes?.sha512 ? 'sha512' : hashes?.sha1 ? 'sha1' : undefined
      const expected = algorithm === 'sha512' ? hashes?.sha512 : hashes?.sha1
      if (algorithm && expected && createHash(algorithm).update(buffer).digest('hex') !== expected.toLowerCase()) {
        throw new Error('La somme de contrôle ne correspond pas.')
      }
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, buffer)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Impossible de télécharger ${destination}`)
}

async function syncModpack(window: BrowserWindow, gamePath: string, config: GameConfig) {
  if (!config.modpackUrl) return
  const markerPath = path.join(gamePath, '.cobblestar-modpack.json')
  const desiredVersion = config.modpackVersion || config.modpackUrl
  let previousFiles: string[] = []
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as { version?: string; files?: string[] }
    if (marker.version === desiredVersion) return
    previousFiles = Array.isArray(marker.files) ? marker.files : []
  } catch {
    // Première installation.
  }

  report(window, { state: 'preparing', phase: 'Téléchargement du modpack CobbleStar…', progress: 74 })
  const response = await net.fetch(config.modpackUrl)
  if (!response.ok) throw new Error(`Le modpack est inaccessible (${response.status}).`)
  const archivePath = path.join(gamePath, '.cobblestar-download.mrpack')
  await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()))

  // Supprime uniquement les fichiers que la précédente version du pack avait
  // elle-même installés. Les mondes, captures et réglages personnels restent intacts.
  for (const previousFile of previousFiles) {
    await fs.rm(path.join(gamePath, safeRelativePath(previousFile)), { force: true })
  }

  const zip = await open(archivePath, { lazyEntries: true })
  let index: ModrinthIndex | undefined
  const managedFiles: string[] = []
  try {
    for await (const entry of walkEntriesGenerator(zip)) {
      if (/\/$/.test(entry.fileName)) continue
      if (entry.fileName === 'modrinth.index.json') {
        index = JSON.parse((await readEntry(zip, entry)).toString('utf8')) as ModrinthIndex
        continue
      }
      const prefix = entry.fileName.startsWith('client-overrides/')
        ? 'client-overrides/'
        : entry.fileName.startsWith('overrides/') ? 'overrides/' : undefined
      if (!prefix) continue
      const relative = safeRelativePath(entry.fileName.slice(prefix.length))
      const target = path.join(gamePath, relative)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await readEntry(zip, entry))
      managedFiles.push(relative)
    }
  } finally {
    zip.close()
    await fs.rm(archivePath, { force: true })
  }

  if (!index) throw new Error('Le fichier modrinth.index.json manque dans le modpack.')
  const clientFiles = index.files.filter((file) => file.env?.client !== 'unsupported')
  let completed = 0
  for (const file of clientFiles) {
    const relative = safeRelativePath(file.path)
    await downloadFile(file.downloads, path.join(gamePath, relative), file.hashes)
    managedFiles.push(relative)
    completed += 1
    report(window, {
      state: 'preparing',
      phase: `Installation du modpack (${completed}/${clientFiles.length})…`,
      progress: 74 + Math.round((completed / Math.max(clientFiles.length, 1)) * 18),
    })
  }

  await fs.writeFile(markerPath, JSON.stringify({ version: desiredVersion, files: managedFiles }, null, 2), 'utf8')
}

async function ensureJava(window: BrowserWindow, dataPath: string) {
  const runtimePath = path.join(dataPath, 'runtime', 'java-21')
  const executable = javaExecutable(runtimePath)
  if (await exists(executable)) return executable

  report(window, { state: 'preparing', phase: 'Téléchargement de Java 21…', progress: 8 })
  await fs.mkdir(runtimePath, { recursive: true })
  const manifest = await fetchJavaRuntimeManifest({ target: 'java-runtime-delta' })
  await installJavaRuntimeTask({ destination: runtimePath, manifest }).startAndWait()

  if (!(await exists(executable))) throw new Error('Java 21 a été téléchargé, mais son exécutable est introuvable.')
  return executable
}

async function ensureMinecraft(window: BrowserWindow, gamePath: string, config: GameConfig) {
  const minecraft = new MinecraftFolder(gamePath)
  const vanillaJson = minecraft.getVersionJson(config.minecraftVersion)

  if (!(await exists(vanillaJson))) {
    report(window, { state: 'preparing', phase: `Installation de Minecraft ${config.minecraftVersion}…`, progress: 22 })
    const manifest = await getVersionList()
    const version = manifest.versions.find((entry) => entry.id === config.minecraftVersion)
    if (!version) throw new Error(`Minecraft ${config.minecraftVersion} est introuvable dans le catalogue officiel.`)
    await install(version, minecraft, { side: 'client' })
  }

  report(window, { state: 'preparing', phase: 'Installation et vérification de Fabric…', progress: 62 })
  const loaders = await getLoaderArtifactListFor(config.minecraftVersion)
  const requestedLoader = config.fabricLoaderVersion
    ? loaders.find((loader) => loader.loader.version === config.fabricLoaderVersion)
    : loaders.find((loader) => loader.loader.stable) ?? loaders[0]
  if (!requestedLoader) throw new Error('Aucune version compatible de Fabric Loader n’a été trouvée.')

  const fabricVersion = await installFabric(requestedLoader, minecraft, { side: 'client' })
  const resolvedVersion = await Version.parse(minecraft, fabricVersion)
  await installDependencies(resolvedVersion, { side: 'client' })
  return fabricVersion
}

export async function startGame(window: BrowserWindow, settings: LauncherSettings, config: GameConfig) {
  if (gameStarting || gameRunning) {
    return { ok: false as const, message: 'Minecraft est déjà en cours de lancement ou déjà ouvert.' }
  }

  const account = getMinecraftAccount()
  const accessToken = getMinecraftAccessToken()
  if (!account || !accessToken) {
    return { ok: false as const, code: 'not_authenticated', message: 'Connecte d’abord ton compte Microsoft.' }
  }

  gameStarting = true
  try {
    const dataPath = path.join(app.getPath('userData'), 'minecraft')
    await fs.mkdir(dataPath, { recursive: true })
    report(window, { state: 'preparing', phase: 'Préparation du jeu…', progress: 2 })

    const javaPath = await ensureJava(window, dataPath)
    const fabricVersion = await ensureMinecraft(window, dataPath, config)
    await syncModpack(window, dataPath, config)

    report(window, { state: 'preparing', phase: 'Démarrage de Minecraft…', progress: 94 })
    const child = await launch({
      gamePath: dataPath,
      resourcePath: dataPath,
      javaPath,
      version: fabricVersion,
      gameProfile: { id: account.id, name: account.name },
      accessToken,
      userType: 'mojang',
      properties: {},
      launcherName: 'CobbleStar Launcher',
      launcherBrand: 'CobbleStar',
      minMemory: Math.min(1024, settings.memoryMb),
      maxMemory: settings.memoryMb,
      server: { ip: config.serverHost, port: config.serverPort },
    })

    gameStarting = false
    gameRunning = true
    report(window, { state: 'running', phase: 'Minecraft est lancé.', progress: 100 })

    child.once('exit', (code) => {
      gameRunning = false
      report(window, {
        state: 'stopped',
        phase: code === 0 ? 'Minecraft a été fermé.' : `Minecraft s’est arrêté (code ${code ?? 'inconnu'}).`,
      })
    })
    child.once('error', (error) => {
      gameRunning = false
      report(window, { state: 'error', phase: 'Minecraft n’a pas pu démarrer.', message: error.message })
    })

    return { ok: true as const }
  } catch (error) {
    gameStarting = false
    const message = error instanceof Error ? error.message : 'Le lancement de Minecraft a échoué.'
    report(window, { state: 'error', phase: 'Échec du lancement.', message })
    return { ok: false as const, code: 'launch_failed', message }
  }
}
