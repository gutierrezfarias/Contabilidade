import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { Button } from '../ui/Button'

interface DashboardLayoutProps {
  children: ReactNode
  title: string
}

interface NavigationItem {
  icon: IconName
  label: string
  path: string
}

interface NavigationGroup {
  id: string
  icon: IconName
  label: string
  items: NavigationItem[]
}

type IconName =
  | 'admin'
  | 'badgeCheck'
  | 'building'
  | 'calendar'
  | 'chevron'
  | 'dashboard'
  | 'dollar'
  | 'documents'
  | 'fiscal'
  | 'gov'
  | 'integrations'
  | 'menu'
  | 'receipt'
  | 'settings'
  | 'shield'

function isItemActive(pathname: string, item: NavigationItem) {
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

function Icon({ name, className = 'h-5 w-5' }: { className?: string; name: IconName }) {
  const commonProps = {
    'aria-hidden': true,
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  const paths: Record<IconName, ReactNode> = {
    admin: (
      <>
        <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    badgeCheck: (
      <>
        <path d="M8 4h8l2 3v10l-2 3H8l-2-3V7l2-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M9 21v-6h6v6" />
        <path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01" />
      </>
    ),
    calendar: (
      <>
        <path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
        <path d="M9 13h3M9 17h6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    dashboard: (
      <>
        <rect height="7" rx="2" width="7" x="3" y="3" />
        <rect height="7" rx="2" width="7" x="14" y="3" />
        <rect height="7" rx="2" width="7" x="14" y="14" />
        <rect height="7" rx="2" width="7" x="3" y="14" />
      </>
    ),
    dollar: (
      <>
        <path d="M12 3v18" />
        <path d="M17 7.5A4 4 0 0 0 12 5c-2.2 0-4 1.1-4 2.7s1.3 2.3 4 2.8c2.7.5 4 1.2 4 2.9S14.2 17 12 17a5 5 0 0 1-5-2.5" />
      </>
    ),
    documents: (
      <>
        <path d="M7 3h7l4 4v14H7V3Z" />
        <path d="M14 3v5h5" />
        <path d="M10 13h6M10 17h6" />
      </>
    ),
    fiscal: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    gov: (
      <>
        <path d="M3 10h18L12 4 3 10Z" />
        <path d="M5 10v8M9 10v8M15 10v8M19 10v8M4 18h16M3 21h18" />
      </>
    ),
    integrations: (
      <>
        <path d="M8 7H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h3" />
        <path d="M16 7h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3" />
        <path d="M8 12h8M10 5v4M14 15v4" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    receipt: (
      <>
        <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1V3Z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        <path d="M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Z" />
        <path d="M12 8v4l3 2" />
      </>
    ),
  }

  return <svg {...commonProps}>{paths[name]}</svg>
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const { logout, user } = useAuth()
  const { isAdmin } = useRole()
  const location = useLocation()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const supportSearch = location.search.includes('organization=') ? location.search : ''
  const toWorkspace = (path: string) => `${path}${supportSearch}`

  const navigationGroups = useMemo<NavigationGroup[]>(() => {
    const groups: NavigationGroup[] = [
      {
        id: 'clientes',
        icon: 'building',
        label: 'Clientes',
        items: [
          { icon: 'building', label: 'Gestao de Clientes', path: '/gestao-clientes' },
          { icon: 'badgeCheck', label: 'Consulta CNPJ', path: '/consulta-cnpj' },
          { icon: 'documents', label: 'Documentos Contabeis', path: '/documentos-contabeis' },
        ],
      },
      {
        id: 'fiscal',
        icon: 'fiscal',
        label: 'Fiscal',
        items: [
          { icon: 'receipt', label: 'Visao Fiscal', path: '/fiscal' },
          { icon: 'calendar', label: 'Obrigacoes e Impostos', path: '/obrigacoes-impostos' },
        ],
      },
      {
        id: 'financeiro',
        icon: 'dollar',
        label: 'Financeiro',
        items: [{ icon: 'dollar', label: 'Gestao Financeira', path: '/gestao-financeira' }],
      },
      {
        id: 'gov',
        icon: 'gov',
        label: 'GOV',
        items: [
          { icon: 'documents', label: 'SEFAZ', path: '/gov/sefaz' },
          { icon: 'shield', label: 'e-CAC', path: '/gov/ecac' },
          { icon: 'gov', label: 'Receita Federal', path: '/gov/receita-federal' },
        ],
      },
      {
        id: 'administracao',
        icon: 'admin',
        label: 'Administracao',
        items: [
          { icon: 'integrations', label: 'Integracoes e Automacoes', path: '/integracoes' },
          { icon: 'settings', label: 'Configuracoes', path: '/configuracoes-contabeis' },
          ...(isAdmin ? [{ icon: 'shield' as IconName, label: 'Menu Administrativo', path: '/admin' }] : []),
        ],
      },
    ]

    return groups
  }, [isAdmin])

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    clientes: false,
    fiscal: false,
    financeiro: false,
    gov: false,
    administracao: false,
  }))

  const activeGroupId = useMemo(() => {
    return navigationGroups.find((group) =>
      group.items.some((item) => isItemActive(location.pathname, item)),
    )?.id
  }, [location.pathname, navigationGroups])

  useEffect(() => {
    if (!activeGroupId) return

    const timeoutId = window.setTimeout(() => {
      setOpenGroups((current) => {
        if (current[activeGroupId]) return current
        return { ...current, [activeGroupId]: true }
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [activeGroupId, location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function toggleGroup(groupId: string) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  function itemClassName({ isActive }: { isActive: boolean }) {
    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
      isActive
        ? 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/20'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    }`
  }

  function dashboardClassName({ isActive }: { isActive: boolean }) {
    return `mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
      isActive
        ? 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/20'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`
  }

  function renderSidebarContent(forceExpanded = false) {
    const compact = isCollapsed && !forceExpanded

    return (
      <>
        <div className={`mb-8 flex items-center ${compact ? 'justify-center' : 'gap-3 px-2'}`}>
          <button
            aria-label={compact ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold transition hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            onClick={() => setIsCollapsed((current) => !current)}
            title={compact ? 'Expandir menu' : 'Recolher menu'}
            type="button"
          >
            A
          </button>
          {!compact && (
            <Link className="text-lg font-semibold" to="/aplicativos">
              <span className="block">Sistema Contabil</span>
              <span className="block text-xs font-normal text-slate-400">Gestao Contabil</span>
            </Link>
          )}
        </div>

        <nav aria-label="Menu principal contabil" className="space-y-3 text-sm">
          <NavLink
            className={dashboardClassName}
            end
            onClick={() => setIsMobileMenuOpen(false)}
            title="Dashboard"
            to={toWorkspace('/dashboard')}
          >
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-slate-300">
              <Icon className="h-[18px] w-[18px]" name="dashboard" />
            </span>
            {!compact && <span>Dashboard</span>}
          </NavLink>

          {navigationGroups.map((group) => {
            const isActiveGroup = group.items.some((item) => isItemActive(location.pathname, item))
            const isOpen = Boolean(openGroups[group.id])

            return (
              <section key={group.id}>
                <button
                  aria-label={`${isOpen ? 'Recolher' : 'Expandir'} menu ${group.label}`}
                  aria-controls={`nav-group-${group.id}`}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                    isActiveGroup
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                  onClick={() => toggleGroup(group.id)}
                  title={group.label}
                  type="button"
                >
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-slate-300">
                    <Icon className="h-[18px] w-[18px]" name={group.icon} />
                  </span>
                  {!compact && (
                    <>
                      <span className="flex-1 text-left">{group.label}</span>
                      <span
                        aria-hidden="true"
                        className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                      >
                        <Icon className="h-4 w-4" name="chevron" />
                      </span>
                    </>
                  )}
                </button>

                {isOpen && (
                  <div
                    className={compact ? 'mt-1 space-y-1' : 'ml-3 mt-1 space-y-1 border-l border-slate-800 pl-3'}
                    id={`nav-group-${group.id}`}
                  >
                    {group.items.map((item) => (
                      <NavLink
                        className={itemClassName}
                        end={item.path === '/dashboard' || item.path === '/admin'}
                        key={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        title={item.label}
                        to={item.path === '/admin' ? item.path : toWorkspace(item.path)}
                      >
                        <span aria-hidden="true" className="flex w-5 justify-center">
                          <Icon className="h-4 w-4" name={item.icon} />
                        </span>
                        {!compact && item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </nav>

        {!compact && (
          <div className="mt-auto rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">{user?.name}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{user?.email}</p>
            {isAdmin && <p className="mt-2 text-xs font-semibold text-indigo-300">Administrador</p>}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside
        className={`hidden shrink-0 flex-col overflow-y-auto bg-slate-950 px-4 py-6 text-white transition-all duration-300 lg:flex ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-80 max-w-[88vw] flex-col overflow-y-auto bg-slate-950 px-4 py-6 text-white shadow-2xl">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Abrir menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
              type="button"
            >
              <Icon className="h-5 w-5" name="menu" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 lg:hidden">
                Sistema Contabil
              </p>
              <h1 className="truncate text-xl font-semibold text-slate-900">{title}</h1>
            </div>
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
