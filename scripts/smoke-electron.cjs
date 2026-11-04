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
    let startupState = { state: 'checking' }
    let startupRequests = 0
    let accountRequests = 0
    let installs = 0
    ipcMain.handle('update:startup', () => { startupRequests++; return startupState })
    ipcMain.handle('update:install', () => { installs++; return {ok:true} })
    ipcMain.handle('auth:account', () => {
      accountRequests++
      return { id: 'test', name: 'DresseurTest' }
    })
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
    const load = () => window.loadFile(path.join(root, 'dist', 'index.html'))
    async function waitFor(probe, timeout = 5000) {
      const deadline = Date.now() + timeout
      while (!(await probe())) {
        if (Date.now() >= deadline) throw Error('Délai dépassé dans le test de démarrage')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    }
    const ui = code => window.webContents.executeJavaScript(code)
    await load()
    await waitFor(() => startupRequests > 0)
    assert(await ui("Boolean(document.querySelector('.startup-content')) && !document.querySelector('.play-button')"))
    assert.equal(accountRequests, 0)
    window.webContents.send('update:status', {state:'downloading',version:'9.9.9',percent:43})
    await waitFor(() => ui("document.querySelector('progress')?.value === 43"))
    window.webContents.send('update:status', {state:'downloaded',version:'9.9.9'})
    await waitFor(() => ui("Boolean(document.querySelector('.startup-content .primary'))"))
    await ui("document.querySelector('.startup-content .primary').click()")
    await waitFor(() => installs === 1)
    assert.equal(accountRequests, 0)
    startupState = { state: 'error', message: 'Hors ligne' }
    await load()
    await waitFor(() => ui("Boolean(document.querySelector('.play-button'))"))
    startupState = { state: 'checking' }
    await load()
    await waitFor(() => ui("Boolean(document.querySelector('.startup-content'))"))
    await waitFor(() => ui("Boolean(document.querySelector('.play-button'))"), 14000)
    startupState = { state: 'current', version: '0.8.6' }
    await load()
    await waitFor(() => ui("Boolean(document.querySelector('.account-card'))"))
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
