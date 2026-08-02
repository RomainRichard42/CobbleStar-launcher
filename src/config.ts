export const launcherConfig = {
  name: 'CobbleStar',
  minecraftVersion: '1.21.1',
  loader: 'Fabric',
  server: {
    host: '23.109.138.130',
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
