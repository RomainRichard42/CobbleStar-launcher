import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cobblestar', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  loginMicrosoft: () => ipcRenderer.invoke('auth:login'),
  logoutMicrosoft: () => ipcRenderer.invoke('auth:logout'),
  getAccount: () => ipcRenderer.invoke('auth:account'),
  launchGame: (memoryMb: number) => ipcRenderer.invoke('game:launch', memoryMb),
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
  onGameProgress: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('game:progress', listener)
    return () => ipcRenderer.removeListener('game:progress', listener)
  },
  platform: process.platform,
})
