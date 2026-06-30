import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardActionLink, DashboardClientSearchItem } from '../../types/dashboard'

const months = [
  { label: 'Janeiro', value: 1 },
  { label: 'Fevereiro', value: 2 },
  { label: 'Marco', value: 3 },
  { label: 'Abril', value: 4 },
  { label: 'Maio', value: 5 },
  { label: 'Junho', value: 6 },
  { label: 'Julho', value: 7 },
  { label: 'Agosto', value: 8 },
  { label: 'Setembro', value: 9 },
  { label: 'Outubro', value: 10 },
  { label: 'Novembro', value: 11 },
  { label: 'Dezembro', value: 12 },
]

interface DashboardHeaderProps {
  buildClientHref: (clientId: string) => string
  clients: DashboardClientSearchItem[]
  firstName: string
  lastSyncAt: string
  month: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
  quickActions: DashboardActionLink[]
  year: number
  years: number[]
}

function formatLastSync(value: string) {
  if (!value) return 'Nenhuma sincronizacao registrada'
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function matchesClient(client: DashboardClientSearchItem, search: string) {
  const haystack = `${client.name} ${client.tradeName} ${client.cnpj}`.toLowerCase()
  return haystack.includes(search.toLowerCase())
}

export function DashboardHeader({
  buildClientHref,
  clients,
  firstName,
  lastSyncAt,
  month,
  onMonthChange,
  onYearChange,
  quickActions,
  year,
  years,
}: DashboardHeaderProps) {
  const [search, setSearch] = useState('')
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const matches = useMemo(() => {
    const trimmed = search.trim()
    if (!trimmed) return []
    return clients.filter((client) => matchesClient(client, trimmed)).slice(0, 6)
  }, [clients, search])

  return (
    <section className="mb-7">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Operacao diaria</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Ola, {firstName}!</h2>
          <p className="mt-2 text-sm text-slate-500">Aqui esta o que requer sua atencao hoje.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-end">
          <label className="text-sm font-medium text-slate-600">
            Mes
            <select
              className="mt-2 h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => onMonthChange(Number(event.target.value))}
              value={month}
            >
              {months.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            Ano
            <select
              className="mt-2 h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => onYearChange(Number(event.target.value))}
              value={year}
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="relative sm:col-span-2 xl:w-80">
            <label className="text-sm font-medium text-slate-600" htmlFor="dashboard-search">
              Pesquisa contextual
            </label>
            <input
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              id="dashboard-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Razao social, fantasia ou CNPJ"
              type="search"
              value={search}
            />
            {matches.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                {matches.map((client) => (
                  <Link
                    className="block px-4 py-3 text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    key={client.id}
                    onClick={() => setSearch('')}
                    to={buildClientHref(client.id)}
                  >
                    <span className="block font-semibold text-slate-900">{client.name}</span>
                    <span className="text-xs text-slate-500">{client.cnpj || 'CNPJ nao informado'}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              aria-expanded={isActionsOpen}
              className="h-11 w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 xl:w-auto"
              onClick={() => setIsActionsOpen((current) => !current)}
              type="button"
            >
              Acao rapida
            </button>
            {isActionsOpen && (
              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                {quickActions.map((action) => (
                  <Link
                    className="block px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    key={action.href}
                    onClick={() => setIsActionsOpen(false)}
                    to={action.href}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        Ultima sincronizacao conhecida: <span className="font-semibold text-slate-800">{formatLastSync(lastSyncAt)}</span>
      </div>
    </section>
  )
}
