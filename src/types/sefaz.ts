export interface SefazServiceStatus {
  name: string
  status: 'Online' | 'Indisponível'
  message: string
}

export interface NfeConsultationResult {
  id: string
  clientName: string
  documentNumber: string
  issueDate: string
  amount: string
  status: string
}
