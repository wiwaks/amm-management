import type { UserSession } from '../../shared/types'
import { Badge } from '../../shared/components/ui/badge'
import { Separator } from '../../shared/components/ui/separator'
import { SidebarTrigger } from '../../shared/components/ui/sidebar'

type SiteHeaderProps = {
  session: UserSession | null
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

function SiteHeader({ session }: SiteHeaderProps) {
  const sessionExpiry = session ? formatDate(session.expiresAt) : null

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1 rounded-md" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <p className="text-sm font-medium tracking-wide">Back office</p>
      <div className="ml-auto flex items-center gap-2">
        {session ? (
          <Badge variant="outline" className="hidden sm:inline-flex">
            Session {session.sessionId.slice(0, 8)}
          </Badge>
        ) : null}
        {sessionExpiry ? (
          <Badge variant="warning" className="hidden md:inline-flex">
            Expire {sessionExpiry}
          </Badge>
        ) : null}
      </div>
    </header>
  )
}

export default SiteHeader
