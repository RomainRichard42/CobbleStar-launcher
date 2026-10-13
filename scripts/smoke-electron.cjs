// Run with: electron scripts/smoke-electron.cjs
// Actual packaged renderer + actual preload, isolated session, mocked main IPC.
// Does not load production main/auth/game/updater or touch player files.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
// A hidden capture in the automation session must not depend on its GPU context.
app.disableHardwareAcceleration()
app.setPath('userData', path.join(root, 'release', 'electron-smoke-profile'))
app.whenReady().then(async () => {
  let window
  try {
    const isolated = session.fromPartition('launcher-ui-smoke')
    isolated.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_request, done) => done({ cancel: true }),
    )
    ipcMain.handle('auth:account', () => ({ id: 'test', name: 'DresseurTest' }))
    ipcMain.handle('settings:get', () => ({ memoryMb: 6144 }))
    ipcMain.handle('launcher:info', () => ({
      version: '0.8.2',
      minecraftVersion: '1.21.1',
      serverHost: 'test.invalid',
      serverPort: 25565,
      totalMemoryMb: 16384,
    }))
    ipcMain.handle('news:get', () => ({ content: { articles: [] } }))
    ipcMain.handle('server:status', () => ({ state: 'online', players: 43, maxPlayers: 200, checkedAt: Date.now() }))
    window = new BrowserWindow({
      show: false,
      frame: false,
      width: 1440,
      height: 840,
      webPreferences: {
        preload: path.join(root, 'dist-electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false,
        session: isolated,
      },
    })
    await window.loadFile(path.join(root, 'dist', 'index.html'))
    const result = await window.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      for(let i=0;i<100 && !document.querySelector('.account-card').textContent.includes('DresseurTest');i++) await new Promise(r=>setTimeout(r,50));
      return { connected:document.querySelector('.account-card').textContent.includes('DresseurTest'),
        address:document.querySelector('.server-address').textContent,
        launchDisabled:document.querySelector('.play-button').disabled,
        bridge:typeof window.cobblestar.maximize,
        node:typeof window.require,
        logo:document.querySelector('.brand img').naturalWidth,
        font:document.fonts.check('500 14px Rubik'),
        server:document.querySelector('.server-state').textContent,
        art:document.querySelector('.landscape').naturalWidth };
    })()`)
    assert.equal(result.connected, true)
    assert.equal(result.address, 'test.invalid:25565')
    assert.equal(result.launchDisabled, false)
    assert.equal(result.bridge, 'function')
    assert.equal(result.node, 'undefined')
    assert.ok(result.logo > 0)
    assert.equal(result.font, true)
    assert.ok(result.server.includes('43 joueurs en ligne'))
    assert.ok(result.art > 1000)
    await new Promise(resolve => setTimeout(resolve, 300))
    const png = await window.webContents.capturePage()
    await fs.mkdir(path.join(root, 'release', 'explorer-review'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, 'release', 'explorer-review', 'electron-native.png'),
      png.toPNG(),
    )
    console.log(
      '9 native Electron checks passed: real preload, IPC server status, renderer, landscape, logo, fonts and isolation.',
    )
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    window?.destroy()
    app.exit(1)
  }
})
