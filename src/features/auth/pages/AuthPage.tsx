import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGoogleTokenClient, type GoogleTokenClient } from '../../../services/google/auth'
import { createNewUser } from '../../../services/supabase/users'
import { Button } from '../../../shared/components/ui/button'
import { Logo } from '../../../shared/components/Logo'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '../../../shared/components/ui/card'
import { clearSession, createSession, getSession } from '../../../shared/auth/sessionManager'
import { MeshGradient } from '../../../shared/components/MeshGradient'

function AuthPage() {
  const [tokenError, setTokenError] = useState<string | null>(null)
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined

  const navigate = useNavigate()

  useEffect(() => {
    const existingSession = getSession()
    if (existingSession) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  const scopes = [
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/forms.body.readonly',
    'openid',
    'email',
    'profile',
  ].join(' ')

  const handleGoogleLogin = () => {
    setTokenError(null)
    if (!googleClientId) {
      setTokenError('Missing VITE_GOOGLE_CLIENT_ID.')
      return
    }

    try {
      if (!tokenClientRef.current) {
        tokenClientRef.current = createGoogleTokenClient({
          clientId: googleClientId,
          scope: scopes,
          callback: async (response) => {
            if (response.error) {
              setTokenError(response.error_description || response.error)
              clearSession()
              return
            }

            if (response.access_token) {
              if (!response.email) {
                setTokenError('Email not found in Google token response.')
                return
              }

              const userResult = await createNewUser(response.email)
              if (userResult.success !== true) {
                setTokenError(userResult.message || 'Failed to create user.')
                return
              }

              setTokenError(null)
              createSession(response.access_token, {
                email: response.email,
                displayName: response.displayName,
                avatarUrl: response.avatarUrl,
              })
              navigate('/dashboard')
            }
          },
        })
      }

      tokenClientRef.current.requestAccessToken({ prompt: '' })
    } catch (error) {
      setTokenError(
        error instanceof Error ? error.message : 'Google auth failed.',
      )
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <MeshGradient
        colors={['#C3423F', '#D4785C', '#E8A87C', '#FBDBB2']}
        className="pointer-events-none"
      />

      <Card className="relative z-10 w-full max-w-sm backdrop-blur-sm">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-2" size="lg" subtitle="Back office" />
          <CardDescription>
            Connectez-vous pour accéder au back office.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full"
          >
            Se connecter avec Google
          </Button>

          {tokenError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {tokenError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default AuthPage
