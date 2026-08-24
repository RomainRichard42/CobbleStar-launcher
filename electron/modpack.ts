export type ModpackAsset = {
  name?: string
  browser_download_url?: string
  updated_at?: string
}

function semanticVersion(name = '') {
  const matches = [...name.matchAll(/(\d+)\.(\d+)\.(\d+)/g)]
  const match = matches.at(-1)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function compareVersions(left: number[], right: number[]) {
  for (let index = 0; index < 3; index += 1) {
    const difference = right[index] - left[index]
    if (difference !== 0) return difference
  }
  return 0
}

export function selectLatestModpackAsset(assets: ModpackAsset[] = []) {
  return [...assets]
    .filter((asset) => asset.name?.toLowerCase().endsWith('.mrpack') && asset.browser_download_url)
    .sort((left, right) => {
      const leftVersion = semanticVersion(left.name)
      const rightVersion = semanticVersion(right.name)
      if (leftVersion && rightVersion) {
        const versionOrder = compareVersions(leftVersion, rightVersion)
        if (versionOrder !== 0) return versionOrder
      } else if (leftVersion) return -1
      else if (rightVersion) return 1

      const dateOrder = Date.parse(right.updated_at ?? '') - Date.parse(left.updated_at ?? '')
      if (Number.isFinite(dateOrder) && dateOrder !== 0) return dateOrder
      return (right.name ?? '').localeCompare(left.name ?? '', undefined, { numeric: true })
    })[0]
}
