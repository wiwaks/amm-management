import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getSession } from '../../shared/auth/sessionManager'

type RequireAuthProps = {
  children: ReactNode
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const session = getSession()

  if (!session || !session.accessToken) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
