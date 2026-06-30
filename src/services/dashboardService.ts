import { supabase } from './supabase'
import {
  addDays,
  certificateSeverity,
  daysFromToday,
  formatDateInput,
  integrationSeverity,
  isClosedStatus,
  isDateInRange,
  isSameLocalDay,
  periodDateRange,
  severityFromDueDate,
  severityRank,
  todayLocalDate,
} from '../utils/dashboardSeverity'
import type {
  DashboardAttentionItem,
  DashboardClientHealth,
  DashboardClientHealthStatus,
  DashboardClientSearchItem,
  DashboardFinancialSummary,
  DashboardIntegrationHealth,
  DashboardMetric,
  DashboardObligationProgress,
  DashboardPeriodFilter,
  DashboardRecentActivity,
  DashboardSourceIssue,
  DashboardSummary,
  DashboardTeamMemberLoad,
  DashboardUpcomingDeadline,
} from '../types/dashboard'

type Row = Record<string, unknown>

interface QueryResult<T> {
  data: T[] | null
  error: { message: string } | null
}

interface ClientRow {
  active?: boolean
  city?: string | null
  cnpj?: string | null
  company_name?: string | null
  created_at?: string | null
  email?: string | null
  id?: string | null
  is_monthly?: boolean | null
  monthly_fee?: number | string | null
  state?: string | null
}

interface PaymentRow {
  amount?: number | string | null
  client_id?: string | null
  due_date?: string | null
  id?: string | null
  status?: string | null
}

interface ObligationRow {
  client_id?: string | null
  clients?: Row | Row[] | null
  created_at?: string | null
  due_date?: string | null
  guide_document_id?: string | null
  id?: string | null
  obligation_type?: string | null
  receipt_document_id?: string | null
  responsible_user_id?: string | null
  status?: string | null
  updated_at?: string | null
}

interface TaxRow {
  amount?: number | string | null
  client_id?: string | null
  clients?: Row | Row[] | null
  created_at?: string | null
  description?: string | null
  due_date?: string | null
  guide_document_id?: string | null
  id?: string | null
  receipt_document_id?: string | null
  responsible_user_id?: string | null
  status?: string | null
  tax_type?: string | null
  total_amount?: number | string | null
  updated_at?: string | null
}

interface DocumentRow {
  approval_status?: string | null
  category?: string | null
  client_id?: string | null
  clients?: Row | Row[] | null
  created_at?: string | null
  description?: string | null
  due_date?: string | null
  id?: string | null
  responsible_user_id?: string | null
  status?: string | null
  updated_at?: string | null
}

interface CertificateRow {
  client_id?: string | null
  clients?: Row | Row[] | null
  environment?: string | null
  holder_name?: string | null
  id?: string | null
  state_uf?: string | null
  status?: string | null
  tax_id?: string | null
  updated_at?: string | null
  valid_until?: string | null
}

interface IntegrationRow {
  active?: boolean | null
  id?: string | null
  last_sync_at?: string | null
  name?: string | null
  provider?: string | null
  status?: string | null
  updated_at?: string | null
}

interface SyncRunRow {
  client_id?: string | null
  error_count?: number | string | null
  finished_at?: string | null
  id?: string | null
  integration_id?: string | null
  provider?: string | null
  status?: string | null
}

interface SefazSyncStateRow {
  client_id?: string | null
  last_status_message?: string | null
  last_sync_at?: string | null
  status?: string | null
  updated_at?: string | null
}

interface ImportBatchRow {
  created_at?: string | null
  id?: string | null
  status?: string | null
}

interface EmployeeRow {
  email?: string | null
  id?: string | null
  name?: string | null
  role?: string | null
}

interface AuditRow {
  action?: string | null
  client_id?: string | null
  created_at?: string | null
  entity_id?: string | null
  entity_type?: string | null
  id?: string | null
  origin?: string | null
}

interface DashboardDataBundle {
  accountingAudits: AuditRow[]
  certificates: CertificateRow[]
  clients: ClientRow[]
  documents: DocumentRow[]
  employees: EmployeeRow[]
  fiscalAudits: AuditRow[]
  importBatches: ImportBatchRow[]
  integrations: IntegrationRow[]
  obligations: ObligationRow[]
  payments: PaymentRow[]
  sefazSyncStates: SefazSyncStateRow[]
  syncRuns: SyncRunRow[]
  taxes: TaxRow[]
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
})

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function boolValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function isMissingRelationError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('does not exist') || normalized.includes('schema cache') || normalized.includes('could not find')
}

async function optionalList<T>(
  source: string,
  promise: PromiseLike<QueryResult<T>>,
  issues: DashboardSourceIssue[],
) {
  const { data, error } = await promise
  if (error) {
    issues.push({
      message: isMissingRelationError(error.message)
        ? 'Fonte indisponivel no Supabase. Verifique se a migration correspondente foi executada.'
        : 'Nao foi possivel carregar esta fonte agora.',
      source,
    })
    return []
  }

  return data ?? []
}

