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
    onDeviceCode(callback: (payload: { userCode: string; verificationUri: string; message: string }) => void): () => void
    platform: string
  }
}
