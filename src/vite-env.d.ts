/// <reference types="vite/client" />

interface Window {
  cobblestar?: {
    minimize(): void
    close(): void
    openExternal(url: string): Promise<void>
    loginMicrosoft(): Promise<
      | { ok: true; account: { id: string; name: string; skinUrl?: string } }
      | { ok: false; code: string; message: string }
    >
    logoutMicrosoft(): Promise<{ ok: true }>
    getAccount(): Promise<{ id: string; name: string; skinUrl?: string } | null>
    getSettings(): Promise<{ memoryMb: number }>
    saveSettings(settings: { memoryMb: number }): Promise<{ memoryMb: number }>
    startGame(): Promise<
      | { ok: true }
      | { ok: false; code?: string; message: string }
    >
    onDeviceCode(callback: (payload: { userCode: string; verificationUri: string; message: string }) => void): () => void
    installUpdate(): void
    onUpdateStatus(callback: (payload: UpdateStatus) => void): () => void
    onGameStatus(callback: (payload: GameStatus) => void): () => void
    platform: string
  }
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
