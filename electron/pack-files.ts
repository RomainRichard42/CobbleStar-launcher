import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function packPath(input: string) {
  const relative = input.replaceAll('\\', '/')
  if (!relative || relative.startsWith('/') || relative.includes(':') || relative.split('/').includes('..')) {
    throw new Error(`Chemin interdit dans le modpack : ${input}`)
  }
  const normalized = path.posix.normalize(relative)
  if (normalized === '.') throw new Error('Chemin de fichier vide dans le modpack.')
  return normalized
}

// Templates and distributed mod assets belong to the pack. Live mod configuration
// files belong to the player as soon as they are created, including on old installs.
function isPlayerPreference(relative: string) {
  const key = relative.toLowerCase()
  if (/^options[^/]*\.txt$/.test(key) || /^shaderpacks\/.+\.txt$/.test(key)) return true
  return key.startsWith('config/') && !/^config\/(yosbr|openloader|fancymenu)\//.test(key)
}

export async function installPackFile(gamePath: string, input: string, contents: () => Promise<Buffer>) {
  const relative = packPath(input)
  const target = path.join(gamePath, relative)
  if (isPlayerPreference(relative)) {
    try {
      await fs.access(target)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const data = await contents()
    await fs.mkdir(path.dirname(target), { recursive: true })
    try {
      await fs.writeFile(target, data, { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return
  }

  const data = await contents()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await replaceFile(target, data)
}

// Leave the previous file intact until the replacement has been written in full.
export async function replaceFile(target: string, data: Buffer | string) {
  const temp = target + '.' + randomUUID() + '.tmp'
  try {
    await fs.writeFile(temp, data)
    await fs.rename(temp, target)
  } finally {
    await fs.rm(temp, { force: true })
  }
}

export async function removeRetiredPackFiles(gamePath: string, previous: string[], installed: string[]) {
  const identity = (name: string) => process.platform === 'win32' ? name.toLowerCase() : name
  const current = new Set(installed.map(name => identity(packPath(name))))
  for (const name of previous) {
    const relative = packPath(name)
    // Iris selects a shader by filename. An older version may still be selected
    // or have presets attached to it after a newer archive joins the pack.
    if (current.has(identity(relative)) || isPlayerPreference(relative) || /^shaderpacks\//i.test(relative)) continue
    await fs.rm(path.join(gamePath, relative), { force: true })
  }
}
