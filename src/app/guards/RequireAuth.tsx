import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  clearSession,
  getSession,
  renewSession,
} from '../../shared/auth/sessionManager'
import {
  createGoogleTokenClient,
  type GoogleTokenClient,
} from '../../services/google/auth'

const RENEW_BEFORE_MS = 5 * 60 * 1000 // 5 minutes avant expiration

export default function RequireAuth() {
  const navigate = useNavigate()
  const [session, setSession] = useState(() => getSession())
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined

  // Initialise le token client Google pour le renouvellement silencieux
  useEffect(() => {
    if (!googleClientId || tokenClientRef.current) return

    try {
      tokenClientRef.current = createGoogleTokenClient({
        clientId: googleClientId,
        scope: [
          'https://www.googleapis.com/auth/forms.responses.readonly',
          'https://www.googleapis.com/auth/forms.body.readonly',
          'openid',
          'email',
          'profile',
        ].join(' '),
        callback: (response) => {
          if (response.error || !response.access_token) {
            // Renouvellement échoué → on laisse expirer normalement
            console.warn('Silent token renewal failed:', response.error)
            return
          }
          const renewed = renewSession(response.access_token)
          if (renewed) {
            setSession(renewed)
          }
        },
      })
    } catch {
      // GIS pas encore chargé — le fallback interval s'en occupera
    }
  }, [googleClientId])

  // Timer de renouvellement silencieux ~5min avant expiration
  useEffect(() => {
    if (!session) return

    const expiresAt = new Date(session.expiresAt).getTime()
    const msUntilRenew = expiresAt - Date.now() - RENEW_BEFORE_MS

    if (msUntilRenew > 0) {
      const timeout = setTimeout(() => {
        if (tokenClientRef.current) {
          tokenClientRef.current.requestAccessToken({ prompt: '' })
        }
      }, msUntilRenew)
      return () => clearTimeout(timeout)
    }

    // Moins de 5min restantes → renouveler immédiatement
    if (expiresAt > Date.now() && tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: '' })
    }
  }, [session])

  // Fallback : vérification par intervalle + redirect si expiré
  useEffect(() => {
    const interval = setInterval(() => {
      if (!getSession()) {
        clearSession()
        navigate('/', { replace: true })
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [navigate])

  if (!session || !session.accessToken) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
