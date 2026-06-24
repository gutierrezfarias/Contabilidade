import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import {
  listAccountingClients,
  listCertificateServices,
  listCertificates,
  listClientDocuments,
  listClientPayments,
} from '../../services/accountingRepository'
import { listObligations, listTaxes } from '../../services/accountingComplianceService'
import { listAccountingDocuments } from '../../services/accountingDocumentsService'
import { listAccountingIntegrations, listIntegrationClients } from '../../services/accountingIntegrationsService'
import {
  getFiscalCompanyProfile,
  listFiscalProducts,
  listFiscalRules,
} from '../../services/fiscalRepository'
import { resolveOrganizationId } from '../../services/platformService'
import type {
  AccountingClient,
  AccountingClientDocument,
  CertificateServiceCode,
  ClientMonthlyPayment,
  DigitalCertificate,
} from '../../types/accounting'
import type {
  AccountingObligationPage,
  AccountingTaxPage,
} from '../../types/accountingCompliance'
import type { AccountingDocumentPage } from '../../types/accountingDocuments'
import type { AccountingIntegration, AccountingIntegrationClient } from '../../types/accountingIntegrations'
import type { FiscalCompanyProfile, FiscalProduct, FiscalRule } from '../../types/fiscal'
import { formatCurrencyBRL, formatDateValue } from '../../utils/formatters'

type WorkspaceTab =
  | 'dashboard'
  | 'cadastro'
  | 'fiscal'
  | 'obrigacoes'
  | 'financeiro'
  | 'documentos'
  | 'certificados'
  | 'integracoes'
  | 'historico'

type AlertLevel = 'critical' | 'warning' | 'info' | 'regular'

interface WorkspaceAlert {
  id: string
  level: AlertLevel
  title: string
  message: string
  targetTab?: WorkspaceTab
}

interface IntegrationSnapshot {
  integration: AccountingIntegration
  link: AccountingIntegrationClient | null
}

interface WorkspaceData {
  accountingDocuments: AccountingDocumentPage
  accountingDocumentsLoaded: boolean
  certificates: DigitalCertificate[]
  certificateServices: Record<string, CertificateServiceCode[]>
  clientDocuments: AccountingClientDocument[]
  clientDocumentsLoaded: boolean
  fiscalProducts: FiscalProduct[]
  fiscalProfile: FiscalCompanyProfile | null
  fiscalRules: FiscalRule[]
  fiscalLoaded: boolean
  integrationError: string
  integrations: IntegrationSnapshot[]
  obligations: AccountingObligationPage
  obligationsLoaded: boolean
  obligationsOverdue: number | null
  obligationsPending: number | null
  payments: ClientMonthlyPayment[]
  paymentsLoaded: boolean
  pendingDocuments: number | null
  sourceErrors: string[]
  taxes: AccountingTaxPage
  taxesLoaded: boolean
  taxesOverdue: number | null
  taxesPending: number | null
}

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'obrigacoes', label: 'Obrigacoes e Impostos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'certificados', label: 'Certificados' },
  { id: 'integracoes', label: 'Integracoes' },
  { id: 'historico', label: 'Historico' },
]

const emptyDocumentsPage: AccountingDocumentPage = { documents: [], total: 0 }
const emptyObligationsPage: AccountingObligationPage = {
  data: [],
  page: 1,
  pageSize: 5,
  total: 0,
  totalPages: 1,
}
const emptyTaxesPage: AccountingTaxPage = {
  data: [],
  page: 1,
  pageSize: 5,
  total: 0,
  totalPages: 1,
}

const initialWorkspaceData: WorkspaceData = {
  accountingDocuments: emptyDocumentsPage,
  accountingDocumentsLoaded: false,
  certificates: [],
  certificateServices: {},
  clientDocuments: [],
  clientDocumentsLoaded: false,
  fiscalProducts: [],
  fiscalProfile: null,
  fiscalRules: [],
  fiscalLoaded: false,
  integrationError: '',
  integrations: [],
  obligations: emptyObligationsPage,
  obligationsLoaded: false,
  obligationsOverdue: null,
  obligationsPending: null,
  payments: [],
  paymentsLoaded: false,
  pendingDocuments: null,
  sourceErrors: [],
  taxes: emptyTaxesPage,
  taxesLoaded: false,
  taxesOverdue: null,
  taxesPending: null,
}

function activeTab(value: string | null): WorkspaceTab {
  return tabs.some((tab) => tab.id === value) ? (value as WorkspaceTab) : 'dashboard'
}

function searchWith(searchParams: URLSearchParams, updates: Record<string, string>) {
  const next = new URLSearchParams(searchParams)
  Object.entries(updates).forEach(([key, value]) => next.set(key, value))
  const text = next.toString()
  return text ? `?${text}` : ''
}

function parseDate(value: string) {
  if (!value) return null
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/').map(Number)
    return new Date(year, month - 1, day)
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysUntil(value: string) {
  const date = parseDate(value)
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000)
}

function statusPill(className: string, children: string) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function valueOrEmpty(value: string) {
  return value || 'Nao informado'
}

