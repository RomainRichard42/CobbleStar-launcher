declare module '@xmcl/user/dist/index.mjs' {
  type XBoxResponse = {
    Token: string
    DisplayClaims: { xui: [{ uhs: string; xid: string; gtg: string }] }
  }

  export class MicrosoftAuthenticator {
    acquireXBoxToken(oauthAccessToken: string, signal?: AbortSignal): Promise<{
      minecraftXstsResponse: XBoxResponse
      liveXstsResponse?: XBoxResponse
    }>
    loginMinecraftWithXBox(uhs: string, xstsToken: string, signal?: AbortSignal): Promise<{
      access_token: string
      expires_in: number
      username: string
    }>
  }
}
