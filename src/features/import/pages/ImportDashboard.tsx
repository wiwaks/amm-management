import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { fetchFormResponses } from '../../../services/google/forms'
import { normalizeAllSubmissions } from '../../../services/supabase/formSubmissionAnswers'
import { getSession } from '../../../shared/auth/sessionManager'
import type { ImportResult } from '../../../shared/types'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
import { Toast } from '../../../shared/components/ui/toast'

type GoogleFormsResponse = {
  responseId?: string
  createTime?: string
  lastSubmittedTime?: string
  answers?: Record<string, unknown>
}

type GoogleFormsPreview = {
  responses?: GoogleFormsResponse[]
  totalResponses?: number
}

type ToastMessage = {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

function summarizeAnswers(answers?: Record<string, unknown>) {
  if (!answers) return { count: 0, preview: '--' }
  const entries = Object.values(answers)
  const values: string[] = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const textAnswers = record.textAnswers as
      | { answers?: Array<{ value?: string }> }
      | undefined
    const fileAnswers = record.fileUploadAnswers as
      | { answers?: Array<{ fileId?: string; fileName?: string }> }
      | undefined

    if (textAnswers?.answers?.length) {
      for (const answer of textAnswers.answers) {
        if (answer?.value) values.push(answer.value)
      }
    } else if (fileAnswers?.answers?.length) {
      for (const answer of fileAnswers.answers) {
        if (answer?.fileName || answer?.fileId) {
          values.push(answer.fileName || answer.fileId || '')
        }
      }
    }
  }

  const previewValues = values.filter(Boolean)
  const preview =
    previewValues.length === 0
      ? `${Object.keys(answers).length} champs`
      : previewValues.slice(0, 2).join(' | ')

  return {
    count: Object.keys(answers).length,
    preview,
  }
}

function ImportDashboard() {
  const session = getSession()
  const accessToken = session?.accessToken
  const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
  const supabaseAnonKey = import.meta.env
    .VITE_SUPABASE_ANON_KEY as string | undefined
  const importEndpoint = import.meta.env.VITE_IMPORT_ENDPOINT as
    | string
    | undefined
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      if (!accessToken) {
        throw new Error('Session expiree. Reconnectez-vous.')
      }
      return fetchFormResponses(formId, accessToken)
    },
    onSuccess: (data) => {
      const preview = data as GoogleFormsPreview
      const total = preview.totalResponses ?? preview.responses?.length ?? 0
      setToast({
        title: 'Previsualisation chargee',
        description: `${total} reponses detectees.`,
        variant: 'info',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de previsualisation',
        description: error.message,
        variant: 'error',
      })
    },
  })

  const normalizeMutation = useMutation({
    mutationFn: normalizeAllSubmissions,
    onSuccess: ({ total, normalized, answersCreated }) => {
      setToast({
        title: 'Normalisation terminee',
        description: `${normalized} / ${total} soumissions normalisees | ${answersCreated} reponses creees.`,
        variant: 'success',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de normalisation',
        description: error.message,
        variant: 'error',
      })
    },
  })

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
      if (!accessToken) {
        throw new Error('Session expiree. Reconnectez-vous.')
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
          sessionId: session?.sessionId,
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
    onSuccess: (data) => {
      const { total, imported, updated, skipped } = data
      const totalLabel = total ?? imported ?? 0
      setToast({
        title: 'Import termine',
        description: `Importes ${imported ?? 0} / ${totalLabel} | Modifies ${
          updated ?? 0
        } | Ignores ${skipped ?? 0}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      setToast({
        title: "Erreur d'import",
        description: error.message,
        variant: 'error',
      })
    },
  })

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  const previewData = previewMutation.data as GoogleFormsPreview | undefined
  const responses = previewData?.responses ?? []
  const previewRows = useMemo(() => responses.slice(0, 4), [responses])
  const totalResponses = previewData?.totalResponses ?? responses.length
  const importStats = importMutation.data

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">

        <div className="shrink-0 grid gap-3 md:grid-cols-4">
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Total reponses
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums">
                {totalResponses || '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Importes
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums text-emerald-600">
                {importStats?.imported ?? '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Modifies
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums text-amber-600">
                {importStats?.updated ?? '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Ignores
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums text-slate-500">
                {importStats?.skipped ?? '--'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {importMutation.isSuccess ? (
          <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium">Import effectue avec succes</span>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="flex min-h-0 min-w-0 flex-col border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Previsualisation des reponses</CardTitle>
                  <CardDescription>
                    Les 4 dernieres reponses Google Forms
                  </CardDescription>
                </div>
                <Badge variant={previewMutation.isSuccess ? 'success' : 'outline'}>
                  {previewMutation.isSuccess ? `${totalResponses} total` : 'En attente'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? 'Chargement...' : "Charger l apercu"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  Rafraichir
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-10">Response ID</TableHead>
                      <TableHead className="h-10">Soumis</TableHead>
                      <TableHead className="h-10">Reponses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="h-24 text-center text-muted-foreground"
                        >
                          Aucune reponse a afficher pour le moment.
                        </TableCell>
                      </TableRow>
                    ) : (
                      previewRows.map((response, index) => {
                        const summary = summarizeAnswers(response.answers)
                        return (
                          <TableRow key={response.responseId ?? index}>
                            <TableCell className="py-2.5 font-mono text-xs">
                              {response.responseId?.slice(0, 12) || '--'}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm">
                              {formatDate(
                                response.lastSubmittedTime || response.createTime,
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="space-y-0.5">
                                <p className="text-sm">{summary.preview}</p>
                                <p className="text-xs text-muted-foreground">
                                  {summary.count} champs
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-lg border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                Le JSON brut est masque pour garder une vue compacte.
              </div>
            </CardContent>
          </Card>

          <div className="grid min-h-0 min-w-0 gap-4 lg:grid-rows-[auto_1fr]">
            <Card className="flex min-h-0 min-w-0 flex-col border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Actions d import</CardTitle>
                    <CardDescription>Importer et normaliser les donnees</CardDescription>
                  </div>
                  <Badge variant={importMutation.isSuccess ? 'success' : 'outline'}>
                    {importMutation.isSuccess ? 'Termine' : 'Pret'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Button
                  type="button"
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                  className="w-full"
                >
                  {importMutation.isPending
                    ? 'Import en cours...'
                    : 'Importer dans Supabase'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => normalizeMutation.mutate()}
                  disabled={normalizeMutation.isPending}
                  className="w-full"
                >
                  {normalizeMutation.isPending
                    ? 'Normalisation...'
                    : 'Normaliser les reponses'}
                </Button>
                <div className="rounded-lg border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                  Le resultat brut est masque pour garder une vue compacte.
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 min-w-0 flex-col border">
              <CardHeader>
                <CardTitle className="text-base">Aide memoire</CardTitle>
                <CardDescription>Points de vigilance avant import</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Verifier le mapping des champs avant l import
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Controler les doublons sur la table Supabase
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Mettre a jour le formulaire si besoin
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {toast ? (
        <div className="fixed right-6 top-16 z-50 flex w-full max-w-sm flex-col gap-3">
          <Toast
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
            onClose={() => setToast(null)}
          />
        </div>
      ) : null}
    </>
  )
}

export default ImportDashboard
