import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { Search, User, Mail, Phone, Calendar, Users, Heart, ListFilter, Check } from 'lucide-react'
import { cn } from '../../../shared/utils/cn'
import { Skeleton } from '../../../shared/components/ui/skeleton'
import { Input } from '../../../shared/components/ui/input'
import {
  type Column,
  type ColumnDef,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { generateInvitation } from '../../../services/supabase/invitations'
import {
  fetchSubmissionAnswers,
  type FormSubmissionAnswer,
} from '../../../services/supabase/formSubmissionAnswers'
import {
  fetchFormQuestionMap,
  type FormQuestionMap,
  upsertFormQuestionMap,
} from '../../../services/supabase/formQuestionMap'
import { fetchFormQuestionMap as fetchGoogleFormQuestionMap } from '../../../services/google/forms'
import {
  searchSubmissions,
  type SearchSubmission,
} from '../../../services/supabase/searchSubmissions'
import { getSession } from '../../../shared/auth/sessionManager'
import { DataTableToolbar } from '../../../shared/components/data-table/data-table-toolbar'
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
import { Popover, PopoverContent, PopoverTrigger } from '../../../shared/components/ui/popover'
import { Toast } from '../../../shared/components/ui/toast'
import type { GenerateInvitationResult } from '../../../shared/types'

type ToastMessage = {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
}

type SubmissionRow = SearchSubmission & {
  searchIndex: string
}

type SelectedSubmission = {
  id: string
  email: string | null
  phone: string | null
  submitted_at: string | null
  created_at: string
  answers: FormSubmissionAnswer[]
}

function formatDate(value?: string | null) {
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

function getAnswerValue(
  answers: FormSubmissionAnswer[],
  questionId: string,
): string {
  if (!questionId) return ''
  return answers
    .filter((answer) => answer.question_id === questionId)
    .sort((left, right) => left.answer_index - right.answer_index)
    .map((answer) => answer.value_text ?? '')
    .filter(Boolean)
    .join(', ')
}

const REQUIRED_ENV = {
  VITE_SEARCH_SUBMISSIONS_ENDPOINT: import.meta.env
    .VITE_SEARCH_SUBMISSIONS_ENDPOINT as string | undefined,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as
    | string
    | undefined,
  VITE_GOOGLE_FORM_ID: import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined,
}

const missingEnvVars = Object.entries(REQUIRED_ENV)
  .filter(([, value]) => !value)
  .map(([key]) => key)

function ColumnFilterHeader<TData>({
  column,
  title,
}: {
  column: Column<TData, unknown>
  title: string
}) {
  const facetedValues = column.getFacetedUniqueValues()
  const selectedValues = new Set(column.getFilterValue() as string[] | undefined)

  const sortedOptions = useMemo(() => {
    const entries: { value: string; count: number }[] = []
    facetedValues.forEach((count, value) => {
      const str = String(value).trim()
      if (str) entries.push({ value: str, count })
    })
    return entries.sort((a, b) => a.value.localeCompare(b.value))
  }, [facetedValues])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-left font-medium hover:text-foreground"
        >
          {title}
          <ListFilter
            className={cn(
              'size-3.5',
              selectedValues.size > 0
                ? 'text-primary'
                : 'text-muted-foreground',
            )}
          />
          {selectedValues.size > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {selectedValues.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="space-y-1">
          {sortedOptions.map((opt) => {
            const isSelected = selectedValues.has(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  const next = new Set(selectedValues)
                  if (isSelected) {
                    next.delete(opt.value)
                  } else {
                    next.add(opt.value)
                  }
                  column.setFilterValue(next.size ? Array.from(next) : undefined)
                }}
              >
                <div
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30',
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                <span className="flex-1 truncate text-left">{opt.value}</span>
                <span className="text-xs text-muted-foreground">{opt.count}</span>
              </button>
            )
          })}
          {selectedValues.size > 0 && (
            <button
              type="button"
              className="w-full rounded-sm px-2 py-1.5 text-center text-sm text-muted-foreground hover:bg-accent"
              onClick={() => column.setFilterValue(undefined)}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RechercheDashboard() {
  const session = getSession()
  const accessToken = session?.accessToken
  const [questionMap, setQuestionMap] = useState<FormQuestionMap[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [selectedSubmission, setSelectedSubmission] =
    useState<SelectedSubmission | null>(null)
  const [loadingSubmissionId, setLoadingSubmissionId] = useState<string | null>(
    null,
  )
  const [generatedDeepLink, setGeneratedDeepLink] = useState<string | null>(null)
  const answersCacheRef = useRef<Record<string, FormSubmissionAnswer[]>>({})
  const [showForm, setShowForm] = useState(true)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const emailInputRef = useRef<HTMLInputElement | null>(null)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)
  const ageInputRef = useRef<HTMLInputElement | null>(null)
  const genderInputRef = useRef<HTMLSelectElement | null>(null)
  const childrenInputRef = useRef<HTMLSelectElement | null>(null)

  const searchMutation = useMutation({
    mutationFn: async (params: { name?: string; email?: string; phone?: string; age?: string; gender?: string; children?: string }) => {
      return searchSubmissions({
        name: params.name,
        email: params.email,
        phone: params.phone,
        age: params.age,
        gender: params.gender,
        children: params.children,
        limit: 200,
      })
    },
    onSuccess: (data) => {
      setShowForm(false)
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

  const handleSearchClick = useCallback(() => {
    const trimmedName = nameInputRef.current?.value.trim() ?? ''
    const trimmedEmail = emailInputRef.current?.value.trim() ?? ''
    const trimmedPhone = phoneInputRef.current?.value.trim() ?? ''
    const trimmedAge = ageInputRef.current?.value.trim() ?? ''
    const selectedGender = genderInputRef.current?.value ?? ''
    const selectedChildren = childrenInputRef.current?.value ?? ''

    searchMutation.mutate({
      name: trimmedName || undefined,
      email: trimmedEmail || undefined,
      phone: trimmedPhone || undefined,
      age: trimmedAge || undefined,
      gender: selectedGender || undefined,
      children: selectedChildren || undefined,
    })
  }, [searchMutation])

  const syncMutation = useMutation({
    mutationFn: async () => {
      const formId = import.meta.env.VITE_GOOGLE_FORM_ID as string | undefined
      if (!formId) {
        throw new Error('Missing VITE_GOOGLE_FORM_ID.')
      }
      if (!accessToken) {
        throw new Error('Session expirée. Reconnectez-vous.')
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
      return generateInvitation(submissionId, session?.sessionId)
    },
    onSuccess: (data: GenerateInvitationResult) => {
      if (data.invitation) {
        setGeneratedDeepLink(data.invitation.deepLink)
        setToast({
          title: data.reused ? 'Invitation existante' : 'Invitation créée',
          description: data.reused
            ? 'Un lien valide existait déjà pour ce client.'
            : "Le lien d'invitation a été généré.",
          variant: 'success',
        })
      }
    },
    onError: (error) => {
      setToast({
        title: "Erreur d'invitation",
        description: error.message,
        variant: 'error',
      })
    },
  })

  const handleOpenSubmission = useCallback(async (submission: SearchSubmission) => {
    setGeneratedDeepLink(null)

    const cachedAnswers = answersCacheRef.current[submission.id]
    if (cachedAnswers) {
      setSelectedSubmission({
        id: submission.id,
        email: submission.email,
        phone: submission.phone || submission.telephone || null,
        submitted_at: submission.submitted_at,
        created_at: submission.created_at,
        answers: cachedAnswers,
      })
      return
    }

    setLoadingSubmissionId(submission.id)
    try {
      const answers = await fetchSubmissionAnswers(submission.id)
      answersCacheRef.current[submission.id] = answers
      setSelectedSubmission({
        id: submission.id,
        email: submission.email,
        phone: submission.phone || submission.telephone || null,
        submitted_at: submission.submitted_at,
        created_at: submission.created_at,
        answers,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setToast({
        title: 'Erreur de chargement',
        description: message,
        variant: 'error',
      })
    } finally {
      setLoadingSubmissionId((current) =>
        current === submission.id ? null : current,
      )
    }
  }, [])

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

  const submissions = useMemo(() => searchMutation.data ?? [], [searchMutation.data])

  const tableData = useMemo<SubmissionRow[]>(() => {
    return submissions.map((submission) => {
      const searchIndex = [
        submission.nom,
        submission.prenom,
        submission.telephone,
        submission.email ?? '',
        submission.phone ?? '',
        submission.age,
        submission.genre,
        submission.enfants,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return {
        ...submission,
        searchIndex,
      }
    })
  }, [submissions])

  const columns = useMemo<ColumnDef<SubmissionRow>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Nom" />
        ),
        meta: { label: 'Nom' },
        cell: ({ row }) => row.original.nom || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.nom.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        accessorKey: 'prenom',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Prénom" />
        ),
        meta: { label: 'Prénom' },
        cell: ({ row }) => row.original.prenom || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.prenom.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        accessorKey: 'telephone',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Téléphone" />
        ),
        meta: { label: 'Téléphone' },
        cell: ({ row }) => row.original.telephone || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.telephone.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        accessorKey: 'age',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Âge" />
        ),
        meta: { label: 'Âge' },
        cell: ({ row }) => row.original.age || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.age.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        accessorKey: 'genre',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Sexe" />
        ),
        meta: { label: 'Sexe' },
        cell: ({ row }) => row.original.genre || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.genre.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        accessorKey: 'enfants',
        header: ({ column }) => (
          <ColumnFilterHeader column={column} title="Enfants" />
        ),
        meta: { label: 'Enfants' },
        cell: ({ row }) => row.original.enfants || '--',
        filterFn: (row, _id, filterValues: string[]) => {
          const val = row.original.enfants.toLowerCase()
          return filterValues.some((f) => val.includes(f.toLowerCase()))
        },
      },
      {
        id: 'action',
        header: '',
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const isLoading = loadingSubmissionId === row.original.id
          return (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void handleOpenSubmission(row.original)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Chargement</span>
                </>
              ) : (
                <>
                  <span>Consulter</span>
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          )
        },
      },
    ],
    [handleOpenSubmission, loadingSubmissionId],
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
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn,
    initialState: {
      pagination: { pageSize: 5 },
    },
  })

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
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">

        {/* View 1: Search form (centered) */}
        {showForm ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="w-full max-w-2xl border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Recherche</CardTitle>
                <CardDescription>
                  Recherchez par nom, email, téléphone ou critères
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <User className="size-4 text-muted-foreground" />
                      Nom
                    </label>
                    <Input
                      ref={nameInputRef}
                      type="text"
                      placeholder="ex: Dupont, Marie..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Mail className="size-4 text-muted-foreground" />
                      Email
                    </label>
                    <Input
                      ref={emailInputRef}
                      type="email"
                      placeholder="ex: jane@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Phone className="size-4 text-muted-foreground" />
                      Téléphone
                    </label>
                    <Input
                      ref={phoneInputRef}
                      type="tel"
                      placeholder="ex: 06 12 34 56 78"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="size-4 text-muted-foreground" />
                      Âge
                    </label>
                    <Input
                      ref={ageInputRef}
                      type="text"
                      placeholder="ex: 30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Users className="size-4 text-muted-foreground" />
                      Sexe
                    </label>
                    <select
                      ref={genderInputRef}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Tous</option>
                      <option value="homme">Homme</option>
                      <option value="femme">Femme</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Heart className="size-4 text-muted-foreground" />
                      Enfants
                    </label>
                    <select
                      ref={childrenInputRef}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Tous</option>
                      <option value="oui">Oui</option>
                      <option value="non">Non</option>
                    </select>
                  </div>
                </div>

                {missingEnvVars.length > 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    Variables d'environnement manquantes: {missingEnvVars.join(', ')}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={handleSearchClick}
                    disabled={searchMutation.isPending || missingEnvVars.length > 0}
                    className="gap-2"
                  >
                    <Search className="size-4" />
                    {searchMutation.isPending ? 'Recherche...' : 'Rechercher'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending || missingEnvVars.length > 0}
                    className="text-muted-foreground"
                  >
                    {syncMutation.isPending
                      ? 'Mise à jour...'
                      : 'Mettre à jour les libellés'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* View 2: Results + "Modifier la recherche" button */}
            <Card className="flex min-h-0 min-w-0 flex-1 flex-col border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      Résultats {filteredCount} / {submissions.length}
                    </CardTitle>
                    <CardDescription>
                      Cliquez sur &quot;Consulter&quot; pour charger les réponses complètes.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowForm(true)}
                    className="gap-2"
                  >
                    <Search className="size-4" />
                    Modifier la recherche
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                <DataTableToolbar
                  table={table}
                  globalPlaceholder="Filtrer les résultats..."
                  showViewOptions={false}
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/20">
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
                        {searchMutation.isPending ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-28" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-10" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-12" /></TableCell>
                              <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                            </TableRow>
                          ))
                        ) : tableData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
                              Aucun résultat.
                            </TableCell>
                          </TableRow>
                        ) : table.getRowModel().rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
                              Aucun résultat pour ce filtre.
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
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border px-4 py-3 text-sm">
                    <div className="text-muted-foreground">
                      {filteredCount === 0 ? '0 résultat' : `${pageStart}-${pageEnd} sur ${filteredCount}`}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                      >
                        Précédent
                      </Button>
                      <span className="text-xs uppercase text-muted-foreground">
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
          </>
        )}

      </div>

      {toast
        ? createPortal(
            <div className="fixed right-6 top-16 z-50 flex w-full max-w-sm flex-col gap-3">
              <Toast
                title={toast.title}
                description={toast.description}
                variant={toast.variant}
                onClose={() => setToast(null)}
              />
            </div>,
            document.body,
          )
        : null}

      {selectedSubmission
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="relative flex h-[calc(100vh-2rem)] h-[calc(100dvh-2rem)] w-full max-w-none flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl sm:h-[min(92vh,900px)] sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:rounded-xl xl:w-[min(90vw,1320px)]">
                <div className="z-10 flex items-center justify-between border-b border-border bg-background/95 p-4 backdrop-blur sm:p-6">
                  <div>
                    <h2 className="text-2xl font-semibold">
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

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase text-muted-foreground">
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
                          <p className="text-xs uppercase text-muted-foreground">
                            Email
                          </p>
                          <p className="font-medium">
                            {selectedSubmission.email || '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted-foreground">
                            Téléphone
                       </p>
                          <p className="font-medium">
                            {selectedSubmission.phone || '--'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {generatedDeepLink ? (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
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
                                description:
                                  'Le lien a été copié dans le presse-papier.',
                                variant: 'info',
                              })
                            }}
                          >
                            Copier
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {(() => {
                      const answerCards = questionMap
                        .map((question) => {
                          const value = getAnswerValue(
                            selectedSubmission.answers,
                            question.question_id,
                          )
                          if (!value) return null
                          return (
                            <div
                              key={question.question_id}
                              className="rounded-lg border bg-card p-4"
                            >
                              <p className="mb-2 font-semibold text-foreground">
                                {question.label}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {value}
                              </p>
                            </div>
                          )
                        })
                        .filter(Boolean)

                      if (answerCards.length === 0) {
                        return (
                          <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                            {questionMap.length === 0
                              ? 'Aucun libellé chargé. Cliquez sur "Mettre à jour les libellés" pour synchroniser.'
                              : `Aucune réponse trouvée (${selectedSubmission.answers.length} réponse(s) brute(s), ${questionMap.length} libellé(s)).`}
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-3">{answerCards}</div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default RechercheDashboard
