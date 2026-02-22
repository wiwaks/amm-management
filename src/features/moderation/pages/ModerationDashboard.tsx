import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import {
  fetchPendingProfiles,
  fetchProfileDetail,
  approveProfile,
  rejectProfile,
  updateProfileFields,
  updateFunFacts,
  computeCompletion,
  type PendingProfile,
  type ProfileDetail,
  type UserPhoto,
  type FunFacts,
} from '../../../services/supabase/moderation'
import { Button } from '../../../shared/components/ui/button'
import {
  Card,
  CardContent,
} from '../../../shared/components/ui/card'
import { Badge } from '../../../shared/components/ui/badge'
import { Skeleton } from '../../../shared/components/ui/skeleton'
import { Toast } from '../../../shared/components/ui/toast'
import {
  Shield,
  CheckCircle2,
  XCircle,
  User,
  MapPin,
  Briefcase,
  AlertTriangle,
  Pencil,
} from 'lucide-react'
import {
  PROFILE_FIELD_SECTIONS,
  FUN_FACTS_SECTIONS,
  type FieldConfig,
  type FieldSection,
} from '../constants/fieldConfig'
import { cn } from '../../../shared/utils/cn'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const BUCKET = 'photos'

function getPhotoUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

function formatDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type ToastMessage = {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
}

type SelectedProfile = {
  profile: ProfileDetail
  photos: UserPhoto[]
  funFacts: FunFacts | null
}

// ── Read-only field display ──

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{String(value)}</p>
    </div>
  )
}

// ── Format a raw value for display in view mode ──

function formatFieldValue(
  config: FieldConfig,
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null

  if (config.type === 'boolean') {
    if (value === true) return 'Oui'
    if (value === false) return 'Non'
    return null
  }

  if (config.type === 'select' && config.options) {
    const opt = config.options.find((o) => o.value === value)
    return opt?.label ?? String(value)
  }

  if (config.type === 'multiselect' && Array.isArray(value)) {
    if (value.length === 0) return null
    return value
      .map((v) => config.options?.find((o) => o.value === v)?.label ?? v)
      .join(', ')
  }

  if (config.type === 'number' && config.key === 'height_cm') {
    return `${value} cm`
  }

  const str = String(value)
  return str || null
}

// ── Editable field control ──

