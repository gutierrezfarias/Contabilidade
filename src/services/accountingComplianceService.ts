import { supabase } from './supabase'
import { uploadAccountingDocument } from './accountingDocumentsService'
import { listAccountingClients } from './accountingRepository'
import { createEmptyPaginatedResult, createPaginatedResult, getPaginationRange } from '../types/pagination'
import type { AccountingDocumentApprovalStatus } from '../types/accountingDocuments'
import type {
  AccountingAlertItem,
  AccountingObligationInput,
  AccountingObligationPage,
  AccountingObligationRecord,
  AccountingObligationStatus,
  AccountingRecurrenceType,
  AccountingTaxInput,
  AccountingTaxPage,
  AccountingTaxRecordDetailed,
  AccountingTaxStatus,
  ClientHealthSummary,
  ClientRegularityItem,
  ComplianceFilters,
} from '../types/accountingCompliance'

type Row = Record<string, unknown>

function databaseError(message: string, fallback: string) {
  const migrationHint =
    'Rode a migration 20260622_obligations_taxes_alerts_regularidade.sql no Supabase para habilitar obrigacoes, impostos e regularidade.'
  return message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find')
    ? migrationHint
    : fallback
}

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(databaseError(error.message, fallback))
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function dateOrNull(value: string) {
  if (!value) return null
  return value.length === 7 ? `${value}-01` : value
}

function dateOnly(value: unknown) {
  return stringValue(value).split('T')[0] ?? ''
}

function clientNameFromRow(row: Row) {
  const clients = row.clients
  if (clients && typeof clients === 'object' && 'company_name' in clients) {
    return stringValue((clients as Row).company_name)
  }
  return 'Cliente'
}

function todayDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function daysUntil(value: string) {
  const date = parseLocalDate(value)
  if (!date) return Number.POSITIVE_INFINITY
  return Math.ceil((date.getTime() - todayDate().getTime()) / 86400000)
}

function addMonths(value: string, months: number) {
  const date = parseLocalDate(value)
  if (!date) return value
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

function recurrenceStep(recurrenceType: AccountingRecurrenceType) {
  return {
    annual: 12,
    monthly: 1,
    none: 0,
    quarterly: 3,
    semiannual: 6,
  }[recurrenceType]
}

function normalizeObligationStatus(status: string): AccountingObligationStatus {
  const allowed = ['pending', 'in_progress', 'processing', 'delivered', 'late', 'overdue', 'exempt', 'cancelled']
  return (allowed.includes(status) ? status : 'pending') as AccountingObligationStatus
}

function normalizeTaxStatus(status: string): AccountingTaxStatus {
  const allowed = ['pending', 'available', 'sent', 'viewed', 'paid', 'overdue', 'installment', 'parcelled', 'cancelled', 'ignored']
  return (allowed.includes(status) ? status : 'pending') as AccountingTaxStatus
}

function mapObligation(row: Row): AccountingObligationRecord {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id),
    clientId: stringValue(row.client_id),
    clientName: clientNameFromRow(row),
    obligationType: stringValue(row.obligation_type),
    competence: dateOnly(row.competence),
    periodStart: dateOnly(row.period_start),
    periodEnd: dateOnly(row.period_end),
    dueDate: dateOnly(row.due_date),
    deliveryDate: dateOnly(row.delivery_date),
    status: normalizeObligationStatus(stringValue(row.status)),
    responsibleUserId: stringValue(row.responsible_user_id),
    recurrenceType: (stringValue(row.recurrence_type) || 'none') as AccountingRecurrenceType,
    recurrenceUntil: dateOnly(row.recurrence_until),
    protocol: stringValue(row.protocol),
    notes: stringValue(row.notes),
    guideDocumentId: stringValue(row.guide_document_id || row.document_id),
    receiptDocumentId: stringValue(row.receipt_document_id),
    alertDaysBefore: numberValue(row.alert_days_before) || 7,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  }
}

