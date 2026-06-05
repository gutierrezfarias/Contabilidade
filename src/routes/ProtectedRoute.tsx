import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50" aria-hidden="true" />
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return <Outlet />
}
