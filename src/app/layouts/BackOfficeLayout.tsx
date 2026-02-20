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
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