function mapTax(row: Row): AccountingTaxRecordDetailed {
  const principal = numberValue(row.principal_amount)
  const total = numberValue(row.total_amount) || numberValue(row.amount)
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id),
    clientId: stringValue(row.client_id),
    clientName: clientNameFromRow(row),
    taxType: stringValue(row.tax_type),
    description: stringValue(row.description),
    competence: dateOnly(row.competence),
    dueDate: dateOnly(row.due_date),
    calculationDate: dateOnly(row.calculation_date),
    paidAt: dateOnly(row.paid_at),
    status: normalizeTaxStatus(stringValue(row.status)),
    principalAmount: principal || total,
    penaltyAmount: numberValue(row.penalty_amount),
    interestAmount: numberValue(row.interest_amount),
    totalAmount: total,
    amount: numberValue(row.amount) || total,
    barcode: stringValue(row.barcode),
    pixCode: stringValue(row.pix_code),
    guideDocumentId: stringValue(row.guide_document_id),
    receiptDocumentId: stringValue(row.receipt_document_id),
    installmentNumber: numberValue(row.installment_number),
    installmentTotal: numberValue(row.installment_total),
    notes: stringValue(row.notes),
    alertDaysBefore: numberValue(row.alert_days_before) || 7,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  }
}

function statusWithDueDate(status: AccountingObligationStatus | AccountingTaxStatus, dueDate: string) {
  if (['paid', 'delivered', 'cancelled', 'exempt', 'ignored'].includes(status)) return status
  return dueDate && daysUntil(dueDate) < 0 ? 'overdue' : status
}

function obligationPayload(organizationId: string, input: AccountingObligationInput, userId: string | null) {
  const status = statusWithDueDate(input.status, input.dueDate)
  return {
    alert_days_before: input.alertDaysBefore || 7,
    client_id: input.clientId,
    completed_at: status === 'delivered' ? new Date().toISOString() : null,
    competence: dateOrNull(input.competence),
    delivery_date: dateOrNull(input.deliveryDate),
    due_date: dateOrNull(input.dueDate),
    guide_document_id: input.guideDocumentId || null,
    idempotency_key: `manual:obligation:${input.clientId}:${input.obligationType.trim().toLowerCase()}:${dateOrNull(input.competence)}`,
    metadata: {
      source: 'obligations_taxes_page',
    },
    notes: input.notes,
    obligation_type: input.obligationType.trim(),
    organization_id: organizationId,
    period_end: dateOrNull(input.periodEnd),
    period_start: dateOrNull(input.periodStart),
    protocol: input.protocol,
    provider: 'manual',
    receipt_document_id: input.receiptDocumentId || null,
    recurrence_type: input.recurrenceType,
    recurrence_until: dateOrNull(input.recurrenceUntil),
    responsible_user_id: input.responsibleUserId || null,
    status,
    updated_by: userId,
  }
}

function taxPayload(organizationId: string, input: AccountingTaxInput, userId: string | null) {
  const principal = Number(input.principalAmount || 0)
  const penalty = Number(input.penaltyAmount || 0)
  const interest = Number(input.interestAmount || 0)
  const total = Number(input.totalAmount || principal + penalty + interest)
  const status = statusWithDueDate(input.status, input.dueDate)
  return {
    alert_days_before: input.alertDaysBefore || 7,
    amount: total,
    barcode: input.barcode,
    calculation_date: dateOrNull(input.calculationDate),
    client_id: input.clientId,
    competence: dateOrNull(input.competence),
    description: input.description,
    due_date: dateOrNull(input.dueDate),
    guide_document_id: input.guideDocumentId || null,
    idempotency_key: `manual:tax:${input.clientId}:${input.taxType.trim().toLowerCase()}:${dateOrNull(input.competence)}:${dateOrNull(input.dueDate)}`,
    installment_number: input.installmentNumber || null,
    installment_total: input.installmentTotal || null,
    interest_amount: interest,
    metadata: {
      source: 'obligations_taxes_page',
    },
    notes: input.notes,
    organization_id: organizationId,
    paid_at: dateOrNull(input.paidAt),
    penalty_amount: penalty,
    pix_code: input.pixCode,
    principal_amount: principal || total,
    provider: 'manual',
    receipt_document_id: input.receiptDocumentId || null,
    source: 'manual',
    status,
    tax_type: input.taxType.trim(),
    total_amount: total,
    updated_by: userId,
  }
}

export async function listObligations(organizationId: string, filters: ComplianceFilters): Promise<AccountingObligationPage> {
  if (!organizationId) return createEmptyPaginatedResult<AccountingObligationRecord>(filters.page, filters.pageSize)

  const { from, to } = getPaginationRange(filters.page, filters.pageSize)
  let query = supabase
    .from('accounting_obligations')
    .select('*, clients(company_name)', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(from, to)

  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.competence) query = query.eq('competence', dateOrNull(filters.competence))
  if (filters.search.trim()) query = query.ilike('obligation_type', `%${filters.search.trim()}%`)

  const { count, data, error } = await query
  fail(error, 'Nao foi possivel carregar obrigacoes.')
  return createPaginatedResult(((data ?? []) as Row[]).map(mapObligation), filters.page, filters.pageSize, count ?? 0)
}