function clientRelationName(value: Row | Row[] | null | undefined) {
  const row = Array.isArray(value) ? value[0] : value
  return row ? stringValue(row.company_name) || 'Cliente' : 'Cliente'
}

function buildHref(
  path: string,
  organizationId: string,
  period: DashboardPeriodFilter,
  params: Record<string, string> = {},
) {
  const search = new URLSearchParams({
    month: String(period.month),
    organization: organizationId,
    year: String(period.year),
    ...params,
  })
  return `${path}?${search.toString()}`
}

function activeClients(clients: ClientRow[]) {
  return clients.filter((client) => boolValue(client.active, true))
}

function clientMap(clients: ClientRow[]) {
  return new Map(
    clients.map((client) => [
      stringValue(client.id),
      {
        cnpj: stringValue(client.cnpj),
        id: stringValue(client.id),
        name: stringValue(client.company_name) || 'Cliente',
      },
    ]),
  )
}

function employeeMap(employees: EmployeeRow[]) {
  return new Map(
    employees.map((employee) => [
      stringValue(employee.id),
      {
        name: stringValue(employee.name) || stringValue(employee.email) || 'Responsavel',
        role: stringValue(employee.role),
      },
    ]),
  )
}

function createMetric(input: DashboardMetric) {
  return input
}

function getPeriodClientGrowth(clients: ClientRow[], period: DashboardPeriodFilter) {
  const range = periodDateRange(period.month, period.year)
  return clients.filter((client) => client.created_at && isDateInRange(stringValue(client.created_at), range.start, range.end)).length
}

function isOverdue(dueDate: string, status: string) {
  return Boolean(dueDate) && daysFromToday(dueDate) < 0 && !isClosedStatus(status)
}

function isDueToday(dueDate: string, status: string) {
  return Boolean(dueDate) && isSameLocalDay(dueDate) && !isClosedStatus(status)
}

function currentAlerts(bundle: DashboardDataBundle) {
  const overdueObligations = bundle.obligations.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status)))
  const overdueTaxes = bundle.taxes.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status)))
  const dueTodayObligations = bundle.obligations.filter((item) => isDueToday(stringValue(item.due_date), stringValue(item.status)))
  const dueTodayTaxes = bundle.taxes.filter((item) => isDueToday(stringValue(item.due_date), stringValue(item.status)))
  const waitingDocuments = bundle.documents.filter((item) => stringValue(item.approval_status) === 'pending')
  const criticalCertificates = bundle.certificates.filter(
    (item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'critical',
  )
  const integrationFailures = [
    ...bundle.integrations.filter((item) => integrationSeverity(stringValue(item.status)) === 'critical'),
    ...bundle.sefazSyncStates.filter(
      (item) => integrationSeverity(stringValue(item.status), stringValue(item.last_status_message)) === 'critical',
    ),
  ]

  return {
    critical: criticalCertificates.length + integrationFailures.length + overdueObligations.length + overdueTaxes.length,
    dueToday: dueTodayObligations.length + dueTodayTaxes.length,
    overdue: overdueObligations.length + overdueTaxes.length,
    waitingClient: waitingDocuments.length,
  }
}

