import { PublicClientApplication } from '@azure/msal-node'
import type { ICachePlugin, INetworkModule, NetworkRequestOptions, NetworkResponse, TokenCacheContext } from '@azure/msal-node'
import { app, BrowserWindow, net, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

// MSAL's default HTTP client relies on une option Undici `throwOnError`
// incompatible avec le runtime Node/Electron des builds packagés
// (plante avec "invalid throwOnError"). On fait passer les requêtes de MSAL
// par net.fetch d'Electron, comme le fait déjà postJson plus bas.
function createElectronNetworkClient(): INetworkModule {
  async function sendRequest<T>(
    url: string,
    method: 'GET' | 'POST',
    options?: NetworkRequestOptions,
  ): Promise<NetworkResponse<T>> {
    const headers: Record<string, string> = { ...(options?.headers ?? {}) }
    let body: string | undefined

   if (method === 'POST') {
      headers['content-type'] = headers['content-type'] ?? 'application/x-www-form-urlencoded'
      const data = options?.body
      if (typeof data === 'string') {
        body = data
      } else if (data && typeof data === 'object') {
        body = new URLSearchParams(data as unknown as Record<string, string>).toString()
      } else {
        body = ''
      }
    }

    const response = await net.fetch(url, { method, headers, body })
    const text = await response.text()

    let parsedBody: T
    try {
      parsedBody = JSON.parse(text) as T
    } catch {
      parsedBody = text as unknown as T
    }

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return { headers: responseHeaders, body: parsedBody, status: response.status }
  }

  return {
    sendGetRequestAsync: (url, options) => sendRequest(url, 'GET', options),
    sendPostRequestAsync: (url, options) => sendRequest(url, 'POST', options),
  }
}

export type MinecraftAccount = {
  id: string
  name: string
  skinUrl?: string
  skinData?: string
}

type MinecraftProfileResponse = {
  id: string
  name: string
  skins?: Array<{ url: string; state?: string }>
}

type XboxResponse = {
  Token: string
  // `xid` est le XUID du compte Xbox. Minecraft 1.19+ le réclame via --xuid
  // pour joindre les services multijoueur (dont la résolution des skins).
  DisplayClaims: { xui: Array<{ uhs: string; xid?: string }> }
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
let minecraftXuid: string | null = null
let tokenIssuedAt = 0

// Le launcher affiche la tête du joueur, qu'il découpe dans le PNG du skin
// avec un canvas. Or un canvas alimenté par une image d'un autre domaine
// devient « tainted » et refuse toDataURL()/getImageData(). On rapatrie donc
// le skin ici pour le transmettre au renderer en data URI : côté renderer
// l'image est alors same-origin et le découpage fonctionne toujours.
async function fetchSkinData(url?: string) {
  if (!url) return undefined
  try {
    const response = await net.fetch(url)
    if (!response.ok) return undefined
    return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch {
    // Une tête manquante ne doit jamais empêcher de se connecter.
    return undefined
  }
}

// --- Persistance du cache MSAL --------------------------------------------
// Sans cache plugin, MSAL garde tout en mémoire : dès que l'app redémarre,
// le refresh token disparaît et il faut refaire le flux device code complet.
// On sérialise donc le cache MSAL sur disque (dossier userData) et on le
// recharge à chaque démarrage, ce qui permet un `acquireTokenSilent` sans
// aucune interaction utilisateur tant que le refresh token est valide.
function msalCachePath() {
  return path.join(app.getPath('userData'), 'msal-cache.json')
}

const msalCachePlugin: ICachePlugin = {
  async beforeCacheAccess(context: TokenCacheContext) {
    try {
      const data = await fs.readFile(msalCachePath(), 'utf8')
      context.tokenCache.deserialize(data)
    } catch {
      // Pas encore de cache : premier lancement, rien à charger.
    }
  },
  async afterCacheAccess(context: TokenCacheContext) {
    if (!context.cacheHasChanged) return
    await fs.mkdir(path.dirname(msalCachePath()), { recursive: true })
    await fs.writeFile(msalCachePath(), context.tokenCache.serialize(), 'utf8')
  },
}

let msalApp: PublicClientApplication | null = null
let msalAppClientId: string | null = null

function getMsalApp(clientId: string) {
  if (!msalApp || msalAppClientId !== clientId) {
    msalApp = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/consumers',
      },
      system: {
        networkClient: createElectronNetworkClient(),
      },
      cache: {
        cachePlugin: msalCachePlugin,
      },
    })
    msalAppClientId = clientId
  }
  return msalApp
}

