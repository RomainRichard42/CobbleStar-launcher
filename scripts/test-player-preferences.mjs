import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { installPackFile, removeRetiredPackFiles } from '../dist-electron/pack-files.js'

test('updating a legacy install or repairing it preserves player settings and updates pack content', async t => {
  const game = await fs.mkdtemp(path.join(tmpdir(), 'cobblestar-preferences-'))
  t.after(() => fs.rm(game, { recursive: true, force: true }))
  const preferences = {
    'options.txt': 'key_key.cobblestar_planets.menu:key.keyboard.k\r\nkey_key.cobblemon.summary:key.keyboard.unknown\r\nguiScale:4\r\nmenuBackgroundBlurriness:6\r\ngraphicsMode:2\r\n',
    'config/iris.properties': 'shaderPack=Old.zip\nenableShaders=true\n',
    'config/sodium-options.json': '{"quality":{"weather_quality":"FAST"}}',
    'shaderpacks/Old.zip.txt': 'SHADOW_QUALITY=3\n',
  }
  const legacy = [...Object.keys(preferences), 'mods/old.jar', 'shaderpacks/Old.zip', 'config/yosbr/options.txt']
  const install = (file, text) => installPackFile(game, file, async () => Buffer.from(text))
  const read = file => fs.readFile(path.join(game, file), 'utf8')
  for (const file of legacy) await install(file, 'initial')
  for (const [file, userValue] of Object.entries(preferences)) await fs.writeFile(path.join(game, file), userValue)
  const next = ['mods/new.jar', 'shaderpacks/New.zip', 'config/yosbr/options.txt', 'options.txt', 'config/sodium-options.json']
  for (const previous of [legacy, []]) { // Existing marker, then the repair path with no marker.
    for (const file of next) await install(file, 'updated')
    await removeRetiredPackFiles(game, previous, next)
    for (const [file, userValue] of Object.entries(preferences)) assert.equal(await read(file), userValue)
    assert.equal(await read('shaderpacks/Old.zip'), 'initial')
    assert.equal(await read('config/yosbr/options.txt'), 'updated')
    assert.equal(await read('mods/new.jar'), 'updated')
    await assert.rejects(read('mods/old.jar'), { code: 'ENOENT' })
  }
  await assert.rejects(installPackFile(game, 'mods/new.jar', async () => { throw Error('network failure') }))
  assert.equal(await read('mods/new.jar'), 'updated')
})
