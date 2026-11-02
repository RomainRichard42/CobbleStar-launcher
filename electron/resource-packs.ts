const bundledOnServer = new Set([
  'file/E19 Cobblemon Minimap Icons.zip',
  'file/PackPackStar.zip',
  'file/NouveauTags.zip',
])

/** These managed packs now arrive together via the mandatory server publication. */
export function migrateServerPackOptions(options: string): string {
  return options.replace(/^(?:incompatibleResourcePacks|resourcePacks):\[[^\r\n]*$/gm, (line) => {
    const start = line.indexOf('['), end = line.lastIndexOf(']')
    if (end < start) return line
    let packs: unknown
    try { packs = JSON.parse(line.slice(start, end + 1)) } catch { return line }
    if (!Array.isArray(packs)) return line
    const retained = packs.filter((pack) => typeof pack !== 'string' || !bundledOnServer.has(pack))
    if (retained.length === packs.length) return line
    return line.slice(0, start) + JSON.stringify(retained) + line.slice(end + 1)
  })
}