function buildMetrics(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardMetric[] {
  const activeClientRows = activeClients(bundle.clients)
  const alertCounts = currentAlerts(bundle)
  const newClients = getPeriodClientGrowth(bundle.clients, period)

  return [
    createMetric({
      description: newClients ? `${newClients} novo(s) no periodo` : 'Sem novos clientes no periodo',
      href: buildHref('/gestao-clientes', organizationId, period, { status: 'active' }),
      id: 'active-clients',
      label: 'Clientes ativos',
      status: 'success',
      tooltip: 'Total de clientes ativos do escritorio selecionado, filtrados pela RLS.',
      value: String(activeClientRows.length),
    }),
    createMetric({
      description: 'Obrigacoes e impostos com vencimento hoje',
      href: buildHref('/obrigacoes-impostos', organizationId, period, { due: 'today' }),
      id: 'due-today',
      label: 'Vencem hoje',
      status: alertCounts.dueToday > 0 ? 'warning' : 'success',
      tooltip: 'Conta obrigacoes e impostos com due_date igual a hoje e status ainda aberto.',
      value: String(alertCounts.dueToday),
    }),
    createMetric({
      description: 'Itens vencidos ainda nao concluidos',
      href: buildHref('/obrigacoes-impostos', organizationId, period, { status: 'overdue' }),
      id: 'overdue',
      label: 'Em atraso',
      status: alertCounts.overdue > 0 ? 'critical' : 'success',
      tooltip: 'Conta obrigacoes e impostos vencidos cujo status nao esta concluido, pago, cancelado ou isento.',
      value: String(alertCounts.overdue),
    }),
    createMetric({
      description: 'Documentos ou retornos pendentes do cliente',
      href: buildHref('/documentos-contabeis', organizationId, period, { status: 'pending' }),
      id: 'waiting-client',
      label: 'Aguardando cliente',
      status: alertCounts.waitingClient > 0 ? 'warning' : 'success',
      tooltip: 'Documentos contabeis marcados como pendentes de aprovacao/retorno.',
      value: String(alertCounts.waitingClient),
    }),
    createMetric({
      description: 'Certificados, atrasos ou integracoes com erro',
      href: buildHref('/integracoes', organizationId, period, { status: 'critical' }),
      id: 'critical',
      label: 'Situacao critica',
      status: alertCounts.critical > 0 ? 'critical' : 'success',
      tooltip: 'Soma certificados vencidos/proximos, obrigacoes/impostos atrasados e integracoes com falha.',
      value: String(alertCounts.critical),
    }),
  ]
}

function attentionActionForClient(organizationId: string, period: DashboardPeriodFilter, clientId: string) {
  return {
    href: buildHref(`/gestao-clientes/${clientId}`, organizationId, period),
    label: 'Abrir cliente',
  }
}

function buildAttentionItems(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardAttentionItem[] {
  const employees = employeeMap(bundle.employees)
  const items: DashboardAttentionItem[] = []
  const pushItem = (item: DashboardAttentionItem) => {
    items.push(item)
  }

  bundle.obligations.forEach((obligation) => {
    const status = stringValue(obligation.status)
    const dueDate = stringValue(obligation.due_date)
    const severity = severityFromDueDate(dueDate, status)
    if (severity === 'success') return
    const clientId = stringValue(obligation.client_id)
    const responsible = employees.get(stringValue(obligation.responsible_user_id))
    const title = stringValue(obligation.obligation_type) || 'Obrigacao contabil'
    pushItem({
      actions: [
        { href: buildHref('/obrigacoes-impostos', organizationId, period, { clientId, source: 'obligation' }), label: 'Ver obrigacao' },
        attentionActionForClient(organizationId, period, clientId),
      ],
      clientId,
      clientName: clientRelationName(obligation.clients),
      dueDate,
      href: buildHref('/obrigacoes-impostos', organizationId, period, { clientId, source: 'obligation' }),
      id: `obligation-${stringValue(obligation.id)}`,
      origin: 'Obrigacao',
      reason: daysFromToday(dueDate) < 0 ? `${title} vencida ha ${Math.abs(daysFromToday(dueDate))} dia(s).` : `${title} vence em ${daysFromToday(dueDate)} dia(s).`,
      responsibleName: responsible?.name ?? '',
      severity,
      title,
      updatedAt: stringValue(obligation.updated_at || obligation.created_at),
    })
  })

  bundle.taxes.forEach((tax) => {
    const status = stringValue(tax.status)
    const dueDate = stringValue(tax.due_date)
    const severity = severityFromDueDate(dueDate, status)
    if (severity === 'success') return
    const clientId = stringValue(tax.client_id)
    const responsible = employees.get(stringValue(tax.responsible_user_id))
    const title = stringValue(tax.tax_type) || stringValue(tax.description) || 'Imposto/guia'
    pushItem({
      actions: [
        { href: buildHref('/obrigacoes-impostos', organizationId, period, { clientId, source: 'tax' }), label: 'Ver imposto' },
        attentionActionForClient(organizationId, period, clientId),
      ],
      clientId,
      clientName: clientRelationName(tax.clients),
      dueDate,
      href: buildHref('/obrigacoes-impostos', organizationId, period, { clientId, source: 'tax' }),
      id: `tax-${stringValue(tax.id)}`,
      origin: 'Imposto',
      reason: daysFromToday(dueDate) < 0 ? `${title} vencido ha ${Math.abs(daysFromToday(dueDate))} dia(s).` : `${title} vence em ${daysFromToday(dueDate)} dia(s).`,
      responsibleName: responsible?.name ?? '',
      severity,
      title,
      updatedAt: stringValue(tax.updated_at || tax.created_at),
    })
  })

  bundle.documents
    .filter((document) => stringValue(document.approval_status) === 'pending')
    .forEach((document) => {
      const dueDate = stringValue(document.due_date)
      const clientId = stringValue(document.client_id)
      const responsible = employees.get(stringValue(document.responsible_user_id))
      pushItem({
        actions: [
          { href: buildHref('/documentos-contabeis', organizationId, period, { clientId, status: 'pending' }), label: 'Ver documento' },
          attentionActionForClient(organizationId, period, clientId),
        ],
        clientId,
        clientName: clientRelationName(document.clients),
        dueDate,
        href: buildHref('/documentos-contabeis', organizationId, period, { clientId, status: 'pending' }),
        id: `document-${stringValue(document.id)}`,
        origin: 'Documento',
        reason: stringValue(document.description) || `Documento ${stringValue(document.category) || 'contabil'} aguardando cliente.`,
        responsibleName: responsible?.name ?? '',
        severity: dueDate ? severityFromDueDate(dueDate, stringValue(document.status), 3) : 'warning',
        title: 'Aguardando cliente',
        updatedAt: stringValue(document.updated_at || document.created_at),
      })
    })

  bundle.certificates.forEach((certificate) => {
    const validUntil = stringValue(certificate.valid_until)
    const severity = certificateSeverity(validUntil, stringValue(certificate.status))
    if (severity === 'success') return
    const clientId = stringValue(certificate.client_id)
    pushItem({
      actions: [
        { href: buildHref('/gestao-clientes', organizationId, period, { clientId, tab: 'certificados' }), label: 'Ver certificado' },
        attentionActionForClient(organizationId, period, clientId),
      ],
      clientId,
      clientName: clientRelationName(certificate.clients),
      dueDate: validUntil,
      href: buildHref('/gestao-clientes', organizationId, period, { clientId, tab: 'certificados' }),
      id: `certificate-${stringValue(certificate.id)}`,
      origin: 'Certificado',
      reason: daysFromToday(validUntil) < 0 ? 'Certificado digital vencido.' : `Certificado vence em ${daysFromToday(validUntil)} dia(s).`,
      responsibleName: '',
      severity,
      title: 'Certificado digital',
      updatedAt: stringValue(certificate.updated_at),
    })
  })

  bundle.sefazSyncStates
    .filter((state) => integrationSeverity(stringValue(state.status), stringValue(state.last_status_message)) === 'critical')
    .forEach((state, index) => {
      const clientId = stringValue(state.client_id)
      const client = clientMap(bundle.clients).get(clientId)
      pushItem({
        actions: [
          { href: buildHref('/gov/sefaz', organizationId, period, { clientId }), label: 'Ver SEFAZ' },
          attentionActionForClient(organizationId, period, clientId),
        ],
        clientId,
        clientName: client?.name ?? 'Cliente',
        dueDate: '',
        href: buildHref('/gov/sefaz', organizationId, period, { clientId }),
        id: `sefaz-${clientId}-${index}`,
        origin: 'SEFAZ',
        reason: stringValue(state.last_status_message) || 'Ultima sincronizacao SEFAZ falhou.',
        responsibleName: '',
        severity: 'critical',
        title: 'Falha de integracao',
        updatedAt: stringValue(state.updated_at || state.last_sync_at),
      })
    })

  return items.sort((left, right) => {
    const severityComparison = severityRank(left.severity) - severityRank(right.severity)
    if (severityComparison) return severityComparison
    const leftDays = left.dueDate ? daysFromToday(left.dueDate) : Number.POSITIVE_INFINITY
    const rightDays = right.dueDate ? daysFromToday(right.dueDate) : Number.POSITIVE_INFINITY
    if (leftDays !== rightDays) return leftDays - rightDays
    const clientComparison = left.clientName.localeCompare(right.clientName, 'pt-BR')
    if (clientComparison) return clientComparison
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function buildObligationProgress(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardObligationProgress[] {
  const range = periodDateRange(period.month, period.year)
  const obligationsInPeriod = bundle.obligations.filter((item) => isDateInRange(stringValue(item.due_date), range.start, range.end))
  const taxesInPeriod = bundle.taxes.filter((item) => isDateInRange(stringValue(item.due_date), range.start, range.end))
  const total = obligationsInPeriod.length + taxesInPeriod.length
  const completed =
    obligationsInPeriod.filter((item) => isClosedStatus(stringValue(item.status))).length +
    taxesInPeriod.filter((item) => isClosedStatus(stringValue(item.status))).length
  const overdue =
    obligationsInPeriod.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status))).length +
    taxesInPeriod.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status))).length
  const waitingClient = taxesInPeriod.filter((item) => !item.guide_document_id && !isClosedStatus(stringValue(item.status))).length
  const inProgress = Math.max(total - completed - overdue, 0)

  return [
    { category: 'total', href: buildHref('/obrigacoes-impostos', organizationId, period), label: 'Total', value: total },
    { category: 'completed', href: buildHref('/obrigacoes-impostos', organizationId, period, { status: 'completed' }), label: 'Concluidas', value: completed },
    { category: 'inProgress', href: buildHref('/obrigacoes-impostos', organizationId, period, { status: 'pending' }), label: 'Em andamento', value: inProgress },
    { category: 'waitingClient', href: buildHref('/documentos-contabeis', organizationId, period, { status: 'pending' }), label: 'Aguardando cliente', value: waitingClient },
    { category: 'overdue', href: buildHref('/obrigacoes-impostos', organizationId, period, { status: 'overdue' }), label: 'Atrasadas', value: overdue },
  ]
}

