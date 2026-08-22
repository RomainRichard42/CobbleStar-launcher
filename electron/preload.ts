import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('cobblestar', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getNews: () => ipcRenderer.invoke('news:get'),
  openNewsSite: () => ipcRenderer.invoke('news:open-site'),
  repairInstallation: () => ipcRenderer.invoke('game:repair'),
  platform: process.platform,
})
