export type AdminClientAppStatus = 'ativo' | 'inativo' | 'teste' | 'cancelado'

export interface AdminClientApp {
  id?: string
  applicationId: string
  applicationName: string
  status: AdminClientAppStatus
  monthlyPrice: number
  discountPercent: number
  subscriptionExempt: boolean
  exemptionUntil: string
  startedAt: string
  nextBillingDate: string
}

export interface AdminClient {
  id: string
  name: string
  cnpj: string
  active: boolean
  contactName: string
  email: string
  phone: string
  cep: string
  address: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  discountPercent: number
  subscriptionExempt: boolean
  notes: string
  apps: AdminClientApp[]
}

export type AdminClientFilters = {
  app: string
  billing: 'todos' | 'com-desconto' | 'isento'
  status: 'todos' | 'ativos' | 'inativos'
  text: string
}
