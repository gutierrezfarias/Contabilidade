import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardAttentionCenter } from '../../components/dashboard/DashboardAttentionCenter'
import { DashboardClientHealthPanel } from '../../components/dashboard/DashboardClientHealth'
import { DashboardErrorState } from '../../components/dashboard/DashboardErrorState'
import { DashboardFinancialSummary } from '../../components/dashboard/DashboardFinancialSummary'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader'
import { DashboardIntegrationHealthPanel } from '../../components/dashboard/DashboardIntegrationHealth'
import { DashboardKpiCard } from '../../components/dashboard/DashboardKpiCard'
import { DashboardObligationsProgress } from '../../components/dashboard/DashboardObligationsProgress'
import { DashboardRecentActivity } from '../../components/dashboard/DashboardRecentActivity'
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton'
import { DashboardTeamWorkload } from '../../components/dashboard/DashboardTeamWorkload'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Alert } from '../../components/ui/Alert'
import { useAuth } from '../../hooks/useAuth'
import { loadOperationalDashboard } from '../../services/dashboardService'
import { resolveOrganizationId } from '../../services/platformService'
import type { DashboardActionLink, DashboardSummary } from '../../types/dashboard'

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function userMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (error instanceof Error) return error.message
  return 'Erro inesperado ao carregar os dados operacionais.'
}

export function Dashboard() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useMemo(() => new Date(), [])
  const initialMonth = numberParam(searchParams.get('month'), now.getMonth() + 1)
  const initialYear = numberParam(searchParams.get('year'), now.getFullYear())
  const [month, setMonthState] = useState(initialMonth)
  const [year, setYearState] = useState(initialYear)
  const [organizationId, setOrganizationId] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const supportOrganizationId = searchParams.get('organization')
  const supportName = searchParams.get('supportName')
  const firstName = user?.name.split(' ')[0] ?? 'Usuario'
  const years = useMemo(() => {
    const current = now.getFullYear()
    return [current + 1, current, current - 1, current - 2]
  }, [now])

  const updatePeriodParams = useCallback(
    (nextMonth: number, nextYear: number) => {
      const next = new URLSearchParams(searchParams)
      next.set('month', String(nextMonth))
      next.set('year', String(nextYear))
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const handleMonthChange = useCallback(
    (nextMonth: number) => {
      setMonthState(nextMonth)
      updatePeriodParams(nextMonth, year)
    },
    [updatePeriodParams, year],
  )

  const handleYearChange = useCallback(
    (nextYear: number) => {
      setYearState(nextYear)
      updatePeriodParams(month, nextYear)
    },
    [month, updatePeriodParams],
  )

  const buildWorkspaceHref = useCallback(
    (path: string, params: Record<string, string> = {}) => {
      const next = new URLSearchParams()
      if (organizationId || supportOrganizationId) {
        next.set('organization', organizationId || supportOrganizationId || '')
      }
      if (supportName) next.set('supportName', supportName)
      next.set('month', String(month))
      next.set('year', String(year))
      Object.entries(params).forEach(([key, value]) => {
        if (value) next.set(key, value)
      })
      return `${path}?${next.toString()}`
    },
    [month, organizationId, supportName, supportOrganizationId, year],
  )

  const quickActions = useMemo<DashboardActionLink[]>(
    () => [
      { href: buildWorkspaceHref('/gestao-clientes'), label: 'Adicionar cliente' },
      { href: buildWorkspaceHref('/obrigacoes-impostos'), label: 'Criar obrigacao' },
      { href: buildWorkspaceHref('/documentos-contabeis'), label: 'Importar documento' },
      { href: buildWorkspaceHref('/gov/sefaz'), label: 'Sincronizar SEFAZ' },
      { href: buildWorkspaceHref('/integracoes'), label: 'Abrir integracoes' },
      { href: buildWorkspaceHref('/gov/sefaz', { tab: 'emitir' }), label: 'Emitir NF-e' },
    ],
    [buildWorkspaceHref],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      setIsLoading(true)
      setError('')
      setSummary(null)

      try {
        const resolvedOrganizationId = await resolveOrganizationId(supportOrganizationId)
        if (!resolvedOrganizationId) {
          throw new Error('Nenhum escritorio contabil foi selecionado para carregar o Dashboard.')
        }

        setOrganizationId(resolvedOrganizationId)
        const loadedSummary = await loadOperationalDashboard(
          resolvedOrganizationId,
          { month, year },
          controller.signal,
        )

        if (!controller.signal.aborted) {
          setSummary(loadedSummary)
        }
      } catch (loadError) {
        const message = userMessage(loadError)
        if (!controller.signal.aborted && message) {
          setError(message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      controller.abort()
    }
  }, [month, reloadToken, supportOrganizationId, year])

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

      <DashboardHeader
        buildClientHref={(clientId) => buildWorkspaceHref(`/gestao-clientes/${clientId}`)}
        clients={summary?.clients ?? []}
        firstName={firstName}
        lastSyncAt={summary?.lastSyncAt ?? ''}
        month={month}
        onMonthChange={handleMonthChange}
        onYearChange={handleYearChange}
        quickActions={quickActions}
        year={year}
        years={years}
      />

      {error && !isLoading && (
        <DashboardErrorState message={error} onRetry={() => setReloadToken((current) => current + 1)} />
      )}

      {isLoading && <DashboardSkeleton />}

      {summary && !isLoading && (
        <div className="space-y-6">
          {summary.sourceIssues.length > 0 && (
            <Alert type="warning">
              Algumas fontes do Dashboard nao responderam agora:{' '}
              {summary.sourceIssues.map((issue) => issue.source).join(', ')}. Os blocos restantes continuam
              usando os dados disponiveis.
            </Alert>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {summary.metrics.map((metric) => (
              <DashboardKpiCard key={metric.id} metric={metric} />
            ))}
          </section>

          <DashboardAttentionCenter
            actionHref={buildWorkspaceHref('/obrigacoes-impostos')}
            items={summary.attentionItems}
          />

          <DashboardObligationsProgress
            progress={summary.obligationProgress}
            upcoming={summary.upcomingDeadlines}
            viewAllHref={buildWorkspaceHref('/obrigacoes-impostos')}
          />

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <DashboardClientHealthPanel
              clients={summary.clientHealth}
              fallbackHref={buildWorkspaceHref('/gestao-clientes')}
            />
            <DashboardIntegrationHealthPanel integrations={summary.integrationHealth} />
          </section>

          <DashboardFinancialSummary financial={summary.financial} />

          <DashboardTeamWorkload team={summary.teamLoad} />

          <DashboardRecentActivity activities={summary.recentActivities} />
        </div>
      )}
    </DashboardLayout>
  )
}
