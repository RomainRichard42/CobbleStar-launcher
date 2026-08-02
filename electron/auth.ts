import { PublicClientApplication } from '@azure/msal-node'
import { MicrosoftAuthenticator } from '@xmcl/user/dist/index.mjs'
import { BrowserWindow, shell } from 'electron'

export type MinecraftAccount = {
  id: string
  name: string
  skinUrl?: string
}

type MinecraftProfileResponse = {
  id: string
  name: string
  skins?: Array<{ url: string; state?: string }>
}

let currentAccount: MinecraftAccount | null = null
let minecraftAccessToken: string | null = null

export async function loginMicrosoft(window: BrowserWindow, clientId: string) {
  if (!clientId || clientId === 'REMPLACE_PAR_TON_CLIENT_ID') {
    return {
      ok: false as const,
      code: 'missing_client_id',
      message: "L’identifiant d’application Microsoft n’est pas encore configuré.",
    }
  }

  try {
    const application = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/consumers',
      },
    })

    const microsoftResult = await application.acquireTokenByDeviceCode({
      scopes: ['XboxLive.signin', 'offline_access'],
      deviceCodeCallback: (response) => {
        const compatibleResponse = response as typeof response & {
          verification_uri?: string
          user_code?: string
        }
        const verificationUri = compatibleResponse.verificationUri
          ?? compatibleResponse.verification_uri
          ?? 'https://microsoft.com/devicelogin'
        const userCode = compatibleResponse.userCode ?? compatibleResponse.user_code ?? ''

        window.webContents.send('auth:device-code', {
          userCode,
          verificationUri,
          message: response.message,
        })
        void shell.openExternal(verificationUri)
      },
    })

    if (!microsoftResult?.accessToken) throw new Error('Microsoft n’a retourné aucun jeton de connexion.')

    const authenticator = new MicrosoftAuthenticator()
    const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(microsoftResult.accessToken)
    const claim = minecraftXstsResponse.DisplayClaims.xui[0]
    const minecraftResult = await authenticator.loginMinecraftWithXBox(claim.uhs, minecraftXstsResponse.Token)

    const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${minecraftResult.access_token}` },
    })

    if (!profileResponse.ok) {
      if (profileResponse.status === 404) {
        throw new Error('Ce compte Microsoft ne possède pas de profil Minecraft Java.')
      }
      throw new Error(`Impossible de récupérer le profil Minecraft (${profileResponse.status}).`)
    }

    const profile = await profileResponse.json() as MinecraftProfileResponse
    minecraftAccessToken = minecraftResult.access_token
    currentAccount = {
      id: profile.id,
      name: profile.name,
      skinUrl: profile.skins?.find((skin) => skin.state === 'ACTIVE')?.url ?? profile.skins?.[0]?.url,
    }

    return { ok: true as const, account: currentAccount }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La connexion Microsoft a échoué.'
    return { ok: false as const, code: 'auth_failed', message }
  }
}

export function getMinecraftAccount() {
  return currentAccount
}

export function getMinecraftAccessToken() {
  return minecraftAccessToken
}

export function logoutMicrosoft() {
  currentAccount = null
  minecraftAccessToken = null
  return { ok: true as const }
}
