type GenerateLoverCvParams = {
  answers: Record<string, string>
  templateHtml: string
  customPrompt?: string
}

type GenerateLoverCvResponse = {
  ok: boolean
  html?: string
  error?: string
}

export async function generateLoverCv(
  params: GenerateLoverCvParams,
): Promise<string> {
  const endpoint = import.meta.env.VITE_GENERATE_LOVER_CV_ENDPOINT as
    | string
    | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
    | string
    | undefined

  if (!endpoint) {
    throw new Error('Missing VITE_GENERATE_LOVER_CV_ENDPOINT.')
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
      answers: params.answers,
      template_html: params.templateHtml,
      custom_prompt: params.customPrompt,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Generation failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
    )
  }

  const payload = (await response.json()) as GenerateLoverCvResponse
  if (!payload.ok) {
    throw new Error(payload.error || 'Generation failed.')
  }

  return payload.html ?? ''
}
