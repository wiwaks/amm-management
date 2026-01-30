import { useRef, useState, useEffect } from 'react'
import { createGoogleTokenClient, type GoogleTokenClient } from './googleAuth'
import type { UserSession } from './types'
import { Button } from './components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card'
// Import des fonctions de gestion de session
import {
  createSession,
  getSession,
  clearSession,
} from './sessionManager'
import Dashboard from './dashboard'
import {useNavigate} from "react-router-dom";
import {createNewUser} from "./userManager";

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  // État pour stocker la session utilisateur actuelle
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  const navigate = useNavigate();
  const handleRedirectToDash = () => {
    navigate('/dashboard')
  }

  // Effet pour charger la session au montage du composant
  useEffect(() => {
    const existingSession = getSession()
    if (existingSession) {
      // Si une session existe, restaurer le token d'accès et la session
      setAccessToken(existingSession.accessToken)
      setUserSession(existingSession)
    }
  }, [])

  const scopes = [
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/forms.body.readonly',
  ].join(' ')

  const handleGoogleLogin = () => {
    setTokenError(null)
    if (!googleClientId) {
      setTokenError('Missing VITE_GOOGLE_CLIENT_ID.')
      return
    }
// Lance le flux d'authentification Google
    try {
      if (!tokenClientRef.current) {
        tokenClientRef.current = createGoogleTokenClient({
          clientId: googleClientId,
          scope: scopes,
          callback: async (response) => {
            // Traitement de la réponse de Google
            // Gère les erreurs et stocke l'accessToken
            
            // Si une erreur est rencontrée, nettoyer l'accessToken
            if (response.error) {
              setTokenError(response.error_description || response.error)
              setAccessToken(null)
              // Nettoyer la session en cas d'erreur
              setUserSession(null)
              clearSession()
              return
            }
            // Si l'authentification est réussie, stocker l'accessToken
            if (response.access_token) {
              // vérification en BDD et création de session
              if (!response.email) {
                console.log('Google token response:', response.email)
                setTokenError('Email not found in Google token response.')
                return
              }
              const userResult = await createNewUser(response.email)
              if (userResult.success === true) {
                setTokenError(null)
                setAccessToken(response.access_token)
                // Créer une session avec l'accessToken après connexion réussie
                // redirect to dashboard
                const newSession = createSession(response.access_token)
                setUserSession(newSession)
                handleRedirectToDash()
              }
              

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

  const handleGoogleLogout = () => {
    // Réinitialiser tous les états liés à la session
    setAccessToken(null)
    setUserSession(null)
    setTokenError(null)
    // Supprimer la session du localStorage
    clearSession()
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              amm-management
            </p>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              POC Import Google Form → Supabase (amm-management)
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Authentifiez-vous avec Google, prévisualisez les réponses du
              formulaire, puis importez-les dans Supabase via l'Edge Function.
            </p>
            {/* Affichage des informations de session si connecté */}
            {userSession && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                <p className="text-emerald-700">
                  <strong>Session active:</strong> {userSession.sessionId.substring(0, 20)}...
                </p>
              </div>
            )}
          </div>
          <div className="inline-flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium">
              <span
                className={
                  accessToken ? 'text-emerald-300' : 'text-muted-foreground'
                }
              >
                {accessToken ? '✅ Google connecté' : 'Google non connecté'}
              </span>
            </div>
          </div>
        </header>

        <Card className="border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle>Authentification Google</CardTitle>
            <CardDescription>
              Utilise Google Identity Services avec les scopes Forms requis.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button type="button" onClick={handleGoogleLogin}>
              Se connecter à Google
            </Button>
            <span className="text-sm text-muted-foreground">
              Scopes: forms.responses.readonly + forms.body.readonly
            </span>
            {tokenError ? (
              <span className="text-sm text-destructive">{tokenError}</span>
            ) : null}
          </CardContent>
        </Card>

        {accessToken && (
          <Dashboard
            accessToken={accessToken}
            userSession={userSession}
            onLogout={handleGoogleLogout}
          />
        )}
      </div>
    </div>
  )
}

export default App
