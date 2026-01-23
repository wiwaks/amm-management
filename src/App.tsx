import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createGoogleTokenClient, type GoogleTokenClient } from './googleAuth'
import { fetchFormResponses } from './googleFormsApi'
import type { ImportResult } from './types'
import { Button } from './components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card'

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const importEndpoint = import.meta.env.VITE_IMPORT_ENDPOINT as string | undefined

  const scopes = [
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/forms.body.readonly',
  ].join(' ')

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error('Connect to Google first.')
      }
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      return fetchFormResponses(formId, accessToken)
    },
  })

  const importMutation = useMutation<ImportResult, Error>({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error('Connect to Google first.')
      }
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      if (!supabaseAnonKey) {
        throw new Error('Missing VITE_SUPABASE_ANON_KEY.')
      }
      if (!importEndpoint) {
        throw new Error('Missing VITE_IMPORT_ENDPOINT.')
      }

      const response = await fetch(importEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          formId,
          googleAccessToken: accessToken,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `Import failed: ${response.status} ${response.statusText}${
            text ? ` - ${text}` : ''
          }`,
        )
      }

      return (await response.json()) as ImportResult
    },
  })

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
          callback: (response) => {
            if (response.error) {
              setTokenError(response.error_description || response.error)
              setAccessToken(null)
              return
            }
            if (response.access_token) {
              setTokenError(null)
              setAccessToken(response.access_token)
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
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium">
            <span
              className={
                accessToken ? 'text-emerald-300' : 'text-muted-foreground'
              }
            >
              {accessToken ? '✅ Google connecté' : 'Google non connecté'}
            </span>
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

        <Card className="border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle>Import & Prévisualisation</CardTitle>
            <CardDescription>
              Prévisualisez les réponses brutes puis lancez l’import Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending
                  ? 'Chargement...'
                  : 'Prévisualiser réponses'}
              </Button>
              <Button
                type="button"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending
                  ? 'Import en cours...'
                  : 'Importer dans Supabase'}
              </Button>
            </div>

            {previewMutation.isError ? (
              <p className="text-sm text-destructive">
                {previewMutation.error.message}
              </p>
            ) : null}
            {importMutation.isError ? (
              <p className="text-sm text-destructive">
                {importMutation.error.message}
              </p>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Prévisualisation Google Forms
                </h2>
                <pre className="mt-3 max-h-96 overflow-auto text-xs leading-relaxed">
                  {previewMutation.data
                    ? JSON.stringify(previewMutation.data, null, 2)
                    : 'Aucune réponse pour le moment.'}
                </pre>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Résultat import Supabase
                </h2>
                <pre className="mt-3 max-h-96 overflow-auto text-xs leading-relaxed">
                  {importMutation.data
                    ? JSON.stringify(importMutation.data, null, 2)
                    : 'Aucun import lancé.'}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App
