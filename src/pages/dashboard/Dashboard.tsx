import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AccountingMetricCard } from '../../components/accounting/AccountingMetricCard'
import { PeriodFilter } from '../../components/accounting/PeriodFilter'
import { StatusBadge } from '../../components/accounting/StatusBadge'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Alert } from '../../components/ui/Alert'
import { useAuth } from '../../hooks/useAuth'
import { getAccountingPeriod } from '../../services/accountingRepository'
import { resolveOrganizationId } from '../../services/platformService'
import type { AccountingPeriod } from '../../types/accounting'

const formatCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function emptyPeriod(month: number, year: number): AccountingPeriod {
  return {
    month,
    year,
    totalClients: 0,
    totalRevenue: 0,
    clientsPaid: 0,
    clientsOverdue: 0,
    monthlyGrowth: 0,
    recentPayments: [],
    obligations: [],
  }
}

export function Dashboard() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const now = useMemo(() => new Date(), [])
  const firstName = user?.name.split(' ')[0] ?? 'Usuario'
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [period, setPeriod] = useState(() => emptyPeriod(month, year))
  const [error, setError] = useState('')
  const supportOrganizationId = searchParams.get('organization')
  const supportName = searchParams.get('supportName')
  const years = useMemo(() => [now.getFullYear(), now.getFullYear() - 1], [now])

  useEffect(() => {
    let active = true

    async function loadPeriod() {
      try {
        const organizationId = await resolveOrganizationId(supportOrganizationId)
        const loadedPeriod = await getAccountingPeriod(organizationId, month, year)
        if (active) {
          setPeriod(loadedPeriod)
          setError('')
        }
      } catch {
        if (active) {
          setPeriod(emptyPeriod(month, year))
          setError('')
        }
      }
    }

    void loadPeriod()
    return () => {
      active = false
    }
  }, [month, supportOrganizationId, year])

  const paidProgress = period.totalClients
    ? (period.clientsPaid / period.totalClients) * 100
    : 0
  const overdueProgress = period.totalClients
    ? (period.clientsOverdue / period.totalClients) * 100
    : 0

  return (
    <DashboardLayout title="Dashboard">
      {supportOrganizationId && (
        <div className="mb-6">
          <Alert type="info">
            Visualizacao assistida ativa: {supportName ?? 'escritorio selecionado'}. Este acesso foi
            registrado para auditoria.
          </Alert>
        </div>
      )}
      <section className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Ola, {firstName}!</h2>
          <p className="mt-2 text-sm text-slate-500">
            Aqui esta um resumo do seu escritorio contabil.
          </p>
        </div>
        <PeriodFilter
          month={month}
          onMonthChange={setMonth}
          onYearChange={setYear}
          year={year}
          years={years}
        />
      </section>

      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AccountingMetricCard label="Total de Clientes" value={String(period.totalClients)} />
        <AccountingMetricCard label="Receita Total" value={formatCurrency.format(period.totalRevenue)} />
        <AccountingMetricCard
          accent="success"
          label="Clientes em Dia"
          progress={paidProgress}
          value={String(period.clientsPaid)}
        />
        <AccountingMetricCard
          accent="danger"
          label="Clientes Inadimplentes"
          progress={overdueProgress}
          value={String(period.clientsOverdue)}
        />
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Clientes Recentes</h2>
          <div className="mt-5 space-y-3">
            {period.recentPayments.map((payment) => (
              <div
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4"
                key={payment.clientName + payment.dueDate}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{payment.clientName}</p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento: {payment.dueDate}</p>
                </div>
                <div className="text-right">
                  <p className="mb-2 text-sm font-semibold text-slate-900">
                    {formatCurrency.format(payment.amount)}
                  </p>
                  <StatusBadge status={payment.status} />
                </div>
              </div>
            ))}
            {period.recentPayments.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">
                Nenhum pagamento cadastrado neste periodo.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Obrigacoes Fiscais</h2>
          <div className="mt-5 space-y-3">
            {period.obligations.map((obligation) => (
              <div
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4"
                key={obligation.name + obligation.dueDate}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{obligation.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {obligation.clientCount} clientes - Vence em {obligation.dueDate}
                  </p>
                </div>
                <StatusBadge status={obligation.status} />
              </div>
            ))}
            {period.obligations.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">
                Nenhuma obrigacao fiscal cadastrada neste periodo.
              </p>
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  )
}
