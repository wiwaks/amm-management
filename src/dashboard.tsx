import { useMutation } from '@tanstack/react-query'
import { fetchFormResponses } from './googleFormsApi'
import type { ImportResult, UserSession } from './types'
import { Button } from './components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card'
import { clearSession } from './sessionManager'


interface DashboardProps {
  accessToken: string
  userSession: UserSession | null
  onLogout: () => void
}


function Dashboard({ accessToken, userSession, onLogout }: DashboardProps) {
  const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const importEndpoint = import.meta.env.VITE_IMPORT_ENDPOINT as string | undefined

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      return fetchFormResponses(formId, accessToken)
    },
  })

  // Mutation pour l'import dans Supabase via l'endpoint
  const importMutation = useMutation<ImportResult, Error>({
    mutationFn: async () => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      if (!supabaseAnonKey) {
        throw new Error('Missing VITE_SUPABASE_ANON_KEY.')
      }
      if (!importEndpoint) {
        throw new Error('Missing VITE_IMPORT_ENDPOINT.')
      }

      // Appel à l'endpoint d'import
      const response = await fetch(importEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${supabaseAnonKey}`,
        },
        // Données envoyées à l'endpoint
        body: JSON.stringify({
          formId,
          googleAccessToken: accessToken,
          sessionId: userSession?.sessionId,
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

  const handleLogout = () => {
    // Supprimer la session du localStorage
    clearSession()
    // Appeler la fonction de déconnexion du parent
    onLogout()
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-xs"
        >
          Se déconnecter
        </Button>
      </div>

      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle>Import & Prévisualisation</CardTitle>
          <CardDescription>
            Prévisualisez les réponses brutes puis lancez l'import Supabase.
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
    </>
  )
}

export default Dashboard
