export type PaymentStatus = 'Pago' | 'Pendente' | 'Vencido'
export type ObligationStatus = 'Concluido' | 'Concluído' | 'Pendente' | 'Vencido'

export interface DashboardClientPayment {
  clientName: string
  amount: number
  dueDate: string
  status: PaymentStatus
}

export interface FiscalObligation {
  name: string
  clientCount: number
  dueDate: string
  status: ObligationStatus
}

export interface AccountingPeriod {
  month: number
  year: number
  totalClients: number
  totalRevenue: number
  clientsPaid: number
  clientsOverdue: number
  monthlyGrowth: number
  recentPayments: DashboardClientPayment[]
  obligations: FiscalObligation[]
}

export type ClientTaxRegime =
  | 'Nao informado'
  | 'MEI'
  | 'Simples Nacional'
  | 'Lucro Presumido'
  | 'Lucro Real'
  | 'Imune'
  | 'Isento'
  | 'Produtor Rural'
  | 'Outros'

export type ClientCompanySize =
  | 'Nao informado'
  | 'MEI'
  | 'ME'
  | 'EPP'
  | 'Medio porte'
  | 'Grande porte'
  | 'Demais'

export interface AccountingClient {
  id: string
  organizationId: string
  companyName: string
  cnpj: string
  phone: string
  email: string
  cep: string
  address: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  cityIbgeCode: string
  stateRegistration: string
  municipalRegistration: string
  taxRegime: ClientTaxRegime
  companySize: ClientCompanySize
  mainCnae: string
  legalNature: string
  photoData?: string
  isMonthly: boolean
  monthlyFee: number
  active: boolean
}

export interface AccountingClientDocument {
  id: string
  organizationId: string
  clientId: string
  fileName: string
  mimeType: string
  fileSize: number
  fileData: string
  documentType: string
  extractedCnpj: string
  createdAt: string
}

export interface ClientMonthlyPayment {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  month: number
  year: number
  amount: number
  dueDate: string
  status: PaymentStatus
}

export type CertificateType = 'A1' | 'A3' | 'e-CNPJ' | 'e-CPF'
export type CertificateStatus = 'Pendente' | 'Ativo' | 'Expirado' | 'Revogado'
export type CertificateEnvironment = 'homologacao' | 'producao'

export interface DigitalCertificate {
  id: string
  organizationId: string
  clientId: string
  certificateType: CertificateType
  holderName: string
  taxId: string
  validFrom: string
  validUntil: string
  status: CertificateStatus
  serialNumber: string
  issuer: string
  environment: CertificateEnvironment
  stateUf: string
  municipalCode: string
  secureReference: string
  certificatePassword: string
  certificateFileName: string
  certificateFileSize: number
  certificateFileData?: string
}

export type CertificateServiceCode =
  | 'nfe'
  | 'nfe_emissao'
  | 'nfe_consulta'
  | 'nfe_cancelamento'
  | 'nfe_cce'
  | 'nfe_inutilizacao'
  | 'nfce'
  | 'cte'
  | 'mdfe'
  | 'nfse'
  | 'dfe_distribuicao'
  | 'manifestacao_destinatario'
  | 'ecac'
  | 'ecac_caixa_postal'
  | 'ecac_situacao_fiscal'
  | 'ecac_certidoes'
  | 'ecac_processos_digitais'
  | 'ecac_dctfweb'
  | 'ecac_perdcomp'
  | 'sped_reinf'
  | 'simples_nacional'

export interface CertificateService {
  id?: string
  certificateId: string
  serviceCode: CertificateServiceCode
  enabled: boolean
  integrationStatus: 'Nao configurado' | 'Configurando' | 'Ativo' | 'Falha'
}

export type NfeDocumentStatus =
  | 'Rascunho'
  | 'Pendente'
  | 'Consultada'
  | 'Autorizada'
  | 'Rejeitada'
  | 'Cancelada'

export type FiscalDocumentDirection = 'recebida' | 'emitida' | 'transporte' | 'citada'

export interface NfeDocument {
  id: string
  organizationId: string
  clientId: string
  certificateId: string
  documentModel: string
  documentDirection: FiscalDocumentDirection
  nsu: string
  accessKey: string
  number: string
  series: string
  issueDate: string
  amount: number
  status: NfeDocumentStatus
  emitterName: string
  emitterDocument: string
  destinationName: string
  destinationDocument: string
  operationType: string
  recipientName: string
  recipientDocument: string
  description: string
  protocolNumber: string
  manifestationStatus: string
  manifestationDeadline: string
  rawXml?: string
  rawSummary?: Record<string, unknown>
  sefazStatusCode: string
  lastConsultedAt: string
  xmlUrl?: string
  danfeUrl?: string
}
