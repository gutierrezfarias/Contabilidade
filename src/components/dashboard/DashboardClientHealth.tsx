import { Link } from 'react-router-dom'
import { DashboardEmptyState } from './DashboardEmptyState'
import type { DashboardClientHealth, DashboardClientHealthStatus } from '../../types/dashboard'

const statusClasses: Record<DashboardClientHealthStatus, string> = {
  attention: 'bg-amber-50 text-amber-700 ring-amber-100',
  critical: 'bg-red-50 text-red-700 ring-red-100',
  healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  not_configured: 'bg-slate-100 text-slate-600 ring-slate-200',
  processing: 'bg-blue-50 text-blue-700 ring-blue-100',
}

function statusLabel(status: DashboardClientHealthStatus) {
  return {
    attention: 'Atencao',
    critical: 'Critico',
    healthy: 'Saudavel',
    not_configured: 'Nao configurado',
    processing: 'Em processamento',
  }[status]
}

function formatActivity(value: string) {
  if (!value) return 'Sem atividade recente'
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function DashboardClientHealthPanel({
  clients,
  fallbackHref,
}: {
  clients: DashboardClientHealth[]
  fallbackHref: string
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Clientes que precisam de atencao</h2>
          <p className="mt-1 text-sm text-slate-500">
            Saude calculada por atraso, documentos, certificado e integracoes.
          </p>
        </div>
        <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-500" to={fallbackHref}>
          Ver clientes
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="mt-5">
          <DashboardEmptyState
            actionHref={fallbackHref}
            actionLabel="Abrir clientes"
            description="Cadastre clientes ou configure certificados e obrigacoes para que o painel acompanhe riscos reais."
            title="Nenhum cliente para avaliar"
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 pr-4">Cliente</th>
                <th className="py-3 pr-4">Situacao</th>
                <th className="py-3 pr-4">Documentos</th>
                <th className="py-3 pr-4">Certificado</th>
                <th className="py-3 pr-4">Integracoes</th>
                <th className="py-3 pr-4">Obrigacoes</th>
                <th className="py-3 pr-4">Ultima atividade</th>
                <th className="py-3">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client) => (
                <tr key={client.clientId}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-slate-900">{client.clientName}</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-500">{client.reasons.join('; ')}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClasses[client.status]}`}>
                      {statusLabel(client.status)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{client.documentSummary}</td>
                  <td className="py-3 pr-4 text-slate-600">{client.certificateSummary}</td>
                  <td className="py-3 pr-4 text-slate-600">{client.integrationSummary}</td>
                  <td className="py-3 pr-4 text-slate-600">{client.obligationSummary}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatActivity(client.lastActivity)}</td>
                  <td className="py-3">
                    <Link className="font-semibold text-indigo-600 hover:text-indigo-500" to={client.actionHref}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
