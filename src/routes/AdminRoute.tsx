import { Navigate, Outlet } from 'react-router-dom'
import { useRole } from '../hooks/useRole'

export function AdminRoute() {
  const { isAdmin, isLoading } = useRole()

  if (isLoading) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
  }

  return isAdmin ? <Outlet /> : <Navigate replace to="/aplicativos" />
}
