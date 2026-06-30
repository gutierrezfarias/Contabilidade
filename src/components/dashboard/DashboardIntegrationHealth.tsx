import { Link } from 'react-router-dom'
import type { DashboardIntegrationHealth, DashboardIntegrationStatus } from '../../types/dashboard'

const statusClasses: Record<DashboardIntegrationStatus, string> = {
  attention: 'bg-amber-50 text-amber-700 ring-amber-100',
  critical: 'bg-red-50 text-red-700 ring-red-100',
  healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  not_configured: 'bg-slate-100 text-slate-600 ring-slate-200',
  partial: 'bg-blue-50 text-blue-700 ring-blue-100',
}

function statusLabel(status: DashboardIntegrationStatus) {
  return {
    attention: 'Atencao',
    critical: 'Critico',
    healthy: 'Saudavel',
    not_configured: 'Nao configurado',
    partial: 'Parcial',
  }[status]
}

function formatDate(value: string) {
  if (!value) return 'Sem execucao'
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function DashboardIntegrationHealthPanel({
  integrations,
}: {
  integrations: DashboardIntegrationHealth[]
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Saude das integracoes</h2>
      <p className="mt-1 text-sm text-slate-500">Status real das fontes configuradas no escritorio.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {integrations.map((integration) => (
          <Link
            className="rounded-2xl border border-slate-100 p-4 transition hover:border-indigo-200 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            key={integration.id}
            to={integration.actionHref}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{integration.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{integration.summary}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClasses[integration.status]}`}>
                {statusLabel(integration.status)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-500">
              <div>
                <span className="block font-semibold text-slate-900">{integration.successes}</span>
                sucessos
              </div>
              <div>
                <span className="block font-semibold text-slate-900">{integration.errors}</span>
                erros
              </div>
              <div>
                <span className="block font-semibold text-slate-900">{formatDate(integration.lastRunAt)}</span>
                ultima execucao
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
