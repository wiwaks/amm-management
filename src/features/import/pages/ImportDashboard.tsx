import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { fetchFormResponses, fetchFormQuestionMap } from '../../../services/google/forms'
import { getSession } from '../../../shared/auth/sessionManager'
import type { ImportResult } from '../../../shared/types'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Skeleton } from '../../../shared/components/ui/skeleton'
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
import { normalizeAllSubmissions } from '../../../services/supabase/formSubmissionAnswers'

type GoogleFormsAnswer = {
  textAnswers?: { answers?: Array<{ value?: string }> }
  fileUploadAnswers?: { answers?: Array<{ fileId?: string; fileName?: string }> }
}

type GoogleFormsResponse = {
  responseId?: string
  createTime?: string
  lastSubmittedTime?: string
  answers?: Record<string, GoogleFormsAnswer>
}

type QuestionColumn = {
  question_id: string
  label: string
  display_order: number
}

type GoogleFormsPreview = {
  responses: GoogleFormsResponse[]
  columns: QuestionColumn[]
  totalResponses: number
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

function getAnswerValue(answers: Record<string, GoogleFormsAnswer> | undefined, questionId: string): string {
  if (!answers) return '--'
  const entry = answers[questionId]
  if (!entry) return '--'
  if (entry.textAnswers?.answers?.length) {
    return entry.textAnswers.answers.map((a) => a.value ?? '').filter(Boolean).join(', ') || '--'
  }
  if (entry.fileUploadAnswers?.answers?.length) {
    return entry.fileUploadAnswers.answers.map((a) => a.fileName ?? a.fileId ?? '').filter(Boolean).join(', ') || '--'
  }
  return '--'
}

const PAGE_SIZE = 10

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

  const [previewPage, setPreviewPage] = useState(0)

  const previewMutation = useMutation({
    mutationFn: async (): Promise<GoogleFormsPreview> => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      if (!accessToken) {
        throw new Error('Session expirée. Reconnectez-vous.')
      }
      const [responsesData, columns] = await Promise.all([
        fetchFormResponses(formId, accessToken),
        fetchFormQuestionMap(formId, accessToken),
      ])
      const responses = (responsesData.responses ?? []) as GoogleFormsResponse[]
      return {
        responses,
        columns: columns.slice(0, 6),
        totalResponses: responses.length,
      }
    },
    onSuccess: (data) => {
      setPreviewPage(0)
      setToast({
        title: 'Prévisualisation chargée',
        description: `${data.totalResponses} réponses détectées.`,
        variant: 'info',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de prévisualisation',
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
        throw new Error('Session expirée. Reconnectez-vous.')
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
    onSuccess: async (data) => {
      const { total, imported, updated, skipped } = data
      const totalLabel = total ?? imported ?? 0

      try {
        const normResult = await normalizeAllSubmissions()
        setToast({
          title: 'Import terminé',
          description: `Importés ${imported ?? 0} / ${totalLabel} | Modifiés ${
            updated ?? 0
          } | Ignorés ${skipped ?? 0} | Normalisés ${normResult.normalized} (${normResult.answersCreated} réponses)`,
          variant: 'success',
        })
      } catch {
        setToast({
          title: 'Import terminé (normalisation échouée)',
          description: `Importés ${imported ?? 0} / ${totalLabel} | Modifiés ${
            updated ?? 0
          } | Ignorés ${skipped ?? 0}`,
          variant: 'success',
        })
      }
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

  const previewData = previewMutation.data
  const columns = useMemo(() => previewData?.columns ?? [], [previewData])
  const sortedResponses = useMemo(
    () =>
      [...(previewData?.responses ?? [])].sort((a, b) => {
        const dateA = new Date(a.lastSubmittedTime || a.createTime || 0).getTime()
        const dateB = new Date(b.lastSubmittedTime || b.createTime || 0).getTime()
        return dateB - dateA
      }),
    [previewData],
  )
  const totalResponses = previewData?.totalResponses ?? 0
  const totalPages = Math.max(1, Math.ceil(sortedResponses.length / PAGE_SIZE))
  const pagedRows = useMemo(
    () => sortedResponses.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE),
    [sortedResponses, previewPage],
  )
  const importStats = importMutation.data

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">

        <div className="shrink-0 grid gap-3 md:grid-cols-4">
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Total réponses
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums">
                {totalResponses || '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Importés
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums text-emerald-600">
                {importStats?.imported ?? '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Modifiés
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums text-amber-600">
                {importStats?.updated ?? '--'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border">
            <CardHeader className="pb-2 pt-4">
              <CardDescription className="text-xs uppercase tracking-wider">
                Ignorés
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
              <span className="font-medium">Import effectué avec succès</span>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="flex min-h-0 min-w-0 flex-col border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Prévisualisation des réponses</CardTitle>
                  <CardDescription>
                    Réponses Google Forms triées par date
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
                  {previewMutation.isPending ? 'Chargement...' : "Charger l'aperçu"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  Rafraîchir
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-10 whitespace-nowrap">Soumis</TableHead>
                      {columns.map((col) => (
                        <TableHead key={col.question_id} className="h-10 max-w-[200px] truncate" title={col.label}>
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewMutation.isPending ? (
                      Array.from({ length: PAGE_SIZE }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2.5"><Skeleton className="h-4 w-24" /></TableCell>
                          {Array.from({ length: 4 }).map((__, j) => (
                            <TableCell key={j} className="py-2.5"><Skeleton className="h-4 w-28" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : pagedRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={1 + columns.length}
                          className="h-24 text-center text-muted-foreground"
                        >
                          Aucune réponse à afficher pour le moment.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedRows.map((response, index) => (
                        <TableRow key={response.responseId ?? index}>
                          <TableCell className="py-2.5 text-sm whitespace-nowrap">
                            {formatDate(response.lastSubmittedTime || response.createTime)}
                          </TableCell>
                          {columns.map((col) => (
                            <TableCell key={col.question_id} className="py-2.5 text-sm max-w-[200px] truncate" title={getAnswerValue(response.answers, col.question_id)}>
                              {getAnswerValue(response.answers, col.question_id)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {sortedResponses.length > PAGE_SIZE && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {previewPage + 1} / {totalPages} — {sortedResponses.length} réponses
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={previewPage === 0}
                      onClick={() => setPreviewPage((p) => p - 1)}
                    >
                      Précédent
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={previewPage >= totalPages - 1}
                      onClick={() => setPreviewPage((p) => p + 1)}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid min-h-0 min-w-0 gap-4 lg:grid-rows-[auto_1fr]">
            <Card className="flex min-h-0 min-w-0 flex-col border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Actions d'import</CardTitle>
                    <CardDescription>Synchroniser les données Google Forms</CardDescription>
                  </div>
                  <Badge variant={importMutation.isSuccess ? 'success' : 'outline'}>
                    {importMutation.isSuccess ? 'Terminé' : 'Prêt'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
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
                  <p className="text-xs text-muted-foreground">
                    Récupère les réponses Google Forms, les enregistre dans Supabase et normalise automatiquement les champs (nom, email, téléphone…) pour la recherche.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 min-w-0 flex-col border">
              <CardHeader>
                <CardTitle className="text-base">Aide-mémoire</CardTitle>
                <CardDescription>Points de vigilance avant import</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Vérifier le mapping des champs avant l'import
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Contrôler les doublons sur la table Supabase
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <p className="text-muted-foreground">
                    Mettre à jour le formulaire si besoin
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
