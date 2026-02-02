import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import AuthPage from '../features/auth/pages/AuthPage'
import ImportDashboard from '../features/import/pages/ImportDashboard'
import { clearSession, getSession } from '../shared/auth/sessionManager'
import type { UserSession } from '../shared/types'
import AuthLayout from './layouts/AuthLayout'
import BackOfficeLayout from './layouts/BackOfficeLayout'
import RequireAuth from './guards/RequireAuth'

function ImportDashboardRoute() {
  const navigate = useNavigate()
  const session = getSession() as UserSession | null

  if (!session || !session.accessToken) {
    return null
  }

  const handleLogout = () => {
    clearSession()
    navigate('/')
  }

  return (
    <ImportDashboard
      accessToken={session.accessToken}
      userSession={session}
      onLogout={handleLogout}
    />
  )
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AuthLayout>
              <AuthPage />
            </AuthLayout>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <BackOfficeLayout>
                <ImportDashboardRoute />
              </BackOfficeLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
