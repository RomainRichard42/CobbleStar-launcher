export const launcherConfig = {
  name: 'CobbleStar',
  minecraftVersion: '1.21.1',
  loader: 'Fabric',
  server: {
    host: 'play.cobblestar-mc.fr',
    port: 25574,
  },
  endpoints: {
    news: '',
    manifest: '',
    status: '',
    website: '',
    discord: '',
  },
  defaults: {
    memoryMb: 4096,
  },
} as const
