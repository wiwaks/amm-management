import { supabase } from './client'

export type FormSubmission = {
  id: string
  source: string
  source_row_id: string
  submitted_at: string | null
  email: string | null
  phone: string | null
  raw_json: Record<string, unknown>
  created_at: string
}

type SearchParams = {
  email?: string
  phone?: string
}

export async function fetchFormSubmissions(params: SearchParams = {}) {
  let query = supabase
    .from('form_submissions')
    .select(
      'id, source, source_row_id, submitted_at, email, phone, raw_json, created_at',
    )
    .order('created_at', { ascending: false })

  if (params.email) {
    query = query.ilike('email', `%${params.email}%`)
  }

  if (params.phone) {
    query = query.ilike('phone', `%${params.phone}%`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as FormSubmission[]
}

export async function fetchFormSubmissionById(
  id: string,
): Promise<FormSubmission | null> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, source, source_row_id, submitted_at, email, phone, raw_json, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as FormSubmission | null
}
