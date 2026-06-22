import { supabase } from './supabase'
import {
  ACCOUNTING_DOCUMENT_BUCKET,
  sha256File,
  validateAccountingDocumentFile,
} from '../utils/accountingDocumentSecurity'
import type {
  AccountingDocument,
  AccountingDocumentFilters,
  AccountingDocumentInput,
  AccountingDocumentPage,
  ClientPortalInviteInput,
  ClientPortalUser,
  PortalNfeDocument,
  PortalObligation,
  PortalTaxRecord,
} from '../types/accountingDocuments'

function requireDataError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('schema cache') ||
        error.message.includes('does not exist') ||
        error.message.includes('Could not find')
        ? 'Rode a migration 20260622_client_portal_and_accounting_documents.sql no Supabase.'
        : fallback,
    )
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function clientNameFromRow(row: Record<string, unknown>) {
  const clients = row.clients
  if (clients && typeof clients === 'object' && 'company_name' in clients) {
    return stringValue((clients as Record<string, unknown>).company_name)
  }
  return 'Cliente'
}

function toDateOrNull(value: string) {
  if (!value) return null
  return value.length === 7 ? `${value}-01` : value
}

function mapAccountingDocument(row: Record<string, unknown>): AccountingDocument {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id),
    clientId: stringValue(row.client_id),
    clientName: clientNameFromRow(row),
    category: stringValue(row.category) || 'Documento contabil',
    description: stringValue(row.description),
    documentType: stringValue(row.document_type),
    competence: stringValue(row.competence),
    dueDate: stringValue(row.due_date),
    filename: stringValue(row.filename),
    originalFileName: stringValue(row.original_file_name) || stringValue(row.filename),
    storageBucket: stringValue(row.storage_bucket) || ACCOUNTING_DOCUMENT_BUCKET,
    storagePath: stringValue(row.storage_path),
    mimeType: stringValue(row.mime_type),
    fileSize: numberValue(row.file_size),
    checksumSha256: stringValue(row.checksum_sha256),
    status: stringValue(row.status) as AccountingDocument['status'],
    approvalStatus: stringValue(row.approval_status) as AccountingDocument['approvalStatus'],
    versionNumber: numberValue(row.version_number) || 1,
    responsibleUserId: stringValue(row.responsible_user_id),
    approvedAt: stringValue(row.approved_at),
    deliveredAt: stringValue(row.delivered_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  }
}

function mapPortalUser(row: Record<string, unknown>): ClientPortalUser {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id),
    clientId: stringValue(row.client_id),
    email: stringValue(row.email),
    fullName: stringValue(row.full_name),
    role: stringValue(row.role) as ClientPortalUser['role'],
    status: stringValue(row.status) as ClientPortalUser['status'],
  }
}

export async function listAccountingDocuments(
  organizationId: string,
  filters: AccountingDocumentFilters,
): Promise<AccountingDocumentPage> {
  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  let query = supabase
    .from('accounting_documents')
    .select('*, clients(company_name)', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.clientId) {
    query = query.eq('client_id', filters.clientId)
  }

  if (filters.category) {
    query = query.eq('category', filters.category)
  }

  if (filters.status) {
    query = query.eq('approval_status', filters.status)
  }

  if (filters.search.trim()) {
    query = query.ilike('filename', `%${filters.search.trim()}%`)
  }

  const { count, data, error } = await query
  requireDataError(error, 'Nao foi possivel carregar os documentos contabeis.')

  return {
    documents: ((data ?? []) as Record<string, unknown>[]).map((row) => mapAccountingDocument(row)),
    total: count ?? 0,
  }
}

