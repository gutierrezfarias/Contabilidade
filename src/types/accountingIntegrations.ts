export type AccountingProvider =
  | 'manual'
  | 'netspeed'
  | 'dominio'
  | 'alterdata'
  | 'sci'
  | 'questor'
  | 'contmatic'
  | 'generic'

export type AccountingConnectionType = 'manual' | 'file_import' | 'api' | 'webservice' | 'local_connector'
export type AccountingIntegrationStatus = 'draft' | 'active' | 'disconnected' | 'error' | 'paused'
export type AccountingRecordType = 'tax' | 'obligation' | 'document' | 'payroll' | 'statement'

export interface AccountingIntegration {
  id: string
  organizationId: string
  name: string
  provider: AccountingProvider
  connectionType: AccountingConnectionType
  environment: 'sandbox' | 'homologation' | 'production'
  status: AccountingIntegrationStatus
  baseUrl: string
  credentialsReference: string
  settings: Record<string, unknown>
  syncFrequency: string
  lastSyncAt: string
  nextSyncAt: string
  automaticSync: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountingIntegrationInput {
  organizationId: string
  name: string
  provider: AccountingProvider
  connectionType: AccountingConnectionType
  environment: 'sandbox' | 'homologation' | 'production'
  status: AccountingIntegrationStatus
  baseUrl: string
  credentialsReference: string
  settings: Record<string, unknown>
  syncFrequency: string
  nextSyncAt?: string
  automaticSync: boolean
  active: boolean
}

export interface AccountingIntegrationClient {
  id: string
  organizationId: string
  integrationId: string
  clientId: string
  clientName: string
  clientCnpj: string
  externalCompanyId: string
  externalCompanyName: string
  externalCnpj: string
  externalCode: string
  status: string
  linkedAt: string
}

export interface AccountingIntegrationClientInput {
  organizationId: string
  clientId: string
  externalCompanyId: string
  externalCompanyName: string
  externalCnpj: string
  externalCode: string
  status: string
}

export interface AccountingSyncRun {
  id: string
  organizationId: string
  integrationId: string
  clientId: string
  provider: string
  syncType: string
  status: string
  startedAt: string
  finishedAt: string
  receivedCount: number
  createdCount: number
  updatedCount: number
  ignoredCount: number
  duplicateCount: number
  errorCount: number
  message: string
  correlationId: string
}

export interface AccountingImportPreviewRequest {
  organizationId: string
  integrationId: string
  clientId: string
  templateId: string
  provider: string
  recordType: AccountingRecordType
  fileName: string
  fileFormat: string
  content: string
  competence: string
  columnMapping: Record<string, string>
}

export interface AccountingImportError {
  rowNumber: number
  fieldName: string
  fieldValue: string
  reason: string
  expectedFix: string
  severity: 'error' | 'warning'
}

export interface AccountingImportPreviewRow {
  rowNumber: number
  valid: boolean
  raw: Record<string, string>
  mapped: Record<string, string>
  errors: AccountingImportError[]
}

export interface AccountingImportPreviewResult {
  ok: boolean
  batchId: string
  message: string
  totalRows: number
  validRows: number
  invalidRows: number
  rows: AccountingImportPreviewRow[]
  errors: AccountingImportError[]
  columns: string[]
}

export interface AccountingImportConfirmResult {
  ok: boolean
  batchId: string
  message: string
  createdRows: number
  updatedRows: number
  duplicateRows: number
  errorRows: number
}

export interface AccountingTaxRecord {
  id: string
  organizationId: string
  clientId: string
  integrationId: string
  provider: string
  externalId: string
  competence: string
  taxType: string
  description: string
  amount: number
  dueDate: string
  calculationDate: string
  status: string
  barcode: string
  pixCode: string
  documentUrl: string
  source: string
}

export interface AccountingObligation {
  id: string
  organizationId: string
  clientId: string
  integrationId: string
  provider: string
  competence: string
  obligationType: string
  dueDate: string
  deliveryDate: string
  status: string
  protocol: string
}

export interface AccountingProviderConnectionResult {
  ok: boolean
  provider: string
  status: string
  message: string
  recommendedAction: string
}
