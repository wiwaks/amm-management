import { useCallback, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_MAIN, NAV_SECONDARY, type NavItem } from '../../shared/navigation'
import type { UserSession } from '../../shared/types'
import { Button } from '../../shared/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../../shared/components/ui/sidebar'
import { cn } from '../../shared/utils/cn'

type AppSidebarProps = {
  session: UserSession | null
  onLogout: () => void
}

function isActiveRoute(pathname: string, item: NavItem) {
  if (!item.route) return false
  return pathname === item.route
}

function AppSidebar({ session, onLogout }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="/dashboard">
                <span className="text-base font-semibold">AMM</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map((item) => {
                const Icon = item.icon
                const isActive = isActiveRoute(location.pathname, item)
                const isDisabled = item.disabled || !item.route

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={isActive}
                      onClick={() => handleNavigate(item)}
                      aria-disabled={isDisabled}
                      className={cn(isDisabled && 'cursor-not-allowed opacity-50')}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_SECONDARY.map((item) => {
                const Icon = item.icon
                const isActive = isActiveRoute(location.pathname, item)
                const isDisabled = item.disabled || !item.route

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={isActive}
                      onClick={() => handleNavigate(item)}
                      aria-disabled={isDisabled}
                      className={cn(isDisabled && 'cursor-not-allowed opacity-50')}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {session ? (
          <div className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Session: {session.sessionId.slice(0, 8)}
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLogout}
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
        >
          <LogOut className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">
            Deconnexion
          </span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
