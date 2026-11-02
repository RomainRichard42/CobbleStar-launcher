import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateServerPackOptions } from '../dist-electron/resource-packs.js'

test('Managed packs move to the server without touching personal packs or GUI settings', () => {
  const before='guiScale:2\r\nresourcePacks:["vanilla","fabric","cobblemon:gyaradosjump","file/E19 Cobblemon Minimap Icons.zip","file/PackPackStar.zip","file/NouveauTags.zip","file/Personal.zip","openloader/local"]\r\nincompatibleResourcePacks:["file/NouveauTags.zip","file/Personal.zip"]\r\nvolume:0.4\r\n'
  assert.equal(migrateServerPackOptions(before),'guiScale:2\r\nresourcePacks:["vanilla","fabric","cobblemon:gyaradosjump","file/Personal.zip","openloader/local"]\r\nincompatibleResourcePacks:["file/Personal.zip"]\r\nvolume:0.4\r\n')
})
test('No file packs are reactivated and migration is idempotent', () => {
  for(const before of ['resourcePacks:[]\n','resourcePacks:["vanilla","fabric"]\n','guiScale:3\n','resourcePacks:[broken]\n']){
    assert.equal(migrateServerPackOptions(before),before)
    assert.equal(migrateServerPackOptions(migrateServerPackOptions(before)),before)
  }
})
