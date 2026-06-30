export type SerproBillingMode = 'cont_hub_managed' | 'direct_serpro'
export type SerproAccessMode = 'cont_hub_managed' | 'direct_serpro' | 'manual_free' | 'local_agent'
export type SerproPlanCode = 'cont_hub_full' | 'cont_hub_local_agent' | 'serpro_direct'
export type SerproEnvironment = 'homologacao' | 'producao'
export type SerproStatus = 'draft' | 'active' | 'paused' | 'blocked' | 'disabled'

export interface SerproService {
  id: string
  name: string
  category: string
  description: string
  officialProduct: string
  requiresCertificate: boolean
  requiresAuthorization: boolean
  supportsManagedMode: boolean
  supportsDirectMode: boolean
  supportsLocalAgent: boolean
  supportsManualImport: boolean
  consumesCredit: boolean
  status: SerproStatus
}

export interface SerproContractPlan {
  code: SerproPlanCode
  commercialName: string
  monthlyPrice: number
  description: string
  active: boolean
  allowedServiceIds: string[]
  defaultDailyLimit: number
  allowsFallback: boolean
  allowsHomologation: boolean
  allowsProduction: boolean
  displayOrder: number
  installerUrl: string
}

export interface SerproPricing {
  serviceId: string
  environment: SerproEnvironment
  providerCost: number
  salePrice: number
  marginAmount: number
  active: boolean
}

export interface SerproSettings {
  organizationId: string
  billingMode: SerproBillingMode
  accessMode: SerproAccessMode
  environment: SerproEnvironment
  status: SerproStatus
  managedModeEnabled: boolean
  directModeEnabled: boolean
  allowManagedFallback: boolean
  monthlyCreditLimit: number
  dailyRequestLimit: number
  notificationEmail: string
  notes: string
  planCode: SerproPlanCode
}

export interface SerproCredentialStatus {
  owner: 'cont_hub' | 'contador' | string
  environment: SerproEnvironment
  status: SerproStatus
  consumerKeyConfigured: boolean
  consumerSecretConfigured: boolean
  consumerSecretReference: string
  certificateConfigured: boolean
  lastTestStatus: string
  lastTestMessage: string
  contractCnpj: string
  consumerKeyMasked: string
}

export interface SerproWallet {
  organizationId: string
  balance: number
  reservedBalance: number
  currency: string
  autoRechargeEnabled: boolean
  autoRechargeThreshold: number
  autoRechargeAmount: number
  status: SerproStatus
}

export interface SerproResolvedMode {
  billingMode: SerproBillingMode
  credentialOwner: string
  credentialsReady: boolean
  walletRequired: boolean
  blockReason: string
}

export interface SerproLocalAgent {
  organizationId: string
  status: 'disconnected' | 'pairing_pending' | 'connected' | 'outdated' | 'blocked'
  pairingKeyPrefix: string
  pairingKeyCreatedAt: string | null
  pairingKeyExpiresAt: string | null
  installedVersion: string
  lastSeenAt: string | null
  lastSyncAt: string | null
  lastError: string
}

export interface SerproPairingKeyResult {
  ok: boolean
  pairingKey: string
  pairingKeyPrefix: string
  expiresAt: string
  message: string
}

export interface SerproSettingsResponse {
  ok: boolean
  settings: SerproSettings
  managedCredential: SerproCredentialStatus
  directCredential: SerproCredentialStatus
  wallet: SerproWallet
  walletTransactions: Array<Record<string, unknown>>
  plans: SerproContractPlan[]
  localAgent: SerproLocalAgent
  services: SerproService[]
  organizationServices: Array<Record<string, unknown>>
  authorizations: Array<Record<string, unknown>>
  usage: Array<Record<string, unknown>>
  requests: Array<Record<string, unknown>>
  auditLogs: Array<Record<string, unknown>>
  manualImports: Array<Record<string, unknown>>
  resolved: SerproResolvedMode
}
