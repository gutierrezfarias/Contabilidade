import { supabase } from './supabase'
import type { FiscalDocumentDirection, NfeDocument } from '../types/accounting'

type NfeInput = Omit<
  NfeDocument,
  | 'id'
  | 'status'
  | 'issueDate'
  | 'documentModel'
  | 'documentDirection'
  | 'nsu'
  | 'emitterName'
  | 'emitterDocument'
  | 'destinationName'
  | 'destinationDocument'
  | 'protocolNumber'
  | 'manifestationStatus'
  | 'manifestationDeadline'
  | 'rawXml'
  | 'rawSummary'
  | 'sefazStatusCode'
  | 'lastConsultedAt'
>
type SefazConsultationResponse = {
  documentsImported: number
  lastNsu?: string
  maxNsu?: string
  message: string
  statusCode?: string
  statusMessage?: string
}

type SefazAccessKeyResponse = {
  accessKey?: string
  message: string
  statusCode?: string
  statusMessage?: string
}

export type SefazQueryType = 'summary' | 'complete'

export type SefazDocumentFilters = {
  dateRange?: string
  direction?: FiscalDocumentDirection
  search?: string
  searchField?: string
}

export type ManifestationEventType = '210200' | '210210' | '210220' | '210240'

export type SefazSyncState = {
  id: string
  organizationId: string
  clientId: string
  certificateId: string
  environment: string
  stateUf: string
  lastNsu: string
  maxNsu: string
  lastStatusCode: string
  lastStatusMessage: string
  lastSuccessAt: string
  lastErrorAt: string
  lastErrorMessage: string
  updatedAt: string
}

function fail(error: { message: string } | null, fallback: string) {
  if (!error) return
  throw new Error(
    error.message.toLowerCase().includes('does not exist')
      ? 'Execute a migration de DF-e/NF-e no Supabase.'
      : fallback,
  )
}

function mapDfe(row: Record<string, unknown>): NfeDocument {
  const summary = (row.summary_data ?? {}) as Record<string, unknown>
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    certificateId: String(row.certificate_id ?? ''),
    documentModel: String(row.document_type ?? row.schema_name ?? 'NF-e'),
    documentDirection: String(row.direction ?? 'recebida') as FiscalDocumentDirection,
    nsu: String(row.nsu ?? ''),
    accessKey: String(row.access_key ?? ''),
    number: String(summary.numero ?? ''),
    series: String(summary.serie ?? ''),
    issueDate: String(row.issue_date ?? ''),
    amount: Number(row.total_value ?? 0),
    status: String(row.nfe_status ?? 'Consultada') as NfeDocument['status'],
    emitterName: String(row.issuer_name ?? ''),
    emitterDocument: String(row.issuer_cnpj ?? ''),
    destinationName: String(row.recipient_name ?? ''),
    destinationDocument: String(row.recipient_cnpj ?? ''),
    operationType: String(summary.natOp ?? 'Consulta DF-e'),
    recipientName: String(row.recipient_name ?? ''),
    recipientDocument: String(row.recipient_cnpj ?? ''),
    description: String(row.document_type ?? row.schema_name ?? ''),
    protocolNumber: String(summary.nProt ?? ''),
    manifestationStatus: String(row.manifestation_status ?? 'Pendente'),
    manifestationDeadline: '',
    rawSummary: summary,
    sefazStatusCode: String(summary.cStat ?? ''),
    lastConsultedAt: String(row.updated_at ?? ''),
    xmlUrl: row.has_full_xml ? `/api/dfe/documents/${row.id}/xml` : undefined,
  }
}

function mapSefazSyncState(row: Record<string, unknown>): SefazSyncState {
  return {
    certificateId: String(row.certificate_id ?? ''),
    clientId: String(row.client_id ?? ''),
    environment: String(row.environment ?? ''),
    id: String(row.id ?? ''),
    lastErrorAt: '',
    lastErrorMessage: String(row.status ?? '') === 'error' ? String(row.last_status_message ?? '') : '',
    lastNsu: String(row.last_nsu ?? ''),
    lastStatusCode: String(row.last_status_code ?? ''),
    lastStatusMessage: String(row.last_status_message ?? ''),
    lastSuccessAt: String(row.last_sync_at ?? ''),
    maxNsu: String(row.max_nsu ?? ''),
    organizationId: String(row.organization_id ?? ''),
    stateUf: '',
    updatedAt: String(row.updated_at ?? ''),
  }
}

