import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../ui/Button'

interface AdminLayoutProps {
  children: ReactNode
  title: string
}

const adminNavClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition ${
    isActive
      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-300/50'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside
        className={`hidden shrink-0 flex-col bg-slate-950 px-4 py-6 text-white transition-all duration-300 lg:flex ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div className={`mb-10 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'}`}>
          <button
            aria-label={isCollapsed ? 'Expandir menu administrativo' : 'Recolher menu administrativo'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-xl transition hover:bg-indigo-400"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            type="button"
          >
            A
          </button>
          {!isCollapsed && (
            <Link className="text-lg font-semibold" to="/admin">
              <span className="block">Admin CONT HUB</span>
              <span className="block text-xs font-normal text-slate-400">Gestao da plataforma</span>
            </Link>
          )}
        </div>

        <nav className="space-y-2 text-sm">
          <NavLink className={adminNavClassName} end to="/admin">
            <span aria-hidden="true">#</span>
            {!isCollapsed && 'Visao geral'}
          </NavLink>
          <NavLink className={adminNavClassName} to="/admin/clientes">
            <span aria-hidden="true">@</span>
            {!isCollapsed && 'Clientes'}
          </NavLink>
          <NavLink className={adminNavClassName} to="/admin/aplicativos">
            <span aria-hidden="true">+</span>
            {!isCollapsed && 'Aplicativos'}
          </NavLink>
          <NavLink className={adminNavClassName} to="/admin/pagamentos">
            <span aria-hidden="true">$</span>
            {!isCollapsed && 'Pagamentos'}
          </NavLink>
          <NavLink className={adminNavClassName} to="/admin/configuracoes">
            <span aria-hidden="true">~</span>
            {!isCollapsed && 'Configuracoes'}
          </NavLink>
        </nav>

        {!isCollapsed && (
          <div className="mt-auto rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">{user?.name}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{user?.email}</p>
            <p className="mt-2 text-xs font-semibold text-indigo-300">Administrador</p>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Area administrativa
            </p>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          </div>
          <Button onClick={handleLogout} variant="secondary">
            Sair
          </Button>
        </header>
        <main className="flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
