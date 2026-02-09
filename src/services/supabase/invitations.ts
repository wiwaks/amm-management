import type { GenerateInvitationResult } from '../../shared/types'

export async function generateInvitation(
  formSubmissionId: string,
  invitedBy?: string,
): Promise<GenerateInvitationResult> {
  const endpoint = import.meta.env.VITE_GENERATE_INVITATION_ENDPOINT as
    | string
    | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
    | string
    | undefined

  if (!endpoint) {
    throw new Error('Missing VITE_GENERATE_INVITATION_ENDPOINT.')
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
    body: JSON.stringify({ formSubmissionId, invitedBy }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Invitation failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
    )
  }

  return (await response.json()) as GenerateInvitationResult
}
