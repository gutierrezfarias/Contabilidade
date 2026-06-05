export type FinancialIntegrationStatus = 'ativo' | 'inativo' | 'teste'

export interface FinancialApiIntegration {
  id?: string
  provider: string
  name: string
  status: FinancialIntegrationStatus
  active: boolean
  config: Record<string, string>
  notes: string
}
