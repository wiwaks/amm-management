import type { ReactNode } from 'react'

type AuthLayoutProps = {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <div className="min-h-[100dvh]">{children}</div>
}
