export type ImportResult = {
  ok: boolean
  total?: number
  imported?: number
  updated?: number
  skipped?: number
  error?: string
  details?: unknown
}

/**
 * Type de session utilisateur
 * Stocke les informations de l'utilisateur connecté avec son accessToken Google
 */
export type UserSession = {
  sessionId: string // Identifiant unique de la session
  accessToken: string // Token d'accès Google fourni après connexion
  createdAt: string // Timestamp ISO de création de la session
  expiresAt: string // Timestamp ISO d'expiration de la session
}

export type Invitation = {
  id: string
  token: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
  deepLink: string
}

export type GenerateInvitationResult = {
  ok: boolean
  invitation?: Invitation
  reused?: boolean
  error?: string
}
