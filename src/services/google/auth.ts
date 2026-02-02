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

  // Interception pour récupérer l'email
  const wrappedCallback = async (response: GoogleTokenResponse) => {
    if (response.error || !response.access_token) {
      callback(response)
      return
    }

    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${response.access_token}`,
        },
      })

      if (res.ok) {
        const profile = await res.json()
        // On injecte uniquement l'email dans la réponse finale
        callback({
          ...response,
          email: profile.email,
        })
      } else {
        const errorBody = await res.json();
        console.error('Détails erreur Google UserInfo:', errorBody);
        callback(response)
      }
    } catch (err) {
      console.error('Erreur lors de la récupération de l\'email:', err)
      callback(response)
    }
  }

  return googleApi.initTokenClient({
    client_id: clientId,
    scope, 
    callback: wrappedCallback,
  })
}

// À placer tout en bas de ton fichier
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: GoogleTokenResponse) => void | Promise<void>
          }) => GoogleTokenClient
        }
      }
    }
  }
}
