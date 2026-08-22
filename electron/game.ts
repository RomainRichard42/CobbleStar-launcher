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
} from '@xmcl/installer'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getMinecraftAccessToken, getMinecraftAccount, getMinecraftIdentity } from './auth.js'
import type { LauncherSettings } from './settings.js'

export type GameConfig = {
  minecraftVersion: string
  fabricLoaderVersion?: string
  serverHost: string
  serverPort: number
  modpackFeedUrl?: string
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

// Un fichier peut exister sur le disque tout en étant vide ou tronqué (par
// exemple si un téléchargement précédent a été interrompu). `exists()` seul
// ne suffit donc pas pour décider si on peut réutiliser un .json déjà
// présent : on vérifie ici qu'il est réellement parsable.
async function isValidJsonFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    if (!content.trim()) return false
    JSON.parse(content)
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

async function resolveModpack(config: GameConfig) {
  if (config.modpackFeedUrl) {
    try {
      const response = await net.fetch(config.modpackFeedUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CobbleStar-Launcher' } })
      if (!response.ok) throw new Error(`GitHub ${response.status}`)
      const payload = await response.json() as { draft?: boolean; prerelease?: boolean; tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string; updated_at?: string }> } | Array<{ draft?: boolean; prerelease?: boolean; tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string; updated_at?: string }> }>
      const releases = Array.isArray(payload) ? payload : [payload]
      for (const release of releases) {
        if (release.draft) continue
        const asset = release.assets?.find((candidate) => candidate.name?.toLowerCase().endsWith('.mrpack') && candidate.browser_download_url)
        if (asset?.browser_download_url) return { url: asset.browser_download_url, version: `${release.tag_name ?? 'release'}:${asset.name}:${asset.updated_at ?? ''}` }
      }
    } catch (error) {
      console.warn('[modpack] flux GitHub indisponible, utilisation de la version configurée', error)
    }
  }
  return config.modpackUrl ? { url: config.modpackUrl, version: config.modpackVersion || config.modpackUrl } : null
}

async function syncModpack(window: BrowserWindow, gamePath: string, config: GameConfig) {
  const remote = await resolveModpack(config)
  if (!remote) return
  const markerPath = path.join(gamePath, '.cobblestar-modpack.json')
  const desiredVersion = remote.version
  let previousFiles: string[] = []
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as { version?: string; files?: string[] }
    if (marker.version === desiredVersion) return
    previousFiles = Array.isArray(marker.files) ? marker.files : []
  } catch {
    // Première installation.
  }

  report(window, { state: 'preparing', phase: 'Téléchargement du modpack CobbleStar…', progress: 74 })
  const response = await net.fetch(remote.url)
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

const REQUIRED_RESOURCE_PACKS = [
  'file/E19 Cobblemon Minimap Icons.zip',
  'file/PackPackStar.zip',
  'file/NouveauTags.zip',
]

/**
 * YOSBR ne doit fournir qu'un réglage initial, jamais reprendre la main sur
 * l'échelle choisie ensuite par le joueur. Les anciens packs contenaient
 * `guiScale:0` (automatique), ce qui redevenait x3 sur beaucoup d'écrans.
 */
async function stopYosbrFromManagingGuiScale(gamePath: string) {
  const optionsPath = path.join(gamePath, 'config', 'yosbr', 'options.txt')
  let options: string
  try {
    options = await fs.readFile(optionsPath, 'utf8')
  } catch {
    return
  }
  const newline = options.includes('\r\n') ? '\r\n' : '\n'
  const lines = options.split(/\r?\n/)
  const filtered = lines.filter((line) => !line.startsWith('guiScale:'))
  if (filtered.length !== lines.length) {
    await fs.writeFile(optionsPath, filtered.join(newline), 'utf8')
  }
}

