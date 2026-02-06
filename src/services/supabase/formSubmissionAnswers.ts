import { supabase } from './client'

export type FormSubmissionAnswer = {
  question_id: string
  answer_index: number
  value_text: string | null
}

/**
 * Parse le raw_json (format Google Forms API) et insère les réponses
 * normalisées dans form_submission_answers.
 */
export async function normalizeSubmissionAnswers(
  submissionId: string,
  rawJson: Record<string, unknown>,
) {
  const answers = (rawJson.answers ?? {}) as Record<string, unknown>
  const rows: Array<{
    submission_id: string
    question_id: string
    answer_index: number
    value_text: string | null
  }> = []

  for (const [questionId, answerData] of Object.entries(answers)) {
    if (!answerData || typeof answerData !== 'object') continue
    const record = answerData as Record<string, unknown>

    const textAnswers = record.textAnswers as
      | { answers?: Array<{ value?: string }> }
      | undefined
    const fileAnswers = record.fileUploadAnswers as
      | { answers?: Array<{ fileId?: string; fileName?: string }> }
      | undefined

    if (textAnswers?.answers?.length) {
      for (let i = 0; i < textAnswers.answers.length; i++) {
        rows.push({
          submission_id: submissionId,
          question_id: questionId,
          answer_index: i,
          value_text: textAnswers.answers[i]?.value ?? null,
        })
      }
    } else if (fileAnswers?.answers?.length) {
      for (let i = 0; i < fileAnswers.answers.length; i++) {
        const a = fileAnswers.answers[i]
        rows.push({
          submission_id: submissionId,
          question_id: questionId,
          answer_index: i,
          value_text: a?.fileName || a?.fileId || null,
        })
      }
    }
  }

  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('form_submission_answers')
    .upsert(rows, { onConflict: 'submission_id,question_id,answer_index' })

  if (error) throw new Error(error.message)
  return rows.length
}

/**
 * Normalise toutes les soumissions qui n'ont pas encore de réponses
 * dans form_submission_answers.
 */
export async function normalizeAllSubmissions(): Promise<{
  total: number
  normalized: number
  answersCreated: number
}> {
  // 1. IDs déjà normalisés
  const { data: existingRaw, error: existError } = await supabase
    .from('form_submission_answers')
    .select('submission_id')

  if (existError) throw new Error(existError.message)

  const existingIds = new Set(
    (existingRaw ?? []).map(
      (row: { submission_id: string }) => row.submission_id,
    ),
  )

  // 2. Toutes les soumissions (avec raw_json pour normalisation)
  const { data: submissions, error: fetchError } = await supabase
    .from('form_submissions')
    .select('id, raw_json')

  if (fetchError) throw new Error(fetchError.message)
  if (!submissions?.length) return { total: 0, normalized: 0, answersCreated: 0 }

  const toNormalize = submissions.filter(
    (s: { id: string }) => !existingIds.has(s.id),
  )

  let answersCreated = 0
  for (const sub of toNormalize) {
    const count = await normalizeSubmissionAnswers(
      sub.id,
      sub.raw_json as Record<string, unknown>,
    )
    answersCreated += count
  }

  return {
    total: submissions.length,
    normalized: toNormalize.length,
    answersCreated,
  }
}

/**
 * Récupère toutes les réponses normalisées pour une soumission donnée.
 */
export async function fetchSubmissionAnswers(submissionId: string) {
  const { data, error } = await supabase
    .from('form_submission_answers')
    .select('question_id, answer_index, value_text')
    .eq('submission_id', submissionId)
    .order('question_id')
    .order('answer_index')

  if (error) throw new Error(error.message)
  return (data ?? []) as FormSubmissionAnswer[]
}

/**
 * Récupère les soumissions avec leurs réponses normalisées (sans raw_json).
 * Retourne une structure légère pour la liste.
 */
export type SubmissionWithAnswers = {
  id: string
  source: string
  source_row_id: string
  submitted_at: string | null
  email: string | null
  phone: string | null
  created_at: string
  answers: FormSubmissionAnswer[]
}

export async function fetchSubmissionsWithAnswers(params: {
  email?: string
  phone?: string
} = {}): Promise<SubmissionWithAnswers[]> {
  let query = supabase
    .from('form_submissions')
    .select(
      `id, source, source_row_id, submitted_at, email, phone, created_at,
       form_submission_answers (question_id, answer_index, value_text)`,
    )
    .order('created_at', { ascending: false })

  if (params.email) {
    query = query.ilike('email', `%${params.email}%`)
  }

  if (params.phone) {
    query = query.ilike('phone', `%${params.phone}%`)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    source: row.source as string,
    source_row_id: row.source_row_id as string,
    submitted_at: row.submitted_at as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    created_at: row.created_at as string,
    answers: (row.form_submission_answers ?? []) as FormSubmissionAnswer[],
  }))
}
