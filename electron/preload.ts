import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cobblestar', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  platform: process.platform,
})