export async function uploadAccountingDocument(
  organizationId: string,
  input: AccountingDocumentInput,
  file: File,
) {
  const validation = validateAccountingDocumentFile(file)
  if (!validation.ok) {
    throw new Error(validation.reason)
  }

  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null
  const checksum = await sha256File(file)
  const documentId = crypto.randomUUID()
  const storagePath = `${organizationId}/${input.clientId}/${documentId}/${validation.safeName}`

  const { error: uploadError } = await supabase.storage
    .from(ACCOUNTING_DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })

  requireDataError(uploadError, 'Nao foi possivel enviar o arquivo para o Storage.')

  const { error } = await supabase.from('accounting_documents').insert({
    id: documentId,
    organization_id: organizationId,
    client_id: input.clientId,
    provider: 'manual',
    external_id: '',
    idempotency_key: `manual:${input.clientId}:${input.category}:${checksum}`,
    document_type: input.documentType || input.category,
    category: input.category,
    competence: toDateOrNull(input.competence),
    description: input.description,
    due_date: toDateOrNull(input.dueDate),
    filename: validation.safeName,
    original_file_name: file.name,
    storage_bucket: ACCOUNTING_DOCUMENT_BUCKET,
    storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream',
    file_size: file.size,
    checksum_sha256: checksum,
    status: 'available',
    approval_status: input.approvalStatus,
    responsible_user_id: input.responsibleUserId || null,
    created_by: userId,
    updated_by: userId,
    metadata: {
      originalExtension: validation.extension,
      source: 'accounting_documents_page',
    },
  })

  requireDataError(error, 'Nao foi possivel salvar o documento contabil.')
  return documentId
}

export async function updateAccountingDocumentApproval(
  documentId: string,
  approvalStatus: AccountingDocument['approvalStatus'],
) {
  const { data: authData } = await supabase.auth.getUser()
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    approval_status: approvalStatus,
    updated_by: authData.user?.id ?? null,
  }

  if (approvalStatus === 'approved') {
    payload.approved_at = now
    payload.approved_by = authData.user?.id ?? null
  }

  if (approvalStatus === 'delivered') {
    payload.delivered_at = now
    payload.status = 'sent'
  }

  const { error } = await supabase.from('accounting_documents').update(payload).eq('id', documentId)
  requireDataError(error, 'Nao foi possivel atualizar o status do documento.')
}

export async function replaceAccountingDocument(document: AccountingDocument, file: File) {
  const validation = validateAccountingDocumentFile(file)
  if (!validation.ok) {
    throw new Error(validation.reason)
  }

  const checksum = await sha256File(file)
  const newDocumentId = crypto.randomUUID()
  const storagePath = `${document.organizationId}/${document.clientId}/${newDocumentId}/${validation.safeName}`
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const { error: uploadError } = await supabase.storage
    .from(ACCOUNTING_DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })

  requireDataError(uploadError, 'Nao foi possivel enviar o arquivo substituto.')

  const { error: insertError } = await supabase.from('accounting_documents').insert({
    id: newDocumentId,
    organization_id: document.organizationId,
    client_id: document.clientId,
    provider: 'manual',
    external_id: '',
    idempotency_key: `replace:${document.id}:${checksum}`,
    document_type: document.documentType,
    category: document.category,
    competence: toDateOrNull(document.competence),
    description: document.description,
    due_date: toDateOrNull(document.dueDate),
    filename: validation.safeName,
    original_file_name: file.name,
    storage_bucket: ACCOUNTING_DOCUMENT_BUCKET,
    storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream',
    file_size: file.size,
    checksum_sha256: checksum,
    status: 'available',
    approval_status: 'pending',
    version_number: document.versionNumber + 1,
    responsible_user_id: document.responsibleUserId || null,
    created_by: userId,
    updated_by: userId,
    metadata: {
      replacesDocumentId: document.id,
      originalExtension: validation.extension,
    },
  })

  requireDataError(insertError, 'Nao foi possivel salvar a nova versao do documento.')

  const { error: updateError } = await supabase
    .from('accounting_documents')
    .update({
      replaced_by_document_id: newDocumentId,
      status: 'replaced',
      updated_by: userId,
    })
    .eq('id', document.id)

  requireDataError(updateError, 'Nova versao salva, mas nao foi possivel marcar o documento anterior.')
}

export async function archiveAccountingDocument(documentId: string) {
  const { data: authData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('accounting_documents')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: authData.user?.id ?? null,
      status: 'archived',
      updated_by: authData.user?.id ?? null,
    })
    .eq('id', documentId)

  requireDataError(error, 'Nao foi possivel arquivar o documento.')
}

export async function createAccountingDocumentSignedUrl(document: AccountingDocument) {
  const { data, error } = await supabase.storage
    .from(document.storageBucket || ACCOUNTING_DOCUMENT_BUCKET)
    .createSignedUrl(document.storagePath, 60)

  requireDataError(error, 'Nao foi possivel gerar o link de download.')

  await supabase
    .from('accounting_documents')
    .update({
      downloaded_at: new Date().toISOString(),
      status: 'downloaded',
    })
    .eq('id', document.id)

  return data?.signedUrl ?? ''
}

