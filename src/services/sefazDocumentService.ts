import { supabase } from './supabase'
import type { FiscalDocumentDirection, NfeDocument } from '../types/accounting'
import {
  createEmptyPaginatedResult,
  createPaginatedResult,
  getPaginationRange,
  type PaginatedResult,
  type SortDirection,
} from '../types/pagination'

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
  documentsImported?: number
  error?: string
  ignoredCount?: number
  insertedCount?: number
  lastNsu?: string
  maxNsu?: string
  message?: string
  nextAllowedSyncAt?: string
  ok?: boolean
  receivedCount?: number
  status?: number
  statusCode?: string
  statusMessage?: string
  syncRunId?: string
  success?: boolean
  updatedCount?: number
}

type SefazAccessKeyResponse = {
  accessKey?: string
  message: string
  statusCode?: string
  statusMessage?: string
}

export type SefazQueryType = 'summary' | 'complete'

export type SefazConsultationResult = {
  ignoredCount: number
  insertedCount: number
  lastNsu: string
  maxNsu: string
  message: string
  nextAllowedSyncAt: string
  receivedCount: number
  statusCode: string
  statusMessage: string
  syncRunId: string
  updatedCount: number
}

export type SefazDocumentFilters = {
  dateRange?: string
  direction?: FiscalDocumentDirection
  manifestationStatus?: string
  page?: number
  pageSize?: number
  search?: string
  searchField?: string
  sortBy?: string
  sortDirection?: SortDirection
  xmlStatus?: 'all' | 'full' | 'summary' | 'missing'
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
  nextAllowedSyncAt: string
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

function onlyDigits(value: string | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

function sanitizePostgrestSearch(value: string) {
  return value.trim().replace(/[,%]/g, ' ')
}

function buildIlike(value: string) {
  return `%${sanitizePostgrestSearch(value)}%`
}

const dfeSortableColumns = new Set([
  'access_key',
  'created_at',
  'issue_date',
  'issuer_name',
  'recipient_name',
  'total_value',
  'updated_at',
])

function resolveDfeSortColumn(sortBy?: string) {
  const columnMap: Record<string, string> = {
    accessKey: 'access_key',
    amount: 'total_value',
    company: 'issuer_name',
    createdAt: 'created_at',
    issueDate: 'issue_date',
    updatedAt: 'updated_at',
  }
  const resolved = columnMap[sortBy ?? ''] ?? sortBy ?? 'issue_date'
  return dfeSortableColumns.has(resolved) ? resolved : 'issue_date'
}

function applyDfeSearch<T extends {
  ilike: (column: string, pattern: string) => T
  or: (filters: string) => T
}>(
  query: T,
  search: string,
  searchField?: string,
) {
  const trimmedSearch = sanitizePostgrestSearch(search)
  if (!trimmedSearch) return query

  const like = buildIlike(trimmedSearch)
  const digits = onlyDigits(trimmedSearch)
  const digitLike = digits ? `%${digits}%` : like

  if (searchField === 'accessKey') return query.ilike('access_key', like)
  if (searchField === 'company') return query.or(`issuer_name.ilike.${like},recipient_name.ilike.${like}`)
  if (searchField === 'document') return query.or(`issuer_cnpj.ilike.${digitLike},recipient_cnpj.ilike.${digitLike}`)
  if (searchField === 'number') return query.or(`access_key.ilike.${like},nsu.ilike.${like}`)

  return query.or(
    [
      `access_key.ilike.${like}`,
      `nsu.ilike.${like}`,
      `issuer_name.ilike.${like}`,
      `recipient_name.ilike.${like}`,
      `issuer_cnpj.ilike.${digitLike}`,
      `recipient_cnpj.ilike.${digitLike}`,
    ].join(','),
  )
}

function mapDfe(row: Record<string, unknown>): NfeDocument {
  const summary = (row.summary_data ?? {}) as Record<string, unknown>
  const schemaName = String(row.schema_name ?? '')
  const xmlStoragePath = String(row.xml_storage_path ?? '')
  const hasFullXml = Boolean(row.has_full_xml)
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    certificateId: String(row.certificate_id ?? ''),
    documentModel: String(row.document_type || schemaName || 'NF-e'),
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
    description: String(row.document_type || schemaName || ''),
    hasFullXml,
    protocolNumber: String(summary.nProt ?? ''),
    manifestationStatus: String(row.manifestation_status ?? 'Pendente'),
    manifestationDeadline: '',
    rawSummary: summary,
    schemaName,
    sefazStatusCode: String(summary.cStat ?? ''),
    lastConsultedAt: String(row.updated_at ?? ''),
    xmlStoragePath,
    xmlUrl: xmlStoragePath ? `/api/dfe/documents/${row.id}/xml` : undefined,
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
    nextAllowedSyncAt: String(row.next_allowed_sync_at ?? ''),
    organizationId: String(row.organization_id ?? ''),
    stateUf: '',
    updatedAt: String(row.updated_at ?? ''),
  }
}

export async function listNfeDocuments(
  organizationId: string | null,
  clientId?: string,
  filters: SefazDocumentFilters = {},
): Promise<PaginatedResult<NfeDocument>> {
  if (!organizationId) return createEmptyPaginatedResult(filters.page, filters.pageSize)

  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 25
  const { from, to } = getPaginationRange(page, pageSize)
  const sortColumn = resolveDfeSortColumn(filters.sortBy)
  const sortDirection = filters.sortDirection === 'asc' ? 'asc' : 'desc'

  let query = supabase
    .from('nfe_dfe_documents')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('active', true)

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

  if (filters.xmlStatus === 'full') {
    query = query.eq('has_full_xml', true)
  }

  if (filters.xmlStatus === 'summary') {
    query = query.eq('has_full_xml', false)
  }

  if (filters.manifestationStatus && filters.manifestationStatus !== 'all') {
    query = query.eq('manifestation_status', filters.manifestationStatus)
  }

  query = applyDfeSearch(query, filters.search ?? '', filters.searchField)

  query = query
    .order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const { count, data, error } = await query
  fail(error, 'Nao foi possivel carregar NF-e.')
  const documents = (data ?? []).map((row) => mapDfe(row as Record<string, unknown>))
  return createPaginatedResult(documents, page, pageSize, count ?? 0)
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
  cnpj?: string
  environment?: string
  organizationId: string | null
}) {
  if (!input.organizationId || !input.clientId || !input.certificateId) return null

  let query = supabase
    .from('nfe_dfe_sync_states')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('client_id', input.clientId)
    .eq('certificate_id', input.certificateId)

  if (input.environment) {
    query = query.eq('environment', input.environment)
  }

  const cnpj = onlyDigits(input.cnpj)
  if (cnpj) {
    query = query.eq('cnpj', cnpj)
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle()

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

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function readNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }

  return 0
}

