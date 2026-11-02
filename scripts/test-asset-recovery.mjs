import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MinecraftFolder } from '@xmcl/core'
import { installResolvedAssetsTask } from '@xmcl/installer'
import { MockAgent } from 'undici'
import { installWithAssetRecovery } from '../dist-electron/asset-recovery.js'

const origin = 'https://resources.download.minecraft.net'
function asset(name) {
  const data = Buffer.from(name)
  const hash = createHash('sha1').update(data).digest('hex')
  return { name, hash, size: data.length }
}

async function setup(t, assets) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'cobblestar-assets-'))
  const folder = new MinecraftFolder(directory)
  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()
  t.after(async () => {
    await dispatcher.close()
    await fs.rm(directory, { recursive: true, force: true })
  })
  const options = { agent: { dispatcher, retryHandler: { retry: async () => false } } }
  const install = () => installResolvedAssetsTask(assets, folder, options).startAndWait()
  return { folder, pool: dispatcher.get(origin), install }
}

test('a rejected HEAD and a reset recover only the missing files, then work offline', async (t) => {
  const [ready, empty, absent] = ['already installed', 'sound', 'texture'].map(asset)
  const { folder, pool, install } = await setup(t, [ready, empty, absent])
  for (const item of [ready, empty]) {
    const file = folder.getAsset(item.hash)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, item === ready ? ready.name : '')
  }
  const route = item => `/${item.hash.slice(0, 2)}/${item.hash}`
  pool.intercept({ path: route(empty), method: 'HEAD' }).reply(503)
  pool.intercept({ path: route(absent), method: 'HEAD' })
    .replyWithError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
  const calls = []
  const notices = []
  async function request(url, init) {
    assert.ok(init.signal)
    const item = [empty, absent].find(candidate => origin + route(candidate) === url)
    assert.ok(item)
    const first = !calls.includes(item.name)
    calls.push(item.name)
    if (first && item === empty) throw new Error('read ECONNRESET')
    if (first && item === absent) return new Response('truncated')
    return new Response(item.name)
  }
  await installWithAssetRecovery(folder, install, request, count => notices.push(count))
  assert.deepEqual(notices, [2])
  assert.deepEqual(calls.sort(), [empty.name, empty.name, absent.name, absent.name].sort())
  for (const item of [ready, empty, absent]) assert.equal(await fs.readFile(folder.getAsset(item.hash), 'utf8'), item.name)
  await installWithAssetRecovery(folder, install, assert.fail, assert.fail)
})

test('a permanent HTTP failure preserves the original bytes and names the failed resource', async (t) => {
  const item = asset('missing sound')
  const { folder, pool, install } = await setup(t, [item])
  const file = folder.getAsset(item.hash)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, '')
  pool.intercept({ path: `/${item.hash.slice(0, 2)}/${item.hash}`, method: 'HEAD' }).reply(403)
  let calls = 0
  await assert.rejects(installWithAssetRecovery(folder, install, async () => {
    calls++
    return new Response(null, { status: 404 })
  }, () => {}), new RegExp(item.hash + '.*404'))
  assert.equal(calls, 1)
  assert.equal((await fs.stat(file)).size, 0)
  assert.deepEqual(await fs.readdir(path.dirname(file)), [item.hash])
})

test('a non-asset installation error propagates without recovery', async () => {
  const failure = new Error('missing version index')
  await assert.rejects(installWithAssetRecovery(undefined, async () => { throw failure }, assert.fail, assert.fail),
    error => error === failure)
})
