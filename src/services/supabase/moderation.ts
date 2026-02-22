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

const ENDPOINT = import.meta.env.VITE_MODERATION_ENDPOINT as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

async function callModeration<T>(body: Record<string, unknown>): Promise<T> {
  if (!ENDPOINT) throw new Error('Missing VITE_MODERATION_ENDPOINT.')
  if (!ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY.')

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Moderation request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
    )
  }

  const payload = (await response.json()) as { ok: boolean; data: T; error?: string }
  if (!payload.ok) {
    throw new Error(payload.error || 'Moderation request failed.')
  }

  return payload.data
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
  return callModeration<PendingProfile[]>({ action: 'fetchPendingProfiles' })
}

export async function fetchProfileDetail(
  userId: string,
): Promise<{ profile: ProfileDetail; photos: UserPhoto[]; funFacts: FunFacts | null } | null> {
  return callModeration<{
    profile: ProfileDetail
    photos: UserPhoto[]
    funFacts: FunFacts | null
  } | null>({ action: 'fetchProfileDetail', userId })
}

// ── Mutations ──

export async function approveProfile(userId: string): Promise<void> {
  await callModeration({ action: 'approveProfile', userId })
}

export async function rejectProfile(
  userId: string,
  reason: string,
): Promise<void> {
  await callModeration({ action: 'rejectProfile', userId, reason })
}

export async function updateProfileFields(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await callModeration({ action: 'updateProfileFields', userId, fields })
}

export async function updateFunFacts(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await callModeration({ action: 'updateFunFacts', userId, fields })
}
