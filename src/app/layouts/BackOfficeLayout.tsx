import type { ReactNode } from 'react'

type BackOfficeLayoutProps = {
  children: ReactNode
}

export default function BackOfficeLayout({ children }: BackOfficeLayoutProps) {
  return <div className="min-h-screen">{children}</div>
}
