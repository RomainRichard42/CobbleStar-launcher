import { app, BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import StreamZip from 'node-stream-zip'
import { launch, Version } from '@xmcl/core'
import {
  fetchJavaRuntimeManifest,
  getVersionList,
  install,
  installDependencies,
  installFabric,
  installJavaRuntimeTask,
  JavaRuntimeTargetType,
  resolveJava,
} from '@xmcl/installer'
import type { MinecraftAccount } from './auth.js'

export type GameConfig = {
  server: { host: string; port: number }
  modpack: { version: string; url: string; sha512: string }
}

type ModrinthFile = {
  path: string
  hashes: { sha1?: string; sha512?: string }
  env?: { client?: 'required' | 'optional' | 'unsupported' }
  downloads: string[]
  fileSize: number
}

type ModrinthIndex = {
  formatVersion: number
  versionId: string
  name: string
  files: ModrinthFile[]
  dependencies: { minecraft?: string; 'fabric-loader'?: string }
}

type InstalledState = {
  version: string
  archiveSha512: string
  minecraftVersion: string
  fabricLoader: string
  files: ModrinthFile[]
  overrideFiles: string[]
}

type ProgressState =
  | 'checking'
  | 'downloading-pack'
  | 'downloading-files'
  | 'extracting'
  | 'installing-minecraft'
  | 'installing-java'
  | 'launching'
  | 'running'
  | 'ready'
  | 'error'

export type GameProgress = {
  state: ProgressState
  percent: number
  message: string
}

type LaunchCredentials = {
  account: MinecraftAccount | null
  accessToken: string | null
  memoryMb: number
}

const send = (window: BrowserWindow, progress: GameProgress) => {
  if (!window.isDestroyed()) window.webContents.send('game:progress', progress)
}

const exists = async (target: string) => stat(target).then(() => true).catch(() => false)

function safeTarget(root: string, relative: string) {
  const normalized = relative.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('../')) {
    throw new Error(`Chemin dangereux refusé dans le modpack : ${relative}`)
  }
  const target = path.resolve(root, normalized)
  const resolvedRoot = path.resolve(root) + path.sep
  if (!target.startsWith(resolvedRoot)) throw new Error(`Chemin extérieur au jeu refusé : ${relative}`)
  return target
}

