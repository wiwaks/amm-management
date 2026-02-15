import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearSession, getSession } from '../../shared/auth/sessionManager'
import { SidebarInset, SidebarProvider } from '../../shared/components/ui/sidebar'
import AppSidebar from '../components/AppSidebar'
import SiteHeader from '../components/SiteHeader'

type BackOfficeLayoutProps = {
  children: ReactNode
}

export default function BackOfficeLayout({ children }: BackOfficeLayoutProps) {
  const navigate = useNavigate()
  const session = getSession()

  const handleLogout = () => {
    clearSession()
    navigate('/', { replace: true })
  }

  return (
    <SidebarProvider>
      <AppSidebar session={session} onLogout={handleLogout} />
      <SidebarInset className="min-h-[100dvh] overflow-hidden">
        <SiteHeader session={session} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