export async function listNfeDocuments(
  organizationId: string | null,
  clientId?: string,
  filters: SefazDocumentFilters = {},
) {
  if (!organizationId) return []

  let query = supabase
    .from('nfe_dfe_documents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('issue_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  if (filters.direction) {
    query = query.eq('direction', filters.direction)
  }

  if (filters.dateRange && filters.dateRange !== 'all') {
    const days = Number(filters.dateRange)
    if (Number.isFinite(days) && days > 0) {
      const from = new Date()
      from.setDate(from.getDate() - days)
      query = query.gte('issue_date', from.toISOString().slice(0, 10))
    }
  }

  const { data, error } = await query
  fail(error, 'Nao foi possivel carregar NF-e.')
  const documents = (data ?? []).map((row) => mapDfe(row as Record<string, unknown>))

  const search = (filters.search ?? '').trim().toLowerCase()
  if (!search) return documents

  return documents.filter((document) => {
    const values = [
      document.number,
      document.accessKey,
      document.emitterName,
      document.emitterDocument,
      document.destinationName,
      document.destinationDocument,
      document.recipientName,
      document.recipientDocument,
    ]
    return values.some((value) => value.toLowerCase().includes(search))
  })
}

export async function createNfeDraft(input: NfeInput) {
  const { error } = await supabase.from('nfe_documents').insert({
    organization_id: input.organizationId,
    client_id: input.clientId,
    certificate_id: input.certificateId || null,
    access_key: input.accessKey,
    number: input.number,
    series: input.series,
    amount: input.amount,
    status: 'Rascunho',
    document_direction: 'emitida',
    operation_type: input.operationType,
    recipient_name: input.recipientName,
    recipient_document: input.recipientDocument,
    destination_name: input.recipientName,
    destination_document: input.recipientDocument,
    description: input.description,
  })

  fail(error, 'Nao foi possivel salvar o rascunho da NF-e.')
}

export async function getLatestSefazSyncState(input: {
  certificateId?: string
  clientId?: string
  organizationId: string | null
}) {
  if (!input.organizationId || !input.clientId || !input.certificateId) return null

  const { data, error } = await supabase
    .from('nfe_dfe_sync_states')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('client_id', input.clientId)
    .eq('certificate_id', input.certificateId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  fail(error, 'Nao foi possivel carregar o controle de NSU.')
  return data ? mapSefazSyncState(data) : null
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Entre novamente para consultar a SEFAZ.')
  }

  return token
}

export async function consultDfeFromSefaz(input: {
  certificateId: string
  clientId: string
  direction?: FiscalDocumentDirection
  organizationId: string
  queryType?: SefazQueryType
}) {
  const token = await getAccessToken()
  const response = await fetch('/api/sefaz/consultar-dfe', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      certificateId: input.certificateId,
      clientId: input.clientId,
      maxCycles: input.queryType === 'complete' ? 8 : 3,
      organizationId: input.organizationId,
      resetNsu: input.queryType === 'complete',
    }),
  })
  const result = (await response.json().catch(() => ({}))) as Partial<SefazConsultationResponse> & {
    error?: string
    ok?: boolean
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? 'Nao foi possivel consultar NF-e/DF-e na SEFAZ.')
  }

  return {
    documentsImported: Number(result.documentsImported ?? 0),
    lastNsu: result.lastNsu,
    maxNsu: result.maxNsu,
    message: result.message ?? 'Consulta SEFAZ concluida.',
    statusCode: result.statusCode,
    statusMessage: result.statusMessage,
  }
}

export async function consultNfeByAccessKey(input: {
  accessKey: string
  certificateId: string
  clientId: string
  organizationId: string
}) {
  const token = await getAccessToken()
  const response = await fetch('/api/sefaz/consultar-chave', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json().catch(() => ({}))) as Partial<SefazAccessKeyResponse> & {
    error?: string
    ok?: boolean
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? 'Nao foi possivel consultar a NF-e por chave.')
  }

  return {
    accessKey: result.accessKey ?? input.accessKey,
    message: result.message ?? 'NF-e consultada por chave.',
    statusCode: result.statusCode ?? '',
    statusMessage: result.statusMessage ?? '',
  }
}

export async function getDfeDocumentXml(input: {
  clientId: string
  documentId: string
  organizationId: string
}) {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    clientId: input.clientId,
    organizationId: input.organizationId,
  })
  const response = await fetch(`/api/dfe/documents/${input.documentId}/xml?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  const result = (await response.json().catch(() => ({}))) as {
    error?: string
    ok?: boolean
    xml?: string
  }

  if (!response.ok || result.ok === false || !result.xml) {
    throw new Error(result.error ?? 'Nao foi possivel baixar o XML privado.')
  }

  return result.xml
}

export async function manifestNfeDocument(input: {
  certificateId: string
  clientId: string
  documentId: string
  eventType: ManifestationEventType
  justification?: string
  organizationId: string
}) {
  const token = await getAccessToken()
  const response = await fetch('/api/sefaz/manifestar', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const result = (await response.json().catch(() => ({}))) as {
    error?: string
    message?: string
    ok?: boolean
    statusCode?: string
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? 'Nao foi possivel manifestar a NF-e.')
  }

  return {
    message: result.message ?? 'Manifestacao enviada.',
    statusCode: result.statusCode ?? '',
  }
}
