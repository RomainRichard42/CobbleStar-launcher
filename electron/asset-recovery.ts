import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import type { MinecraftFolder } from '@xmcl/core'

const resourceHost = 'https://resources.download.minecraft.net'
type FetchResource = (url: string, init: RequestInit) => Promise<Response>

function failedResources(error: unknown, hashes: Set<string>) {
  if (!(error instanceof AggregateError)) return
  if (error.name === 'DownloadAggregateError' && 'urls' in error && Array.isArray(error.urls)) {
    for (const url of error.urls) {
      if (typeof url !== 'string' || !url.startsWith(resourceHost + '/')) continue
      const match = /^\/([a-f0-9]{2})\/([a-f0-9]{40})$/.exec(url.slice(resourceHost.length))
      if (match && match[2].startsWith(match[1])) hashes.add(match[2])
    }
  }
  for (const child of error.errors) failedResources(child, hashes)
}

async function fetchVerifiedAsset(hash: string, request: FetchResource) {
  const url = `${resourceHost}/${hash.slice(0, 2)}/${hash}`
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined
    try {
      response = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
      if (response.status !== 200) {
        await response.body?.cancel()
        throw new Error(`HTTP ${response.status}`)
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (createHash('sha1').update(bytes).digest('hex') !== hash) throw new Error('Fichier incomplet ou corrompu')
      return bytes
    } catch (cause) {
      const status = response?.status
      const permanent = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
      const retryAfter = response?.headers.get('retry-after')
      const delay = retryAfter
        ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())
        : 0
      if (permanent || attempt >= 2 || delay > 30_000) {
        throw new Error(`Impossible de récupérer la ressource Minecraft ${hash} (${cause instanceof Error ? cause.message : cause}).`, { cause })
      }
      await wait(Math.max(1000 * 2 ** attempt, delay || 0))
    }
  }
}

export async function installWithAssetRecovery(
  folder: MinecraftFolder,
  installAssets: () => Promise<unknown>,
  request: FetchResource,
  onRecovery: (count: number) => void,
) {
  try {
    await installAssets()
    return
  } catch (error) {
    const hashes = new Set<string>()
    failedResources(error, hashes)
    if (!hashes.size) throw error
    onRecovery(hashes.size)
    for (const hash of hashes) {
      const bytes = await fetchVerifiedAsset(hash, request)
      const destination = folder.getAsset(hash)
      const temporary = `${destination}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(temporary, bytes, { flag: 'wx' })
        await fs.rename(temporary, destination)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    }
  }
  // Recheck the whole index and propagate any unrelated installation failures.
  await installAssets()
}
