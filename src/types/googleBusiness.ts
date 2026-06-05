export type GoogleBusinessConnectionStatus = 'Nao conectado' | 'Conectado' | 'Pendente' | 'Erro'
export type GoogleBusinessSyncStatus =
  | 'Atualizado'
  | 'Google desatualizado'
  | 'Pendente'
  | 'Erro'
  | 'Nao vinculado'
  | 'Enviado'
  | 'Pendente de analise'
  | 'Rejeitado'

export interface GoogleBusinessConnection {
  id: string
  accountantId: string
  connectedEmail: string
  status: GoogleBusinessConnectionStatus
  tokenExpiresAt: string
  updatedAt: string
}

export interface GoogleBusinessLocation {
  id: string
  accountantId: string
  googleConnectionId: string
  googleLocationName: string
  googleLocationId: string
  businessName: string
  address: string
  phone: string
  website: string
  syncStatus: GoogleBusinessSyncStatus
  selected: boolean
  googlePayload?: Record<string, unknown>
  lastCheckedAt: string
  lastSyncedAt: string
}

export interface GoogleBusinessComparisonRow {
  key: string
  label: string
  systemValue: string
  googleValue: string
  status: 'Atualizado' | 'Desatualizado' | 'Pendente' | 'Erro'
  googleField: string
}

export interface GoogleBusinessSyncLog {
  id: string
  accountantId: string
  googleLocationId: string
  action: string
  userEmail: string
  fieldsSent: string[]
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  status: string
  errorMessage: string
  createdAt: string
}

export interface GoogleBusinessStatus {
  connection: GoogleBusinessConnection | null
  locations: GoogleBusinessLocation[]
  logs: GoogleBusinessSyncLog[]
  comparison: GoogleBusinessComparisonRow[]
}
