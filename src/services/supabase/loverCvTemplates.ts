import { supabase } from './client'

export type LoverCvTemplate = {
  id: string
  name: string
  html_content: string
  created_at: string
  updated_at: string
}

const DEFAULT_TEMPLATE_NAME = 'default'

export async function fetchDefaultTemplate(): Promise<LoverCvTemplate | null> {
  const { data, error } = await supabase
    .from('lover_cv_templates')
    .select('id, name, html_content, created_at, updated_at')
    .eq('name', DEFAULT_TEMPLATE_NAME)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as LoverCvTemplate | null
}

export async function upsertDefaultTemplate(
  htmlContent: string,
): Promise<LoverCvTemplate> {
  const { data, error } = await supabase
    .from('lover_cv_templates')
    .upsert(
      { name: DEFAULT_TEMPLATE_NAME, html_content: htmlContent },
      { onConflict: 'name' },
    )
    .select('id, name, html_content, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return data as LoverCvTemplate
}
