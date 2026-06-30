import { formatDashboardMoney } from '../../services/dashboardService'
import type { DashboardFinancialSummary as DashboardFinancialSummaryType } from '../../types/dashboard'

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function DashboardFinancialSummary({
  financial,
}: {
  financial: DashboardFinancialSummaryType
}) {
  if (!financial.hasPermission) return null

  const rows = [
    { label: 'Honorarios previstos', value: formatDashboardMoney(financial.projectedFees) },
    { label: 'Honorarios recebidos', value: formatDashboardMoney(financial.receivedFees) },
    { label: 'Valor em atraso', value: formatDashboardMoney(financial.overdueAmount) },
    { label: 'Taxa de inadimplencia', value: percent(financial.delinquencyRate) },
    { label: 'Clientes inadimplentes', value: String(financial.overdueClients) },
    { label: 'Receita media por cliente', value: formatDashboardMoney(financial.averageRevenuePerClient) },
  ]

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Financeiro do escritorio</h2>
      <p className="mt-1 text-sm text-slate-500">Metricas do periodo selecionado, respeitando a organizacao ativa.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div className="rounded-2xl bg-slate-50 p-4" key={row.label}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{row.label}</p>
            <p className="mt-2 text-lg font-bold text-slate-950">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
