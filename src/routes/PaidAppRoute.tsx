import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { paymentService } from '../services/paymentService'

interface PaidAppRouteProps {
  applicationId: string
  children: ReactNode
}

export function PaidAppRoute({ applicationId, children }: PaidAppRouteProps) {
  const { user } = useAuth()
  const { isAdmin, isLoading } = useRole()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true

    if (isAdmin) {
      Promise.resolve(true).then((allowed) => {
        if (active) setHasAccess(allowed)
      })
      return () => {
        active = false
      }
    }

    if (!user) {
      Promise.resolve(false).then((allowed) => {
        if (active) setHasAccess(allowed)
      })
      return () => {
        active = false
      }
    }

    paymentService
      .hasActiveAccessFromSupabase(user.id, applicationId)
      .then((allowed) => {
        if (active) setHasAccess(allowed)
      })
      .catch(() => {
        if (active) setHasAccess(paymentService.hasActiveAccess(user.id, applicationId))
      })

    return () => {
      active = false
    }
  }, [applicationId, isAdmin, user])

  if (isLoading || hasAccess === null) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
  }

  if (!isAdmin && (!user || !hasAccess)) {
    return <Navigate replace to={`/configuracoes/pagamentos?app=${encodeURIComponent(applicationId)}`} />
  }

  return <>{children}</>
}
