import {
  Upload,
  Search,
  LayoutDashboard,
  History,
  Users,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  icon: LucideIcon
  route: string | null
  disabled?: boolean
}

export const NAV_MAIN: NavItem[] = [
  { label: 'Apercu', icon: LayoutDashboard, route: null, disabled: true },
  { label: 'Import', icon: Upload, route: '/dashboard' },
  { label: 'Historique', icon: History, route: null, disabled: true },
  { label: 'Recherche', icon: Search, route: '/recherche' },
  { label: 'Clients', icon: Users, route: null, disabled: true },
]

export const NAV_SECONDARY: NavItem[] = [
  { label: 'Parametres', icon: Settings, route: null, disabled: true },
  { label: 'Support', icon: LifeBuoy, route: null, disabled: true },
]