function periodFilters(clientId: string, status = '') {
  return {
    clientId,
    competence: '',
    page: 1,
    pageSize: 5,
    search: '',
    status,
  }
}

async function countObligationsByStatus(organizationId: string, clientId: string, statuses: string[]) {
  const results = await Promise.all(
    statuses.map((status) => listObligations(organizationId, { ...periodFilters(clientId, status), pageSize: 1 })),
  )
  return results.reduce((total, result) => total + result.total, 0)
}

async function countTaxesByStatus(organizationId: string, clientId: string, statuses: string[]) {
  const results = await Promise.all(
    statuses.map((status) => listTaxes(organizationId, { ...periodFilters(clientId, status), pageSize: 1 })),
  )
  return results.reduce((total, result) => total + result.total, 0)
}

async function loadIntegrations(organizationId: string, clientId: string) {
  const integrations = await listAccountingIntegrations(organizationId)
  const links = await Promise.all(
    integrations.map(async (integration) => {
      const clients = await listIntegrationClients(organizationId, integration.id)
      return {
        integration,
        link: clients.find((client) => client.clientId === clientId) ?? null,
      }
    }),
  )
  return links
}

function rejectedMessage(label: string, result: PromiseSettledResult<unknown>) {
  if (result.status === 'fulfilled') return ''
  const detail = result.reason instanceof Error ? result.reason.message : 'erro desconhecido'
  return `${label}: ${detail}`
}

function buildAlerts(client: AccountingClient, data: WorkspaceData): WorkspaceAlert[] {
  const alerts: WorkspaceAlert[] = []
  const activeCertificate = data.certificates.find((certificate) => certificate.status === 'Ativo')
  const certificate = activeCertificate ?? data.certificates[0]
  const certificateDays = certificate ? daysUntil(certificate.validUntil) : null
  const requiredFields = [
    ['CNPJ', client.cnpj],
    ['telefone', client.phone],
    ['e-mail', client.email],
    ['CEP', client.cep],
    ['endereco', client.address],
    ['cidade', client.city],
    ['UF', client.state],
    ['codigo IBGE', client.cityIbgeCode],
  ]
  const missingFields = requiredFields.filter(([, value]) => !value).map(([label]) => label)

  if (missingFields.length) {
    alerts.push({
      id: 'cadastro-incompleto',
      level: 'warning',
      message: `Campos pendentes: ${missingFields.join(', ')}.`,
      targetTab: 'cadastro',
      title: 'Cadastro incompleto',
    })
  }

  if (!certificate) {
    alerts.push({
      id: 'certificado-ausente',
      level: 'warning',
      message: 'Nenhum certificado digital cadastrado para este cliente.',
      targetTab: 'certificados',
      title: 'Certificado nao configurado',
    })
  } else if (certificate.status !== 'Ativo') {
    alerts.push({
      id: 'certificado-inativo',
      level: 'critical',
      message: `Status atual do certificado: ${certificate.status}.`,
      targetTab: 'certificados',
      title: 'Certificado inativo',
    })
  } else if (certificateDays !== null && certificateDays < 0) {
    alerts.push({
      id: 'certificado-vencido',
      level: 'critical',
      message: `Validade encerrada em ${formatDateValue(certificate.validUntil)}.`,
      targetTab: 'certificados',
      title: 'Certificado vencido',
    })
  } else if (certificateDays !== null && certificateDays <= 30) {
    alerts.push({
      id: 'certificado-vencendo',
      level: 'warning',
      message: `Vence em ${certificateDays} dia(s).`,
      targetTab: 'certificados',
      title: 'Certificado proximo do vencimento',
    })
  }

  const overduePayments = data.payments.filter((payment) => payment.status === 'Vencido')
  if (overduePayments.length) {
    alerts.push({
      id: 'pagamentos-vencidos',
      level: 'critical',
      message: `${overduePayments.length} pagamento(s) vencido(s) no periodo carregado.`,
      targetTab: 'financeiro',
      title: 'Financeiro com pendencias',
    })
  }

  if (data.obligationsOverdue && data.obligationsOverdue > 0) {
    alerts.push({
      id: 'obrigacoes-vencidas',
      level: 'critical',
      message: `${data.obligationsOverdue} obrigacao(oes) vencida(s) para este cliente.`,
      targetTab: 'obrigacoes',
      title: 'Obrigacoes vencidas',
    })
  }

  if (data.taxesOverdue && data.taxesOverdue > 0) {
    alerts.push({
      id: 'impostos-vencidos',
      level: 'critical',
      message: `${data.taxesOverdue} imposto(s)/guia(s) vencido(s) para este cliente.`,
      targetTab: 'obrigacoes',
      title: 'Impostos vencidos',
    })
  }

  if (data.integrationError) {
    alerts.push({
      id: 'integracoes-erro',
      level: 'info',
      message: data.integrationError,
      targetTab: 'integracoes',
      title: 'Integracoes nao consultadas',
    })
  }

  if (data.sourceErrors.length) {
    alerts.push({
      id: 'fontes-com-erro',
      level: 'info',
      message: data.sourceErrors.join(' | '),
      title: 'Algumas fontes nao foram consultadas',
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'regular',
      level: 'regular',
      message: 'Nenhum alerta foi identificado nas fontes carregadas para este cliente.',
      title: 'Situacao regular',
    })
  }

  return alerts
}