async function ensureMinecraftOption(optionsPath: string, key: string, value: string) {
  let options: string
  try {
    options = await fs.readFile(optionsPath, 'utf8')
  } catch {
    return
  }

  const newline = options.includes('\r\n') ? '\r\n' : '\n'
  const lines = options.split(/\r?\n/)
  const prefix = `${key}:`
  const index = lines.findIndex((line) => line.startsWith(prefix))
  const expected = `${prefix}${value}`

  if (index >= 0) {
    if (lines[index] === expected) return
    lines[index] = expected
  } else {
    const trailingEmptyLine = lines.at(-1) === ''
    lines.splice(trailingEmptyLine ? lines.length - 1 : lines.length, 0, expected)
  }
  await fs.writeFile(optionsPath, lines.join(newline), 'utf8')
}

/** Le fond FancyMenu doit rester net, y compris sur les profils existants. */
async function ensureSharpMainMenu(gamePath: string) {
  await Promise.all([
    ensureMinecraftOption(path.join(gamePath, 'options.txt'), 'menuBackgroundBlurriness', '0'),
    ensureMinecraftOption(path.join(gamePath, 'config', 'yosbr', 'options.txt'), 'menuBackgroundBlurriness', '0'),
  ])
}

/**
 * Les identifiants GLFW suivent la position QWERTY : sur un clavier AZERTY,
 * key.keyboard.m est la touche virgule et key.keyboard.semicolon est la vraie
 * touche M. On conserve donc la virgule pour le résumé Cobblemon et on réserve
 * le M physique AZERTY au menu CobbleStar.
 */
async function reserveCobbleStarMenuKeyInFile(optionsPath: string) {
  let options: string
  try {
    options = await fs.readFile(optionsPath, 'utf8')
  } catch {
    return
  }

  const newline = options.includes('\r\n') ? '\r\n' : '\n'
  const lines = options.split(/\r?\n/)
  const menuPrefix = 'key_key.cobblestar_planets.menu:'
  const summaryPrefix = 'key_key.cobblemon.summary:'
  const menuIndex = lines.findIndex((line) => line.startsWith(menuPrefix))
  const expectedMenu = `${menuPrefix}key.keyboard.semicolon`
  let changed = false

  if (menuIndex >= 0) {
    if (lines[menuIndex] !== expectedMenu) {
      lines[menuIndex] = expectedMenu
      changed = true
    }
  } else {
    const trailingEmptyLine = lines.at(-1) === ''
    lines.splice(trailingEmptyLine ? lines.length - 1 : lines.length, 0, expectedMenu)
    changed = true
  }

  const summaryIndex = lines.findIndex((line) => line.startsWith(summaryPrefix))
  const expectedSummary = `${summaryPrefix}key.keyboard.m`
  if (summaryIndex >= 0) {
    if (lines[summaryIndex] !== expectedSummary) {
      lines[summaryIndex] = expectedSummary
      changed = true
    }
  } else {
    const trailingEmptyLine = lines.at(-1) === ''
    lines.splice(trailingEmptyLine ? lines.length - 1 : lines.length, 0, expectedSummary)
    changed = true
  }

  if (changed) await fs.writeFile(optionsPath, lines.join(newline), 'utf8')
}

async function reserveCobbleStarMenuKey(gamePath: string) {
  await Promise.all([
    reserveCobbleStarMenuKeyInFile(path.join(gamePath, 'options.txt')),
    reserveCobbleStarMenuKeyInFile(path.join(gamePath, 'config', 'yosbr', 'options.txt')),
  ])
}

/**
 * YOSBR ne recopie ses options que pour un profil vierge. On conserve les
 * packs internes de Minecraft et des mods, mais les seuls packs de fichiers
 * activés doivent être les trois packs CobbleStar demandés.
 */
