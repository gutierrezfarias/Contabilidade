export type ApplicationIcon = 'accounting' | 'crm' | 'chat' | 'website' | 'psychology'
export type ApplicationStatus = 'available' | 'coming-soon' | 'requires-purchase'

export interface ApplicationItem {
  id: string
  name: string
  description: string
  icon: ApplicationIcon
  status: ApplicationStatus
  price?: string
  route?: string
  displayInCatalog?: boolean
  includedApplicationIds?: string[]
}
