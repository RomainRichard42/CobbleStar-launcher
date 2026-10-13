import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const archive = resolve(
  process.argv[2] || 'release-0.8.2-explorer-local/win-unpacked/resources/app.asar',
)
const root = process.cwd()
let checked = 0
function verify(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) verify(file)
    else {
      const key = relative(root, file)
      assert.ok(
        readFileSync(file).equals(asar.extractFile(archive, key)),
        `Archive differs: ${key}`,
      )
      checked++
    }
  }
}
verify(resolve('dist'))
verify(resolve('dist-electron'))
assert.equal(
  JSON.parse(asar.extractFile(archive, 'package.json')).version,
  JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version,
)
assert.ok(
  asar.extractFile(archive, join('src', 'assets', 'RUBIK-OFL.txt')).length >
    100,
)
assert.ok(
  !asar
    .listPackage(archive)
    .some((file) => /ui-review|test-ui|smoke-electron|\.env($|\.)/.test(file)),
)
console.log(
  `${checked} compiled files match app.asar; version, font license and absence of test fixtures verified.`,
)
