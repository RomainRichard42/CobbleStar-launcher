import { PublicClientApplication } from '@azure/msal-node'
import { BrowserWindow, net, shell } from 'electron'

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

type XboxResponse = {
  Token: string
  DisplayClaims: { xui: Array<{ uhs: string }> }
}

async function postJson<T>(url: string, body: object): Promise<T> {
  const response = await net.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Service Microsoft indisponible (${response.status}) : ${text}`)
  return JSON.parse(text) as T
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

    // These calls deliberately use Electron's network stack. This avoids the
    // incompatible Undici `throwOnError` option that affected packaged builds.
    const xboxLive = await postJson<XboxResponse>('https://user.auth.xboxlive.com/user/authenticate', {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${microsoftResult.accessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    })
    const minecraftXstsResponse = await postJson<XboxResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xboxLive.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    })
    const claim = minecraftXstsResponse.DisplayClaims.xui[0]
    if (!claim) throw new Error('Microsoft n’a retourné aucun profil Xbox.')
    const minecraftResult = await postJson<{ access_token: string }>(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      { identityToken: `XBL3.0 x=${claim.uhs};${minecraftXstsResponse.Token}` },
    )

    const profileResponse = await net.fetch('https://api.minecraftservices.com/minecraft/profile', {
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
