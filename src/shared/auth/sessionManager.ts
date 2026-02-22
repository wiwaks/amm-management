/**
 * Session Manager
 * Gère le stockage et la récupération des sessions utilisateur après connexion Google
 */

import type { UserSession } from '../types'

// Clé de stockage pour la session dans le localStorage
const SESSION_STORAGE_KEY = 'amm_user_session'

/**
 * Crée et sauvegarde une nouvelle session après la connexion Google
 * @param accessToken - Token d'accès Google fourni par l'API Google Identity Services
 * @param userInfo - Infos du profil Google (email, nom, avatar)
 * @returns La session créée
 */
export function createSession(
  accessToken: string,
  userInfo?: { email?: string; displayName?: string; avatarUrl?: string },
): UserSession {
  // Crée un identifiant unique pour la session
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`

  // Crée l'objet session avec l'accessToken
  const session: UserSession = {
    sessionId,
    accessToken,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // Expire dans 1h
    email: userInfo?.email,
    displayName: userInfo?.displayName,
    avatarUrl: userInfo?.avatarUrl,
  }

  // Sauvegarde la session dans le localStorage
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))

  return session
}

/**
 * Récupère la session actuelle du localStorage
 * @returns La session trouvée ou null si aucune session active
 */
export function getSession(): UserSession | null {
  try {
    const sessionData = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!sessionData) return null

    const session: UserSession = JSON.parse(sessionData)

    // Vérifie si la session n'a pas expiré
    const expiresAt = new Date(session.expiresAt)
    if (expiresAt < new Date()) {
      // La session a expiré, la supprimer
      clearSession()
      return null
    }

    return session
  } catch (error) {
    console.error('Erreur lors de la récupération de la session:', error)
    return null
  }
}

/**
 * Récupère l'accessToken de la session actuelle
 * @returns L'accessToken ou null si aucune session active
 */
export function getAccessTokenFromSession(): string | null {
  const session = getSession()
  return session?.accessToken || null
}

/**
 * Supprime la session actuelle du localStorage
 */
export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

/**
 * Met à jour l'accessToken d'une session existante
 * @param newAccessToken - Le nouvel accessToken
 * @returns La session mise à jour ou null
 */
export function updateSessionAccessToken(newAccessToken: string): UserSession | null {
  const session = getSession()
  if (!session) return null

  // Crée une nouvelle session avec le token mis à jour
  const updatedSession: UserSession = {
    ...session,
    accessToken: newAccessToken,
  }

  // Sauvegarde la session mise à jour
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession))

  return updatedSession
}

/**
 * Renouvelle la session avec un nouveau token et repousse l'expiration d'1h
 */
export function renewSession(newAccessToken: string): UserSession | null {
  const session = getSession()
  if (!session) return null

  const renewed: UserSession = {
    ...session,
    accessToken: newAccessToken,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(renewed))
  return renewed
}

/**
 * Vérifie si une session active existe
 * @returns true si une session valide existe, false sinon
 */
export function hasActiveSession(): boolean {
  return getSession() !== null
}
