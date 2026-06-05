import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authService } from '../services/authService'
import type { AuthContextValue, AuthUser, LoginCredentials } from '../types/auth'
import { AuthContext } from './auth-context'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    authService
      .getSessionUser()
      .then((sessionUser) => {
        if (mounted) {
          setUser(sessionUser)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (mounted) {
          setIsLoading(false)
        }
      })

    const { data } = authService.onAuthStateChange((sessionUser) => {
      setUser(sessionUser)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      async login(credentials: LoginCredentials) {
        const loggedUser = await authService.login(credentials)
        setUser(loggedUser)
      },
      register: authService.register,
      forgotPassword: authService.forgotPassword,
      updatePassword: authService.updatePassword,
      async logout() {
        await authService.logout()
        setUser(null)
      },
    }),
    [isLoading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
