import type { AccountingClient, DigitalCertificate } from './accounting'

export type NfeValidationSeverity = 'error' | 'warning' | 'info'

export type NfeValidationEntity =
  | 'empresa'
  | 'certificado'
  | 'cliente'
  | 'produto'
  | 'nota'
  | 'tributacao'
  | 'integracao'
  | 'sefaz'
  | 'dfe'

export type NfeOperationType =
  | 'consulta_chave'
  | 'distribuicao_dfe'
  | 'emissao_nfe'
  | 'status_sefaz'
  | 'manifestacao'
  | 'download_xml'

export type NfeValidationIssue = {
  severity: NfeValidationSeverity
  entity: NfeValidationEntity
  field: string
  message: string
  suggestion?: string
  actionLabel?: string
  actionPath?: string
}

export type NfeMissingField = {
  table: string
  column: string
  reason: string
  suggestedSql?: string
}

export type NfeReadinessInput = {
  ambiente?: string
  backendConfigured?: boolean
  chaveAcesso?: string
  certificado?: DigitalCertificate | null
  empresa?: AccountingClient | null
  enabledServices?: string[]
  senhaCertificado?: string
  tipoOperacao: NfeOperationType
  uf?: string
}

export type NfeReadinessResult = {
  isReady: boolean
  errors: NfeValidationIssue[]
  warnings: NfeValidationIssue[]
  missingFields: NfeMissingField[]
}

export type SefazMode = 'real_api_interna' | 'backend_externo' | 'simulado'

