import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMinecraftAccessToken, getMinecraftAccount, loginMicrosoft, logoutMicrosoft } from './auth.js'
import { installAndLaunch, type GameConfig } from './game.js'
import { installDownloadedUpdate, setupAutoUpdater } from './updater.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

type LauncherConfig = GameConfig & { microsoftClientId?: string }

function getLauncherConfig(): LauncherConfig {
  try {
    const configPath = path.join(app.getAppPath(), 'launcher.config.json')
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as LauncherConfig
  } catch {
    return {
      microsoftClientId: '',
      server: { host: 'play.cobblestar-mc.fr', port: 25574 },
      modpack: { version: '', url: '', sha512: '' },
    }
  }
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
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

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
  ipcMain.handle('auth:login', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, code: 'window_missing', message: 'Fenêtre du launcher introuvable.' }
    return loginMicrosoft(window, getLauncherConfig().microsoftClientId?.trim() ?? '')
  })
  ipcMain.handle('auth:logout', () => logoutMicrosoft())
  ipcMain.handle('auth:account', () => getMinecraftAccount())
  ipcMain.handle('game:launch', async (event, memoryMb: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, code: 'window_missing', message: 'Fenêtre du launcher introuvable.' }
    return installAndLaunch(window, getLauncherConfig(), {
      account: getMinecraftAccount(),
      accessToken: getMinecraftAccessToken(),
      memoryMb,
    })
  })
  ipcMain.on('update:install', () => installDownloadedUpdate())

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
