export type SerproBillingMode = 'cont_hub_managed' | 'direct_serpro'
export type SerproAccessMode = 'cont_hub_managed' | 'direct_serpro' | 'manual_free'
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
  status: SerproStatus
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

export interface SerproSettingsResponse {
  ok: boolean
  settings: SerproSettings
  managedCredential: SerproCredentialStatus
  directCredential: SerproCredentialStatus
  wallet: SerproWallet
  services: SerproService[]
  organizationServices: Array<Record<string, unknown>>
  authorizations: Array<Record<string, unknown>>
  resolved: SerproResolvedMode
}