function buildUpcomingDeadlines(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardUpcomingDeadline[] {
  const today = formatDateInput(todayLocalDate())
  const nextMonth = formatDateInput(addDays(todayLocalDate(), 30))
  const employees = employeeMap(bundle.employees)
  const obligations = bundle.obligations
    .filter((item) => stringValue(item.due_date) >= today && stringValue(item.due_date) <= nextMonth && !isClosedStatus(stringValue(item.status)))
    .map((item) => ({
      actionHref: buildHref('/obrigacoes-impostos', organizationId, period, { clientId: stringValue(item.client_id), source: 'obligation' }),
      clientId: stringValue(item.client_id),
      clientName: clientRelationName(item.clients),
      dueDate: stringValue(item.due_date),
      id: `deadline-obligation-${stringValue(item.id)}`,
      responsibleName: employees.get(stringValue(item.responsible_user_id))?.name ?? '',
      status: severityFromDueDate(stringValue(item.due_date), stringValue(item.status)),
      title: stringValue(item.obligation_type) || 'Obrigacao',
    }))
  const taxes = bundle.taxes
    .filter((item) => stringValue(item.due_date) >= today && stringValue(item.due_date) <= nextMonth && !isClosedStatus(stringValue(item.status)))
    .map((item) => ({
      actionHref: buildHref('/obrigacoes-impostos', organizationId, period, { clientId: stringValue(item.client_id), source: 'tax' }),
      clientId: stringValue(item.client_id),
      clientName: clientRelationName(item.clients),
      dueDate: stringValue(item.due_date),
      id: `deadline-tax-${stringValue(item.id)}`,
      responsibleName: employees.get(stringValue(item.responsible_user_id))?.name ?? '',
      status: severityFromDueDate(stringValue(item.due_date), stringValue(item.status)),
      title: stringValue(item.tax_type) || stringValue(item.description) || 'Imposto',
    }))

  return [...obligations, ...taxes]
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.clientName.localeCompare(right.clientName, 'pt-BR'))
    .slice(0, 8)
}