async function ensureResourcePacksInFile(optionsPath: string) {
  let options: string
  try {
    options = await fs.readFile(optionsPath, 'utf8')
  } catch {
    return
  }

  const newline = options.includes('\r\n') ? '\r\n' : '\n'
  const lines = options.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith('resourcePacks:['))
  if (index < 0) return

  const openingBracket = lines[index].indexOf('[')
  const closingBracket = lines[index].lastIndexOf(']')
  if (openingBracket < 0 || closingBracket < openingBracket) return

  let configuredPacks: unknown
  try {
    configuredPacks = JSON.parse(lines[index].slice(openingBracket, closingBracket + 1))
  } catch {
    return
  }
  if (!Array.isArray(configuredPacks)) return

  const internalPacks = configuredPacks.filter((pack): pack is string =>
    typeof pack === 'string'
      && !pack.startsWith('file/')
      && !pack.startsWith('openloader/'))
  const exactPacks = [...new Set([...internalPacks, ...REQUIRED_RESOURCE_PACKS])]
  const expected = `resourcePacks:${JSON.stringify(exactPacks)}${lines[index].slice(closingBracket + 1)}`
  if (lines[index] === expected) return

  lines[index] = expected
  await fs.writeFile(optionsPath, lines.join(newline), 'utf8')
}

async function ensureRequiredResourcePacks(gamePath: string) {
  await Promise.all([
    ensureResourcePacksInFile(path.join(gamePath, 'options.txt')),
    ensureResourcePacksInFile(path.join(gamePath, 'config', 'yosbr', 'options.txt')),
  ])
}

type JavaManifestFileEntry = {
  type: 'file'
  downloads: { raw: { url: string; sha1: string } }
}
type JavaManifestOtherEntry = {
  type: 'directory' | 'link'
  target?: string
}

// Combien de fichiers on télécharge en même temps. Le runtime Java Mojang
// contient plusieurs centaines de petits fichiers ; les télécharger tous en
// parallèle sans limite (comportement par défaut d'@xmcl/installer) sature
// souvent la box, l'antivirus ou déclenche un throttling côté CDN, ce qui
// provoque l'échec simultané de la quasi-totalité des téléchargements.
const JAVA_DOWNLOAD_CONCURRENCY = 6
const JAVA_DOWNLOAD_MAX_ATTEMPTS = 3

async function ensureJava(window: BrowserWindow, dataPath: string) {
  const runtimePath = path.join(dataPath, 'runtime', 'java-21')
  const executable = javaExecutable(runtimePath)
  if (await exists(executable)) return executable

  report(window, { state: 'preparing', phase: 'Téléchargement de Java 21…', progress: 8 })
  await fs.mkdir(runtimePath, { recursive: true })
  const manifest = await fetchJavaRuntimeManifest({ target: 'java-runtime-delta' })

  const entries = Object.entries(manifest.files) as Array<[string, JavaManifestFileEntry | JavaManifestOtherEntry]>
  const fileEntries = entries.filter((entry): entry is [string, JavaManifestFileEntry] => entry[1].type === 'file')
  const otherEntries = entries.filter((entry) => entry[1].type !== 'file')

  // Les dossiers d'abord, pour que les fichiers aient un endroit où atterrir.
  for (const [file, entry] of otherEntries) {
    if (entry.type === 'directory') await fs.mkdir(path.join(runtimePath, file), { recursive: true })
  }

  let completed = 0
  let index = 0
  const failures: Array<{ file: string; error: unknown }> = []

  async function downloadOne(file: string, entry: JavaManifestFileEntry) {
    const dest = path.join(runtimePath, file)
    const { url, sha1 } = entry.downloads.raw
    let lastError: unknown
    for (let attempt = 1; attempt <= JAVA_DOWNLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        await downloadFile([url], dest, { sha1 })
        return
      } catch (error) {
        lastError = error
        // Petite pause avant retry pour laisser une éventuelle saturation réseau retomber.
        if (attempt < JAVA_DOWNLOAD_MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
      }
    }
    failures.push({ file, error: lastError })
  }

  async function worker() {
    while (index < fileEntries.length) {
      const current = index++
      const [file, entry] = fileEntries[current]
      await downloadOne(file, entry)
      completed += 1
      report(window, {
        state: 'preparing',
        phase: `Téléchargement de Java 21 (${completed}/${fileEntries.length})…`,
        progress: 8 + Math.round((completed / Math.max(fileEntries.length, 1)) * 12),
      })
    }
  }

  await Promise.all(Array.from({ length: Math.min(JAVA_DOWNLOAD_CONCURRENCY, fileEntries.length) }, () => worker()))

  // Les liens symboliques une fois les fichiers en place.
  for (const [file, entry] of otherEntries) {
    if (entry.type === 'link' && entry.target) {
      const dest = path.join(runtimePath, file)
      await fs.link(path.join(path.dirname(dest), entry.target), dest).catch(() => {})
    }
  }

  if (failures.length > 0) {
    const preview = failures.slice(0, 5).map(({ file, error }) => `${file} : ${error instanceof Error ? error.message : String(error)}`)
    throw new Error(
      `Échec du téléchargement de Java 21 (${failures.length}/${fileEntries.length} fichiers en échec).\n` +
        preview.join('\n') +
        (failures.length > preview.length ? `\n… et ${failures.length - preview.length} autres.` : ''),
    )
  }

  if (process.platform !== 'win32') {
    await fs.chmod(executable, 0o755).catch(() => {})
  }

  if (!(await exists(executable))) throw new Error('Java 21 a été téléchargé, mais son exécutable est introuvable.')
  return executable
}

