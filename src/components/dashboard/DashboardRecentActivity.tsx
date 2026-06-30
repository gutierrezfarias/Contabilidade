import { Link } from 'react-router-dom'
import { DashboardEmptyState } from './DashboardEmptyState'
import type { DashboardRecentActivity as DashboardRecentActivityType } from '../../types/dashboard'

function formatDate(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function DashboardRecentActivity({
  activities,
}: {
  activities: DashboardRecentActivityType[]
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Atividades recentes</h2>
      <p className="mt-1 text-sm text-slate-500">Eventos reais de auditoria contabil e fiscal.</p>

      {activities.length === 0 ? (
        <div className="mt-5">
          <DashboardEmptyState
            description="Nenhuma atividade auditada foi encontrada para o periodo selecionado."
            title="Sem atividades recentes"
          />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {activities.map((activity) => (
            <Link
              className="block rounded-2xl border border-slate-100 p-4 transition hover:border-indigo-200 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
              key={activity.id}
              to={activity.href}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{activity.action}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {activity.clientName || activity.entityType || 'Entidade do sistema'} - {activity.origin}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">{formatDate(activity.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
