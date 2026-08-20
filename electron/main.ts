import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureFreshSession, getMinecraftAccount, loginMicrosoft, logoutMicrosoft, restoreSession } from './auth.js'
import { startGame, type GameConfig } from './game.js'
import { getSettings, saveSettings } from './settings.js'
import { installDownloadedUpdate, setupAutoUpdater } from './updater.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

type LauncherFileConfig = {
  microsoftClientId?: string
  newsUrl?: string
  websiteUrl?: string
  game?: Partial<GameConfig>
}

function getLauncherConfig(): LauncherFileConfig {
  try {
    const configPath = path.join(app.getAppPath(), 'launcher.config.json')
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as LauncherFileConfig
  } catch {
    return {}
  }
}

function getMicrosoftClientId() {
  return getLauncherConfig().microsoftClientId?.trim() ?? ''
}

function getGameConfig(): GameConfig {
  const configured = getLauncherConfig().game
  return {
    minecraftVersion: configured?.minecraftVersion?.trim() || '1.21.1',
    fabricLoaderVersion: configured?.fabricLoaderVersion?.trim() || undefined,
    serverHost: configured?.serverHost?.trim() || 'play.cobblestar-mc.fr',
    serverPort: Number.isInteger(configured?.serverPort) ? Number(configured?.serverPort) : 25574,
    modpackFeedUrl: configured?.modpackFeedUrl?.trim() || undefined,
    modpackUrl: configured?.modpackUrl?.trim() || undefined,
    modpackVersion: configured?.modpackVersion?.trim() || undefined,
  }
}

async function getNews() {
  const configured = getLauncherConfig();
  const url = configured.newsUrl?.trim() || 'https://cobblestar-mc.fr/api/news';
  if (!url.startsWith('https://')) throw new Error('L’adresse des actualités doit utiliser HTTPS.');
  const response = await net.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'CobbleStar-Launcher' } });
  if (!response.ok) throw new Error(`Actualités indisponibles (${response.status}).`);
  return response.json();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    transparent: false,
    backgroundColor: '#100b2b',
    title: 'CobbleStar Launcher',
    // electron-builder pose déjà l'icône sur l'exécutable packagé, mais la
    // fenêtre elle-même n'en a aucune : en développement la barre des tâches
    // affiche donc l'icône Electron par défaut.
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    // La fenêtre reste cachée tant que le rendu n'est pas prêt : sinon on voit
    // un rectangle vide le temps que React monte, ce qui donne l'impression
    // que le launcher a planté au démarrage.
    show: false,
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (isDev) window.loadURL('http://127.0.0.1:5173')
  else window.loadFile(path.join(currentDir, '../dist/index.html'))

  if (!isDev) setupAutoUpdater(window)
  return window
}

app.whenReady().then(() => {
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  ipcMain.handle('external:open', (_event, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('news:get', () => getNews())
  ipcMain.handle('news:open-site', () => shell.openExternal(`${getLauncherConfig().websiteUrl?.trim() || 'https://cobblestar-mc.fr'}/actualites/`))
  ipcMain.handle('auth:login', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, code: 'window_missing', message: 'Fenêtre du launcher introuvable.' }
    return loginMicrosoft(window, getMicrosoftClientId())
  })
  ipcMain.handle('auth:logout', () => logoutMicrosoft())
  // Tente un refresh silencieux via le cache MSAL avant de répondre : si
  // une session valide existe déjà sur disque, le renderer récupère
  // directement le compte sans repasser par l'écran de connexion.
  ipcMain.handle('auth:account', async () => {
    const existing = getMinecraftAccount()
    if (existing) return existing
    const restored = await restoreSession(getMicrosoftClientId())
    return restored.ok ? restored.account : null
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_event, settings: { memoryMb?: number }) => saveSettings(settings))
  ipcMain.handle('game:start', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, code: 'window_missing', message: 'Fenêtre du launcher introuvable.' }
    await ensureFreshSession(getMicrosoftClientId())
    return startGame(window, getSettings(), getGameConfig())
  })
  ipcMain.on('update:install', () => installDownloadedUpdate())

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
