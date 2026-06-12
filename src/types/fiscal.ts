import type { NfeEmissionItem, NfeEmissionPayload } from './nfeEmission'

export type FiscalApprovalStatus = 'Incompleto' | 'Aguardando revisao' | 'Aprovado' | 'Bloqueado'
export type FiscalEnvironment = 'homologacao' | 'producao'

export type FiscalCompanyProfile = {
  id: string
  organizationId: string
  clientId: string
  cnpj: string
  stateRegistration: string
  municipalRegistration: string
  stateUf: string
  city: string
  cityIbgeCode: string
  mainCnae: string
  secondaryCnaes: string[]
  taxRegime: string
  crt: string
  icmsTaxpayerIndicator: string
  defaultFinalConsumer: boolean
  defaultNfeSeries: string
  defaultEnvironment: FiscalEnvironment
  pisCofinsRegime: string
  fiscalNotes: string
  approvalStatus: FiscalApprovalStatus
  active: boolean
}

export type FiscalCompanyProfileInput = Omit<FiscalCompanyProfile, 'id' | 'organizationId' | 'clientId'>

export type FiscalProductStatus = 'Pendente' | 'Completo' | 'Bloqueado'

export type FiscalProduct = {
  id: string
  organizationId: string
  clientId: string
  productCode: string
  groupId: string
  description: string
  gtin: string
  commercialUnit: string
  ncm: string
  cest: string
  merchandiseOrigin: string
  itemType: string
  defaultCfopIn: string
  defaultCfopOut: string
  icmsCst: string
  icmsCsosn: string
  pisCst: string
  pisRate: number
  cofinsCst: string
  cofinsRate: number
  ipiCst: string
  ipiRate: number
  icmsRate: number
  icmsBaseReduction: number
  hasIcmsSt: boolean
  mvaRate: number
  fcpRate: number
  fiscalBenefitCode: string
  fiscalStatus: FiscalProductStatus
  notes: string
  active: boolean
}

export type FiscalProductInput = Omit<FiscalProduct, 'id' | 'organizationId' | 'clientId'>

export type FiscalRuleApprovalStatus = 'Aguardando revisao' | 'Aprovada' | 'Bloqueada'

export type FiscalRule = {
  id: string
  organizationId: string
  clientId: string
  ruleCode: string
  name: string
  priority: number
  active: boolean
  startDate: string
  endDate: string
  taxRegime: string
  direction: 'entrada' | 'saida'
  originUf: string
  destinationUf: string
  recipientTaxpayerIndicator: string
  finalConsumer: boolean | null
  nfePurpose: string
  ncm: string
  cest: string
  productId: string
  groupId: string
  merchandiseOrigin: string
  cfop: string
  icmsCst: string
  icmsCsosn: string
  icmsBaseMode: string
  icmsRate: number
  icmsBaseReduction: number
  pisCst: string
  pisRate: number
  cofinsCst: string
  cofinsRate: number
  ipiCst: string
  ipiRate: number
  hasIcmsSt: boolean
  mvaRate: number
  fcpRate: number
  fiscalBenefitCode: string
  approvalStatus: FiscalRuleApprovalStatus
  version: number
  notes: string
}

export type FiscalRuleInput = Omit<FiscalRule, 'id' | 'organizationId' | 'clientId'>

export type NcmCatalogItem = {
  code: string
  formattedCode: string
  description: string
  startDate?: string
  endDate?: string
  isActive: boolean
  sourceUpdatedAt?: string
}

export type NcmSyncStatus = {
  status: string
  totalCodes: number
  insertedCodes: number
  updatedCodes: number
  deactivatedCodes: number
  errorMessage: string
  startedAt: string
  finishedAt: string
  createdAt: string
}

export type NcmSyncResult = {
  success: boolean
  status: string
  message: string
  totalCodes: number
  insertedCodes: number
  updatedCodes: number
  deactivatedCodes: number
  jobId: string
}

export type NfeTaxPreviewRequest = {
  organizationId: string
  clientId: string
  direction: 'entrada' | 'saida'
  operationTypeCode: string
  finalidade: string
  destinatario: NfeEmissionPayload['destinatario']
  itens: NfeEmissionItem[]
}

export type NfeTaxPreviewItem = {
  index: number
  originalItem: NfeEmissionItem
  calculatedItem: NfeEmissionItem
  appliedRuleId: string
  appliedRuleCode: string
  appliedRuleVersion: number
  justification: string
  errors: string[]
  warnings: string[]
  blockingErrors?: Array<{
    code: string
    message: string
    productCode: string
    field: string
    ruleId: string
    action: string
  }>
}

export type NfeTaxPreviewResult = {
  success: boolean
  status: string
  message: string
  fiscalProfileStatus: string
  items: NfeTaxPreviewItem[]
  errors: string[]
  warnings: string[]
  blockingErrors?: Array<{
    code: string
    message: string
    productCode: string
    field: string
    ruleId: string
    action: string
  }>
  appliedRuleIds?: string[]
  fiscalProfileId?: string
}
