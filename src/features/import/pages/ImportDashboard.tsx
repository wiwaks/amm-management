import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { fetchFormResponses } from '../../../services/google/forms'
import { normalizeAllSubmissions } from '../../../services/supabase/formSubmissionAnswers'
import type { ImportResult, UserSession } from '../../../shared/types'
import { Button } from '../../../shared/components/ui/button'
import { Badge } from '../../../shared/components/ui/badge'
import { Toast } from '../../../shared/components/ui/toast'
import { Logo } from '../../../shared/components/Logo'
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

interface DashboardProps {
  accessToken: string
  userSession: UserSession | null
  onLogout: () => void
}

// Navigation items for the sidebar and mobile nav
const NAV_ITEMS = [
  { label: 'Aperçu', active: false, route: null },
  { label: 'Import', active: true, route: '/dashboard' },
  { label: 'Historique', active: false, route: null },
  { label: 'Recherches', active: true, route: '/recherche' },
  { label: 'Clients', active: false, route: null },
  { label: 'Paramètres', active: false, route: null },
]

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

function summarizeAnswers(answers?: Record<string, unknown>) {
  if (!answers) return { count: 0, preview: '—' }
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
      : previewValues.slice(0, 2).join(' • ')

  return {
    count: Object.keys(answers).length,
    preview,
  }
}

function ImportDashboard({ accessToken, userSession, onLogout }: DashboardProps) {
  const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
  const supabaseAnonKey = import.meta.env
    .VITE_SUPABASE_ANON_KEY as string | undefined
  const importEndpoint = import.meta.env
    .VITE_IMPORT_ENDPOINT as string | undefined
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      return fetchFormResponses(formId, accessToken)
    },
    onSuccess: (data) => {
      const preview = data as GoogleFormsPreview
      const total = preview.totalResponses ?? preview.responses?.length ?? 0
      setToast({
        title: 'Prévisualisation chargée',
        description: `${total} réponses détectées.`,
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

  const normalizeMutation = useMutation({
    mutationFn: normalizeAllSubmissions,
    onSuccess: ({ total, normalized, answersCreated }) => {
      setToast({
        title: 'Normalisation terminée',
        description: `${normalized} / ${total} soumissions normalisées · ${answersCreated} réponses créées.`,
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

      const response = await fetch(importEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${supabaseAnonKey}`,
        },
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
    onSuccess: (data) => {
      const { total, imported, updated, skipped } = data
      const totalLabel = total ?? imported ?? 0
      setToast({
        title: 'Import terminé',
        description: `Importé ${imported ?? 0} / ${totalLabel} · Modifiés ${
          updated ?? 0
        } · Ignorés ${skipped ?? 0}`,
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
  const previewRows = useMemo(() => responses.slice(0, 6), [responses])
  const totalResponses = previewData?.totalResponses ?? responses.length

  const importStats = importMutation.data
  const sessionExpiry = userSession ? formatDate(userSession.expiresAt) : null

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-10">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] w-72 flex-col lg:flex">
          <div className="flex h-full flex-col gap-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm">
            <div className="space-y-3">
              <Logo subtitle="Back office" />
              <p className="text-sm text-muted-foreground">
                Centralisez vos imports Google Forms en un seul endroit.
              </p>
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.route || undefined}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    item.active
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/40'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.active ? (
                    <span className="text-xs uppercase tracking-[0.3em] text-primary">
                      actif
                    </span>
                  ) : null}
                </a>
              ))}
            </nav>

            <div className="mt-auto space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Support
              </p>
              <p className="text-muted-foreground">
                Besoin d’aide sur un import ?
              </p>
              <Button variant="secondary" size="sm" className="w-full">
                Contacter l’équipe
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 lg:hidden">
                <Logo subtitle="Back office" />
              </div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Rubrique import
              </p>
              <h1 className="font-display text-3xl font-semibold md:text-4xl">
                Prévisualisation & Import
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Suivez les réponses, contrôlez le format, puis lancez l’import
                Supabase en toute sérénité.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">
                Session {userSession?.sessionId.slice(0, 8) ?? '—'}
              </Badge>
              {sessionExpiry ? (
                <Badge variant="warning">Expire {sessionExpiry}</Badge>
              ) : null}
              <Button variant="outline" size="sm" onClick={onLogout}>
                Se déconnecter
              </Button>
            </div>
          </header>

          <div className="flex gap-2 overflow-auto pb-2 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.route || undefined}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${
                  item.active
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs uppercase tracking-wider">
                  Total réponses
                </CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {totalResponses || '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs uppercase tracking-wider">
                  Importés
                </CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums text-emerald-600">
                  {importStats?.imported ?? '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs uppercase tracking-wider">
                  Modifiés
                </CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums text-amber-600">
                  {importStats?.updated ?? '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs uppercase tracking-wider">
                  Ignorés
                </CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums text-slate-500">
                  {importStats?.skipped ?? '—'}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {importMutation.isSuccess ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Import effectué avec succès</span>
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Prévisualisation des réponses</CardTitle>
                    <CardDescription>
                      Les 6 dernières réponses Google Forms
                    </CardDescription>
                  </div>
                  <Badge variant={previewMutation.isSuccess ? 'success' : 'outline'}>
                    {previewMutation.isSuccess
                      ? `${totalResponses} total`
                      : 'En attente'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                  >
                    {previewMutation.isPending
                      ? 'Chargement...'
                      : 'Charger l\'aperçu'}
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

                <div className="overflow-hidden rounded-lg border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-10">Response ID</TableHead>
                        <TableHead className="h-10">Soumis</TableHead>
                        <TableHead className="h-10">Réponses</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="h-24 text-center text-muted-foreground"
                          >
                            Aucune réponse à afficher pour le moment.
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewRows.map((response) => {
                          const summary = summarizeAnswers(response.answers)
                          return (
                            <TableRow key={response.responseId}>
                              <TableCell className="font-mono text-xs">
                                {response.responseId?.slice(0, 12) || '—'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(
                                  response.lastSubmittedTime ||
                                    response.createTime,
                                )}
                              </TableCell>
                              <TableCell>
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

                <details className="group rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5">
                  <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground transition group-open:mb-3">
                    Voir le JSON brut
                  </summary>
                  <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-50">
                    {previewMutation.data
                      ? JSON.stringify(previewMutation.data, null, 2)
                      : 'Aucune réponse chargée.'}
                  </pre>
                </details>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Actions d'import</CardTitle>
                      <CardDescription>Importer et normaliser les données</CardDescription>
                    </div>
                    <Badge
                      variant={importMutation.isSuccess ? 'success' : 'outline'}
                    >
                      {importMutation.isSuccess ? 'Terminé' : 'Prêt'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
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
                      : 'Normaliser les réponses'}
                  </Button>

                  <details className="group rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground transition group-open:mb-3">
                      Voir le résultat brut
                    </summary>
                    <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-50">
                      {importMutation.data
                        ? JSON.stringify(importMutation.data, null, 2)
                        : 'Aucun import lancé.'}
                    </pre>
                  </details>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">Aide-mémoire</CardTitle>
                  <CardDescription>
                    Points de vigilance avant import
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <p className="text-muted-foreground">Vérifier le mapping des champs avant l'import</p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <p className="text-muted-foreground">Contrôler les doublons sur la table Supabase</p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <p className="text-muted-foreground">Mettre à jour le formulaire si besoin</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

      {toast ? (
        <div className="fixed right-6 top-6 z-50 flex w-full max-w-sm flex-col gap-3">
          <Toast
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
            onClose={() => setToast(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

export default ImportDashboard
