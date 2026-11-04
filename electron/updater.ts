import { BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
let readyToInstall = false

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'current'; version: string }
  | { state: 'error'; message: string }

let latest: UpdateStatus = { state: 'checking' }
let started = false

function send(status: UpdateStatus) {
  latest = status
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send('update:status', status)
  }
}

/** Subscribe in the renderer first, then start the single check or replay its snapshot. */
export function checkStartupUpdate(): UpdateStatus {
  if (started) return latest
  started = true
  let availableVersion = autoUpdater.currentVersion.version
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version
    send({ state: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => send({
    state: 'downloading',
    version: availableVersion,
    percent: Math.round(progress.percent),
  }))
  autoUpdater.on('update-not-available', (info) => send({ state: 'current', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => {
    readyToInstall = true
    send({ state: 'downloaded', version: info.version })
  })
  const failed = (error: unknown) => send({
    state: 'error', message: error instanceof Error ? error.message : 'Vérification de mise à jour impossible.',
  })
  autoUpdater.on('error', failed)
  void autoUpdater.checkForUpdates().then(result => {
    if (!result) send({ state: 'current', version: autoUpdater.currentVersion.version })
    return result?.downloadPromise
  }).catch(failed)
  return latest
}

export function installDownloadedUpdate() {
  if (!readyToInstall) return false
  readyToInstall = false
  // isSilent = true : sans ça, NSIS affiche sa propre fenêtre d'installation
  // pendant que celle du launcher reste à l'écran sans repeindre — Windows la
  // marque alors « ne répond pas ». En silencieux, la fenêtre se ferme
  // immédiatement et l'utilisateur ne voit jamais d'application figée.
  // Let the IPC reply and the transition paint before the process exits.
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 500)
  return true
}
