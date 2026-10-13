/// <reference types="vite/client" />

interface Window {
  cobblestar?: {
    minimize(): void
    maximize(): void
    getInfo(): Promise<LauncherInfo>
    getServerStatus(): Promise<ServerStatus>
    close(): void
    openExternal(url: string): Promise<void>
    getNews(): Promise<{ content: { articles: LauncherNews[] }; version: number }>
    openNewsSite(): Promise<void>
    loginMicrosoft(): Promise<
      | { ok: true; account: { id: string; name: string; skinUrl?: string; skinData?: string } }
      | { ok: false; code: string; message: string }
    >
    logoutMicrosoft(): Promise<{ ok: true }>
    getAccount(): Promise<{ id: string; name: string; skinUrl?: string; skinData?: string } | null>
    getSettings(): Promise<{ memoryMb: number }>
    saveSettings(settings: { memoryMb: number }): Promise<{ memoryMb: number }>
    repairInstallation(): Promise<{ ok: true } | { ok: false; message: string }>
    startGame(): Promise<
      | { ok: true }
      | { ok: false; code?: string; message: string }
    >
    onDeviceCode(callback: (payload: { userCode: string; verificationUri: string; message: string }) => void): () => void
    installUpdate(): Promise<{ ok: true } | { ok: false; message: string }>
    onUpdateStatus(callback: (payload: UpdateStatus) => void): () => void
    onGameStatus(callback: (payload: GameStatus) => void): () => void
    platform: string
  }
}

type LauncherInfo = { version: string; minecraftVersion: string; serverHost: string; serverPort: number; totalMemoryMb: number; modpackVersion?: string; websiteUrl?: string; discordUrl?: string }

type ServerStatus =
  | { state: 'online'; players: number; maxPlayers: number; checkedAt: number }
  | { state: 'unknown'; checkedAt: number }

type LauncherNews = {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  accent: 'cyan' | 'pink' | 'gold' | 'mint' | 'violet'
  image: string
  publishedAt: string
  published: boolean
  featured: boolean
}

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'current'; version: string }
  | { state: 'error'; message: string }

type GameStatus = {
  state: 'preparing' | 'running' | 'stopped' | 'error'
  phase: string
  progress?: number
  message?: string
}