export async function listTaxes(organizationId: string, filters: ComplianceFilters): Promise<AccountingTaxPage> {
  if (!organizationId) return createEmptyPaginatedResult<AccountingTaxRecordDetailed>(filters.page, filters.pageSize)

  const { from, to } = getPaginationRange(filters.page, filters.pageSize)
  let query = supabase
    .from('accounting_tax_records')
    .select('*, clients(company_name)', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(from, to)

  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.competence) query = query.eq('competence', dateOrNull(filters.competence))
  if (filters.search.trim()) query = query.or(`tax_type.ilike.%${filters.search.trim()}%,description.ilike.%${filters.search.trim()}%`)

  const { count, data, error } = await query
  fail(error, 'Nao foi possivel carregar impostos/guias.')
  return createPaginatedResult(((data ?? []) as Row[]).map(mapTax), filters.page, filters.pageSize, count ?? 0)
}

export async function saveObligation(organizationId: string, input: AccountingObligationInput, id = '') {
  if (!input.clientId || !input.obligationType || !input.competence) {
    throw new Error('Informe cliente, tipo de obrigacao e competencia.')
  }

  const { data: authData } = await supabase.auth.getUser()
  const payload = obligationPayload(organizationId, input, authData.user?.id ?? null)

  if (id) {
    const { error } = await supabase.from('accounting_obligations').update(payload).eq('id', id).eq('organization_id', organizationId)
    fail(error, 'Nao foi possivel atualizar a obrigacao.')
    return id
  }

  const { data, error } = await supabase
    .from('accounting_obligations')
    .insert({ ...payload, created_by: authData.user?.id ?? null })
    .select('id')
    .single()

  fail(error, 'Nao foi possivel salvar a obrigacao.')
  return stringValue(data?.id)
}

export async function saveTax(organizationId: string, input: AccountingTaxInput, id = '') {
  if (!input.clientId || !input.taxType || !input.competence) {
    throw new Error('Informe cliente, tipo de imposto e competencia.')
  }

  const { data: authData } = await supabase.auth.getUser()
  const payload = taxPayload(organizationId, input, authData.user?.id ?? null)

  if (id) {
    const { error } = await supabase.from('accounting_tax_records').update(payload).eq('id', id).eq('organization_id', organizationId)
    fail(error, 'Nao foi possivel atualizar o imposto/guia.')
    return id
  }

  const { data, error } = await supabase
    .from('accounting_tax_records')
    .insert({ ...payload, created_by: authData.user?.id ?? null })
    .select('id')
    .single()

  fail(error, 'Nao foi possivel salvar o imposto/guia.')
  return stringValue(data?.id)
}

export async function archiveObligation(organizationId: string, id: string) {
  const { data: authData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('accounting_obligations')
    .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null, updated_by: authData.user?.id ?? null })
    .eq('id', id)
    .eq('organization_id', organizationId)

  fail(error, 'Nao foi possivel arquivar a obrigacao.')
}

export async function archiveTax(organizationId: string, id: string) {
  const { data: authData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('accounting_tax_records')
    .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null, updated_by: authData.user?.id ?? null })
    .eq('id', id)
    .eq('organization_id', organizationId)

  fail(error, 'Nao foi possivel arquivar o imposto/guia.')
}

export async function uploadComplianceDocument(
  organizationId: string,
  clientId: string,
  category: 'Guia de imposto' | 'Recibo' | 'Obrigacao fiscal',
  file: File,
  competence: string,
  description: string,
) {
  return uploadAccountingDocument(
    organizationId,
    {
      approvalStatus: 'approved' as AccountingDocumentApprovalStatus,
      category,
      clientId,
      competence,
      description,
      documentType: category,
      dueDate: '',
      responsibleUserId: '',
    },
    file,
  )
}

