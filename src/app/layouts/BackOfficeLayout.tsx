import type { ReactNode } from 'react'

type BackOfficeLayoutProps = {
  children: ReactNode
}

export default function BackOfficeLayout({ children }: BackOfficeLayoutProps) {
  return <div className="min-h-full overflow-visible lg:h-full lg:overflow-hidden">{children}</div>
}