async function ensureMinecraft(window: BrowserWindow, gamePath: string, config: GameConfig) {
  const minecraft = new MinecraftFolder(gamePath)
  const vanillaJson = minecraft.getVersionJson(config.minecraftVersion)

  if (!(await isValidJsonFile(vanillaJson))) {
    // Le fichier peut exister mais être corrompu (téléchargement interrompu
    // lors d'une tentative précédente) : on repart d'un dossier de version
    // propre pour éviter tout mélange entre anciens fichiers partiels et
    // nouveaux fichiers.
    await fs.rm(path.dirname(vanillaJson), { recursive: true, force: true })
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

function describeError(e: unknown, depth = 0): string {
  const prefix = '  '.repeat(depth)
  if (e instanceof Error) {
    const code = (e as { code?: string }).code
    let line = `${prefix}${e.name}: ${e.message}${code ? ` [${code}]` : ''}`
    const nested = (e as { errors?: unknown[] }).errors
    if (Array.isArray(nested) && nested.length > 0 && depth < 4) {
      line += '\n' + nested.slice(0, 3).map((sub) => describeError(sub, depth + 1)).join('\n')
    }
    return line
  }
  return `${prefix}${String(e)}`
}

export async function startGame(window: BrowserWindow, settings: LauncherSettings, config: GameConfig) {
  if (gameStarting || gameRunning) {
    return { ok: false as const, message: 'Minecraft est déjà en cours de lancement ou déjà ouvert.' }
  }

  const account = getMinecraftAccount()
  const accessToken = getMinecraftAccessToken()
  const identity = getMinecraftIdentity()
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
    await stopYosbrFromManagingGuiScale(dataPath)
    await ensureSharpMainMenu(dataPath)
    await ensureRequiredResourcePacks(dataPath)
    await reserveCobbleStarMenuKey(dataPath)

    report(window, { state: 'preparing', phase: 'Démarrage de Minecraft…', progress: 94 })

    // La JVM écrit énormément sur stdout au démarrage (avec YOSBR + 270 mods,
    // plusieurs centaines de Ko). Si on laisse `spawn` créer des pipes, le
    // buffer de l'OS (~64 Ko) se remplit et la JVM se bloque *définitivement*
    // sur System.out.write dès que personne ne draine assez vite : javaw reste
    // en mémoire sans jamais afficher de fenêtre. On branche donc stdout et
    // stderr directement sur un descripteur de fichier — c'est le noyau qui
    // écrit, aucun buffer Node ne peut saturer, même si l'app est occupée.
    const logPath = path.join(dataPath, 'latest-launch.log')
    const logFd = fsSync.openSync(logPath, 'w')
    fsSync.writeSync(logFd, `--- Lancement ${new Date().toISOString()} ---\n`)

    const child = await launch({
      extraExecOption: { stdio: ['ignore', logFd, logFd] },
      gamePath: dataPath,
      resourcePath: dataPath,
      javaPath,
      version: fabricVersion,
      gameProfile: { id: account.id, name: account.name },
      accessToken,
      // Pas de `userType` : @xmcl/core retombe alors sur 'msa', la valeur
      // correcte pour un compte Microsoft. L'ancien 'mojang' faisait prendre
      // au client la voie héritée des comptes Mojang (supprimés depuis), ce
      // qui casse la résolution des profils joueur — donc des skins.
      properties: {},
      // @xmcl/core ne connaît ni --xuid ni --clientId (ajoutés par Mojang en
      // 1.19) : il laissait les placeholders en clair dans la commande, le jeu
      // recevait littéralement `--xuid ${auth_xuid}`. Les valeurs des features
      // sont fusionnées dans la table de substitution, c'est le point
      // d'injection propre. Ce nom de feature n'est référencé par aucune règle
      // du fichier de version, il n'active donc aucun argument conditionnel.
      features: { cobblestarIdentity: identity },
      launcherName: 'CobbleStar Launcher',
      launcherBrand: 'CobbleStar',
      minMemory: Math.min(1024, settings.memoryMb),
      maxMemory: settings.memoryMb,
      // Volontairement aucune connexion automatique : le jeu doit s'ouvrir sur
      // l'écran titre CobbleStar, où le bouton « Rejoindre CobbleStar »
      // déclenche la connexion. Passer --quickPlayMultiplayer ici
      // sauterait ce menu. Note : --server/--port n'existent plus depuis 1.20.
    }).catch((error: unknown) => {
      // Si le spawn échoue, personne ne fermera le descripteur plus bas.
      fsSync.closeSync(logFd)
      throw error
    })

    gameStarting = false
    gameRunning = true
    report(window, { state: 'running', phase: 'Minecraft est lancé.', progress: 100 })

    // Le processus Java est autonome. Une fois le spawn confirmé, on cache la
    // fenêtre lanceuse pour éviter une fermeture prématurée du process.
    setTimeout(() => {
      if (!window.isDestroyed()) window.hide()
    }, 350)

    // `exit` et `error` peuvent se suivre : on ne ferme le descripteur qu'une fois.
    let logClosed = false
    const closeLog = () => {
      if (logClosed) return
      logClosed = true
      fsSync.closeSync(logFd)
    }

    child.once('exit', (code) => {
      gameRunning = false
      closeLog()
      if (!window.isDestroyed()) {
        window.show()
      }
      report(window, {
        state: 'stopped',
        phase: code === 0 ? 'Minecraft a été fermé.' : `Minecraft s’est arrêté (code ${code ?? 'inconnu'}). Voir ${logPath}`,
      })
    })
    child.once('error', (error) => {
      gameRunning = false
      closeLog()
      if (!window.isDestroyed()) {
        window.show()
      }
      report(window, { state: 'error', phase: 'Minecraft n’a pas pu démarrer.', message: error.message })
    })

    return { ok: true as const }
} catch (error) {
    gameStarting = false
    const baseMessage = error instanceof Error ? error.message : 'Le lancement de Minecraft a échoué.'
    const detail = `\n\n--- Détail ---\n${describeError(error)}`
    const message = `${baseMessage}${detail}`
    console.error('[startGame] échec :', error)
    report(window, { state: 'error', phase: 'Échec du lancement.', message })
    return { ok: false as const, code: 'launch_failed', message }
  }
}
