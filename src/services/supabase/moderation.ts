import { supabaseAdmin } from './client'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const BUCKET = 'photos'

// ── Types ──

export type PendingProfile = {
  user_id: string
  first_name: string | null
  last_name: string | null
  age_years: number | null
  gender: string | null
  city: string | null
  zone: string | null
  profession: string | null
  bio_short: string | null
  completion_score: number | null
  verification_status: string | null
  created_at: string
  main_photo_url: string | null
}

export type ProfileDetail = {
  user_id: string
  first_name: string | null
  last_name: string | null
  birthdate: string | null
  age_years: number | null
  gender: string | null
  city: string | null
  zone: string | null
  profession: string | null
  sector: string | null
  relationship_status: string | null
  housing_status: string | null
  children_has: boolean | null
  children_count: number | null
  zodiac_sign: string | null
  religion: string | null
  has_vehicle: boolean | null
  smoker: boolean | null
  alcohol: string | null
  sport_frequency: string | null
  height_cm: number | null
  skin_tone: string | null
  hair_length: string | null
  hair_texture: string | null
  hair_style: string | null
  clothing_size: string | null
  fashion_style: string[] | null
  bio_short: string | null
  bio_long: string | null
  lover_cv_short: string | null
  lover_cv_long: string | null
  completion_score: number | null
  completion_missing_fields: string[] | null
  verification_status: string | null
  rejection_reason: string | null
  created_at: string
}

export type FunFacts = {
  user_id: string
  // Food
  fav_dish: string | null
  sweet_pleasure: string | null
  dislikes_food: string | null
  allergies: string | null
  team_environment: string | null
  // Culture
  last_book_or_alt: string | null
  movie_or_series_like_me: string | null
  music_of_the_moment: string | null
  ideal_weekend_activity: string | null
  // Emotion
  best_recognized_quality: string | null
  small_flaw: string | null
  i_appreciate_in_someone: string | null
  dealbreaker_text: string | null
  // Story
  bravest_thing_done: string | null
  surprising_fact: string | null
  happiest_when: string | null
  // Projection
  i_am_looking_for: string | null
  in_2_5_years_i_want: string | null
  love_language: string | null
}

export type UserPhoto = {
  id: string
  user_id: string
  album: string
  position: number
  storage_path: string
}

// ── Helpers ──

function getPublicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

/** Profile fields that count towards completion (excludes system fields). */
const PROFILE_SCORED_KEYS: (keyof ProfileDetail)[] = [
  'first_name', 'last_name', 'birthdate', 'gender',
  'city', 'zone', 'profession', 'sector',
  'relationship_status', 'housing_status',
  'children_has', 'zodiac_sign', 'religion',
  'has_vehicle', 'smoker', 'alcohol', 'sport_frequency',
  'height_cm', 'skin_tone', 'hair_length', 'hair_texture', 'hair_style',
  'clothing_size', 'fashion_style',
  'bio_short', 'bio_long',
  'lover_cv_short', 'lover_cv_long',
]

const FUN_FACTS_KEYS: (keyof FunFacts)[] = [
  'fav_dish', 'sweet_pleasure', 'dislikes_food', 'allergies', 'team_environment',
  'last_book_or_alt', 'movie_or_series_like_me', 'music_of_the_moment', 'ideal_weekend_activity',
  'best_recognized_quality', 'small_flaw', 'i_appreciate_in_someone', 'dealbreaker_text',
  'bravest_thing_done', 'surprising_fact', 'happiest_when',
  'i_am_looking_for', 'in_2_5_years_i_want', 'love_language',
]

export function computeCompletion(
  profile: ProfileDetail,
  funFacts: FunFacts | null,
): { pct: number; missing: string[] } {
  const missing: string[] = []
  const total = PROFILE_SCORED_KEYS.length + FUN_FACTS_KEYS.length

  for (const key of PROFILE_SCORED_KEYS) {
    const v = profile[key]
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      missing.push(key)
    }
  }

  for (const key of FUN_FACTS_KEYS) {
    const v = funFacts?.[key]
    if (!v) missing.push(key)
  }

  const filled = total - missing.length
  return { pct: total > 0 ? Math.round((filled / total) * 100) : 0, missing }
}

// ── Queries ──

export async function fetchPendingProfiles(): Promise<PendingProfile[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'user_id, first_name, last_name, age_years, gender, city, zone, profession, bio_short, completion_score, verification_status, created_at',
    )
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!profiles || profiles.length === 0) return []

  // Fetch main photos for all pending profiles
  const userIds = profiles.map((p) => p.user_id)
  const { data: photos } = await supabaseAdmin
    .from('user_photos')
    .select('user_id, storage_path')
    .in('user_id', userIds)
    .eq('album', 'main')

  const photoMap = new Map<string, string>()
  for (const photo of photos ?? []) {
    photoMap.set(photo.user_id, getPublicUrl(photo.storage_path))
  }

  return profiles.map((p) => ({
    ...p,
    main_photo_url: photoMap.get(p.user_id) ?? null,
  }))
}

export async function fetchProfileDetail(
  userId: string,
): Promise<{ profile: ProfileDetail; photos: UserPhoto[]; funFacts: FunFacts | null } | null> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !profile) return null

  const [photosResult, funFactsResult] = await Promise.all([
    supabaseAdmin
      .from('user_photos')
      .select('id, user_id, album, position, storage_path')
      .eq('user_id', userId)
      .order('album')
      .order('position'),
    supabaseAdmin
      .from('fun_facts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  return {
    profile: profile as ProfileDetail,
    photos: photosResult.data ?? [],
    funFacts: (funFactsResult.data as FunFacts) ?? null,
  }
}

// ── Mutations ──

export async function approveProfile(userId: string): Promise<void> {
  const now = new Date().toISOString()

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      verification_status: 'approved',
      verified_at: now,
      visible_at: now,
    })
    .eq('user_id', userId)

  if (profileError) throw profileError

  const { error: userError } = await supabaseAdmin
    .from('users')
    .update({ status: 'active' })
    .eq('id', userId)

  if (userError) throw userError
}

export async function rejectProfile(
  userId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      verification_status: 'rejected',
      rejection_reason: reason,
    })
    .eq('user_id', userId)

  if (error) throw error
}
