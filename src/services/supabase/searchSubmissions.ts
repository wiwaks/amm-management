export type SearchSubmission = {
  id: string
  submitted_at: string | null
  created_at: string
  email: string | null
  phone: string | null
  nom: string
  prenom: string
  telephone: string
  age: string
  genre: string
  enfants: string
}

type SearchSubmissionsParams = {
  name?: string
  email?: string
  phone?: string
  age?: string
  gender?: string
  children?: string
  freetext?: string
  limit?: number
  offset?: number
}

type SearchSubmissionsResponse = {
  ok: boolean
  rows?: SearchSubmission[]
  error?: string
}

export async function searchSubmissions(
  params: SearchSubmissionsParams = {},
): Promise<SearchSubmission[]> {
  const endpoint = import.meta.env.VITE_SEARCH_SUBMISSIONS_ENDPOINT as
    | string
    | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
    | string
    | undefined

  if (!endpoint) {
    throw new Error('Missing VITE_SEARCH_SUBMISSIONS_ENDPOINT.')
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      phone: params.phone,
      age: params.age,
      gender: params.gender,
      children: params.children,
      freetext: params.freetext,
      limit: params.limit,
      offset: params.offset,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Search failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
    )
  }

  const payload = (await response.json()) as SearchSubmissionsResponse
  if (!payload.ok) {
    throw new Error(payload.error || 'Search failed.')
  }

  return payload.rows ?? []
}
