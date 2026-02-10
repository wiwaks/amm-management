import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGoogleTokenClient, type GoogleTokenClient } from '../../../services/google/auth'
import { createNewUser } from '../../../services/supabase/users'
import type { UserSession } from '../../../shared/types'
import { Button } from '../../../shared/components/ui/button'
import { Badge } from '../../../shared/components/ui/badge'
import { Logo } from '../../../shared/components/Logo'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import { clearSession, createSession, getSession } from '../../../shared/auth/sessionManager'

const HIGHLIGHTS = [
  'Google Identity Services',
  'Import en 1 clic',
  'Sessions sécurisées',
  'Traçabilité complète',
]

const STEPS = [
  {
    title: 'Connexion Google',
    description: 'Authentification rapide et sécurisée.',
  },
  {
    title: 'Création de compte',
    description: 'Enregistrement automatique dans Supabase.',
  },
  {
    title: 'Import guidé',
    description: 'Prévisualisez puis importez les réponses.',
  },
]

function AuthPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined

  const navigate = useNavigate()

  useEffect(() => {
    const existingSession = getSession()
    if (existingSession) {
      setAccessToken(existingSession.accessToken)
      setUserSession(existingSession)
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
              setAccessToken(null)
              setUserSession(null)
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
              setAccessToken(response.access_token)
              const newSession = createSession(response.access_token)
              setUserSession(newSession)
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

  const sessionExpiresAt = userSession
    ? new Date(userSession.expiresAt)
    : null
  const sessionExpiresLabel = sessionExpiresAt
    ? sessionExpiresAt.toLocaleString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      })
    : null

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 right-0 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Logo subtitle="Agence matrimoniale" />
            <div className="hidden h-6 w-px bg-border/60 sm:block" />
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-muted-foreground">
              <Badge variant="outline" className="tracking-normal">
                Back office
              </Badge>
              <span>Import</span>
            </div>
          </div>
          <Badge variant={accessToken ? 'success' : 'outline'}>
            {accessToken ? 'Connecté' : 'Non connecté'}
          </Badge>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Importer les réponses
              </p>
              <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">
                Un portail élégant pour{' '}
                <span className="text-primary">vos données Google Forms</span>.
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground md:text-base">
                Authentifiez-vous, visualisez les réponses et lancez l’import
                Supabase dans une interface pensée pour un usage back office
                quotidien.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {HIGHLIGHTS.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <Card key={step.title} className="border-border/60 bg-card/70">
                  <CardHeader className="pb-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      étape {index + 1}
                    </p>
                    <CardTitle className="text-base">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {step.description}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/60 bg-card/70">
                <CardHeader>
                  <CardTitle className="text-base">
                    Sécurité et conformité
                  </CardTitle>
                  <CardDescription>
                    Aucune clé sensible côté client.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-border/60 bg-card/70">
                <CardHeader>
                  <CardTitle className="text-base">Auditabilité</CardTitle>
                  <CardDescription>
                    Sessions loguées et import traçable.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </section>

          <Card className="border-border/60 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-2xl">
                Authentification
              </CardTitle>
              <CardDescription>
                Connectez-vous pour accéder au back office.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Statut
                  </span>
                  <Badge variant={accessToken ? 'success' : 'outline'}>
                    {accessToken ? 'Connecté' : 'Non connecté'}
                  </Badge>
                </div>
                {userSession ? (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>
                      Session:{' '}
                      <span className="text-foreground">
                        {userSession.sessionId.slice(0, 20)}…
                      </span>
                    </p>
                    {sessionExpiresLabel ? (
                      <p>
                        Expire le:{' '}
                        <span className="text-foreground">
                          {sessionExpiresLabel}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Aucun compte actif. Connectez-vous pour accéder à l’import.
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full"
              >
                Se connecter avec Google
              </Button>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-xs text-muted-foreground">
                Scopes: forms.responses.readonly · forms.body.readonly ·
                profile · email
              </div>

              {tokenError ? (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
                  {tokenError}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AuthPage