async function hashFile(file: string, algorithm: 'sha1' | 'sha512') {
  const hash = createHash(algorithm)
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function downloadFile(url: string, destination: string, onChunk?: (size: number) => void) {
  const partial = `${destination}.part`
  await mkdir(path.dirname(destination), { recursive: true })
  await rm(partial, { force: true })
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`)

  const writer = createWriteStream(partial)
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk?.(value.byteLength)
      if (!writer.write(value)) await new Promise<void>((resolve) => writer.once('drain', resolve))
    }
    await new Promise<void>((resolve, reject) => writer.end((error?: Error | null) => error ? reject(error) : resolve()))
    await rm(destination, { force: true })
    await rename(partial, destination)
  } catch (error) {
    writer.destroy()
    await rm(partial, { force: true })
    throw error
  }
}

async function readState(file: string): Promise<InstalledState | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as InstalledState
  } catch {
    return null
  }
}

async function readIndex(archive: string) {
  const zip = new StreamZip.async({ file: archive })
  try {
    const data = await zip.entryData('modrinth.index.json')
    const index = JSON.parse(data.toString('utf8')) as ModrinthIndex
    if (index.formatVersion !== 1 || !index.dependencies?.minecraft || !index.dependencies?.['fabric-loader']) {
      throw new Error('Le manifeste Modrinth est incomplet ou incompatible.')
    }
    return index
  } finally {
    await zip.close()
  }
}

async function extractOverrides(archive: string, gameDir: string, window: BrowserWindow) {
  const zip = new StreamZip.async({ file: archive })
  const extracted: string[] = []
  try {
    const entries = Object.values(await zip.entries())
      .filter((entry) => entry.isFile && (entry.name.startsWith('overrides/') || entry.name.startsWith('client-overrides/')))

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const prefix = entry.name.startsWith('client-overrides/') ? 'client-overrides/' : 'overrides/'
      const relative = entry.name.slice(prefix.length)
      const destination = safeTarget(gameDir, relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await pipeline(await zip.stream(entry), createWriteStream(destination))
      extracted.push(relative)
      if (index % 25 === 0 || index === entries.length - 1) {
        send(window, {
          state: 'extracting',
          percent: 76 + Math.round(((index + 1) / Math.max(entries.length, 1)) * 8),
          message: `Installation des configurations… ${index + 1}/${entries.length}`,
        })
      }
    }
  } finally {
    await zip.close()
  }
  return extracted
}

async function validateManagedFiles(gameDir: string, files: ModrinthFile[]) {
  const missing: ModrinthFile[] = []
  for (const file of files) {
    if (file.env?.client === 'unsupported') continue
    const target = safeTarget(gameDir, file.path)
    if (!await exists(target)) {
      missing.push(file)
      continue
    }
    const algorithm = file.hashes.sha512 ? 'sha512' : 'sha1'
    const expected = file.hashes[algorithm]
    if (!expected || await hashFile(target, algorithm) !== expected) missing.push(file)
  }
  return missing
}

async function downloadManagedFiles(gameDir: string, files: ModrinthFile[], window: BrowserWindow) {
  const queue = [...files]
  const total = queue.reduce((sum, file) => sum + Math.max(file.fileSize || 0, 1), 0)
  let downloaded = 0
  let completed = 0
  let lastPercent = -1

  const report = () => {
    const ratio = total > 0 ? downloaded / total : completed / Math.max(files.length, 1)
    const percent = 16 + Math.round(Math.min(ratio, 1) * 60)
    if (percent !== lastPercent) {
      lastPercent = percent
      send(window, {
        state: 'downloading-files',
        percent,
        message: `Téléchargement du modpack… ${completed}/${files.length}`,
      })
    }
  }

  const worker = async () => {
    while (queue.length > 0) {
      const file = queue.shift()
      if (!file) return
      const destination = safeTarget(gameDir, file.path)
      const url = file.downloads[0]
      if (!url) throw new Error(`Aucune source disponible pour ${file.path}`)
      await downloadFile(url, destination, (size) => {
        downloaded += size
        report()
      })
      const algorithm = file.hashes.sha512 ? 'sha512' : 'sha1'
      const expected = file.hashes[algorithm]
      if (!expected || await hashFile(destination, algorithm) !== expected) {
        await rm(destination, { force: true })
        throw new Error(`Le contrôle d’intégrité a échoué pour ${file.path}`)
      }
      completed += 1
      report()
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, files.length) }, () => worker()))
}

async function ensureModpack(config: GameConfig, gameDir: string, dataDir: string, window: BrowserWindow) {
  const statePath = path.join(dataDir, 'installed-pack.json')
  const archivePath = path.join(dataDir, `CobbleStar-${config.modpack.version}.mrpack`)
  const previous = await readState(statePath)

  send(window, { state: 'checking', percent: 2, message: 'Vérification du modpack…' })
  if (previous?.version === config.modpack.version && previous.archiveSha512 === config.modpack.sha512) {
    const missing = await validateManagedFiles(gameDir, previous.files)
    const overridesPresent = await Promise.all(previous.overrideFiles.map((file) => exists(safeTarget(gameDir, file))))
    if (missing.length === 0 && overridesPresent.every(Boolean)) {
      send(window, { state: 'checking', percent: 84, message: 'Modpack déjà à jour.' })
      return previous
    }
    if (missing.length > 0) await downloadManagedFiles(gameDir, missing, window)
    if (!overridesPresent.every(Boolean)) {
      if (!await exists(archivePath)) throw new Error('Les configurations du modpack sont incomplètes. Une réinstallation est nécessaire.')
      previous.overrideFiles = await extractOverrides(archivePath, gameDir, window)
    }
    await writeFile(statePath, JSON.stringify(previous, null, 2))
    return previous
  }

  send(window, { state: 'downloading-pack', percent: 4, message: 'Téléchargement de CobbleStar 1.0.0…' })
  let archiveBytes = 0
  await downloadFile(config.modpack.url, archivePath, (size) => {
    archiveBytes += size
    const percent = Math.min(15, 4 + Math.floor(archiveBytes / (12 * 1024 * 1024)))
    send(window, { state: 'downloading-pack', percent, message: 'Téléchargement du manifeste CobbleStar…' })
  })
  if (await hashFile(archivePath, 'sha512') !== config.modpack.sha512) {
    await rm(archivePath, { force: true })
    throw new Error('Le fichier du modpack est corrompu ou ne correspond pas à la version annoncée.')
  }

  const index = await readIndex(archivePath)
  if (index.versionId !== config.modpack.version) throw new Error(`Version de modpack inattendue : ${index.versionId}`)
  const clientFiles = index.files.filter((file) => file.env?.client !== 'unsupported')
  const missing = await validateManagedFiles(gameDir, clientFiles)
  await downloadManagedFiles(gameDir, missing, window)
  const overrideFiles = await extractOverrides(archivePath, gameDir, window)

  const nextPaths = new Set(clientFiles.map((file) => file.path))
  for (const oldFile of previous?.files ?? []) {
    if (!nextPaths.has(oldFile.path)) await rm(safeTarget(gameDir, oldFile.path), { force: true })
  }

  const state: InstalledState = {
    version: index.versionId,
    archiveSha512: config.modpack.sha512,
    minecraftVersion: index.dependencies.minecraft!,
    fabricLoader: index.dependencies['fabric-loader']!,
    files: clientFiles,
    overrideFiles,
  }
  await writeFile(statePath, JSON.stringify(state, null, 2))
  return state
}

async function ensureMinecraft(state: InstalledState, gameDir: string, window: BrowserWindow) {
  send(window, { state: 'installing-minecraft', percent: 85, message: `Installation de Minecraft ${state.minecraftVersion}…` })
  const list = await getVersionList()
  const metadata = list.versions.find((version) => version.id === state.minecraftVersion)
  if (!metadata) throw new Error(`Minecraft ${state.minecraftVersion} est introuvable.`)
  await install(metadata, gameDir)
  const fabricVersion = await installFabric({
    minecraftVersion: state.minecraftVersion,
    version: state.fabricLoader,
    minecraft: gameDir,
  })
  const resolved = await Version.parse(gameDir, fabricVersion)
  await installDependencies(resolved)
  send(window, { state: 'installing-minecraft', percent: 94, message: `Fabric ${state.fabricLoader} est prêt.` })
  return fabricVersion
}

async function ensureJava(dataDir: string, window: BrowserWindow) {
  const javaHome = path.join(dataDir, 'runtime', 'java-21')
  const executable = path.join(javaHome, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java')
  const installed = await resolveJava(executable).catch(() => undefined)
  if (installed && installed.majorVersion >= 21) return executable

  send(window, { state: 'installing-java', percent: 95, message: 'Installation automatique de Java 21…' })
  const manifest = await fetchJavaRuntimeManifest({ target: JavaRuntimeTargetType.Delta })
  const task = installJavaRuntimeTask({ destination: javaHome, manifest })
  await task.startAndWait({
    onUpdate(current) {
      const ratio = current.total > 0 ? current.progress / current.total : 0
      send(window, {
        state: 'installing-java',
        percent: 95 + Math.round(Math.min(ratio, 1) * 4),
        message: 'Installation automatique de Java 21…',
      })
    },
  })
  if (process.platform !== 'win32') {
    for (const [relative, entry] of Object.entries(manifest.files)) {
      if (entry.type === 'file' && entry.executable) await chmod(path.join(javaHome, relative), 0o755)
    }
  }
  return executable
}

let operation: Promise<{ ok: true } | { ok: false; code: string; message: string }> | null = null

export function installAndLaunch(
  window: BrowserWindow,
  config: GameConfig,
  credentials: LaunchCredentials,
) {
  if (operation) return operation
  operation = (async () => {
    try {
      const dataDir = path.join(app.getPath('userData'), 'game')
      const gameDir = path.join(dataDir, 'instance')
      await mkdir(gameDir, { recursive: true })
      const state = await ensureModpack(config, gameDir, dataDir, window)
      const version = await ensureMinecraft(state, gameDir, window)
      const javaPath = await ensureJava(dataDir, window)

      if (!credentials.account || !credentials.accessToken) {
        send(window, { state: 'ready', percent: 100, message: 'Installation terminée — connecte ton compte Microsoft.' })
        return { ok: false as const, code: 'auth_required', message: 'Le modpack est installé. Connecte maintenant ton compte Microsoft pour jouer.' }
      }

      send(window, { state: 'launching', percent: 100, message: 'Lancement de CobbleStar…' })
      const process = await launch({
        gamePath: gameDir,
        resourcePath: gameDir,
        javaPath,
        version,
        gameProfile: { id: credentials.account.id, name: credentials.account.name },
        accessToken: credentials.accessToken,
        userType: 'mojang',
        launcherName: 'CobbleStar Launcher',
        launcherBrand: 'CobbleStar',
        minMemory: 1024,
        maxMemory: Math.max(2048, credentials.memoryMb),
        quickPlayMultiplayer: config.server.host,
        server: { ip: config.server.host, port: config.server.port },
        extraExecOption: { detached: true },
      })
      send(window, { state: 'running', percent: 100, message: `Connexion à ${config.server.host}…` })
      process.once('exit', () => send(window, { state: 'ready', percent: 100, message: 'Minecraft est fermé — prêt à rejouer.' }))
      return { ok: true as const }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La préparation du jeu a échoué.'
      send(window, { state: 'error', percent: 0, message })
      return { ok: false as const, code: 'game_failed', message }
    } finally {
      operation = null
    }
  })()
  return operation
}