const MS_SCOPES = ['XboxLive.signin', 'offline_access']

// Échange un access token Microsoft (obtenu via MSAL) contre un compte
// Minecraft complet, via la chaîne Xbox Live -> XSTS -> Minecraft Services.
// Ces appels ne nécessitent aucune interaction utilisateur : ils peuvent
// donc être rejoués silencieusement à chaque démarrage tant que MSAL arrive
// à rafraîchir son propre token en silence.
async function exchangeMicrosoftToken(microsoftAccessToken: string) {
  // These calls deliberately use Electron's network stack. This avoids the
  // incompatible Undici `throwOnError` option that affected packaged builds.
  const xboxLive = await postJson<XboxResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${microsoftAccessToken}`,
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
  minecraftXuid = claim.xid ?? null
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
  tokenIssuedAt = Date.now()
  const skinUrl = profile.skins?.find((skin) => skin.state === 'ACTIVE')?.url ?? profile.skins?.[0]?.url
  currentAccount = {
    id: profile.id,
    name: profile.name,
    skinUrl,
    skinData: await fetchSkinData(skinUrl),
  }
  return currentAccount
}

// Le jeton Minecraft ne vit qu'environ 24 h. Un launcher resté ouvert toute
// une nuit lancerait donc le jeu avec un jeton périmé, et le serveur
// refuserait l'entrée ("Failed to verify username") alors que le launcher
// affiche toujours le compte comme connecté. On le renouvelle silencieusement
// avant chaque lancement dès qu'il n'est plus tout frais.
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000

export async function ensureFreshSession(clientId: string) {
  if (!currentAccount || Date.now() - tokenIssuedAt < TOKEN_MAX_AGE_MS) return
  // En cas d'échec on garde le jeton actuel : il a encore une chance de
  // passer, et startGame remontera une erreur claire sinon.
  await restoreSession(clientId)
}

// À appeler au démarrage du launcher : tente de restaurer la session à
// partir du cache MSAL persisté sur disque, sans ouvrir de navigateur ni
// demander quoi que ce soit à l'utilisateur.
export async function restoreSession(clientId: string) {
  if (!clientId || clientId === 'REMPLACE_PAR_TON_CLIENT_ID') return { ok: false as const }

  try {
    const application = getMsalApp(clientId)
    const accounts = await application.getTokenCache().getAllAccounts()
    const account = accounts[0]
    if (!account) return { ok: false as const }

    const silentResult = await application.acquireTokenSilent({ account, scopes: MS_SCOPES })
    if (!silentResult?.accessToken) return { ok: false as const }

    const minecraftAccount = await exchangeMicrosoftToken(silentResult.accessToken)
    return { ok: true as const, account: minecraftAccount }
  } catch {
    // Refresh token expiré/révoqué, ou pas encore de session : il faudra
    // repasser par le flux device code.
    return { ok: false as const }
  }
}

export async function loginMicrosoft(window: BrowserWindow, clientId: string) {
  if (!clientId || clientId === 'REMPLACE_PAR_TON_CLIENT_ID') {
    return {
      ok: false as const,
      code: 'missing_client_id',
      message: "L’identifiant d’application Microsoft n’est pas encore configuré.",
    }
  }

  try {
    const application = getMsalApp(clientId)

    const microsoftResult = await application.acquireTokenByDeviceCode({
      scopes: MS_SCOPES,
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

    const account = await exchangeMicrosoftToken(microsoftResult.accessToken)
    return { ok: true as const, account }
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

// Minecraft 1.19+ attend --xuid et --clientId sur la ligne de commande.
// Les valeurs vides sont pires que rien : @xmcl/core réinjecte alors le
// placeholder brut (`${auth_xuid}`), donc on retombe sur '0' à défaut.
export function getMinecraftIdentity() {
  return { xuid: minecraftXuid || '0', clientId: msalAppClientId || '0' }
}

export async function logoutMicrosoft() {
  currentAccount = null
  minecraftAccessToken = null
  minecraftXuid = null
  tokenIssuedAt = 0
  if (msalApp) {
    const accounts = await msalApp.getTokenCache().getAllAccounts()
    await Promise.all(accounts.map((account) => msalApp!.getTokenCache().removeAccount(account)))
  }
  return { ok: true as const }
}
