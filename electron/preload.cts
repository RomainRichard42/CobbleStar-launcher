import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cobblestar', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  loginMicrosoft: () => ipcRenderer.invoke('auth:login'),
  logoutMicrosoft: () => ipcRenderer.invoke('auth:logout'),
  getAccount: () => ipcRenderer.invoke('auth:account'),
  onDeviceCode: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('auth:device-code', listener)
    return () => ipcRenderer.removeListener('auth:device-code', listener)
  },
  platform: process.platform,
})
