export type MiniCrmStage = 'Lead' | 'Qualificado' | 'Proposta' | 'Cliente' | 'Perdido'

export interface MiniCrmLead {
  id: string
  organizationId: string
  contactName: string
  companyName: string
  cnpj: string
  email: string
  phone: string
  source: string
  stage: MiniCrmStage
  estimatedValue: number
  nextActionDate: string
  notes: string
  convertedClientId?: string
  createdAt: string
  updatedAt: string
}
