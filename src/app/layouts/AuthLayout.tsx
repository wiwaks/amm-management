import type { ReactNode } from 'react'

type AuthLayoutProps = {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <div className="min-h-full overflow-visible lg:h-full lg:overflow-hidden">{children}</div>
}
