import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AuthPage from '../features/auth/pages/AuthPage'
import ImportDashboard from '../features/import/pages/ImportDashboard'
import RechercheDashboard from '../features/recherche/pages/rechercheDashboard'
import ModerationDashboard from '../features/moderation/pages/ModerationDashboard'
import AuthLayout from './layouts/AuthLayout'
import BackOfficeLayout from './layouts/BackOfficeLayout'
import RequireAuth from './guards/RequireAuth'

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
        <Route element={<RequireAuth />}>
          <Route element={<BackOfficeLayout />}>
            <Route path="/dashboard" element={<ImportDashboard />} />
            <Route path="/recherche" element={<RechercheDashboard />} />
            <Route path="/moderation" element={<ModerationDashboard />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
