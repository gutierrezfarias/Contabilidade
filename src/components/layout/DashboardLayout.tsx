import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { Button } from '../ui/Button'

interface DashboardLayoutProps {
  children: ReactNode
  title: string
}

const navigationClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition ${
    isActive
      ? 'bg-indigo-500/20 text-indigo-100'
      : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const { logout, user } = useAuth()
  const { isAdmin } = useRole()
  const location = useLocation()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isGovOpen, setIsGovOpen] = useState(() => location.pathname.startsWith('/gov'))
  const supportSearch = location.search.includes('organization=') ? location.search : ''
  const toWorkspace = (path: string) => `${path}${supportSearch}`

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside
        className={`hidden shrink-0 flex-col bg-slate-950 px-4 py-6 text-white transition-all duration-300 lg:flex ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`mb-11 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'}`}>
          <button
            aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-xl transition hover:bg-indigo-400"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            type="button"
          >
            A
          </button>
          {!isCollapsed && (
            <Link className="text-lg font-semibold" to="/aplicativos">
              <span className="block">Sistema Contabil</span>
              <span className="block text-xs font-normal text-slate-400">Gestao Contabil</span>
            </Link>
          )}
        </div>
        <nav className="space-y-2 text-sm">
          <NavLink className={navigationClassName} title="Dashboard" to={toWorkspace('/dashboard')}>
            <span aria-hidden="true">#</span>
            {!isCollapsed && 'Dashboard'}
          </NavLink>
          <NavLink className={navigationClassName} title="Gestao de Clientes" to={toWorkspace('/gestao-clientes')}>
            <span aria-hidden="true">@</span>
            {!isCollapsed && 'Gestao de Clientes'}
          </NavLink>
          <NavLink className={navigationClassName} title="Consulta CNPJ" to={toWorkspace('/consulta-cnpj')}>
            <span aria-hidden="true">C</span>
            {!isCollapsed && 'Consulta CNPJ'}
          </NavLink>
          <NavLink className={navigationClassName} title="Gestao Financeira" to={toWorkspace('/gestao-financeira')}>
            <span aria-hidden="true">$</span>
            {!isCollapsed && 'Gestao Financeira'}
          </NavLink>
          <div className="pt-2">
            <button
              aria-expanded={isGovOpen}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 font-medium transition ${
                location.pathname.startsWith('/gov')
                  ? 'bg-indigo-500/20 text-indigo-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              onClick={() => setIsGovOpen((current) => !current)}
              title="GOV"
              type="button"
            >
              <span aria-hidden="true">{isGovOpen ? '-' : '+'}</span>
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">GOV</span>
                  <span aria-hidden="true" className="text-xs text-slate-400">
                    {isGovOpen ? 'ocultar' : 'mostrar'}
                  </span>
                </>
              )}
            </button>
            {isGovOpen && (
              <div className={isCollapsed ? 'mt-1 space-y-1' : 'ml-5 mt-1 space-y-1 border-l border-slate-700 pl-3'}>
                <NavLink className={navigationClassName} title="SEFAZ" to={toWorkspace('/gov/sefaz')}>
                  <span aria-hidden="true">.</span>
                  {!isCollapsed && 'SEFAZ'}
                </NavLink>
                <NavLink className={navigationClassName} title="e-CAC" to={toWorkspace('/gov/ecac')}>
                  <span aria-hidden="true">.</span>
                  {!isCollapsed && 'e-CAC'}
                </NavLink>
              </div>
            )}
          </div>
          <NavLink className={navigationClassName} title="Integracoes" to={toWorkspace('/integracoes')}>
            <span aria-hidden="true">~</span>
            {!isCollapsed && 'Integracoes'}
          </NavLink>
          <NavLink className={navigationClassName} title="Configuracoes" to={toWorkspace('/configuracoes-contabeis')}>
            <span aria-hidden="true">*</span>
            {!isCollapsed && 'Configuracoes'}
          </NavLink>
          {isAdmin && (
            <NavLink className={navigationClassName} title="Menu Administrativo" to="/admin">
              <span aria-hidden="true">A</span>
              {!isCollapsed && 'Menu Administrativo'}
            </NavLink>
          )}
        </nav>
        {!isCollapsed && (
          <div className="mt-auto rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">{user?.name}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{user?.email}</p>
            {isAdmin && <p className="mt-2 text-xs font-semibold text-indigo-300">Administrador</p>}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 lg:hidden">
              Sistema Contabil
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
