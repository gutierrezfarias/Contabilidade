import { Link } from 'react-router-dom'
import { DashboardEmptyState } from './DashboardEmptyState'
import type { DashboardObligationProgress, DashboardUpcomingDeadline } from '../../types/dashboard'

const statusDot = {
  critical: 'bg-red-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
}

function formatDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo'
}

export function DashboardObligationsProgress({
  progress,
  upcoming,
  viewAllHref,
}: {
  progress: DashboardObligationProgress[]
  upcoming: DashboardUpcomingDeadline[]
  viewAllHref: string
}) {
  const total = progress.find((item) => item.category === 'total')?.value ?? 0

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Obrigacoes do mes</h2>
            <p className="mt-1 text-sm text-slate-500">Acompanhamento por prazo e status no periodo selecionado.</p>
          </div>
          <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-500" to={viewAllHref}>
            Ver todas
          </Link>
        </div>

        <div className="mt-5 space-y-4">
          {progress.map((item) => {
            const percent = total ? Math.min(100, Math.round((item.value / total) * 100)) : 0
            return (
              <Link className="block" key={item.category} to={item.href}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="font-semibold text-slate-950">{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Proximos vencimentos</h2>
            <p className="mt-1 text-sm text-slate-500">Itens abertos ordenados pelo vencimento mais proximo.</p>
          </div>
          <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-500" to={viewAllHref}>
            Ver todas
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="mt-5">
            <DashboardEmptyState
              description="Nenhuma obrigacao ou imposto aberto com vencimento nos proximos 30 dias."
              title="Sem vencimentos proximos"
            />
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Data</th>
                  <th className="py-3 pr-4">Cliente</th>
                  <th className="py-3 pr-4">Obrigacao</th>
                  <th className="py-3 pr-4">Responsavel</th>
                  <th className="py-3 pr-4">Situacao</th>
                  <th className="py-3">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 font-medium text-slate-700">{formatDate(item.dueDate)}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.clientName}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.title}</td>
                    <td className="py-3 pr-4 text-slate-500">{item.responsibleName || 'Nao atribuido'}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${statusDot[item.status]}`} />
                        {item.status === 'critical' ? 'Critico' : item.status === 'warning' ? 'Atencao' : 'No prazo'}
                      </span>
                    </td>
                    <td className="py-3">
                      <Link className="font-semibold text-indigo-600 hover:text-indigo-500" to={item.actionHref}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