export async function generateRecurringObligations(organizationId: string, base: AccountingObligationInput) {
  const step = recurrenceStep(base.recurrenceType)
  if (!step || !base.recurrenceUntil) {
    return 0
  }

  const existing = await listObligations(organizationId, {
    clientId: base.clientId,
    competence: '',
    page: 1,
    pageSize: 100,
    search: base.obligationType,
    status: '',
  })
  const existingKeys = new Set(existing.data.map((item) => `${item.obligationType.toLowerCase()}|${item.competence}`))
  let created = 0
  let nextCompetence = addMonths(dateOrNull(base.competence) ?? '', step)
  let nextDueDate = addMonths(dateOrNull(base.dueDate) ?? '', step)

  while (nextCompetence && nextCompetence <= base.recurrenceUntil) {
    const key = `${base.obligationType.toLowerCase()}|${nextCompetence}`
    if (!existingKeys.has(key)) {
      await saveObligation(organizationId, {
        ...base,
        competence: nextCompetence,
        dueDate: nextDueDate,
        periodEnd: base.periodEnd ? addMonths(base.periodEnd, step * (created + 1)) : '',
        periodStart: base.periodStart ? addMonths(base.periodStart, step * (created + 1)) : '',
        recurrenceType: 'none',
        recurrenceUntil: '',
      })
      existingKeys.add(key)
      created += 1
    }
    nextCompetence = addMonths(nextCompetence, step)
    nextDueDate = addMonths(nextDueDate, step)
  }

  return created
}

export async function upsertComplianceAlerts(organizationId: string) {
  const [obligations, taxes] = await Promise.all([
    listObligations(organizationId, { clientId: '', competence: '', page: 1, pageSize: 100, search: '', status: '' }),
    listTaxes(organizationId, { clientId: '', competence: '', page: 1, pageSize: 100, search: '', status: '' }),
  ])

  const alerts = buildComplianceAlerts(obligations.data, taxes.data)
  await Promise.all(
    alerts.map((alert) =>
      supabase.rpc('upsert_accounting_alert_event', {
        p_alert_type: alert.alertType,
        p_client_id: alert.clientId,
        p_due_date: dateOrNull(alert.dueDate),
        p_entity_id: alert.entityId,
        p_entity_type: alert.entityType,
        p_idempotency_key: `${alert.entityType}:${alert.entityId}:${alert.alertType}:${alert.dueDate}`,
        p_message: alert.message,
        p_organization_id: organizationId,
        p_severity: alert.severity,
        p_title: alert.title,
      }),
    ),
  )
  return alerts.length
}

export function buildComplianceAlerts(
  obligations: AccountingObligationRecord[],
  taxes: AccountingTaxRecordDetailed[],
): AccountingAlertItem[] {
  const alerts: AccountingAlertItem[] = []
  const addAlert = (
    item: AccountingObligationRecord | AccountingTaxRecordDetailed,
    entityType: 'obligation' | 'tax',
    alertType: string,
    severity: 'warning' | 'critical',
    title: string,
    message: string,
  ) => {
    alerts.push({
      alertType,
      clientId: item.clientId,
      clientName: item.clientName,
      dueDate: item.dueDate,
      entityId: item.id,
      entityType,
      id: `${entityType}:${item.id}:${alertType}`,
      message,
      organizationId: item.organizationId,
      severity,
      status: 'open',
      title,
    })
  }

  obligations.forEach((obligation) => {
    if (['delivered', 'cancelled', 'exempt'].includes(obligation.status)) return
    const remaining = daysUntil(obligation.dueDate)
    if (remaining < 0) {
      addAlert(obligation, 'obligation', 'obligation_due', 'critical', 'Obrigacao vencida', `${obligation.obligationType} venceu ha ${Math.abs(remaining)} dia(s).`)
    } else if (remaining <= obligation.alertDaysBefore) {
      addAlert(obligation, 'obligation', 'obligation_due', 'warning', 'Obrigacao perto do vencimento', `${obligation.obligationType} vence em ${remaining} dia(s).`)
    }
    if (!obligation.guideDocumentId && obligation.status === 'pending') {
      addAlert(obligation, 'obligation', 'missing_guide', 'warning', 'Obrigacao sem guia/documento', `${obligation.obligationType} ainda nao tem guia ou documento vinculado.`)
    }
  })

  taxes.forEach((tax) => {
    if (['paid', 'cancelled', 'ignored'].includes(tax.status)) return
    const remaining = daysUntil(tax.dueDate)
    if (remaining < 0) {
      addAlert(tax, 'tax', 'tax_due', 'critical', 'Imposto vencido', `${tax.taxType} venceu ha ${Math.abs(remaining)} dia(s).`)
    } else if (remaining <= tax.alertDaysBefore) {
      addAlert(tax, 'tax', 'tax_due', 'warning', 'Imposto perto do vencimento', `${tax.taxType} vence em ${remaining} dia(s).`)
    }
    if (!tax.guideDocumentId) {
      addAlert(tax, 'tax', 'missing_guide', 'warning', 'Imposto sem guia', `${tax.taxType} ainda nao possui guia anexada.`)
    }
    if (tax.status !== 'paid' && tax.guideDocumentId && !tax.receiptDocumentId && remaining < 0) {
      addAlert(tax, 'tax', 'missing_receipt', 'critical', 'Imposto sem comprovante', `${tax.taxType} esta vencido e sem recibo de pagamento.`)
    }
  })

  return alerts
}

