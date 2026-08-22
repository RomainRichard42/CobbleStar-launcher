import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cobblestar', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getNews: () => ipcRenderer.invoke('news:get'),
  openNewsSite: () => ipcRenderer.invoke('news:open-site'),
  loginMicrosoft: () => ipcRenderer.invoke('auth:login'),
  logoutMicrosoft: () => ipcRenderer.invoke('auth:logout'),
  getAccount: () => ipcRenderer.invoke('auth:account'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { memoryMb: number }) => ipcRenderer.invoke('settings:save', settings),
  repairInstallation: () => ipcRenderer.invoke('game:repair'),
  startGame: () => ipcRenderer.invoke('game:start'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onDeviceCode: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('auth:device-code', listener)
    return () => ipcRenderer.removeListener('auth:device-code', listener)
  },
  onUpdateStatus: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  onGameStatus: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('game:status', listener)
    return () => ipcRenderer.removeListener('game:status', listener)
  },
  platform: process.platform,
})