function buildClientHealth(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardClientHealth[] {
  const rows = activeClients(bundle.clients).map((client) => {
    const clientId = stringValue(client.id)
    const clientObligations = bundle.obligations.filter((item) => stringValue(item.client_id) === clientId)
    const clientTaxes = bundle.taxes.filter((item) => stringValue(item.client_id) === clientId)
    const clientDocuments = bundle.documents.filter((item) => stringValue(item.client_id) === clientId)
    const clientCertificates = bundle.certificates.filter((item) => stringValue(item.client_id) === clientId)
    const clientSefaz = bundle.sefazSyncStates.filter((item) => stringValue(item.client_id) === clientId)
    const overdueObligations = clientObligations.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status))).length
    const overdueTaxes = clientTaxes.filter((item) => isOverdue(stringValue(item.due_date), stringValue(item.status))).length
    const pendingDocs = clientDocuments.filter((item) => stringValue(item.approval_status) === 'pending').length
    const criticalCertificate = clientCertificates.some((item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'critical')
    const warningCertificate = clientCertificates.some((item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'warning')
    const integrationError = clientSefaz.some((item) => integrationSeverity(stringValue(item.status), stringValue(item.last_status_message)) === 'critical')
    const reasons = [
      overdueObligations ? `${overdueObligations} obrigacao(oes) atrasada(s)` : '',
      overdueTaxes ? `${overdueTaxes} imposto(s) atrasado(s)` : '',
      pendingDocs ? `${pendingDocs} documento(s) aguardando cliente` : '',
      criticalCertificate ? 'certificado vencido ou vence em ate 7 dias' : '',
      warningCertificate ? 'certificado vence em ate 30 dias' : '',
      integrationError ? 'ultima sincronizacao SEFAZ falhou' : '',
      clientCertificates.length === 0 ? 'sem certificado cadastrado' : '',
    ].filter(Boolean)
    const status: DashboardClientHealthStatus = integrationError || criticalCertificate || overdueObligations || overdueTaxes
      ? 'critical'
      : clientCertificates.length === 0
      ? 'not_configured'
      : pendingDocs || warningCertificate
      ? 'attention'
      : 'healthy'
    const lastActivity = [
      ...clientObligations.map((item) => stringValue(item.updated_at || item.created_at)),
      ...clientTaxes.map((item) => stringValue(item.updated_at || item.created_at)),
      ...clientDocuments.map((item) => stringValue(item.updated_at || item.created_at)),
      ...clientSefaz.map((item) => stringValue(item.updated_at || item.last_sync_at)),
    ].filter(Boolean).sort().at(-1) ?? ''

    return {
      actionHref: buildHref(`/gestao-clientes/${clientId}`, organizationId, period),
      certificateSummary: clientCertificates.length ? (criticalCertificate ? 'Critico' : warningCertificate ? 'Vence em breve' : 'Valido') : 'Nao configurado',
      clientId,
      clientName: stringValue(client.company_name) || 'Cliente',
      documentSummary: pendingDocs ? `${pendingDocs} pendente(s)` : 'Sem pendencias',
      integrationSummary: integrationError ? 'Falha SEFAZ' : clientSefaz.length ? 'Monitorada' : 'Nao configurada',
      lastActivity,
      obligationSummary: overdueObligations ? `${overdueObligations} atrasada(s)` : 'Em dia',
      reasons: reasons.length ? reasons : ['sem pendencias operacionais atuais'],
      status,
      taxSummary: overdueTaxes ? `${overdueTaxes} atrasado(s)` : 'Em dia',
    } satisfies DashboardClientHealth
  })

  return rows.sort((left, right) => {
    const ranks: Record<DashboardClientHealthStatus, number> = {
      attention: 1,
      critical: 0,
      healthy: 4,
      not_configured: 2,
      processing: 3,
    }
    return ranks[left.status] - ranks[right.status] || left.clientName.localeCompare(right.clientName, 'pt-BR')
  }).slice(0, 8)
}