export async function inviteClientPortalUser(organizationId: string, input: ClientPortalInviteInput) {
  const { data, error } = await supabase.rpc('upsert_client_portal_user', {
    p_client_id: input.clientId,
    p_email: input.email,
    p_full_name: input.fullName,
    p_organization_id: organizationId,
    p_role: input.role,
  })

  requireDataError(error, 'Nao foi possivel criar o acesso do portal.')
  return String(data)
}

export async function listClientPortalUsers(organizationId: string, clientId: string) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('client_portal_users')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  requireDataError(error, 'Nao foi possivel carregar usuarios do portal.')
  return ((data ?? []) as Record<string, unknown>[]).map((row) => mapPortalUser(row))
}

export async function sendClientPortalPasswordReset(email: string) {
  const redirectTo = `${window.location.origin}/redefinir-senha`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  requireDataError(error, 'Nao foi possivel enviar a redefinicao de senha.')
}

export async function claimClientPortalAccess() {
  const { data, error } = await supabase.rpc('claim_client_portal_access')
  requireDataError(error, 'Nao foi possivel ativar o acesso do portal.')
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => mapPortalUser(row))
}

export async function listPortalDocuments(profile: ClientPortalUser) {
  const { data, error } = await supabase
    .from('accounting_documents')
    .select('*, clients(company_name)')
    .eq('organization_id', profile.organizationId)
    .eq('client_id', profile.clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  requireDataError(error, 'Nao foi possivel carregar documentos do portal.')
  return ((data ?? []) as Record<string, unknown>[]).map((row) => mapAccountingDocument(row))
}

export async function listPortalTaxes(profile: ClientPortalUser): Promise<PortalTaxRecord[]> {
  const { data, error } = await supabase
    .from('accounting_tax_records')
    .select('id, tax_type, description, amount, competence, due_date, status')
    .eq('organization_id', profile.organizationId)
    .eq('client_id', profile.clientId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
    .limit(50)

  requireDataError(error, 'Nao foi possivel carregar impostos do portal.')

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: stringValue(row.id),
    taxType: stringValue(row.tax_type),
    description: stringValue(row.description),
    amount: numberValue(row.amount),
    competence: stringValue(row.competence),
    dueDate: stringValue(row.due_date),
    status: stringValue(row.status),
  }))
}

export async function listPortalObligations(profile: ClientPortalUser): Promise<PortalObligation[]> {
  const { data, error } = await supabase
    .from('accounting_obligations')
    .select('id, obligation_type, competence, due_date, delivery_date, status, protocol')
    .eq('organization_id', profile.organizationId)
    .eq('client_id', profile.clientId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
    .limit(50)

  requireDataError(error, 'Nao foi possivel carregar obrigacoes do portal.')

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: stringValue(row.id),
    obligationType: stringValue(row.obligation_type),
    competence: stringValue(row.competence),
    dueDate: stringValue(row.due_date),
    deliveryDate: stringValue(row.delivery_date),
    status: stringValue(row.status),
    protocol: stringValue(row.protocol),
  }))
}

export async function listPortalNfeDocuments(profile: ClientPortalUser): Promise<PortalNfeDocument[]> {
  const { data, error } = await supabase
    .from('nfe_documents')
    .select('id, access_key, number, series, issue_date, amount, status, recipient_name, xml_url, danfe_url')
    .eq('organization_id', profile.organizationId)
    .eq('client_id', profile.clientId)
    .order('issue_date', { ascending: false })
    .limit(50)

  requireDataError(error, 'Nao foi possivel carregar NF-es do portal.')

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: stringValue(row.id),
    accessKey: stringValue(row.access_key),
    number: stringValue(row.number),
    series: stringValue(row.series),
    issueDate: stringValue(row.issue_date),
    amount: numberValue(row.amount),
    status: stringValue(row.status),
    recipientName: stringValue(row.recipient_name),
    xmlUrl: stringValue(row.xml_url),
    danfeUrl: stringValue(row.danfe_url),
  }))
}

export async function logClientPortalAccess(profile: ClientPortalUser, action: string, resourceType = '', resourceId = '') {
  await supabase.rpc('log_client_portal_access', {
    p_action: action,
    p_client_id: profile.clientId,
    p_metadata: {},
    p_organization_id: profile.organizationId,
    p_resource_id: resourceId || null,
    p_resource_type: resourceType,
  })
}