function readBoolean(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'boolean') return value
  }

  return undefined
}

function recommendedAction(httpStatus: number, result: Record<string, unknown>) {
  const code = readString(result, 'statusCode', 'StatusCode')
  const message = `${readString(result, 'error', 'Error')} ${readString(result, 'message', 'Message')} ${readString(result, 'statusMessage', 'StatusMessage')}`.toLowerCase()

  if (httpStatus === 401 || message.includes('login') || message.includes('token')) {
    return 'Entre novamente no sistema e tente outra vez.'
  }

  if (httpStatus === 403 || message.includes('acesso') || message.includes('permiss')) {
    return 'Confirme se o usuario possui acesso a organizacao e ao cliente selecionado.'
  }

  if (message.includes('certificado') && (message.includes('senha') || message.includes('password'))) {
    return 'Revise a senha do certificado no cadastro do cliente.'
  }

  if (message.includes('certificado') && (message.includes('venc') || message.includes('valid'))) {
    return 'Atualize o certificado digital A1/PFX/P12 do cliente.'
  }

  if (code === '108' || code === '109') {
    return 'Aguarde a SEFAZ estabilizar e tente novamente em alguns minutos.'
  }

  if (code === '656' || message.includes('consumo indevido')) {
    return 'Aguarde o intervalo de bloqueio da SEFAZ antes de consultar novamente.'
  }

  if (message.includes('soap') || message.includes('webservice') || message.includes('endpoint')) {
    return 'Verifique a disponibilidade do webservice SEFAZ e a configuracao do backend fiscal.'
  }

  if (httpStatus >= 500) {
    return 'Verifique os logs seguros do backend fiscal no Railway.'
  }

  return 'Revise cliente, certificado, ambiente e tente novamente.'
}

