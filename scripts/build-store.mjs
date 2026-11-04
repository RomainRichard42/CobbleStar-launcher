// Partner Center signs the APPX after certification. The .exe feed is a separate channel.
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build, Platform, Arch } = require('electron-builder')
const { version } = require('../package.json')

const check = process.argv.includes('--check')
const env = process.env
const identity = check ? 'CobbleStar.PackageCheck' : env.STORE_IDENTITY_NAME
const publisher = check ? 'CN=PackageCheck' : env.STORE_PUBLISHER
const display = check ? 'Package check' : env.STORE_PUBLISHER_DISPLAY_NAME
const product = check ? 'CobbleStar Package Check' : env.STORE_DISPLAY_NAME
if (!identity || !/^[a-z0-9.-]{3,50}$/i.test(identity) || !publisher?.startsWith('CN=') || !display?.trim() || !product?.trim()) {
  throw new Error('Renseigner STORE_IDENTITY_NAME, STORE_PUBLISHER, STORE_PUBLISHER_DISPLAY_NAME et STORE_DISPLAY_NAME depuis Identité du produit dans Partner Center.')
}
const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
const [major, minor, patch] = version.split('.').map(Number)
const storeVersion = [major + 1, minor, patch, 0]
if (storeVersion.some(n => !Number.isInteger(n) || n < 0 || n > 65535)) throw new Error('Version Store invalide')

await build({
  targets: Platform.WINDOWS.createTarget('appx', Arch.x64),
  publish: 'never',
  config: {
    directories: { output: check ? 'release-store-check' : 'release-store' },
    artifactName: check ? 'CobbleStar-package-check.appx' : 'CobbleStar-Launcher-${version}-store-x64.appx',
    win: { signExecutable: false },
    appx: { applicationId: 'CobbleStar', identityName: identity, publisher: xml(publisher),
      publisherDisplayName: xml(display), displayName: xml(product), languages: ['fr-FR'],
      backgroundColor: '#211629', electronUpdaterAware: false, minVersion: '10.0.19041.0' },
    appxManifestCreated: async manifest => {
      // The Store reserves the fourth field and rejects major 0. Keep the app's own version.
      const original = await readFile(manifest, 'utf8')
      const identityVersion = /(<Identity\b[^>]*\bVersion=")[^"]+(")/
      if (!identityVersion.test(original)) throw new Error('Version absente du manifeste APPX')
      await writeFile(manifest, original.replace(identityVersion, (_, before, after) => before + storeVersion.join('.') + after))
    },
  },
})
