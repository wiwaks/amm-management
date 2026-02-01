import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import App from './App'
import Dashboard from './dashboard'
import { getSession, clearSession } from './sessionManager'
import type { UserSession } from './types'


// `Dashboard` attend des props (`accessToken`, `userSession`, `onLogout`).
// Le wrapper lit la session stockée (localStorage via `sessionManager`) et
// fournit ces props. Il gère également la redirection après la déconnexion.
function DashboardWrapper() {
  const navigate = useNavigate()

  // Récupère la session stockée
  const session = getSession() as UserSession | null

  if (!session || !session.accessToken) {
    // Si pas de session, redirige vers la page d'accueil (login)
    return <Navigate to="/" replace />
  }
  // Handler appelé depuis Dashboard pour déconnecter l'utilisateur.
  // Il efface la session côté client puis redirige vers la page d'accueil.
  const handleLogout = () => {
    clearSession()
    navigate('/')
  }

  // On passe au Dashboard les props attendues. Si `session` est null,
  // on passe une chaîne vide pour `accessToken` (comportement inchangé).
  return (
    <Dashboard
      accessToken={session?.accessToken ?? ''}
      userSession={session}
      onLogout={handleLogout}
    />
  )
}

// Composant de routage principal :
// - `/` sert l'écran d'authentification (`App`)
// - `/dashboard` sert l'écran d'import/prévisualisation (`DashboardWrapper`)
export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dashboard" element={<DashboardWrapper />} />
      </Routes>
    </BrowserRouter>
  )
}