function EditableField({
  config,
  value,
  onChange,
}: {
  config: FieldConfig
  value: unknown
  onChange: (val: unknown) => void
}) {
  const inputCls =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  switch (config.type) {
    case 'text':
      return (
        <div>
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputCls}
          />
        </div>
      )

    case 'textarea':
      return (
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            rows={3}
            className={inputCls}
          />
        </div>
      )

    case 'number':
      return (
        <div>
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null)
            }
            className={inputCls}
          />
        </div>
      )

    case 'select':
      return (
        <div>
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputCls}
          >
            <option value="">--</option>
            {config.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )

    case 'boolean':
      return (
        <div>
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <div className="flex gap-4 pt-1">
            {[
              { val: true, label: 'Oui' },
              { val: false, label: 'Non' },
              { val: null, label: '--' },
            ].map((opt) => (
              <label
                key={String(opt.val)}
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <input
                  type="radio"
                  name={config.key}
                  checked={value === opt.val}
                  onChange={() => onChange(opt.val)}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )

    case 'multiselect':
      return (
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs uppercase text-muted-foreground">
            {config.label}
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            {config.options?.map((opt) => {
              const selected =
                Array.isArray(value) && (value as string[]).includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const arr = Array.isArray(value)
                      ? [...(value as string[])]
                      : []
                    if (selected) {
                      const next = arr.filter((v) => v !== opt.value)
                      onChange(next.length > 0 ? next : null)
                    } else {
                      onChange([...arr, opt.value])
                    }
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    selected
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border bg-background text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )

    default:
      return null
  }
}

// ── Section renderer ──

function SectionBlock({
  section,
  data,
  draft,
  isEditing,
  onFieldChange,
}: {
  section: FieldSection
  data: Record<string, unknown>
  draft: Record<string, unknown>
  isEditing: boolean
  onFieldChange: (key: string, value: unknown) => void
}) {
  const hasAnyValue = section.fields.some((f) => {
    const v = data[f.key]
    return v !== null && v !== undefined && v !== ''
  })

  // In view mode, hide section if completely empty
  if (!isEditing && !hasAnyValue) return null

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
        {section.title}
      </h3>
      <div
        className={cn(
          'grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3',
          isEditing
            ? 'border-primary/40 bg-primary/5'
            : 'border bg-muted/50',
        )}
      >
        {isEditing
          ? section.fields.map((config) => (
              <EditableField
                key={config.key}
                config={config}
                value={config.key in draft ? draft[config.key] : data[config.key]}
                onChange={(val) => onFieldChange(config.key, val)}
              />
            ))
          : section.fields.map((config) => {
              const val = data[config.key]
              const display = formatFieldValue(config, val)
              return (
                <InfoField key={config.key} label={config.label} value={display} />
              )
            })}
      </div>
    </div>
  )
}

// ── Main Component ──

function ModerationDashboard() {
  const [profiles, setProfiles] = useState<PendingProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfile | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const rejectInputRef = useRef<HTMLTextAreaElement>(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [profileDraft, setProfileDraft] = useState<Record<string, unknown>>({})
  const [funFactsDraft, setFunFactsDraft] = useState<Record<string, unknown>>({})
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())

  const resetEditState = useCallback(() => {
    setIsEditing(false)
    setProfileDraft({})
    setFunFactsDraft({})
    setDirtyFields(new Set())
  }, [])

  // ── Fetch pending profiles ──
  const loadMutation = useMutation({
    mutationFn: fetchPendingProfiles,
    onSuccess: (data) => setProfiles(data),
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // ── Fetch profile detail ──
  const detailMutation = useMutation({
    mutationFn: (userId: string) => fetchProfileDetail(userId),
    onSuccess: (data) => {
      if (data) {
        setSelectedProfile(data)
        setShowRejectInput(false)
        setRejectReason('')
        resetEditState()
      }
    },
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // ── Approve ──
  const approveMutation = useMutation({
    mutationFn: (userId: string) => approveProfile(userId),
    onSuccess: () => {
      setToast({ title: 'Approuvé', description: 'Le profil a été validé.', variant: 'success' })
      setSelectedProfile(null)
      resetEditState()
      loadMutation.mutate()
    },
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // ── Reject ──
  const rejectMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      rejectProfile(userId, reason),
    onSuccess: () => {
      setToast({ title: 'Rejeté', description: 'Le profil a été rejeté.', variant: 'info' })
      setSelectedProfile(null)
      resetEditState()
      loadMutation.mutate()
    },
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // ── Save edits ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      const userId = selectedProfile!.profile.user_id

      const profileChanges: Record<string, unknown> = {}
      const funFactsChanges: Record<string, unknown> = {}

      for (const field of dirtyFields) {
        if (field in profileDraft) profileChanges[field] = profileDraft[field]
        if (field in funFactsDraft) funFactsChanges[field] = funFactsDraft[field]
      }

      const promises: Promise<void>[] = []
      if (Object.keys(profileChanges).length > 0) {
        promises.push(updateProfileFields(userId, profileChanges))
      }
      if (Object.keys(funFactsChanges).length > 0) {
        promises.push(updateFunFacts(userId, funFactsChanges))
      }

      await Promise.all(promises)
    },
    onSuccess: () => {
      setToast({
        title: 'Sauvegarde',
        description: `${dirtyFields.size} champ(s) mis à jour.`,
        variant: 'success',
      })
      // Re-fetch fresh data
      detailMutation.mutate(selectedProfile!.profile.user_id)
    },
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // Load on mount
  useEffect(() => {
    loadMutation.mutate()
  }, [])

  const handleReject = useCallback(() => {
    if (!selectedProfile || !rejectReason.trim()) return
    rejectMutation.mutate({
      userId: selectedProfile.profile.user_id,
      reason: rejectReason.trim(),
    })
  }, [selectedProfile, rejectReason])

  const handleClose = useCallback(() => {
    setSelectedProfile(null)
    setShowRejectInput(false)
    setRejectReason('')
    resetEditState()
  }, [resetEditState])

  const handleToggleEdit = useCallback(() => {
    if (isEditing && dirtyFields.size > 0) {
      if (!window.confirm('Abandonner les modifications ?')) return
    }
    if (isEditing) {
      resetEditState()
    } else {
      setIsEditing(true)
    }
  }, [isEditing, dirtyFields.size, resetEditState])

  // Profile field change handler
  const handleProfileFieldChange = useCallback((key: string, value: unknown) => {
    setProfileDraft((prev) => ({ ...prev, [key]: value }))
    setDirtyFields((prev) => new Set(prev).add(key))

    // children_has = false → clear children_count
    if (key === 'children_has' && value === false) {
      setProfileDraft((prev) => ({ ...prev, children_has: false, children_count: null }))
      setDirtyFields((prev) => new Set(prev).add('children_has').add('children_count'))
    }
  }, [])

  // Fun facts field change handler
  const handleFunFactsFieldChange = useCallback((key: string, value: unknown) => {
    setFunFactsDraft((prev) => ({ ...prev, [key]: value }))
    setDirtyFields((prev) => new Set(prev).add(key))
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  // Focus reject input when shown
  useEffect(() => {
    if (showRejectInput) rejectInputRef.current?.focus()
  }, [showRejectInput])

  // Compute completion score dynamically from profile + fun facts
  const completion = useMemo(() => {
    if (!selectedProfile) return { pct: 0, missing: [] as string[] }
    return computeCompletion(selectedProfile.profile, selectedProfile.funFacts)
  }, [selectedProfile])

  // Build flat data objects for section rendering
  const profileData = useMemo<Record<string, unknown>>(() => {
    if (!selectedProfile) return {}
    return selectedProfile.profile as unknown as Record<string, unknown>
  }, [selectedProfile])

  const funFactsData = useMemo<Record<string, unknown>>(() => {
    if (!selectedProfile?.funFacts) return {}
    return selectedProfile.funFacts as unknown as Record<string, unknown>
  }, [selectedProfile])

  return (
    <>
      <div className="flex h-full flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Modération des profils</h1>
            <p className="text-sm text-muted-foreground">
              {profiles.length} profil{profiles.length !== 1 ? 's' : ''} en attente de validation
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => loadMutation.mutate()}
            disabled={loadMutation.isPending}
          >
            {loadMutation.isPending ? 'Chargement...' : 'Rafraîchir'}
          </Button>
        </div>

        {/* Grid of profile cards */}
        {loadMutation.isPending ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border">
                <Skeleton className="aspect-[3/4] w-full rounded-none" />
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <Card className="border">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">Aucun profil en attente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {profiles.map((profile) => (
              <Card
                key={profile.user_id}
                className="group cursor-pointer overflow-hidden border transition-all hover:border-primary/40 hover:shadow-lg"
                onClick={() => detailMutation.mutate(profile.user_id)}
              >
                {/* Photo */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                  {profile.main_photo_url ? (
                    <img
                      src={profile.main_photo_url}
                      alt={profile.first_name ?? 'Photo'}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <User className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="font-semibold text-white">
                      {profile.first_name ?? '?'}
                      {profile.age_years ? `, ${profile.age_years}` : ''}
                    </p>
                    {profile.city && (
                      <p className="flex items-center gap-1 text-xs text-white/80">
                        <MapPin className="h-3 w-3" />
                        {profile.city}
                      </p>
                    )}
                  </div>
                </div>

                {/* Info */}
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {profile.profession && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Briefcase className="h-3 w-3" />
                          {profile.profession}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {profile.completion_score ?? 0}%
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDate(profile.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
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

      {/* ── Skeleton detail modal (loading) ── */}
      {detailMutation.isPending && !selectedProfile
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="relative flex h-[calc(100dvh-2rem)] w-full max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:rounded-3xl xl:w-[min(90vw,1320px)]">
                {/* Skeleton header */}
                <div className="flex items-center justify-between border-b border-border p-4 sm:p-6">
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded-md" />
                </div>
                {/* Skeleton body */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="space-y-6 p-4 sm:p-6">
                    {/* Skeleton photos */}
                    <div>
                      <Skeleton className="mb-3 h-3 w-16" />
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                        ))}
                      </div>
                    </div>
                    {/* Skeleton sections */}
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i}>
                        <Skeleton className="mb-3 h-3 w-24" />
                        <div className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <div key={j} className="space-y-1.5">
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-5 w-full" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ── Profile detail modal ── */}
      {selectedProfile
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="relative flex h-[calc(100vh-2rem)] h-[calc(100dvh-2rem)] w-full max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:h-[min(92vh,900px)] sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:rounded-3xl xl:w-[min(90vw,1320px)]">
                {/* Modal header */}
                <div className="z-10 flex items-center justify-between border-b border-border bg-background/95 p-4 backdrop-blur sm:p-6">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {selectedProfile.profile.first_name ?? '?'}{' '}
                      {selectedProfile.profile.last_name ?? ''}
                      {selectedProfile.profile.age_years
                        ? `, ${selectedProfile.profile.age_years} ans`
                        : ''}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedProfile.profile.city ?? '--'} &middot;{' '}
                      {selectedProfile.profile.gender ?? '--'} &middot; Score{' '}
                      {completion.pct}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!showRejectInput && (
                      <Button
                        type="button"
                        variant={isEditing ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={handleToggleEdit}
                      >
                        {isEditing ? (
                          <>
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Annuler
                          </>
                        ) : (
                          <>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Modifier
                          </>
                        )}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                      Fermer
                    </Button>
                  </div>
                </div>

                {/* Scrollable content */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="space-y-6 p-4 sm:p-6">
                    {/* Photos grid (always read-only) */}
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                        Photos
                      </h3>
                      {selectedProfile.photos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                          {selectedProfile.photos.map((photo) => (
                            <div
                              key={photo.id}
                              className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted"
                            >
                              <img
                                src={getPhotoUrl(photo.storage_path)}
                                alt={`${photo.album} ${photo.position}`}
                                className="h-full w-full object-cover"
                              />
                              <Badge
                                variant="outline"
                                className="absolute left-1.5 top-1.5 bg-background/80 text-[10px] backdrop-blur"
                              >
                                {photo.album === 'main'
                                  ? 'Principale'
                                  : photo.album === 'public'
                                    ? `Public ${photo.position + 1}`
                                    : `Privé ${photo.position + 1}`}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucune photo</p>
                      )}
                    </div>

                    {/* Profile sections (data-driven) */}
                    {PROFILE_FIELD_SECTIONS.map((section) => (
                      <SectionBlock
                        key={section.title}
                        section={section}
                        data={profileData}
                        draft={profileDraft}
                        isEditing={isEditing}
                        onFieldChange={handleProfileFieldChange}
                      />
                    ))}

                    {/* Fun Facts sections (data-driven) */}
                    {FUN_FACTS_SECTIONS.map((section) => (
                      <SectionBlock
                        key={section.title}
                        section={section}
                        data={funFactsData}
                        draft={funFactsDraft}
                        isEditing={isEditing}
                        onFieldChange={handleFunFactsFieldChange}
                      />
                    ))}

                    {/* Missing fields */}
                    {completion.missing.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                          Champs manquants ({completion.missing.length})
                        </h3>
                        <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          {completion.missing.map((field) => (
                            <Badge
                              key={field}
                              variant="outline"
                              className="border-amber-500/40 text-xs text-amber-600"
                            >
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reject reason input */}
                    {showRejectInput && (
                      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                        <label className="mb-2 block text-xs font-semibold uppercase text-destructive">
                          Motif du rejet
                        </label>
                        <textarea
                          ref={rejectInputRef}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-destructive focus:outline-none"
                          placeholder="Ex: Photos inappropriées, profil incomplet, contenu offensant..."
                        />
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleReject}
                            disabled={!rejectReason.trim() || rejectMutation.isPending}
                          >
                            {rejectMutation.isPending ? 'Rejet...' : 'Confirmer le rejet'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowRejectInput(false)
                              setRejectReason('')
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action bar */}
                {isEditing ? (
                  <div className="flex items-center justify-between border-t border-border bg-background/95 p-4 backdrop-blur sm:p-6">
                    <p className="text-xs text-muted-foreground">
                      {dirtyFields.size} champ{dirtyFields.size !== 1 ? 's' : ''}{' '}
                      modifié{dirtyFields.size !== 1 ? 's' : ''}
                    </p>
                    <Button
                      type="button"
                      onClick={() => saveMutation.mutate()}
                      disabled={dirtyFields.size === 0 || saveMutation.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {saveMutation.isPending ? 'Enregistrement...' : 'Sauvegarder'}
                    </Button>
                  </div>
                ) : !showRejectInput ? (
                  <div className="flex items-center justify-end gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:p-6">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowRejectInput(true)}
                      disabled={approveMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        approveMutation.mutate(selectedProfile.profile.user_id)
                      }
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {approveMutation.isPending ? 'Validation...' : 'Approuver'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default ModerationDashboard
