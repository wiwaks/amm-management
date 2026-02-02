export type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  email?: string
}

export type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}

type TokenClientConfig = {
  clientId: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
}

export function createGoogleTokenClient({
  clientId,
  scope,
  callback,
}: TokenClientConfig): GoogleTokenClient {
  const googleApi = window.google?.accounts?.oauth2
  if (!googleApi?.initTokenClient) {
    throw new Error('Google Identity Services not loaded.')
  }

  return googleApi.initTokenClient({
    client_id: clientId,
    scope,
    callback,
  })
}

/*declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: GoogleTokenResponse) => void
          }) => GoogleTokenClient
        }
      }
    }
  }
}*/