function ClientHeader({
  activeCertificate,
  client,
  onBack,
  searchParams,
}: {
  activeCertificate: DigitalCertificate | null
  client: AccountingClient
  onBack: () => void
  searchParams: URLSearchParams
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          {client.photoData ? (
            <img alt={client.companyName} className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" src={client.photoData} />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
              {client.companyName.slice(0, 1).toUpperCase() || 'C'}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Cliente aberto</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{client.companyName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {[client.cnpj, client.city && client.state ? `${client.city}/${client.state}` : ''].filter(Boolean).join(' - ')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusPill(client.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700', client.active ? 'Ativo' : 'Inativo')}
              {statusPill('bg-indigo-50 text-indigo-700', client.taxRegime)}
              {statusPill('bg-slate-100 text-slate-600', client.companySize)}
              {statusPill('bg-amber-50 text-amber-700', client.isMonthly ? formatCurrencyBRL(client.monthlyFee) : 'Nao mensalista')}
              {statusPill(
                activeCertificate ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                activeCertificate ? `Certificado ${activeCertificate.status}` : 'Sem certificado ativo',
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onBack} type="button" variant="secondary">
            Voltar a lista
          </Button>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700"
            to={`/gestao-clientes${searchWith(searchParams, { editClient: client.id })}`}
          >
            Editar cadastro
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            to={`/gov/sefaz${searchWith(searchParams, { clientId: client.id })}`}
          >
            Abrir SEFAZ
          </Link>
        </div>
      </div>
    </section>
  )
}

function WorkspaceTabs({
  currentTab,
  onTabChange,
}: {
  currentTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm" role="tablist">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => (
          <button
            aria-selected={currentTab === tab.id}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
              currentTab === tab.id
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  onClick,
  state = 'neutral',
  value,
}: {
  label: string
  onClick?: () => void
  state?: 'neutral' | 'good' | 'warning' | 'critical'
  value: string
}) {
  const colors = {
    critical: 'border-rose-100 bg-rose-50 text-rose-700',
    good: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    neutral: 'border-slate-100 bg-white text-slate-900',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
  }
  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-3 text-2xl font-bold ${state === 'neutral' ? 'text-slate-900' : ''}`}>{value}</p>
    </>
  )

  if (!onClick) {
    return <div className={`rounded-2xl border p-5 shadow-sm ${colors[state]}`}>{content}</div>
  }

  return (
    <button className={`rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 ${colors[state]}`} onClick={onClick} type="button">
      {content}
    </button>
  )
}

function ClientDashboard({
  alerts,
  client,
  data,
  onTabChange,
}: {
  alerts: WorkspaceAlert[]
  client: AccountingClient
  data: WorkspaceData
  onTabChange: (tab: WorkspaceTab) => void
}) {
  const activeCertificate = data.certificates.find((certificate) => certificate.status === 'Ativo') ?? null
  const certificate = activeCertificate ?? data.certificates[0] ?? null
  const paidPayments = data.payments.filter((payment) => payment.status === 'Pago').length
  const pendingPayments = data.payments.filter((payment) => payment.status === 'Pendente').length
  const overduePayments = data.payments.filter((payment) => payment.status === 'Vencido').length
  const fiscalStatus = data.fiscalProfile
    ? data.fiscalProfile.approvalStatus
    : 'Nao configurado'

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Situacao cadastral" state={client.active ? 'good' : 'critical'} value={client.active ? 'Ativo' : 'Inativo'} />
        <MetricCard label="Regime tributario" onClick={() => onTabChange('cadastro')} value={client.taxRegime} />
        <MetricCard label="Mensalidade contabil" onClick={() => onTabChange('financeiro')} value={client.isMonthly ? formatCurrencyBRL(client.monthlyFee) : 'Nao mensalista'} />
        <MetricCard
          label="Pagamentos no periodo"
          onClick={() => onTabChange('financeiro')}
          state={overduePayments ? 'critical' : pendingPayments ? 'warning' : paidPayments ? 'good' : 'neutral'}
          value={
            data.paymentsLoaded
              ? data.payments.length
                ? `${paidPayments} pagos / ${pendingPayments} pendentes / ${overduePayments} vencidos`
                : 'Nenhum registro encontrado'
              : 'Nao consultado'
          }
        />
        <MetricCard
          label="Certificado digital"
          onClick={() => onTabChange('certificados')}
          state={activeCertificate ? 'good' : certificate ? 'warning' : 'neutral'}
          value={certificate ? certificate.status : 'Nao configurado'}
        />
        <MetricCard
          label="Validade certificado"
          onClick={() => onTabChange('certificados')}
          state={certificate && daysUntil(certificate.validUntil) !== null && Number(daysUntil(certificate.validUntil)) < 30 ? 'warning' : 'neutral'}
          value={certificate?.validUntil ? formatDateValue(certificate.validUntil) : 'Nao informado'}
        />
        <MetricCard
          label="Obrigacoes pendentes"
          onClick={() => onTabChange('obrigacoes')}
          state={data.obligationsPending ? 'warning' : 'neutral'}
          value={data.obligationsPending === null ? 'Nao consultado' : String(data.obligationsPending)}
        />
        <MetricCard
          label="Obrigacoes vencidas"
          onClick={() => onTabChange('obrigacoes')}
          state={data.obligationsOverdue ? 'critical' : 'neutral'}
          value={data.obligationsOverdue === null ? 'Nao consultado' : String(data.obligationsOverdue)}
        />
        <MetricCard
          label="Impostos pendentes"
          onClick={() => onTabChange('obrigacoes')}
          state={data.taxesPending ? 'warning' : 'neutral'}
          value={data.taxesPending === null ? 'Nao consultado' : String(data.taxesPending)}
        />
        <MetricCard
          label="Impostos vencidos"
          onClick={() => onTabChange('obrigacoes')}
          state={data.taxesOverdue ? 'critical' : 'neutral'}
          value={data.taxesOverdue === null ? 'Nao consultado' : String(data.taxesOverdue)}
        />
        <MetricCard
          label="Documentos contabeis"
          onClick={() => onTabChange('documentos')}
          value={data.accountingDocumentsLoaded ? `${data.accountingDocuments.total} registro(s)` : 'Nao consultado'}
        />
        <MetricCard
          label="Documentos pendentes"
          onClick={() => onTabChange('documentos')}
          state={data.pendingDocuments ? 'warning' : 'neutral'}
          value={data.pendingDocuments === null ? 'Nao consultado' : String(data.pendingDocuments)}
        />
        <MetricCard label="Perfil fiscal" onClick={() => onTabChange('fiscal')} value={fiscalStatus} />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Atencao necessaria</h3>
        <div className="mt-4 grid gap-3">
          {alerts.map((alert) => (
            <button
              className={`rounded-2xl border p-4 text-left ${
                alert.level === 'critical'
                  ? 'border-rose-100 bg-rose-50'
                  : alert.level === 'warning'
                    ? 'border-amber-100 bg-amber-50'
                    : alert.level === 'regular'
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-indigo-100 bg-indigo-50'
              }`}
              disabled={!alert.targetTab}
              key={alert.id}
              onClick={() => alert.targetTab && onTabChange(alert.targetTab)}
              type="button"
            >
              <p className="font-semibold text-slate-900">
                {alert.level === 'critical' ? 'Critico' : alert.level === 'warning' ? 'Atencao' : alert.level === 'regular' ? 'Regular' : 'Informacao'} - {alert.title}
              </p>
              <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Situacao por area</h3>
          <div className="mt-4 grid gap-3">
            <AreaStatus label="Cadastro" status={client.cnpj && client.city && client.state ? 'Regular' : 'Incompleto'} tab="cadastro" onTabChange={onTabChange} />
            <AreaStatus label="Fiscal" status={data.fiscalProfile ? data.fiscalProfile.approvalStatus : 'Nao configurado'} tab="fiscal" onTabChange={onTabChange} />
            <AreaStatus label="Obrigacoes" status={data.obligationsLoaded ? data.obligations.total ? `${data.obligations.total} registro(s)` : 'Sem registros' : 'Nao consultado'} tab="obrigacoes" onTabChange={onTabChange} />
            <AreaStatus label="Financeiro" status={data.paymentsLoaded ? data.payments.length ? `${data.payments.length} registro(s) no periodo` : 'Sem registros no periodo' : 'Nao consultado'} tab="financeiro" onTabChange={onTabChange} />
            <AreaStatus label="Documentos" status={data.accountingDocumentsLoaded || data.clientDocumentsLoaded ? `${data.accountingDocuments.total + data.clientDocuments.length} registro(s)` : 'Nao consultado'} tab="documentos" onTabChange={onTabChange} />
            <AreaStatus label="Certificados" status={certificate ? certificate.status : 'Nao configurado'} tab="certificados" onTabChange={onTabChange} />
            <AreaStatus label="Integracoes" status={data.integrationError || `${data.integrations.length} vinculacao(oes)`} tab="integracoes" onTabChange={onTabChange} />
          </div>
        </div>
        <ClientActivityTimeline data={data} />
      </section>
    </div>
  )
}

function AreaStatus({
  label,
  onTabChange,
  status,
  tab,
}: {
  label: string
  onTabChange: (tab: WorkspaceTab) => void
  status: string
  tab: WorkspaceTab
}) {
  return (
    <button className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-white" onClick={() => onTabChange(tab)} type="button">
      <span className="font-semibold text-slate-900">{label}</span>
      <span className="text-sm text-slate-500">{status}</span>
    </button>
  )
}

function ClientActivityTimeline({ data }: { data: WorkspaceData }) {
  const activities = [
    ...data.accountingDocuments.documents.map((document) => ({
      date: document.createdAt,
      detail: document.filename,
      title: 'Documento contabil',
    })),
    ...data.clientDocuments.map((document) => ({
      date: document.createdAt,
      detail: document.fileName,
      title: 'Documento do cadastro',
    })),
    ...data.payments.map((payment) => ({
      date: payment.dueDate,
      detail: `${payment.status} - ${formatCurrencyBRL(payment.amount)}`,
      title: 'Pagamento',
    })),
    ...data.certificates.map((certificate) => ({
      date: certificate.validUntil,
      detail: certificate.holderName,
      title: `Certificado ${certificate.status}`,
    })),
  ]
    .filter((activity) => activity.date || activity.detail)
    .slice(0, 8)

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Atividades recentes</h3>
      {activities.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
          Ainda nao ha historico consolidado nas fontes carregadas para este cliente.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {activities.map((activity, index) => (
            <div className="rounded-xl border border-slate-100 p-4" key={`${activity.title}-${activity.detail}-${index}`}>
              <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
              <p className="mt-1 text-sm text-slate-500">{activity.detail}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDateValue(activity.date)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CadastroTab({ client, searchParams }: { client: AccountingClient; searchParams: URLSearchParams }) {
  const rows = [
    ['Razao social', client.companyName],
    ['CNPJ', client.cnpj],
    ['E-mail', client.email],
    ['Telefone', client.phone],
    ['CEP', client.cep],
    ['Endereco', [client.address, client.addressNumber, client.addressComplement].filter(Boolean).join(', ')],
    ['Bairro', client.neighborhood],
    ['Cidade/UF', [client.city, client.state].filter(Boolean).join('/')],
    ['Codigo IBGE', client.cityIbgeCode],
    ['Inscricao estadual', client.stateRegistration],
    ['Inscricao municipal', client.municipalRegistration],
    ['Regime tributario', client.taxRegime],
    ['Porte', client.companySize],
    ['CNAE principal', client.mainCnae],
    ['Natureza juridica', client.legalNature],
  ]

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Cadastro do cliente</h3>
          <p className="mt-2 text-sm text-slate-500">
            Esta aba mostra os dados atuais. A edicao usa o formulario principal para preservar mascaras, ViaCEP e validacoes.
          </p>
        </div>
        <Link
          className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          to={`/gestao-clientes${searchWith(searchParams, { editClient: client.id })}`}
        >
          Editar no cadastro
        </Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <div className="rounded-2xl bg-slate-50 p-4" key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{valueOrEmpty(value)}</p>
          </div>
        ))}
      </div>
      {client.photoData && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-slate-700">Logo/imagem cadastrada</p>
          <img alt={`Logo ${client.companyName}`} className="h-28 w-28 rounded-2xl border border-slate-200 object-cover" src={client.photoData} />
        </div>
      )}
    </section>
  )
}

function FiscalTab({
  clientId,
  data,
  searchParams,
}: {
  clientId: string
  data: WorkspaceData
  searchParams: URLSearchParams
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
        <h3 className="text-xl font-bold text-slate-900">Fiscal</h3>
        <p className="mt-2 text-sm text-slate-500">
          Dados fiscais lidos dos modulos existentes. Para alterar perfil, produtos ou regras, use a tela Fiscal atual.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard label="Perfil fiscal" value={data.fiscalProfile ? data.fiscalProfile.approvalStatus : 'Nao configurado'} />
          <MetricCard label="Produtos/servicos" value={`${data.fiscalProducts.length} registro(s)`} />
          <MetricCard label="Regras fiscais" value={`${data.fiscalRules.length} registro(s)`} />
        </div>
        {data.fiscalProfile && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Perfil fiscal atual</p>
            <p className="mt-2 text-sm text-slate-600">
              UF {data.fiscalProfile.stateUf || 'Nao informada'} - CRT {data.fiscalProfile.crt || 'Nao informado'} - Ambiente {data.fiscalProfile.defaultEnvironment}
            </p>
          </div>
        )}
      </div>
      <LinkPanel
        description="Abrir a tela Fiscal completa preservando organizacao e cliente na URL."
        href={`/fiscal${searchWith(searchParams, { clientId })}`}
        title="Gerenciar fiscal"
      />
    </section>
  )
}

function ObligationsTab({
  clientId,
  data,
  searchParams,
}: {
  clientId: string
  data: WorkspaceData
  searchParams: URLSearchParams
}) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Obrigacoes" value={data.obligationsLoaded ? `${data.obligations.total} registro(s)` : 'Nao consultado'} />
        <MetricCard label="Obrigacoes vencidas" state={data.obligationsOverdue ? 'critical' : 'neutral'} value={data.obligationsOverdue === null ? 'Nao consultado' : String(data.obligationsOverdue)} />
        <MetricCard label="Impostos/guias" value={data.taxesLoaded ? `${data.taxes.total} registro(s)` : 'Nao consultado'} />
        <MetricCard label="Impostos vencidos" state={data.taxesOverdue ? 'critical' : 'neutral'} value={data.taxesOverdue === null ? 'Nao consultado' : String(data.taxesOverdue)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ListPanel
          emptyText="Nenhuma obrigacao encontrada para este cliente."
          items={data.obligations.data.map((item) => ({
            detail: `${item.status} - vencimento ${formatDateValue(item.dueDate)}`,
            title: item.obligationType,
          }))}
          title="Obrigacoes recentes"
        />
        <ListPanel
          emptyText="Nenhum imposto/guia encontrado para este cliente."
          items={data.taxes.data.map((item) => ({
            detail: `${item.status} - ${formatCurrencyBRL(item.totalAmount)} - vencimento ${formatDateValue(item.dueDate)}`,
            title: item.taxType,
          }))}
          title="Impostos e guias recentes"
        />
      </div>
      <LinkPanel description="Abrir modulo completo de Obrigacoes e Impostos." href={`/obrigacoes-impostos${searchWith(searchParams, { clientId })}`} title="Abrir modulo completo" />
    </section>
  )
}

function FinanceTab({ payments }: { payments: ClientMonthlyPayment[] }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900">Financeiro</h3>
      <p className="mt-2 text-sm text-slate-500">Pagamentos carregados para o periodo atual e filtrados pelo cliente aberto.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="pb-4">Vencimento</th><th>Valor</th><th>Status</th></tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr className="border-t border-slate-100" key={payment.id}>
                <td className="py-4">{payment.dueDate}</td>
                <td>{formatCurrencyBRL(payment.amount)}</td>
                <td>{payment.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum pagamento cadastrado para este cliente no periodo carregado.</p>}
      </div>
    </section>
  )
}

function DocumentsTab({
  accountingDocuments,
  clientDocuments,
}: {
  accountingDocuments: AccountingDocumentPage
  clientDocuments: AccountingClientDocument[]
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <ListPanel
        emptyText="Nenhum documento contabil encontrado."
        items={accountingDocuments.documents.map((document) => ({
          detail: `${document.category} - ${document.approvalStatus} - ${formatDateValue(document.createdAt)}`,
          title: document.filename,
        }))}
        title={`Documentos contabeis (${accountingDocuments.total})`}
      />
      <ListPanel
        emptyText="Nenhum documento vinculado ao cadastro."
        items={clientDocuments.map((document) => ({
          detail: `${document.documentType} - ${(document.fileSize / 1024).toFixed(1)} KB`,
          title: document.fileName,
        }))}
        title={`Documentos do cadastro (${clientDocuments.length})`}
      />
    </section>
  )
}

function CertificatesTab({
  certificateServices,
  certificates,
  searchParams,
}: {
  certificateServices: Record<string, CertificateServiceCode[]>
  certificates: DigitalCertificate[]
  searchParams: URLSearchParams
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-start">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Certificados digitais</h3>
          <p className="mt-2 text-sm text-slate-500">
            A edicao completa continua no fluxo atual de Gestao de Clientes para preservar PFX/P12, senha e servicos habilitados.
          </p>
        </div>
        <Link
          className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          to={`/gestao-clientes${searchWith(searchParams, { tab: 'certificados' })}`}
        >
          Gerenciar certificados
        </Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {certificates.map((certificate) => (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={certificate.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{certificate.certificateType} - {certificate.holderName}</p>
                <p className="mt-1 text-sm text-slate-500">{certificate.taxId}</p>
              </div>
              {statusPill(certificate.status === 'Ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700', certificate.status)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SmallInfo label="Validade" value={certificate.validUntil ? formatDateValue(certificate.validUntil) : 'Nao informada'} />
              <SmallInfo label="Ambiente" value={certificate.environment} />
              <SmallInfo label="UF" value={certificate.stateUf || 'Nao informada'} />
              <SmallInfo label="Arquivo" value={certificate.certificateFileName || 'Sem PFX/P12'} />
              <SmallInfo label="Senha" value={certificate.certificatePassword ? 'Cadastrada' : 'Nao cadastrada'} />
              <SmallInfo label="Servicos" value={`${certificateServices[certificate.id]?.length ?? 0} habilitado(s)`} />
            </div>
          </div>
        ))}
        {certificates.length === 0 && (
          <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">Nenhum certificado cadastrado para este cliente.</p>
        )}
      </div>
    </section>
  )
}

function IntegrationsTab({
  clientId,
  data,
  searchParams,
}: {
  clientId: string
  data: WorkspaceData
  searchParams: URLSearchParams
}) {
  return (
    <section className="space-y-6">
      {data.integrationError && <Alert type="warning">{data.integrationError}</Alert>}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.integrations.map(({ integration, link }) => (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={integration.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{integration.name}</p>
                <p className="mt-1 text-sm text-slate-500">{integration.provider} - {integration.connectionType}</p>
              </div>
              {statusPill(integration.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600', integration.status)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SmallInfo label="Vinculo do cliente" value={link ? link.status : 'Nao vinculado'} />
              <SmallInfo label="Ultima sincronizacao" value={integration.lastSyncAt ? formatDateValue(integration.lastSyncAt) : 'Nao informada'} />
            </div>
          </div>
        ))}
      </div>
      {data.integrations.length === 0 && !data.integrationError && (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">Nenhuma integracao vinculada foi encontrada para este cliente.</p>
      )}
      <LinkPanel description="Abrir configuracao de integracoes contabeis." href={`/integracoes${searchWith(searchParams, { clientId })}`} title="Configurar integracoes" />
    </section>
  )
}

function HistoryTab({ data }: { data: WorkspaceData }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900">Historico do cliente</h3>
      <p className="mt-2 text-sm text-slate-500">
        O sistema ainda nao possui uma fonte unica de auditoria para esta area. Abaixo entram apenas registros reais disponiveis nos modulos atuais.
      </p>
      <div className="mt-6">
        <ClientActivityTimeline data={data} />
      </div>
    </section>
  )
}

function LinkPanel({ description, href, title }: { description: string; href: string; title: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <Link className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700" to={href}>
        Abrir
      </Link>
    </div>
  )
}

function ListPanel({
  emptyText,
  items,
  title,
}: {
  emptyText: string
  items: Array<{ detail: string; title: string }>
  title: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div className="rounded-xl border border-slate-100 p-4" key={`${item.title}-${index}`}>
            <p className="font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
          </div>
        ))}
        {items.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">{emptyText}</p>}
      </div>
    </div>
  )
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || 'Nao informado'}</p>
    </div>
  )
}

export function ClientWorkspace() {
  const navigate = useNavigate()
  const { clientId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const organizationParam = searchParams.get('organization')
  const currentTab = activeTab(searchParams.get('tab'))
  const currentDate = useMemo(() => new Date(), [])
  const [client, setClient] = useState<AccountingClient | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [data, setData] = useState<WorkspaceData>(initialWorkspaceData)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadWorkspace() {
      try {
        setIsLoading(true)
        setError('')
        const resolvedOrganizationId = await resolveOrganizationId(organizationParam)
        const loadedClients = await listAccountingClients(resolvedOrganizationId)
        const loadedClient = loadedClients.find((item) => item.id === clientId) ?? null

        if (!active) return

        setOrganizationId(resolvedOrganizationId)
        setClient(loadedClient)

        if (!resolvedOrganizationId || !loadedClient) {
          setData(initialWorkspaceData)
          return
        }

        const month = currentDate.getMonth() + 1
        const year = currentDate.getFullYear()
        const [
          paymentsResult,
          clientDocumentsResult,
          accountingDocumentsResult,
          pendingDocumentsResult,
          certificatesResult,
          obligationsResult,
          obligationsPendingResult,
          obligationsOverdueResult,
          taxesResult,
          taxesPendingResult,
          taxesOverdueResult,
          fiscalProfileResult,
          fiscalProductsResult,
          fiscalRulesResult,
          integrationsResult,
        ] = await Promise.allSettled([
          listClientPayments(resolvedOrganizationId, month, year),
          listClientDocuments(loadedClient.id),
          listAccountingDocuments(resolvedOrganizationId, {
            category: '',
            clientId: loadedClient.id,
            page: 1,
            pageSize: 5,
            search: '',
            status: '',
          }),
          listAccountingDocuments(resolvedOrganizationId, {
            category: '',
            clientId: loadedClient.id,
            page: 1,
            pageSize: 1,
            search: '',
            status: 'pending',
          }),
          listCertificates(loadedClient.id),
          listObligations(resolvedOrganizationId, periodFilters(loadedClient.id)),
          countObligationsByStatus(resolvedOrganizationId, loadedClient.id, ['pending', 'in_progress', 'processing']),
          countObligationsByStatus(resolvedOrganizationId, loadedClient.id, ['late', 'overdue']),
          listTaxes(resolvedOrganizationId, periodFilters(loadedClient.id)),
          countTaxesByStatus(resolvedOrganizationId, loadedClient.id, ['pending', 'available', 'sent', 'viewed']),
          countTaxesByStatus(resolvedOrganizationId, loadedClient.id, ['overdue']),
          getFiscalCompanyProfile(resolvedOrganizationId, loadedClient.id),
          listFiscalProducts(resolvedOrganizationId, loadedClient.id),
          listFiscalRules(resolvedOrganizationId, loadedClient.id),
          loadIntegrations(resolvedOrganizationId, loadedClient.id),
        ])

        const loadedCertificates =
          certificatesResult.status === 'fulfilled' ? certificatesResult.value : []
        const certificateServicePairs = await Promise.allSettled(
          loadedCertificates.map(async (certificate) => ({
            id: certificate.id,
            services: await listCertificateServices(certificate.id),
          })),
        )
        const certificateServices = certificateServicePairs.reduce<Record<string, CertificateServiceCode[]>>(
          (accumulator, result) => {
            if (result.status === 'fulfilled') {
              accumulator[result.value.id] = result.value.services
            }
            return accumulator
          },
          {},
        )

        if (!active) return

        const sourceErrors = [
          rejectedMessage('Pagamentos', paymentsResult),
          rejectedMessage('Documentos contabeis', accountingDocumentsResult),
          rejectedMessage('Documentos do cadastro', clientDocumentsResult),
          rejectedMessage('Obrigacoes', obligationsResult),
          rejectedMessage('Impostos', taxesResult),
          rejectedMessage('Fiscal', fiscalProfileResult),
        ].filter(Boolean)

        setData({
          accountingDocuments:
            accountingDocumentsResult.status === 'fulfilled' ? accountingDocumentsResult.value : emptyDocumentsPage,
          accountingDocumentsLoaded: accountingDocumentsResult.status === 'fulfilled',
          certificates: loadedCertificates,
          certificateServices,
          clientDocuments:
            clientDocumentsResult.status === 'fulfilled' ? clientDocumentsResult.value : [],
          clientDocumentsLoaded: clientDocumentsResult.status === 'fulfilled',
          fiscalProducts:
            fiscalProductsResult.status === 'fulfilled' ? fiscalProductsResult.value : [],
          fiscalProfile:
            fiscalProfileResult.status === 'fulfilled' ? fiscalProfileResult.value : null,
          fiscalRules:
            fiscalRulesResult.status === 'fulfilled' ? fiscalRulesResult.value : [],
          fiscalLoaded:
            fiscalProfileResult.status === 'fulfilled' &&
            fiscalProductsResult.status === 'fulfilled' &&
            fiscalRulesResult.status === 'fulfilled',
          integrationError:
            integrationsResult.status === 'rejected'
              ? integrationsResult.reason instanceof Error
                ? integrationsResult.reason.message
                : 'Nao foi possivel consultar integracoes.'
              : '',
          integrations:
            integrationsResult.status === 'fulfilled' ? integrationsResult.value : [],
          obligations:
            obligationsResult.status === 'fulfilled' ? obligationsResult.value : emptyObligationsPage,
          obligationsLoaded: obligationsResult.status === 'fulfilled',
          obligationsOverdue:
            obligationsOverdueResult.status === 'fulfilled' ? obligationsOverdueResult.value : null,
          obligationsPending:
            obligationsPendingResult.status === 'fulfilled' ? obligationsPendingResult.value : null,
          payments:
            paymentsResult.status === 'fulfilled'
              ? paymentsResult.value.filter((payment) => payment.clientId === loadedClient.id)
              : [],
          paymentsLoaded: paymentsResult.status === 'fulfilled',
          pendingDocuments:
            pendingDocumentsResult.status === 'fulfilled' ? pendingDocumentsResult.value.total : null,
          sourceErrors,
          taxes:
            taxesResult.status === 'fulfilled' ? taxesResult.value : emptyTaxesPage,
          taxesLoaded: taxesResult.status === 'fulfilled',
          taxesOverdue:
            taxesOverdueResult.status === 'fulfilled' ? taxesOverdueResult.value : null,
          taxesPending:
            taxesPendingResult.status === 'fulfilled' ? taxesPendingResult.value : null,
        })
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar o cliente.')
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadWorkspace()
    return () => {
      active = false
    }
  }, [clientId, currentDate, organizationParam])

  const activeCertificate = useMemo(
    () => data.certificates.find((certificate) => certificate.status === 'Ativo') ?? null,
    [data.certificates],
  )
  const alerts = useMemo(() => (client ? buildAlerts(client, data) : []), [client, data])

  function setTab(tab: WorkspaceTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  function backToList() {
    navigate(`/gestao-clientes${searchWith(searchParams, {})}`)
  }

  function renderTab() {
    if (!client) return null

    if (currentTab === 'cadastro') return <CadastroTab client={client} searchParams={searchParams} />
    if (currentTab === 'fiscal') return <FiscalTab clientId={client.id} data={data} searchParams={searchParams} />
    if (currentTab === 'obrigacoes') return <ObligationsTab clientId={client.id} data={data} searchParams={searchParams} />
    if (currentTab === 'financeiro') return <FinanceTab payments={data.payments} />
    if (currentTab === 'documentos') {
      return <DocumentsTab accountingDocuments={data.accountingDocuments} clientDocuments={data.clientDocuments} />
    }
    if (currentTab === 'certificados') {
      return <CertificatesTab certificateServices={data.certificateServices} certificates={data.certificates} searchParams={searchParams} />
    }
    if (currentTab === 'integracoes') return <IntegrationsTab clientId={client.id} data={data} searchParams={searchParams} />
    if (currentTab === 'historico') return <HistoryTab data={data} />

    return <ClientDashboard alerts={alerts} client={client} data={data} onTabChange={setTab} />
  }

  return (
    <DashboardLayout title="Cliente">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">Area individual</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Painel do cliente</h1>
        <p className="mt-2 text-sm text-slate-500">
          Dashboard, cadastro e atalhos por cliente usando apenas dados reais disponiveis nos modulos atuais.
        </p>
      </div>

      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}
      {isLoading && <div className="rounded-2xl border border-slate-100 bg-white p-8 text-sm text-slate-500 shadow-sm">Carregando dados do cliente...</div>}

      {!isLoading && !client && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-bold">Cliente nao encontrado nesta organizacao</h2>
          <p className="mt-2 text-sm">
            O registro pode nao existir, pertencer a outra organizacao ou estar bloqueado pelas politicas de acesso.
          </p>
          <Button className="mt-5" onClick={backToList} type="button" variant="secondary">
            Voltar a lista
          </Button>
        </div>
      )}

      {!isLoading && client && (
        <div className="space-y-6">
          <ClientHeader activeCertificate={activeCertificate} client={client} onBack={backToList} searchParams={searchParams} />
          {!organizationId && <Alert type="warning">Organizacao nao resolvida. Verifique o contexto de acesso.</Alert>}
          <WorkspaceTabs currentTab={currentTab} onTabChange={setTab} />
          {renderTab()}
        </div>
      )}
    </DashboardLayout>
  )
}
