import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import {
  fetchPendingProfiles,
  fetchProfileDetail,
  approveProfile,
  rejectProfile,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import { Badge } from '../../../shared/components/ui/badge'
import { Toast } from '../../../shared/components/ui/toast'
import { Shield, CheckCircle2, XCircle, User, MapPin, Briefcase, Eye, AlertTriangle } from 'lucide-react'

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

// ── Profile info field helper ──

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="font-medium">{String(value)}</p>
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
      }
    },
    onError: (err) =>
      setToast({ title: 'Erreur', description: String(err), variant: 'error' }),
  })

  // ── Approve ──
  const approveMutation = useMutation({
    mutationFn: (userId: string) => approveProfile(userId),
    onSuccess: () => {
      setToast({ title: 'Approuve', description: 'Le profil a ete valide.', variant: 'success' })
      setSelectedProfile(null)
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
      setToast({ title: 'Rejete', description: 'Le profil a ete rejete.', variant: 'info' })
      setSelectedProfile(null)
      loadMutation.mutate()
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

  return (
    <>
      <div className="flex h-full flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Moderation des profils</h1>
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
            {loadMutation.isPending ? 'Chargement...' : 'Rafraichir'}
          </Button>
        </div>

        {/* Grid of profile cards */}
        {profiles.length === 0 && !loadMutation.isPending ? (
          <Card className="border-border/60 bg-card/80">
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
                className="group cursor-pointer overflow-hidden border-border/60 bg-card/80 transition-all hover:border-primary/40 hover:shadow-lg"
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

      {/* ── Profile detail modal ── */}
      {selectedProfile
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="relative flex h-[calc(100vh-2rem)] h-[calc(100dvh-2rem)] w-full max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:h-[min(92vh,900px)] sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:rounded-3xl xl:w-[min(90vw,1320px)]">
                {/* Modal header */}
                <div className="z-10 flex items-center justify-between border-b border-border bg-background/95 p-4 backdrop-blur sm:p-6">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProfile(null)
                      setShowRejectInput(false)
                      setRejectReason('')
                    }}
                  >
                    Fermer
                  </Button>
                </div>

                {/* Scrollable content */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="space-y-6 p-4 sm:p-6">
                    {/* Photos grid */}
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
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
                                    : `Prive ${photo.position + 1}`}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucune photo</p>
                      )}
                    </div>

                    {/* Profile info */}
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Informations
                      </h3>
                      <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoField label="Prenom" value={selectedProfile.profile.first_name} />
                        <InfoField label="Nom" value={selectedProfile.profile.last_name} />
                        <InfoField label="Date de naissance" value={selectedProfile.profile.birthdate} />
                        <InfoField label="Genre" value={selectedProfile.profile.gender} />
                        <InfoField label="Ville" value={selectedProfile.profile.city} />
                        <InfoField label="Zone" value={selectedProfile.profile.zone} />
                        <InfoField label="Profession" value={selectedProfile.profile.profession} />
                        <InfoField label="Secteur" value={selectedProfile.profile.sector} />
                        <InfoField label="Logement" value={selectedProfile.profile.housing_status} />
                        <InfoField label="Situation" value={selectedProfile.profile.relationship_status} />
                        <InfoField label="Taille" value={selectedProfile.profile.height_cm ? `${selectedProfile.profile.height_cm} cm` : null} />
                        <InfoField label="Teint" value={selectedProfile.profile.skin_tone} />
                        <InfoField label="Cheveux" value={[selectedProfile.profile.hair_length, selectedProfile.profile.hair_texture, selectedProfile.profile.hair_style].filter(Boolean).join(', ') || null} />
                        <InfoField label="Taille vetements" value={selectedProfile.profile.clothing_size} />
                        <InfoField label="Style" value={selectedProfile.profile.fashion_style?.join(', ') ?? null} />
                        <InfoField label="Enfants" value={selectedProfile.profile.children_has === true ? `Oui (${selectedProfile.profile.children_count ?? '?'})` : selectedProfile.profile.children_has === false ? 'Non' : null} />
                        <InfoField label="Signe" value={selectedProfile.profile.zodiac_sign} />
                        <InfoField label="Religion" value={selectedProfile.profile.religion} />
                        <InfoField label="Fumeur" value={selectedProfile.profile.smoker === true ? 'Oui' : selectedProfile.profile.smoker === false ? 'Non' : null} />
                        <InfoField label="Alcool" value={selectedProfile.profile.alcohol} />
                        <InfoField label="Sport" value={selectedProfile.profile.sport_frequency} />
                        <InfoField label="Vehicule" value={selectedProfile.profile.has_vehicle === true ? 'Oui' : selectedProfile.profile.has_vehicle === false ? 'Non' : null} />
                      </div>
                    </div>

                    {/* Bio */}
                    {(selectedProfile.profile.bio_short || selectedProfile.profile.bio_long) && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Bio
                        </h3>
                        <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4">
                          {selectedProfile.profile.bio_short && (
                            <p className="text-sm">{selectedProfile.profile.bio_short}</p>
                          )}
                          {selectedProfile.profile.bio_long && (
                            <p className="text-sm text-muted-foreground">
                              {selectedProfile.profile.bio_long}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Lover CV */}
                    {(selectedProfile.profile.lover_cv_short || selectedProfile.profile.lover_cv_long) && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Lover CV
                        </h3>
                        <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4">
                          {selectedProfile.profile.lover_cv_short && (
                            <p className="text-sm">{selectedProfile.profile.lover_cv_short}</p>
                          )}
                          {selectedProfile.profile.lover_cv_long && (
                            <p className="text-sm text-muted-foreground">
                              {selectedProfile.profile.lover_cv_long}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Fun Facts */}
                    {selectedProfile.funFacts && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Fun Facts
                        </h3>
                        <div className="space-y-4">
                          {/* Food */}
                          {[selectedProfile.funFacts.fav_dish, selectedProfile.funFacts.sweet_pleasure, selectedProfile.funFacts.dislikes_food, selectedProfile.funFacts.allergies, selectedProfile.funFacts.team_environment].some(Boolean) && (
                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Cuisine</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoField label="Plat prefere" value={selectedProfile.funFacts.fav_dish} />
                                <InfoField label="Plaisir sucre" value={selectedProfile.funFacts.sweet_pleasure} />
                                <InfoField label="N'aime pas" value={selectedProfile.funFacts.dislikes_food} />
                                <InfoField label="Allergies" value={selectedProfile.funFacts.allergies} />
                                <InfoField label="Team" value={selectedProfile.funFacts.team_environment} />
                              </div>
                            </div>
                          )}

                          {/* Culture */}
                          {[selectedProfile.funFacts.last_book_or_alt, selectedProfile.funFacts.movie_or_series_like_me, selectedProfile.funFacts.music_of_the_moment, selectedProfile.funFacts.ideal_weekend_activity].some(Boolean) && (
                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Culture</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoField label="Dernier livre / podcast" value={selectedProfile.funFacts.last_book_or_alt} />
                                <InfoField label="Film / serie qui me ressemble" value={selectedProfile.funFacts.movie_or_series_like_me} />
                                <InfoField label="Musique du moment" value={selectedProfile.funFacts.music_of_the_moment} />
                                <InfoField label="Weekend ideal" value={selectedProfile.funFacts.ideal_weekend_activity} />
                              </div>
                            </div>
                          )}

                          {/* Emotion */}
                          {[selectedProfile.funFacts.best_recognized_quality, selectedProfile.funFacts.small_flaw, selectedProfile.funFacts.i_appreciate_in_someone, selectedProfile.funFacts.dealbreaker_text].some(Boolean) && (
                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Emotion</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoField label="Qualite reconnue" value={selectedProfile.funFacts.best_recognized_quality} />
                                <InfoField label="Petit defaut" value={selectedProfile.funFacts.small_flaw} />
                                <InfoField label="J'apprecie chez quelqu'un" value={selectedProfile.funFacts.i_appreciate_in_someone} />
                                <InfoField label="Dealbreaker" value={selectedProfile.funFacts.dealbreaker_text} />
                              </div>
                            </div>
                          )}

                          {/* Story */}
                          {[selectedProfile.funFacts.bravest_thing_done, selectedProfile.funFacts.surprising_fact, selectedProfile.funFacts.happiest_when].some(Boolean) && (
                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Histoire</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoField label="Chose la plus courageuse" value={selectedProfile.funFacts.bravest_thing_done} />
                                <InfoField label="Fait surprenant" value={selectedProfile.funFacts.surprising_fact} />
                                <InfoField label="Le plus heureux quand" value={selectedProfile.funFacts.happiest_when} />
                              </div>
                            </div>
                          )}

                          {/* Projection */}
                          {[selectedProfile.funFacts.i_am_looking_for, selectedProfile.funFacts.in_2_5_years_i_want, selectedProfile.funFacts.love_language].some(Boolean) && (
                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Projection</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoField label="Je recherche" value={selectedProfile.funFacts.i_am_looking_for} />
                                <InfoField label="Dans 2-5 ans" value={selectedProfile.funFacts.in_2_5_years_i_want} />
                                <InfoField label="Langage d'amour" value={selectedProfile.funFacts.love_language} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Missing fields */}
                    {completion.missing.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Champs manquants ({completion.missing.length})
                        </h3>
                        <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          {completion.missing.map((field) => (
                            <Badge key={field} variant="outline" className="border-amber-500/40 text-xs text-amber-600">
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reject reason input */}
                    {showRejectInput && (
                      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
                          Motif du rejet
                        </label>
                        <textarea
                          ref={rejectInputRef}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm focus:border-destructive focus:outline-none"
                          placeholder="Ex: Photos inappropriees, profil incomplet, contenu offensant..."
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
                {!showRejectInput && (
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
                      onClick={() => approveMutation.mutate(selectedProfile.profile.user_id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {approveMutation.isPending ? 'Validation...' : 'Approuver'}
                    </Button>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default ModerationDashboard
