import { BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'current'; version: string }
  | { state: 'error'; message: string }

function send(window: BrowserWindow, status: UpdateStatus) {
  if (!window.isDestroyed()) window.webContents.send('update:status', status)
}

export function setupAutoUpdater(window: BrowserWindow) {
  let availableVersion = autoUpdater.currentVersion.version
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send(window, { state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version
    send(window, { state: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => send(window, {
    state: 'downloading',
    version: availableVersion,
    percent: Math.round(progress.percent),
  }))
  autoUpdater.on('update-not-available', (info) => send(window, { state: 'current', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => send(window, { state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (error) => send(window, { state: 'error', message: error.message }))

  window.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Vérification de mise à jour impossible.'
        send(window, { state: 'error', message })
      })
    }, 1500)
  })
}

export function installDownloadedUpdate() {
  autoUpdater.quitAndInstall(false, true)
}
