import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
} from '@tanstack/react-table'
import type { GenerateInvitationResult, UserSession } from '../../../shared/types'
import { generateInvitation } from '../../../services/supabase/invitations'
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
import { ScrollArea } from '../../../shared/components/ui/scroll-area'
import { DataTableToolbar } from '../../../shared/components/data-table/data-table-toolbar'
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

type SubmissionRow = {
  id: string
  nom: string
  prenom: string
  telephone: string
  email: string
  searchIndex: string
  submission: SubmissionWithAnswers
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionWithAnswers | null>(null)
  const [generatedDeepLink, setGeneratedDeepLink] = useState<string | null>(null)

  const searchMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim()
      const trimmedEmail = email.trim()
      const trimmedPhone = phone.trim()
      return fetchSubmissionsWithAnswers({
        name: trimmedName || undefined,
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

  const inviteMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      return generateInvitation(submissionId, userSession?.sessionId)
    },
    onSuccess: (data: GenerateInvitationResult) => {
      if (data.invitation) {
        setGeneratedDeepLink(data.invitation.deepLink)
        setToast({
          title: data.reused ? 'Invitation existante' : 'Invitation créée',
          description: data.reused
            ? 'Un lien valide existait déjà pour ce client.'
            : 'Le lien d\'invitation a été généré.',
          variant: 'success',
        })
      }
    },
    onError: (error) => {
      setToast({
        title: 'Erreur d\'invitation',
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

  const tableData = useMemo<SubmissionRow[]>(() => {
    return submissions.map((submission) => {
      const nom = getAnswerValue(
        submission.answers,
        fieldQuestionIds.lastName ?? '',
      )
      const prenom = getAnswerValue(
        submission.answers,
        fieldQuestionIds.firstName ?? '',
      )
      const telephone =
        submission.phone ||
        getAnswerValue(submission.answers, fieldQuestionIds.phone ?? '')
      const emailValue = submission.email ?? ''
      const searchIndex = [nom, prenom, telephone, emailValue]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return {
        id: submission.id,
        nom,
        prenom,
        telephone,
        email: emailValue,
        searchIndex,
        submission,
      }
    })
  }, [fieldQuestionIds, submissions])

  const columns = useMemo<ColumnDef<SubmissionRow>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: 'Nom',
        meta: { label: 'Nom' },
        cell: ({ row }) => row.original.nom || '--',
      },
      {
        accessorKey: 'prenom',
        header: 'Prenom',
        meta: { label: 'Prenom' },
        cell: ({ row }) => row.original.prenom || '--',
      },
      {
        accessorKey: 'telephone',
        header: 'Telephone',
        meta: { label: 'Telephone' },
        cell: ({ row }) => row.original.telephone || '--',
      },
      {
        id: 'action',
        header: 'Action',
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSelectedSubmission(row.original.submission)}
          >
            Voir tout
          </Button>
        ),
      },
    ],
    [setSelectedSubmission],
  )

  const globalFilterFn: FilterFn<SubmissionRow> = useCallback(
    (row, _columnId, filterValue) => {
      const term = String(filterValue ?? '').trim().toLowerCase()
      if (!term) return true
      return row.original.searchIndex.includes(term)
    },
    [],
  )

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn,
    initialState: {
      pagination: { pageSize: 5 },
    },
  })

  const sessionExpiry = userSession ? formatDate(userSession.expiresAt) : null
  const filteredCount = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const pagination = table.getState().pagination
  const pageStart =
    filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const pageEnd = Math.min(
    (pagination.pageIndex + 1) * pagination.pageSize,
    filteredCount,
  )

  return (
    <div className="min-h-full overflow-x-hidden overflow-y-visible lg:h-full lg:overflow-hidden">
      <div className="mx-auto flex min-h-full min-w-0 w-full max-w-7xl gap-4 px-4 py-4 lg:h-full">
        <aside className="hidden h-full w-72 flex-col lg:flex">
          <div className="flex h-full flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm">
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

        <main className="flex min-h-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-visible lg:h-full lg:overflow-hidden">
          <header className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 lg:hidden">
                <Logo subtitle="Back office" />
              </div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Rubrique Recherche
              </p>
              <h1 className="font-display text-2xl font-semibold md:text-3xl">
                Recherche de clients
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
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

          <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 lg:hidden">
            {NAV_ITEMS.filter((item) => item.route).map((item) => (
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

          <Card className="shrink-0 min-w-0 border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle>Filtres de recherche</CardTitle>
              <CardDescription>
                Recherchez par nom, email ou telephone. Laissez vide pour tout afficher.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Nom / Prenom
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                    placeholder="ex: Dupont"
                  />
                </div>
                <div className="min-w-0">
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
                <div className="min-w-0">
                  <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Telephone
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
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle>
                Resultats {filteredCount} / {submissions.length}
              </CardTitle>
              <CardDescription>
                Cliquez sur "Voir tout" pour afficher les reponses completes.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <DataTableToolbar
                table={table}
                globalPlaceholder="Filtrer les resultats..."
                showViewOptions={false}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {tableData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {searchMutation.isPending
                            ? 'Recherche en cours...'
                            : 'Aucun resultat. Cliquez sur "Rechercher" pour commencer.'}
                        </TableCell>
                      </TableRow>
                    ) : table.getRowModel().rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Aucun resultat pour ce filtre.
                        </TableCell>
                      </TableRow>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  </Table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm">
                  <div className="text-muted-foreground">
                    {filteredCount === 0
                      ? '0 resultat'
                      : `${pageStart}-${pageEnd} sur ${filteredCount}`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      Precedent
                    </Button>
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Page {pageCount === 0 ? 0 : pagination.pageIndex + 1} / {pageCount}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
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
          <div className="relative flex h-[calc(100vh-2rem)] h-[calc(100dvh-2rem)] w-full max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:h-[min(92vh,900px)] sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:rounded-3xl xl:w-[min(90vw,1320px)]">
            <div className="z-10 flex items-center justify-between border-b border-border bg-background/95 p-4 backdrop-blur sm:p-6">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Réponses complètes
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedSubmission.email || selectedSubmission.phone || 'Client'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => inviteMutation.mutate(selectedSubmission.id)}
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? 'Génération...' : 'Inviter'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSubmission(null)
                    setGeneratedDeepLink(null)
                  }}
                >
                  Fermer
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-4 sm:p-6">
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

              {generatedDeepLink ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                    Lien d'invitation (deep link)
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-background px-3 py-2 text-sm font-mono break-all">
                      {generatedDeepLink}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedDeepLink)
                        setToast({
                          title: 'Copié',
                          description: 'Le lien a été copié dans le presse-papier.',
                          variant: 'info',
                        })
                      }}
                    >
                      Copier
                    </Button>
                  </div>
                </div>
              ) : null}

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
            </ScrollArea>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default RechercheDashboard