export async function buildRegularityAndHealth(organizationId: string): Promise<ClientHealthSummary[]> {
  const [clients, obligations, taxes, certificatesResult, documentsResult] = await Promise.all([
    listAccountingClients(organizationId),
    listObligations(organizationId, { clientId: '', competence: '', page: 1, pageSize: 100, search: '', status: '' }),
    listTaxes(organizationId, { clientId: '', competence: '', page: 1, pageSize: 100, search: '', status: '' }),
    supabase.from('digital_certificates').select('id, client_id, status, valid_until').eq('organization_id', organizationId),
    supabase
      .from('accounting_documents')
      .select('id, client_id, approval_status, due_date, category')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .limit(200),
  ])

  fail(certificatesResult.error, 'Nao foi possivel carregar certificados para regularidade.')
  fail(documentsResult.error, 'Nao foi possivel carregar documentos para regularidade.')

  const certificates = ((certificatesResult.data ?? []) as Row[])
  const documents = ((documentsResult.data ?? []) as Row[])
  const alerts = buildComplianceAlerts(obligations.data, taxes.data)

  return clients.map((client) => {
    const items: ClientRegularityItem[] = []
    const push = (status: ClientRegularityItem['status'], source: string, title: string, detail: string, impact: string, action: string, date = '') => {
      items.push({
        action,
        clientId: client.id,
        clientName: client.companyName,
        date,
        detail,
        id: `${client.id}:${source}:${title}:${date}`,
        impact,
        source,
        status,
        title,
      })
    }

    if (!client.active) {
      push('critical', 'Cadastro', 'Cliente inativo', 'O cliente esta marcado como inativo no cadastro.', 'Pode bloquear operacoes e acompanhamento.', 'Revise o cadastro do cliente.')
    } else {
      push('regular', 'Cadastro', 'Cliente ativo', 'Cadastro ativo no sistema.', 'Sem bloqueio cadastral local.', 'Manter dados atualizados.')
    }

    const clientCertificates = certificates.filter((certificate) => stringValue(certificate.client_id) === client.id)
    if (clientCertificates.length === 0) {
      push('attention', 'Certificado digital', 'Sem certificado cadastrado', 'Nenhum certificado digital foi encontrado para este cliente.', 'SEFAZ/e-CAC nao conseguem operar automaticamente.', 'Cadastre um certificado valido.')
    }
    clientCertificates.forEach((certificate) => {
      const validUntil = dateOnly(certificate.valid_until)
      const remaining = daysUntil(validUntil)
      if (remaining < 0 || stringValue(certificate.status) !== 'Ativo') {
        push('critical', 'Certificado digital', 'Certificado vencido ou inativo', `Status: ${stringValue(certificate.status) || 'Nao informado'}.`, 'Consultas fiscais podem falhar.', 'Atualize o certificado.', validUntil)
      } else if (remaining <= 30) {
        push('attention', 'Certificado digital', 'Certificado proximo do vencimento', `Vence em ${remaining} dia(s).`, 'Risco de parada nas consultas fiscais.', 'Renove antes do vencimento.', validUntil)
      }
    })

    alerts.filter((alert) => alert.clientId === client.id).forEach((alert) => {
      push(
        alert.severity === 'critical' ? 'critical' : 'attention',
        alert.entityType === 'tax' ? 'Impostos/guias' : 'Obrigacoes',
        alert.title,
        alert.message,
        'Pode gerar atraso, multa ou perda de controle fiscal.',
        'Abra Obrigações e Impostos e regularize o item.',
        alert.dueDate,
      )
    })

    documents
      .filter((document) => stringValue(document.client_id) === client.id && stringValue(document.approval_status) === 'pending')
      .forEach((document) => {
        push('attention', 'Documentos', 'Documento aguardando aprovacao', `Categoria: ${stringValue(document.category) || 'Documento'}.`, 'O cliente pode estar aguardando retorno.', 'Aprove, rejeite ou entregue o documento.', dateOnly(document.due_date))
      })

    const critical = items.filter((item) => item.status === 'critical').length
    const attention = items.filter((item) => item.status === 'attention').length
    const score = Math.max(0, 100 - critical * 25 - attention * 10)

    return {
      clientId: client.id,
      clientName: client.companyName,
      items,
      score,
      status: critical ? 'critical' : attention ? 'attention' : 'regular',
    }
  })
}
