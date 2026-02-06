import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { UserSession } from '../../../shared/types'
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
import {
  fetchSubmissionsWithAnswers,
  type SubmissionWithAnswers,
} from '../../../services/supabase/formSubmissionAnswers'
import {
  fetchFormQuestionMap,
  type FormQuestionMap,
  upsertFormQuestionMap,
} from '../../../services/supabase/formQuestionMap'
import { fetchFormQuestionMap as fetchGoogleFormQuestionMap } from '../../../services/google/forms'

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

const NAV_ITEMS = [
  { label: 'Aperçu', active: false, route: null },
  { label: 'Import', active: false, route: '/dashboard' },
  { label: 'Historique', active: false, route: null },
  { label: 'Recherche', active: true, route: '/recherche' },
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

function getAnswerValue(
  answers: SubmissionWithAnswers['answers'],
  questionId: string,
): string {
  return answers
    .filter((a) => a.question_id === questionId)
    .sort((a, b) => a.answer_index - b.answer_index)
    .map((a) => a.value_text ?? '')
    .filter(Boolean)
    .join(', ')
}

function RechercheDashboard({ accessToken, userSession, onLogout }: DashboardProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionWithAnswers | null>(null)

  const searchMutation = useMutation({
    mutationFn: async () => {
      const trimmedEmail = email.trim()
      const trimmedPhone = phone.trim()
      return fetchSubmissionsWithAnswers({
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
      })
    },
    onSuccess: (data) => {
      setToast({
        title: 'Recherche terminée',
        description: `${data.length} réponses trouvées.`,
        variant: 'info',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de recherche',
        description: error.message,
        variant: 'error',
      })
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      const googleItems = await fetchGoogleFormQuestionMap(formId, accessToken)
      return upsertFormQuestionMap(googleItems)
    },
    onSuccess: (data) => {
      setQuestionMap(data)
      setToast({
        title: 'Libellés mis à jour',
        description: `${data.length} questions synchronisées.`,
        variant: 'success',
      })
    },
    onError: (error) => {
      setToast({
        title: 'Erreur de synchronisation',
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

  useEffect(() => {
    let isMounted = true
    fetchFormQuestionMap()
      .then((data) => {
        if (!isMounted) return
        setQuestionMap(data)
      })
      .catch((error: Error) => {
        console.error('Failed to load question map:', error)
      })
    return () => {
      isMounted = false
    }
  }, [])

  const submissions = searchMutation.data ?? []

  const fieldQuestionIds = useMemo(() => {
    const findByKeywords = (keywords: string[], exclude: string[] = []) => {
      for (const question of questionMap) {
        const label = question.label.toLowerCase()
        if (exclude.some((term) => label.includes(term))) continue
        if (keywords.some((term) => label.includes(term))) {
          return question.question_id
        }
      }
      return undefined
    }

    return {
      lastName: findByKeywords(['nom de famille', 'nom'], ['prenom', 'prénom']),
      firstName: findByKeywords(['prénom', 'prenom']),
      phone: findByKeywords([
        'téléphone',
        'telephone',
        'portable',
        'mobile',
        'numéro',
        'numero',
      ]),
    }
  }, [questionMap])

  const sessionExpiry = userSession ? formatDate(userSession.expiresAt) : null

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-10">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] w-72 flex-col lg:flex">
          <div className="flex h-full flex-col gap-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm">
            <div className="space-y-3">
              <Logo subtitle="Back office" />
              <p className="text-sm text-muted-foreground">
                Recherche rapide dans les réponses normalisées.
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
              <p className="text-muted-foreground">Besoin d'aide ?</p>
              <Button variant="secondary" size="sm" className="w-full">
                Contacter l'équipe
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
                Rubrique Recherche
              </p>
              <h1 className="font-display text-3xl font-semibold md:text-4xl">
                Recherche de clients
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Recherchez par email ou téléphone, consultez les réponses complètes.
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

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle>Filtres de recherche</CardTitle>
              <CardDescription>
                Recherchez par email ou téléphone, ou laissez vide pour tout afficher.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                    placeholder="ex: jane@email.com"
                  />
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                    placeholder="ex: 06 12 34 56 78"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => searchMutation.mutate()}
                  disabled={searchMutation.isPending}
                >
                  {searchMutation.isPending ? 'Recherche...' : 'Rechercher'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending
                    ? 'Mise à jour...'
                    : 'Mettre à jour les libellés'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle>Résultats ({submissions.length})</CardTitle>
              <CardDescription>
                Cliquez sur "Voir tout" pour afficher les réponses complètes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-border/60 bg-muted/20 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {searchMutation.isPending
                            ? 'Recherche en cours...'
                            : 'Aucun résultat. Cliquez sur "Rechercher" pour commencer.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      submissions.map((submission) => {
                        const nom = getAnswerValue(
                          submission.answers,
                          fieldQuestionIds.lastName ?? '',
                        )
                        const prenom = getAnswerValue(
                          submission.answers,
                          fieldQuestionIds.firstName ?? '',
                        )
                        const tel =
                          submission.phone ||
                          getAnswerValue(
                            submission.answers,
                            fieldQuestionIds.phone ?? '',
                          )

                        return (
                          <TableRow key={submission.id}>
                            <TableCell>{nom || '—'}</TableCell>
                            <TableCell>{prenom || '—'}</TableCell>
                            <TableCell>{tel || '—'}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedSubmission(submission)}
                              >
                                Voir tout
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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

      {selectedSubmission ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-background shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 p-6 backdrop-blur">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Réponses complètes
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedSubmission.email || selectedSubmission.phone || 'Client'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSubmission(null)}
              >
                Fermer
              </Button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Soumis le
                    </p>
                    <p className="font-medium">
                      {formatDate(
                        selectedSubmission.submitted_at ??
                          selectedSubmission.created_at,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Email
                    </p>
                    <p className="font-medium">
                      {selectedSubmission.email || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Téléphone
                    </p>
                    <p className="font-medium">
                      {selectedSubmission.phone || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {questionMap.map((question) => {
                  const value = getAnswerValue(
                    selectedSubmission.answers,
                    question.question_id,
                  )
                  if (!value) return null

                  return (
                    <div
                      key={question.question_id}
                      className="rounded-2xl border border-border/60 bg-card p-4"
                    >
                      <p className="mb-2 font-semibold text-foreground">
                        {question.label}
                      </p>
                      <p className="text-sm text-muted-foreground">{value}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default RechercheDashboard
