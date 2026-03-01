import { supabase } from './client'

export type LoverCvGeneration = {
  id: string
  submission_id: string
  html_content: string
  custom_prompt: string | null
  template_name: string
  generated_by: string | null
  created_at: string
}

type InsertGenerationParams = {
  submission_id: string
  html_content: string
  custom_prompt: string | null
  template_name: string
  generated_by: string | null
}

export async function fetchGenerationsBySubmission(
  submissionId: string,
): Promise<LoverCvGeneration[]> {
  const { data, error } = await supabase
    .from('lover_cv_generations')
    .select('id, submission_id, html_content, custom_prompt, template_name, generated_by, created_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as LoverCvGeneration[]
}

export async function insertGeneration(
  params: InsertGenerationParams,
): Promise<LoverCvGeneration> {
  const { data, error } = await supabase
    .from('lover_cv_generations')
    .insert(params)
    .select('id, submission_id, html_content, custom_prompt, template_name, generated_by, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data as LoverCvGeneration
}

export async function updateGenerationHtml(id: string, htmlContent: string): Promise<void> {
  const { error } = await supabase
    .from('lover_cv_generations')
    .update({ html_content: htmlContent })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function deleteGeneration(id: string): Promise<void> {
  const { error } = await supabase
    .from('lover_cv_generations')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}
