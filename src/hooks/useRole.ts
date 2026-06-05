import { useEffect, useState } from 'react'
import { getCurrentProfile } from '../services/platformService'
import type { UserRole } from '../types/platform'
import { useAuth } from './useAuth'

export function useRole() {
  const { user } = useAuth()
  const [profileRole, setProfileRole] = useState<{ role: UserRole; userId: string }>({
    role: 'client',
    userId: '',
  })

  useEffect(() => {
    let active = true

    if (!user) {
      return
    }

    getCurrentProfile()
      .then((profile) => {
        if (active) {
          setProfileRole({ role: profile?.role ?? 'client', userId: user.id })
        }
      })
      .catch(() => {
        if (active) {
          setProfileRole({ role: 'client', userId: user.id })
        }
      })

    return () => {
      active = false
    }
  }, [user])

  const isLoading = Boolean(user && profileRole.userId !== user.id)
  const role = isLoading ? 'client' : profileRole.role

  return { isAdmin: role === 'admin', isLoading, role }
}