function buildSefazError(httpStatus: number, result: Record<string, unknown>) {
  const code = readString(result, 'statusCode', 'StatusCode') || 'Nao informado'
  const message =
    readString(result, 'statusMessage', 'StatusMessage') ||
    readString(result, 'message', 'Message') ||
    readString(result, 'error', 'Error') ||
    'Nao foi possivel consultar NF-e/DF-e na SEFAZ.'
  const detail = readString(result, 'error', 'Error')
  const nextAllowedSyncAt = readString(result, 'nextAllowedSyncAt', 'NextAllowedSyncAt')
  const lastNsu = readString(result, 'lastNsu', 'LastNsu')
  const maxNsu = readString(result, 'maxNsu', 'MaxNsu')
  const syncRunId = readString(result, 'syncRunId', 'SyncRunId')

  if (httpStatus === 429 || code === '656' || `${message} ${detail}`.toLowerCase().includes('consumo indevido')) {
    return [
      'Consulta temporariamente bloqueada pela SEFAZ.',
      'Motivo: foram realizadas consultas antes do intervalo permitido ou fora da sequencia esperada de NSU.',
      'O Cont Hub bloqueou novas tentativas para evitar ampliar o periodo de bloqueio.',
      nextAllowedSyncAt ? `Nova consulta permitida apos ${new Date(nextAllowedSyncAt).toLocaleString('pt-BR')}.` : '',
      'Nao e necessario alterar o certificado ou a senha.',
      `Detalhes tecnicos: HTTP ${httpStatus}, cStat ${code}, xMotivo ${message}.`,
      lastNsu ? `Ultimo NSU ${lastNsu}.` : '',
      maxNsu ? `Max NSU ${maxNsu}.` : '',
      syncRunId ? `Sync ${syncRunId}.` : '',
    ].filter(Boolean).join(' ')
  }

  return [
    `HTTP ${httpStatus}.`,
    `Codigo: ${code}.`,
    `Mensagem: ${message}.`,
    detail && detail !== message ? `Detalhe seguro: ${detail}.` : '',
    `Acao recomendada: ${recommendedAction(httpStatus, result)}`,
  ].filter(Boolean).join(' ')
}

function logSafeDfeCall(endpoint: string, httpStatus: number, statusCode?: string) {
  console.info('[SEFAZ DF-e]', {
    endpoint,
    httpStatus,
    momento: new Date().toISOString(),
    statusCode: statusCode || 'sem-cStat',
  })
}

function createSyncRunId() {
  const browserCrypto = globalThis.crypto
  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID().replace(/-/g, '')
  }

  return `${Date.now()}${Math.random().toString(16).slice(2)}`.replace(/\W/g, '').slice(0, 32)
}

export async function consultDfeFromSefaz(input: {
  certificateId: string
  clientId: string
  direction?: FiscalDocumentDirection
  environment?: string
  organizationId: string
  queryType?: SefazQueryType
}): Promise<SefazConsultationResult> {
  const token = await getAccessToken()
  const endpoint = '/api/dfe/sync'
  const syncRunId = createSyncRunId()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-sync-run-id': syncRunId,
    },
    body: JSON.stringify({
      certificateId: input.certificateId,
      clientId: input.clientId,
      environment: input.environment ?? 'homologacao',
      maxCycles: input.queryType === 'complete' ? 8 : 1,
      organizationId: input.organizationId,
      queryType: input.queryType ?? 'summary',
      resetNsu: false,
      syncRunId,
    }),
  })
  const result = (await response.json().catch(() => ({}))) as Partial<SefazConsultationResponse> & Record<string, unknown>
  const success = readBoolean(result, 'success', 'Success')
  const ok = readBoolean(result, 'ok', 'Ok')
  const statusCode = readString(result, 'statusCode', 'StatusCode')
  logSafeDfeCall(endpoint, response.status, statusCode)

  if (!response.ok || ok === false || success === false) {
    throw new Error(buildSefazError(response.status, result))
  }

  const receivedCount = readNumber(result, 'receivedCount', 'ReceivedCount', 'documentsImported')
  const insertedCount = readNumber(result, 'insertedCount', 'InsertedCount')
  const updatedCount = readNumber(result, 'updatedCount', 'UpdatedCount')
  const ignoredCount = readNumber(result, 'ignoredCount', 'IgnoredCount')

  return {
    ignoredCount,
    insertedCount,
    lastNsu: readString(result, 'lastNsu', 'LastNsu'),
    maxNsu: readString(result, 'maxNsu', 'MaxNsu'),
    message: readString(result, 'message', 'Message') || 'Consulta SEFAZ concluida.',
    nextAllowedSyncAt: readString(result, 'nextAllowedSyncAt', 'NextAllowedSyncAt'),
    receivedCount,
    statusCode,
    statusMessage: readString(result, 'statusMessage', 'StatusMessage'),
    syncRunId: readString(result, 'syncRunId', 'SyncRunId') || syncRunId,
    updatedCount,
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
  const contentType = response.headers.get('content-type') ?? ''

  if (response.ok && contentType.includes('xml')) {
    return response.text()
  }

  const result = contentType.includes('json')
    ? ((await response.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
        xml?: string
      })
    : { error: await response.text().catch(() => ''), ok: false, xml: '' }

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