function buildIntegrationHealth(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardIntegrationHealth[] {
  const sefazErrors = bundle.sefazSyncStates.filter(
    (item) => integrationSeverity(stringValue(item.status), stringValue(item.last_status_message)) === 'critical',
  ).length
  const sefazSuccess = bundle.sefazSyncStates.filter((item) => integrationSeverity(stringValue(item.status)) === 'success').length
  const latestSefaz = bundle.sefazSyncStates.map((item) => stringValue(item.updated_at || item.last_sync_at)).filter(Boolean).sort().at(-1) ?? ''
  const certificateValid = bundle.certificates.filter((item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'success').length
  const certificateWarning = bundle.certificates.filter((item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'warning').length
  const certificateCritical = bundle.certificates.filter((item) => certificateSeverity(stringValue(item.valid_until), stringValue(item.status)) === 'critical').length
  const importErrors = bundle.importBatches.filter((item) => stringValue(item.status).toLowerCase().includes('error')).length
  const importDone = bundle.importBatches.filter((item) => stringValue(item.status).toLowerCase().includes('confirm')).length
  const latestImport = bundle.importBatches.map((item) => stringValue(item.created_at)).filter(Boolean).sort().at(-1) ?? ''

  const rows: DashboardIntegrationHealth[] = [
    {
      actionHref: buildHref('/gov/sefaz', organizationId, period),
      errors: sefazErrors,
      id: 'sefaz',
      lastRunAt: latestSefaz,
      name: 'SEFAZ',
      status: sefazErrors ? 'critical' : bundle.sefazSyncStates.length ? 'healthy' : 'not_configured',
      successes: sefazSuccess,
      summary: bundle.sefazSyncStates.length ? `${bundle.sefazSyncStates.length} empresa(s) monitorada(s)` : 'Nenhuma sincronizacao configurada',
    },
    {
      actionHref: buildHref('/gestao-clientes', organizationId, period, { tab: 'certificados' }),
      errors: certificateCritical,
      id: 'certificates',
      lastRunAt: '',
      name: 'Certificados',
      status: certificateCritical ? 'critical' : certificateWarning ? 'attention' : certificateValid ? 'healthy' : 'not_configured',
      successes: certificateValid,
      summary: `${certificateValid} valido(s), ${certificateWarning} vencendo, ${certificateCritical} critico(s)`,
    },
    {
      actionHref: buildHref('/integracoes', organizationId, period),
      errors: bundle.integrations.filter((item) => integrationSeverity(stringValue(item.status)) === 'critical').length,
      id: 'accounting-integrations',
      lastRunAt: bundle.syncRuns.map((item) => stringValue(item.finished_at)).filter(Boolean).sort().at(-1) ?? '',
      name: 'Integracoes contabeis',
      status: bundle.integrations.length ? 'partial' : 'not_configured',
      successes: bundle.syncRuns.filter((item) => stringValue(item.status).toLowerCase().includes('success')).length,
      summary: bundle.integrations.length ? `${bundle.integrations.length} integracao(oes) cadastrada(s)` : 'Nenhuma integracao contabil configurada',
    },
    {
      actionHref: buildHref('/integracoes', organizationId, period, { tab: 'importacoes' }),
      errors: importErrors,
      id: 'imports',
      lastRunAt: latestImport,
      name: 'Importacoes',
      status: importErrors ? 'attention' : importDone ? 'healthy' : 'not_configured',
      successes: importDone,
      summary: importDone || importErrors ? `${importDone} concluida(s), ${importErrors} com erro` : 'Nenhuma importacao recente',
    },
  ]

  return rows
}

function buildFinancialSummary(bundle: DashboardDataBundle): DashboardFinancialSummary {
  const activeClientRows = activeClients(bundle.clients)
  const projectedFromClients = activeClientRows
    .filter((client) => boolValue(client.is_monthly))
    .reduce((total, client) => total + numberValue(client.monthly_fee), 0)
  const projectedFromPayments = bundle.payments.reduce((total, payment) => total + numberValue(payment.amount), 0)
  const projectedFees = projectedFromPayments || projectedFromClients
  const receivedFees = bundle.payments
    .filter((payment) => stringValue(payment.status) === 'Pago')
    .reduce((total, payment) => total + numberValue(payment.amount), 0)
  const overduePayments = bundle.payments.filter(
    (payment) => stringValue(payment.status) === 'Vencido' || isOverdue(stringValue(payment.due_date), stringValue(payment.status)),
  )
  const overdueAmount = overduePayments.reduce((total, payment) => total + numberValue(payment.amount), 0)
  const overdueClients = new Set(overduePayments.map((payment) => stringValue(payment.client_id))).size
  const delinquencyRate = activeClientRows.length ? overdueClients / activeClientRows.length : 0

  return {
    averageRevenuePerClient: activeClientRows.length ? projectedFees / activeClientRows.length : 0,
    delinquencyRate,
    hasPermission: true,
    overdueAmount,
    overdueClients,
    projectedFees,
    receivedFees,
  }
}

function buildTeamLoad(period: DashboardPeriodFilter, bundle: DashboardDataBundle): DashboardTeamMemberLoad[] {
  if (!bundle.employees.length) return []

  const range = periodDateRange(period.month, period.year)
  const employees = bundle.employees.map((employee) => ({
    completedInPeriod: 0,
    id: stringValue(employee.id),
    name: stringValue(employee.name) || stringValue(employee.email) || 'Responsavel',
    nextSevenDays: 0,
    overdue: 0,
    role: stringValue(employee.role),
    today: 0,
  }))
  const byId = new Map(employees.map((employee) => [employee.id, employee]))

  bundle.obligations.forEach((obligation) => {
    const member = byId.get(stringValue(obligation.responsible_user_id))
    if (!member) return
    const dueDate = stringValue(obligation.due_date)
    const status = stringValue(obligation.status)
    if (isDueToday(dueDate, status)) member.today += 1
    if (isOverdue(dueDate, status)) member.overdue += 1
    if (!isClosedStatus(status) && daysFromToday(dueDate) >= 0 && daysFromToday(dueDate) <= 7) member.nextSevenDays += 1
    if (isClosedStatus(status) && isDateInRange(stringValue(obligation.updated_at), range.start, range.end)) member.completedInPeriod += 1
  })

  return employees.filter(
    (employee) => employee.completedInPeriod || employee.nextSevenDays || employee.overdue || employee.today,
  )
}

function buildRecentActivities(
  organizationId: string,
  period: DashboardPeriodFilter,
  bundle: DashboardDataBundle,
): DashboardRecentActivity[] {
  const clients = clientMap(bundle.clients)
  const mapRow = (row: AuditRow, origin: string): DashboardRecentActivity => {
    const client = clients.get(stringValue(row.client_id))
    const entityType = stringValue(row.entity_type)
    return {
      action: stringValue(row.action) || 'Atualizacao',
      clientName: client?.name ?? '',
      createdAt: stringValue(row.created_at),
      entityType,
      href: entityType.includes('client') && row.client_id
        ? buildHref(`/gestao-clientes/${stringValue(row.client_id)}`, organizationId, period)
        : buildHref('/fiscal', organizationId, period),
      id: `${origin}-${stringValue(row.id)}`,
      origin,
      userName: 'Sistema',
    }
  }

  return [
    ...bundle.accountingAudits.map((row) => mapRow(row, 'Auditoria contabil')),
    ...bundle.fiscalAudits.map((row) => mapRow(row, 'Auditoria fiscal')),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10)
}

function buildClientSearchItems(clients: ClientRow[]): DashboardClientSearchItem[] {
  return clients.map((client) => ({
    cnpj: stringValue(client.cnpj),
    id: stringValue(client.id),
    name: stringValue(client.company_name) || 'Cliente',
    tradeName: '',
  }))
}

function latestSyncAt(bundle: DashboardDataBundle) {
  return [
    ...bundle.sefazSyncStates.map((item) => stringValue(item.updated_at || item.last_sync_at)),
    ...bundle.syncRuns.map((item) => stringValue(item.finished_at)),
    ...bundle.integrations.map((item) => stringValue(item.last_sync_at || item.updated_at)),
  ].filter(Boolean).sort().at(-1) ?? ''
}

async function loadDashboardBundle(
  organizationId: string,
  period: DashboardPeriodFilter,
  issues: DashboardSourceIssue[],
  signal?: AbortSignal,
): Promise<DashboardDataBundle> {
  const range = periodDateRange(period.month, period.year)
  const today = todayLocalDate()
  const horizon = formatDateInput(addDays(today, 30))

  const clientsQuery = supabase
    .from('clients')
    .select('id, company_name, cnpj, active, created_at, email, city, state, monthly_fee, is_monthly')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(500)

  const paymentsQuery = supabase
    .from('client_payments')
    .select('id, client_id, amount, due_date, status')
    .eq('organization_id', organizationId)
    .eq('competence_month', period.month)
    .eq('competence_year', period.year)
    .limit(500)

  const obligationsQuery = supabase
    .from('accounting_obligations')
    .select('id, client_id, obligation_type, due_date, status, responsible_user_id, guide_document_id, receipt_document_id, created_at, updated_at, clients(company_name)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .lte('due_date', horizon)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const taxesQuery = supabase
    .from('accounting_tax_records')
    .select('id, client_id, tax_type, description, amount, total_amount, due_date, status, responsible_user_id, guide_document_id, receipt_document_id, created_at, updated_at, clients(company_name)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .lte('due_date', horizon)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const documentsQuery = supabase
    .from('accounting_documents')
    .select('id, client_id, category, description, status, approval_status, due_date, responsible_user_id, created_at, updated_at, clients(company_name)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(300)

  const certificatesQuery = supabase
    .from('digital_certificates')
    .select('id, client_id, holder_name, tax_id, valid_until, status, environment, state_uf, updated_at, clients(company_name)')
    .eq('organization_id', organizationId)
    .limit(300)

  const integrationsQuery = supabase
    .from('accounting_integrations')
    .select('id, name, provider, status, active, last_sync_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .limit(100)

  const syncRunsQuery = supabase
    .from('accounting_sync_runs')
    .select('id, integration_id, client_id, provider, status, finished_at, error_count')
    .eq('organization_id', organizationId)
    .gte('started_at', range.start)
    .order('started_at', { ascending: false })
    .limit(100)

  const sefazStatesQuery = supabase
    .from('nfe_dfe_sync_states')
    .select('client_id, status, last_status_message, last_sync_at, updated_at')
    .eq('organization_id', organizationId)
    .limit(200)

  const importBatchesQuery = supabase
    .from('accounting_import_batches')
    .select('id, status, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', range.start)
    .order('created_at', { ascending: false })
    .limit(100)

  const employeesQuery = supabase
    .from('employees')
    .select('id, name, role, email')
    .eq('organization_id', organizationId)
    .limit(100)

  const accountingAuditsQuery = supabase
    .from('accounting_audit_logs')
    .select('id, entity_type, entity_id, action, created_at, client_id, origin')
    .eq('organization_id', organizationId)
    .gte('created_at', range.start)
    .order('created_at', { ascending: false })
    .limit(20)

  const fiscalAuditsQuery = supabase
    .from('fiscal_audit_logs')
    .select('id, entity_type, entity_id, action, created_at, client_id, origin')
    .eq('organization_id', organizationId)
    .gte('created_at', range.start)
    .order('created_at', { ascending: false })
    .limit(20)

  if (signal) {
    clientsQuery.abortSignal(signal)
    paymentsQuery.abortSignal(signal)
    obligationsQuery.abortSignal(signal)
    taxesQuery.abortSignal(signal)
    documentsQuery.abortSignal(signal)
    certificatesQuery.abortSignal(signal)
    integrationsQuery.abortSignal(signal)
    syncRunsQuery.abortSignal(signal)
    sefazStatesQuery.abortSignal(signal)
    importBatchesQuery.abortSignal(signal)
    employeesQuery.abortSignal(signal)
    accountingAuditsQuery.abortSignal(signal)
    fiscalAuditsQuery.abortSignal(signal)
  }

  const [
    clients,
    payments,
    obligations,
    taxes,
    documents,
    certificates,
    integrations,
    syncRuns,
    sefazSyncStates,
    importBatches,
    employees,
    accountingAudits,
    fiscalAudits,
  ] = await Promise.all([
    optionalList<ClientRow>('clients', clientsQuery, issues),
    optionalList<PaymentRow>('client_payments', paymentsQuery, issues),
    optionalList<ObligationRow>('accounting_obligations', obligationsQuery, issues),
    optionalList<TaxRow>('accounting_tax_records', taxesQuery, issues),
    optionalList<DocumentRow>('accounting_documents', documentsQuery, issues),
    optionalList<CertificateRow>('digital_certificates', certificatesQuery, issues),
    optionalList<IntegrationRow>('accounting_integrations', integrationsQuery, issues),
    optionalList<SyncRunRow>('accounting_sync_runs', syncRunsQuery, issues),
    optionalList<SefazSyncStateRow>('nfe_dfe_sync_states', sefazStatesQuery, issues),
    optionalList<ImportBatchRow>('accounting_import_batches', importBatchesQuery, issues),
    optionalList<EmployeeRow>('employees', employeesQuery, issues),
    optionalList<AuditRow>('accounting_audit_logs', accountingAuditsQuery, issues),
    optionalList<AuditRow>('fiscal_audit_logs', fiscalAuditsQuery, issues),
  ])

  return {
    accountingAudits,
    certificates,
    clients,
    documents,
    employees,
    fiscalAudits,
    importBatches,
    integrations,
    obligations,
    payments,
    sefazSyncStates,
    syncRuns,
    taxes,
  }
}

export async function loadOperationalDashboard(
  organizationId: string,
  period: DashboardPeriodFilter,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  const issues: DashboardSourceIssue[] = []
  const bundle = await loadDashboardBundle(organizationId, period, issues, signal)

  return {
    attentionItems: buildAttentionItems(organizationId, period, bundle),
    clientHealth: buildClientHealth(organizationId, period, bundle),
    clients: buildClientSearchItems(bundle.clients),
    financial: buildFinancialSummary(bundle),
    integrationHealth: buildIntegrationHealth(organizationId, period, bundle),
    lastSyncAt: latestSyncAt(bundle),
    metrics: buildMetrics(organizationId, period, bundle),
    obligationProgress: buildObligationProgress(organizationId, period, bundle),
    recentActivities: buildRecentActivities(organizationId, period, bundle),
    sourceIssues: issues,
    teamLoad: buildTeamLoad(period, bundle),
    upcomingDeadlines: buildUpcomingDeadlines(organizationId, period, bundle),
  }
}

export function formatDashboardMoney(value: number) {
  return moneyFormatter.format(value)
}
