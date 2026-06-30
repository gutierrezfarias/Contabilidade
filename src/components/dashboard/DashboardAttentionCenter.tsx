import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardEmptyState } from './DashboardEmptyState'
import { daysFromToday, isSameLocalDay } from '../../utils/dashboardSeverity'
import type {
  DashboardAttentionFilter,
  DashboardAttentionItem,
  DashboardAttentionSeverity,
} from '../../types/dashboard'

const filters: Array<{ id: DashboardAttentionFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'critical', label: 'Criticos' },
  { id: 'overdue', label: 'Atrasados' },
  { id: 'today', label: 'Hoje' },
  { id: 'next7', label: 'Proximos 7 dias' },
  { id: 'waiting_client', label: 'Aguardando cliente' },
]

const severityClasses: Record<DashboardAttentionSeverity, string> = {
  critical: 'bg-red-50 text-red-700 ring-red-100',
  info: 'bg-blue-50 text-blue-700 ring-blue-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
}

function severityLabel(severity: DashboardAttentionSeverity) {
  return {
    critical: 'Critico',
    info: 'Info',
    success: 'Concluido',
    warning: 'Atencao',
  }[severity]
}

function filterItem(item: DashboardAttentionItem, filter: DashboardAttentionFilter) {
  if (filter === 'all') return true
  if (filter === 'critical') return item.severity === 'critical'
  if (filter === 'waiting_client') return item.origin === 'Documento'
  if (filter === 'today') return isSameLocalDay(item.dueDate)
  if (filter === 'overdue') return item.dueDate ? daysFromToday(item.dueDate) < 0 : false
  if (filter === 'next7') {
    const days = item.dueDate ? daysFromToday(item.dueDate) : Number.POSITIVE_INFINITY
    return days >= 0 && days <= 7
  }
  return true
}

function formatDueDate(value: string) {
  if (!value) return 'Sem prazo'
  const days = daysFromToday(value)
  const formatted = new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
  if (days < 0) return `${formatted} (${Math.abs(days)} dia(s) em atraso)`
  if (days === 0) return `${formatted} (hoje)`
  return `${formatted} (${days} dia(s))`
}

export function DashboardAttentionCenter({
  actionHref,
  items,
}: {
  actionHref: string
  items: DashboardAttentionItem[]
}) {
  const [filter, setFilter] = useState<DashboardAttentionFilter>('all')
  const filteredItems = useMemo(
    () => items.filter((item) => filterItem(item, filter)).slice(0, 12),
    [filter, items],
  )

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Requer sua atencao</h2>
          <p className="mt-1 text-sm text-slate-500">
            Riscos, atrasos e pendencias derivados de registros reais do escritorio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                filter === item.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {filteredItems.map((item) => (
          <article className="rounded-2xl border border-slate-100 p-4" key={item.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${severityClasses[item.severity]}`}>
                    {severityLabel(item.severity)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {item.origin}
                  </span>
                  <span className="text-xs text-slate-400">{formatDueDate(item.dueDate)}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-950">{item.clientName}</h3>
                <p className="mt-1 text-sm font-medium text-slate-700">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                {item.responsibleName && (
                  <p className="mt-2 text-xs text-slate-400">Responsavel: {item.responsibleName}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {item.actions.map((action) => (
                  <Link
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                    key={action.href + action.label}
                    to={action.href}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}

        {filteredItems.length === 0 && (
          <DashboardEmptyState
            actionHref={actionHref}
            actionLabel="Abrir obrigacoes"
            description="Seu escritorio nao possui alertas nesta categoria neste momento."
            title="Nenhuma pendencia encontrada"
          />
        )}
      </div>
    </section>
  )
}
