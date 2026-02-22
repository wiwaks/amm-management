import { useCallback, useEffect, useState } from 'react'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_MAIN, NAV_SECONDARY, type NavItem } from '../../shared/navigation'
import type { UserSession } from '../../shared/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../shared/components/ui/dropdown-menu'
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
import { Logo } from '../../shared/components/Logo'
import { cn } from '../../shared/utils/cn'

type AppSidebarProps = {
  session: UserSession | null
  onLogout: () => void
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Expirée'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function SessionCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState(() => new Date(expiresAt).getTime() - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(new Date(expiresAt).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const isLow = timeLeft > 0 && timeLeft < 5 * 60 * 1000

  return (
    <div className="px-2 py-1 text-center text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
      Expire dans{' '}
      <span className={isLow ? 'font-medium text-destructive' : ''}>
        {formatTimeLeft(timeLeft)}
      </span>
    </div>
  )
}

function getInitials(displayName?: string, email?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return '?'
}

function UserAvatar({ session }: { session: UserSession }) {
  const initials = getInitials(session.displayName, session.email)

  if (session.avatarUrl) {
    return (
      <img
        src={session.avatarUrl}
        alt={session.displayName ?? 'Avatar'}
        className="size-8 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {initials}
    </div>
  )
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
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5 h-auto">
              <a href="/dashboard">
                <Logo className="group-data-[collapsible=icon]:hidden" />
                <span className="text-base font-semibold text-terracotta hidden group-data-[collapsible=icon]:inline">AM</span>
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
          <>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                      <UserAvatar session={session} />
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {session.displayName || 'Utilisateur'}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {session.email || ''}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                    side={isMobile ? 'bottom' : 'right'}
                    align="end"
                    sideOffset={4}
                  >
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <UserAvatar session={session} />
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-medium">
                            {session.displayName || 'Utilisateur'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {session.email || ''}
                          </span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onLogout}>
                      <LogOut className="mr-2 size-4" />
                      Déconnexion
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
            <SessionCountdown expiresAt={session.expiresAt} />
          </>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
