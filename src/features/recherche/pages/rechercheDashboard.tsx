import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { DataTableToolbar } from '../../../shared/components/data-table/data-table-toolbar'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnFiltersState,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  fetchFormSubmissions,
  type FormSubmission,
} from '../../../services/supabase/formSubmissions'
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

function getAnswerValuesForQuestion(rawJson: Record<string, unknown>, questionId: string) {
  const answers = (rawJson.answers ?? {}) as Record<string, unknown>
  const record = answers[questionId] as Record<string, unknown> | undefined
  const textAnswers = record?.textAnswers as
    | { answers?: Array<{ value?: string }> }
    | undefined

  if (!textAnswers?.answers?.length) return []
  return textAnswers.answers
    .map((answer) => answer?.value)
    .filter((value): value is string => Boolean(value))
}

function RechercheDashboard({ accessToken, userSession, onLogout }: DashboardProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnFilterId, setColumnFilterId] = useState('last_name')
  const [columnFilterValue, setColumnFilterValue] = useState('')
  const [globalFilter, setGlobalFilter] = useState('')
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const searchMutation = useMutation({
    mutationFn: async () => {
      const trimmedEmail = email.trim()
      const trimmedPhone = phone.trim()
      const data = await fetchFormSubmissions({
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
      })
      return data
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
        setMapError(null)
      })
      .catch((error: Error) => {
        if (!isMounted) return
        setMapError(error.message)
      })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!searchMutation.isSuccess || !searchMutation.data) return
    const total = searchMutation.data.length
    setToast({
      title: 'Recherche terminée',
      description: `${total} réponses trouvées.`,
      variant: 'info',
    })
  }, [searchMutation.isSuccess, searchMutation.data])

  useEffect(() => {
    if (searchMutation.isError && searchMutation.error) {
      setToast({
        title: 'Erreur de recherche',
        description: searchMutation.error.message,
        variant: 'error',
      })
    }
  }, [searchMutation.isError, searchMutation.error])

  useEffect(() => {
    if (syncMutation.isSuccess && syncMutation.data) {
      setQuestionMap(syncMutation.data)
      setToast({
        title: 'Libellés mis à jour',
        description: `${syncMutation.data.length} questions synchronisées.`,
        variant: 'success',
      })
    }
  }, [syncMutation.isSuccess, syncMutation.data])

  useEffect(() => {
    if (syncMutation.isError && syncMutation.error) {
      setToast({
        title: 'Erreur de synchronisation',
        description: syncMutation.error.message,
        variant: 'error',
      })
    }
  }, [syncMutation.isError, syncMutation.error])

  useEffect(() => {
    if (!columnFilterValue) {
      setColumnFilters([])
      return
    }
    setColumnFilters([{ id: columnFilterId, value: columnFilterValue }])
  }, [columnFilterId, columnFilterValue])

  useEffect(() => {
    if (columnFilters.length === 0 && columnFilterValue) {
      setColumnFilterValue('')
    }
  }, [columnFilters])

  const submissions = (searchMutation.data ?? []) as FormSubmission[]
  const filteredSubmissions = submissions

  const visibleQuestions = useMemo(() => {
    if (questionMap.length > 0) return questionMap
    const known = new Set<string>()
    const fallback: FormQuestionMap[] = []
    for (const row of submissions) {
      const answers = (row.raw_json?.answers ?? {}) as Record<string, unknown>
      Object.keys(answers).forEach((questionId) => {
        if (known.has(questionId)) return
        known.add(questionId)
        fallback.push({
          question_id: questionId,
          label: questionId,
          display_order: null,
        })
      })
    }
    return fallback
  }, [questionMap, submissions])

  const fieldQuestionIds = useMemo(() => {
    const findByKeywords = (keywords: string[], exclude: string[] = []) => {
      for (const question of visibleQuestions) {
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
      age: findByKeywords(['âge', 'age']),
      phoneFromForm: findByKeywords([
        'téléphone',
        'telephone',
        'portable',
        'mobile',
        'numéro',
        'numero',
      ]),
    }
  }, [visibleQuestions])

  const handleDownloadCsv = useCallback(
    (row: FormSubmission) => {
      const meta = [
        {
          label: 'Soumis',
          value: formatDate(row.submitted_at ?? row.created_at),
        },
        { label: 'Email', value: row.email ?? '' },
        { label: 'Téléphone', value: row.phone ?? '' },
      ]

      const questionPairs = visibleQuestions.map((question) => ({
        label: question.label,
        value: getAnswerValuesForQuestion(row.raw_json, question.question_id).join(' • '),
      }))

      const headers = meta
        .map((item) => item.label)
        .concat(questionPairs.map((item) => item.label))
      const values = meta
        .map((item) => item.value)
        .concat(questionPairs.map((item) => item.value))

      const escapeValue = (value: string) => {
        const safe = String(value ?? '').replace(/"/g, '""')
        return `"${safe}"`
      }

      const csv = `\ufeff${headers.map(escapeValue).join(';')}\n${values
        .map(escapeValue)
        .join(';')}`

      const base = (row.email ?? row.source_row_id ?? row.id)
        .toString()
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      const filename = `client-${base || row.id}.csv`

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    },
    [visibleQuestions],
  )

  const columns = useMemo<ColumnDef<FormSubmission>[]>(() => {
    const getAnswerValue = (row: FormSubmission, questionId?: string) => {
      if (!questionId) return ''
      return getAnswerValuesForQuestion(row.raw_json, questionId).join(' • ')
    }

    const renderValue = (value: string) => (value ? value : '—')

    return [
      {
        id: 'last_name',
        header: 'Nom',
        meta: { label: 'Nom' },
        accessorFn: (row) => getAnswerValue(row, fieldQuestionIds.lastName),
        cell: ({ row }) => {
          const value = row.getValue<string>('last_name')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'first_name',
        header: 'Prénom',
        meta: { label: 'Prénom' },
        accessorFn: (row) => getAnswerValue(row, fieldQuestionIds.firstName),
        cell: ({ row }) => {
          const value = row.getValue<string>('first_name')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        accessorFn: (row) => row.email ?? '',
        cell: ({ row }) => {
          const value = row.original.email ?? row.getValue<string>('email')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'phone',
        header: 'Téléphone',
        meta: { label: 'Téléphone' },
        accessorFn: (row) => row.phone ?? getAnswerValue(row, fieldQuestionIds.phoneFromForm),
        cell: ({ row }) => {
          const value = row.getValue<string>('phone')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'age',
        header: 'Âge',
        meta: { label: 'Âge' },
        accessorFn: (row) => getAnswerValue(row, fieldQuestionIds.age),
        cell: ({ row }) => {
          const value = row.getValue<string>('age')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'phone_raw',
        header: 'Numéro de téléphone',
        meta: { label: 'Numéro de téléphone' },
        accessorFn: (row) => getAnswerValue(row, fieldQuestionIds.phoneFromForm),
        cell: ({ row }) => {
          const value = row.getValue<string>('phone_raw')
          return <span className="whitespace-nowrap">{renderValue(value)}</span>
        },
      },
      {
        id: 'actions',
        header: 'Action',
        meta: { label: 'Action' },
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleDownloadCsv(row.original)}
          >
            CSV
          </Button>
        ),
      },
    ]
  }, [fieldQuestionIds, handleDownloadCsv])

  const columnFilterOptions = useMemo(
    () => [
      { id: 'last_name', label: 'Nom' },
      { id: 'first_name', label: 'Prénom' },
      { id: 'email', label: 'Email' },
      { id: 'phone', label: 'Téléphone' },
      { id: 'age', label: 'Âge' },
      { id: 'phone_raw', label: 'Numéro de téléphone' },
    ],
    [],
  )

  const searchableColumns = ['last_name', 'first_name', 'email', 'phone', 'age', 'phone_raw']

  const table = useReactTable({
    data: filteredSubmissions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue ?? '').toLowerCase()
      if (!term) return true
      return searchableColumns.some((columnId) => {
        const value = String(row.getValue<string>(columnId) ?? '')
        return value.toLowerCase().includes(term)
      })
    },
    state: {
      columnVisibility,
      columnFilters,
      globalFilter,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
  })

  const sessionExpiry = userSession ? formatDate(userSession.expiresAt) : null

  const handleSearch = () => {
    setHasSearched(true)
    searchMutation.mutate()
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-10">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] w-72 flex-col lg:flex">
          <div className="flex h-full flex-col gap-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm">
            <div className="space-y-3">
              <Logo subtitle="Back office" />
              <p className="text-sm text-muted-foreground">
                Visualisez les réponses issues de la table form_submissions.
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
                Besoin d’aide pour les exports ?
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
                Rubrique Recherche
              </p>
              <h1 className="font-display text-3xl font-semibold md:text-4xl">
                Filtrez les formulaires importés
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Recherche par email, téléphone ou dans toutes les réponses
                enregistrées dans form_submissions.
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

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-base">Table</CardTitle>
                <CardDescription>form_submissions</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="truncate">Données brutes issues de Supabase.</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-base">Statut</CardTitle>
                <CardDescription>Authentification</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge variant={accessToken ? 'success' : 'outline'}>
                  {accessToken ? 'Connecté' : 'Non connecté'}
                </Badge>
                <span className="text-xs text-muted-foreground">Token actif</span>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>Recherche</CardTitle>
                  <CardDescription>
                    Formulaire de filtrage des réponses.
                  </CardDescription>
                </div>
                <Badge variant={searchMutation.isSuccess ? 'success' : 'outline'}>
                  {searchMutation.isSuccess
                    ? `${table.getFilteredRowModel().rows.length} réponses`
                    : 'En attente'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-1 flex-wrap gap-3">
                    <div className="min-w-[220px] flex-1">
                      <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
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
                        onChange={(event) => setPhone(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                        placeholder="ex: 06 12 34 56 78"
                      />
                    </div>
                  </div>
                </div>

                <div className="w-full mb-4 flex flex-wrap gap-3">
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSearch}
                      disabled={searchMutation.isPending}
                    >
                      {searchMutation.isPending ? 'Recherche...' : 'Rechercher'}
                    </Button>
                  </div>
                  <div className="flex items-end">
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
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px]">
                    <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Filtrer une colonne
                    </label>
                    <select
                      className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                      value={columnFilterId}
                      onChange={(event) => setColumnFilterId(event.target.value)}
                    >
                      {columnFilterOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Valeur
                    </label>
                    <input
                      type="text"
                      value={columnFilterValue}
                      onChange={(event) => setColumnFilterValue(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm"
                      placeholder="Ex: Martin"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setColumnFilterValue('')}
                    >
                      Effacer
                    </Button>
                  </div>
                </div>

                <DataTableToolbar
                  table={table}
                  globalPlaceholder="Rechercher (nom, prénom, email, téléphone)..."
                  showViewOptions={false}
                />

                <p className="text-xs text-muted-foreground">
                  Les champs email/téléphone filtrent côté serveur. La recherche
                  globale filtre le tableau.
                </p>

                {mapError ? (
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
                    Mapping introuvable: {mapError}. Les IDs de questions seront affichés.
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border/60 bg-muted/20 overflow-x-auto max-w-full">
                  <Table className="min-w-[900px] w-max">
                    <TableHeader>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id} className="whitespace-nowrap">
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
                      {hasSearched && table.getFilteredRowModel().rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={table.getVisibleFlatColumns().length}
                            className="text-muted-foreground"
                          >
                            Aucun résultat pour ces critères.
                          </TableCell>
                        </TableRow>
                      ) : (
                        table.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <details className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Voir le JSON brut
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto text-xs leading-relaxed">
                    {searchMutation.data
                      ? JSON.stringify(searchMutation.data, null, 2)
                      : 'Aucune réponse chargée.'}
                  </pre>
                </details>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">Étapes suivantes</CardTitle>
                  <CardDescription>
                    Mapping des questions à intégrer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>• Ajouter la table form_question_map.</p>
                  <p>• Associer question_id ? label.</p>
                  <p>• Afficher les libellés dans le tableau.</p>
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

export default RechercheDashboard
