import { useCallback, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_MAIN, NAV_SECONDARY, type NavItem } from '../../shared/navigation'
import type { UserSession } from '../../shared/types'
import { Logo } from '../../shared/components/Logo'
import { Button } from '../../shared/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '../../shared/components/ui/sidebar'
import { cn } from '../../shared/utils/cn'

type AppSidebarProps = {
  session: UserSession | null
  onLogout: () => void
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

function isActiveRoute(pathname: string, item: NavItem) {
  if (!item.route) return false
  return pathname === item.route
}

function renderMenuItems(
  items: NavItem[],
  pathname: string,
  onNavigate: (item: NavItem) => void,
) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon
        const isActive = isActiveRoute(pathname, item)
        const isDisabled = item.disabled || !item.route

        return (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton
              tooltip={item.label}
              isActive={isActive}
              onClick={() => onNavigate(item)}
              aria-disabled={isDisabled}
              className={cn(isDisabled && 'cursor-not-allowed opacity-55')}
            >
              <Icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function AppSidebar({ session, onLogout }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const sessionExpiry = session ? formatDate(session.expiresAt) : null

  const handleNavigate = useCallback(
    (item: NavItem) => {
      if (item.disabled || !item.route) return
      const route = item.route

      if (isMobile) {
        setOpenMobile(false)
        setTimeout(() => navigate(route), 0)
        return
      }

      navigate(route)
    },
    [isMobile, navigate, setOpenMobile],
  )

  useEffect(() => {
    if (!isMobile) return
    setOpenMobile(false)
  }, [isMobile, location.pathname, setOpenMobile])

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80 px-3 py-3">
        <div className="rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 p-3">
          <Logo subtitle="Back office" />
          <p className="mt-2 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
            Martinique - Back office
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupContent>
            {renderMenuItems(NAV_MAIN, location.pathname, handleNavigate)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto px-2 py-2">
          <SidebarGroupContent>
            {renderMenuItems(NAV_SECONDARY, location.pathname, handleNavigate)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 px-3 py-3">
        <div className="rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 p-3 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
          <p className="uppercase tracking-[0.2em] text-sidebar-foreground/65">
            Session
          </p>
          <p className="mt-1 font-medium text-sidebar-foreground">
            {session?.sessionId.slice(0, 8) ?? '--'}
          </p>
          {sessionExpiry ? <p className="mt-1">Expire {sessionExpiry}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLogout}
          className="w-full rounded-md border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
        >
          <LogOut className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">
            Deconnexion
          </span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
