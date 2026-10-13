// Safe UI checks: isolated mock IPC, no real login, game, downloads or external writes.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let modulePath = process.env.PLAYWRIGHT_MODULE
if (!modulePath) {
  try { modulePath = require.resolve('playwright') }
  catch { throw new Error('Installe Playwright pour ces tests, ou définis PLAYWRIGHT_MODULE vers son module local.') }
}
const { chromium } = await import(pathToFileURL(modulePath).href)
const origin = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:5187'
const output = fileURLToPath(new URL('../release/explorer-review/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
let checks = 0
const ok = (value, message) => { assert.ok(value, message); checks++ }
const article = { id: 'welcome', slug: 'welcome', title: 'Bienvenue sur CobbleStar', excerpt: 'Les repères pour commencer ton aventure.', content: 'Connecte ton compte Microsoft, puis clique sur Jouer.\n\nLe launcher prépare le jeu automatiquement.', category: 'LE SERVEUR', published: true, featured: true, publishedAt: '2026-10-13', image: '' }
async function setup({ account = true, news = 'live', boot = false, server = 'online' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 840 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort())
  await context.addInitScript(({ account, news, boot, server, article }) => {
    const callbacks = {}
    window.mock = { calls: [], news, failSave: false, failStart: false, failLogin: false, failRepair: false, failUpdate: false, account }
    const mock = window.mock
    window.emit = (type, value) => { for (const callback of callbacks[type] || []) callback(value) }
    const subscribe = type => callback => { (callbacks[type] ||= new Set()).add(callback);return () => callbacks[type].delete(callback) }
    const deferred = value => boot ? new Promise(resolve => { (window.resolveBoot ||= []).push(() => resolve(value)) }) : Promise.resolve(value)
    window.cobblestar = {
      platform: 'win32', minimize: () => mock.calls.push('minimize'), maximize: () => mock.calls.push('maximize'), close: () => mock.calls.push('close'),
      getInfo: async () => ({ version: '0.8.1', minecraftVersion: '1.21.1', serverHost: 'play.cobblestar-mc.fr', serverPort: 25574, totalMemoryMb: 16384, modpackVersion: '1.0.28' }),
      getAccount: () => deferred(account ? { id: 'fixture', name: 'LhShiroe' } : null), getSettings: async () => ({ memoryMb: 4096 }),
      getServerStatus: async () => server === 'online' ? { state: 'online', players: 37, maxPlayers: 200, checkedAt: Date.now() } : { state: 'unknown', checkedAt: Date.now() },
      getNews: async () => { mock.calls.push('news');if (mock.news === 'offline') throw new Error('News fixture offline');return { content: { articles: mock.news === 'empty' ? [] : [article, { ...article, id: 'second', title: 'Le jeu se prépare automatiquement', featured: false }, { ...article, id: 'third', title: 'Les nouvelles du serveur', featured: false }, { ...article, id: 'draft', title: 'DRAFT MUST NOT APPEAR', published: false }] } } },
      loginMicrosoft: async () => { mock.calls.push('login');if (mock.failLogin) throw new Error('Connexion simulée indisponible');window.emit('device', { userCode: 'ABCD EFGH', verificationUri: 'https://microsoft.com/link' });return new Promise(resolve => { window.completeLogin = () => resolve({ ok: true, account: { id: 'fixture', name: 'LhShiroe' } }) }) },
      logoutMicrosoft: async () => { mock.calls.push('logout');return { ok: true } },
      saveSettings: async value => { mock.calls.push(['save', value.memoryMb]);if (mock.failSave) throw new Error('Écriture simulée impossible');return value },
      repairInstallation: async () => { mock.calls.push('repair');return mock.failRepair ? { ok: false, message: 'Réparation simulée indisponible' } : { ok: true } },
      startGame: async () => { mock.calls.push('start');if (mock.failStart) throw new Error('Téléchargement simulé interrompu');return { ok: true } },
      openExternal: async url => mock.calls.push(['external', url]), openNewsSite: async () => mock.calls.push('news-site'),
      installUpdate: async () => { mock.calls.push('update');return mock.failUpdate ? { ok: false, message: 'Installation refusée' } : { ok: true } },
      onDeviceCode: subscribe('device'), onGameStatus: subscribe('game'), onUpdateStatus: subscribe('update'),
    }
  }, { account, news, boot, server, article })
  const page = await context.newPage(); const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(origin);await page.evaluate(() => document.fonts.ready)
  if (!boot) await page.getByRole('button', { name: account ? 'Jouer à CobbleStar' : 'Connexion Microsoft', exact: true }).waitFor()
  return { page, context, errors }
}
const shots = []
async function shot(page, name) {
  await page.screenshot({ path: `${output}/${name}.png` });shots.push(name)
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${name}: window overflow`)
  for (const locator of [page.locator('.play-button'), page.locator('.account-card'), page.locator('.explorer-footer'), page.locator('.workspace:visible')]) {
    if (!await locator.count()) continue
    const box = await locator.boundingBox(), viewport = page.viewportSize()
    ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${name}: controls in viewport`)
  }
}
try {
  const { page, context, errors } = await setup()
  await shot(page, '01-accueil')
  ok(await page.getByText('37 joueurs en ligne', { exact: true }).count(), 'live IPC server count, not 128')
  ok(!await page.getByText('DRAFT MUST NOT APPEAR').count(), 'draft not visible')
  await page.getByRole('button', { name: 'Copier l’adresse du serveur' }).click()
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'play.cobblestar-mc.fr:25574', 'configured address copied')
  await page.getByRole('button', { name: 'Masquer la notification' }).click()
  await page.getByRole('button', { name: 'Compte de LhShiroe' }).click();await shot(page, '04-compte')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Actualités', exact: true }).click();await shot(page, '05-actualites')
  await page.locator('.story.featured').click();await shot(page, '06-article');await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Voir sur le site', exact: true }).click()
  ok(await page.evaluate(() => window.mock.calls.includes('news-site')), 'news site delegated')
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();await shot(page, '07-parametres')
  ok(await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), 'saved state button disabled')
  await page.getByRole('slider', { name: 'Mémoire allouée' }).fill('6144');await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  ok(await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), 'save completed')
  ok(await page.evaluate(() => window.mock.calls.some(c => c[0] === 'save' && c[1] === 6144)), 'real save intent')
  await page.evaluate(() => window.mock.failSave = true);await page.getByRole('slider').fill('7168');await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByRole('dialog', { name: 'Une erreur est survenue' }).waitFor();ok(await page.getByText('Écriture simulée impossible').count(), 'save error shown');await page.keyboard.press('Escape')
  ok(await page.getByText('Modifications non enregistrées').count(), 'failed save stays dirty')
  await page.evaluate(() => window.mock.failSave = false);await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByRole('button', { name: 'Assistance', exact: true }).click();await shot(page, '08-assistance')
  await page.getByRole('button', { name: 'Ouvrir Discord', exact: true }).click();ok(await page.evaluate(() => window.mock.calls.some(c => c[0] === 'external' && c[1] === 'https://discord.gg/Sd387Ky4M')), 'Discord actual invite')
  await page.getByRole('button', { name: 'Réparer l’installation', exact: true }).click();await shot(page, '09-reparation');await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  ok(!await page.evaluate(() => window.mock.calls.includes('repair')), 'repair cancelled without mutation')
  await page.getByRole('button', { name: 'Réparer l’installation', exact: true }).click();await page.getByRole('button', { name: 'Préparer la réparation', exact: true }).click()
  ok(await page.evaluate(() => window.mock.calls.filter(c => c === 'repair').length === 1), 'repair once')
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();await page.getByRole('button', { name: 'Jouer à CobbleStar' }).click()
  await page.evaluate(() => window.emit('game', { state: 'preparing', phase: 'Installation de Minecraft 1.21.1…', progress: 22 }));await shot(page, '11-verification')
  ok(await page.getByRole('button', { name: 'Préparation du jeu', exact: true }).isDisabled(), 'launch locked while preparing')
  await page.evaluate(() => window.emit('game', { state: 'preparing', phase: 'Installation du modpack (42/96)…', progress: 81 }));await shot(page, '12-telechargement')
  ok(await page.locator('.preparation-card progress').getAttribute('value') === '81', 'progress from event')
  await page.evaluate(() => window.emit('game', { state: 'running', phase: 'Minecraft est lancé.', progress: 100 }));await shot(page, '13-jeu-ouvert')
  await page.getByRole('button', { name: 'Compte de LhShiroe' }).click();ok(await page.getByRole('button', { name: 'Se déconnecter', exact: true }).isDisabled(), 'logout locked while running');await page.keyboard.press('Escape')
  await page.evaluate(() => window.emit('update', { state: 'downloaded', version: '0.8.2' }));await page.getByRole('dialog', { name: 'Mise à jour prête' }).waitFor();ok(await page.getByRole('dialog').getByRole('button', { name: 'Installer et redémarrer', exact: true }).isDisabled(), 'update locked during game');await page.getByRole('button', { name: 'Plus tard' }).click()
  await page.evaluate(() => { window.emit('game', { state: 'stopped', phase: 'Minecraft a été fermé.' });window.emit('update', { state: 'downloading', version: '0.8.2', percent: 48 }) });await shot(page, '14-mise-a-jour-telechargement')
  ok(await page.getByRole('progressbar', { name: 'Téléchargement du launcher' }).getAttribute('value') === '48', 'real updater progress')
  await page.evaluate(() => window.emit('update', { state: 'downloaded', version: '0.8.2' }));await shot(page, '15-mise-a-jour-prete');await page.getByRole('button', { name: 'Plus tard' }).click()
  await page.evaluate(() => { window.mock.failStart = true;window.emit('update', { state: 'current', version: '0.8.1' }) });await page.getByRole('button', { name: 'Jouer à CobbleStar' }).click()
  await page.getByRole('dialog', { name: 'Une erreur est survenue' }).waitFor();await shot(page, '17-erreur');ok(await page.getByText('Téléchargement simulé interrompu').count(), 'actual error displayed');await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1040, height: 680 });await shot(page, '21-fenetre-compacte')
  for (const view of ['Actualités', 'Paramètres', 'Assistance']) { await page.getByRole('button', { name: view, exact: true }).click();await shot(page, `compact-${view}`) }
  await page.setViewportSize({ width: 1920, height: 1080 });await page.getByRole('button', { name: 'Retour à l’accueil' }).click();await shot(page, 'large-accueil')
  ok(errors.length === 0, errors.join('\n'));await context.close()
  const login = await setup({ account: false });await shot(login.page, '02-premiere-connexion');await login.page.getByRole('button', { name: 'Connexion Microsoft', exact: true }).click()
  await login.page.getByRole('dialog', { name: 'Connexion Microsoft' }).waitFor();await shot(login.page, '03-code-microsoft')
  await login.page.getByRole('button', { name: 'Ouvrir Microsoft', exact: true }).click();ok(await login.page.evaluate(() => window.mock.calls.some(c => c[0] === 'external' && c[1] === 'https://microsoft.com/link')), 'Microsoft link')
  await login.page.getByRole('button', { name: 'Copier le code Microsoft' }).click();ok(await login.page.evaluate(() => navigator.clipboard.readText()) === 'ABCD EFGH', 'code copied')
  await login.page.keyboard.press('Escape');ok(await login.page.getByRole('button', { name: 'Connexion…', exact: true }).isDisabled(), 'closing does not cancel pending login')
  await login.page.evaluate(() => window.completeLogin());await login.page.getByRole('button', { name: 'Jouer à CobbleStar' }).waitFor()
  await login.page.getByRole('button', { name: 'Compte de LhShiroe' }).click();await login.page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();await login.page.getByRole('button', { name: 'Connexion Microsoft', exact: true }).waitFor()
  ok(await login.page.evaluate(() => window.mock.calls.includes('logout')), 'logout delegated');ok(login.errors.length === 0, 'login errors');await login.context.close()
  for (const [state, file] of [['offline', '19-actualites-hors-ligne'], ['empty', '20-actualites-vides']]) {
    const env = await setup({ news: state });await env.page.getByRole('button', { name: 'Actualités', exact: true }).click();await shot(env.page, file)
    ok(state === 'offline' ? await env.page.getByText('Actualités indisponibles · guides locaux').count() : await env.page.getByText('Aucune actualité pour le moment').count(), 'offline vs empty')
    await env.page.evaluate(() => window.mock.news = 'live');await env.page.getByRole('button', { name: state === 'offline' ? 'Réessayer les actualités' : 'Actualiser', exact: true }).click();await env.page.locator('.story.featured').waitFor()
    ok(env.errors.length === 0, 'news recovery errors');await env.context.close()
  }
  const unknown = await setup({ server: 'unknown' });await shot(unknown.page, '18-serveur-indisponible');ok(!await unknown.page.getByText('0 joueurs en ligne').count(), 'unknown not zero');ok(await unknown.page.getByRole('button', { name: 'Jouer à CobbleStar' }).isEnabled(), 'server query failure does not block launch');await unknown.context.close()
  const boot = await setup({ boot: true });await shot(boot.page, '10-ouverture');ok(await boot.page.getByRole('button', { name: 'Chargement…', exact: true }).isDisabled(), 'boot locked');await boot.page.evaluate(() => window.resolveBoot.forEach(resolve => resolve()));await boot.page.getByRole('button', { name: 'Jouer à CobbleStar' }).waitFor();await boot.context.close()
  const update = await setup();await update.page.evaluate(() => window.emit('update', { state: 'downloaded', version: '0.8.2' }));await update.page.getByRole('dialog', { name: 'Mise à jour prête' }).waitFor();await update.page.getByRole('dialog').getByRole('button', { name: 'Installer et redémarrer', exact: true }).click();await shot(update.page, '16-mise-a-jour-installation')
  ok(await update.page.evaluate(() => window.mock.calls.includes('update')), 'update IPC called');ok(update.errors.length === 0, 'update errors');await update.context.close()
  await writeFile(`${output}/verification.json`, JSON.stringify({ checks, screenshots: shots, screenshotData: 'Isolated mock IPC; not production counts or real player login', browser: 'Edge Chromium', nativeElectron: false, actualGameLaunch: false, published: false }, null, 2))
  console.log(`PASS: ${checks} assertions; ${shots.length} screenshots; all 21 states + compact panels and large viewport. No real auth, game, downloads or external writes.`)
} finally { await browser.close() }
