import { supabase } from './client'

export type FormQuestionMap = {
  question_id: string
  label: string
  display_order: number | null
}

export async function fetchFormQuestionMap() {
  const { data, error } = await supabase
    .from('form_question_map')
    .select('question_id, label, display_order')
    .order('display_order', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as FormQuestionMap[]
}

export async function upsertFormQuestionMap(items: FormQuestionMap[]) {
  if (items.length === 0) return []

  const { data, error } = await supabase
    .from('form_question_map')
    .upsert(items, { onConflict: 'question_id' })
    .select('question_id, label, display_order')

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as FormQuestionMap[]
}
