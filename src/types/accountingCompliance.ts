import type { PaginatedResult } from './pagination'

export type AccountingObligationStatus =
  | 'pending'
  | 'in_progress'
  | 'processing'
  | 'delivered'
  | 'late'
  | 'overdue'
  | 'exempt'
  | 'cancelled'

export type AccountingTaxStatus =
  | 'pending'
  | 'available'
  | 'sent'
  | 'viewed'
  | 'paid'
  | 'overdue'
  | 'installment'
  | 'parcelled'
  | 'cancelled'
  | 'ignored'

export type AccountingRecurrenceType = 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export type AccountingAlertSeverity = 'info' | 'warning' | 'critical'

export interface AccountingObligationRecord {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  obligationType: string
  competence: string
  periodStart: string
  periodEnd: string
  dueDate: string
  deliveryDate: string
  status: AccountingObligationStatus
  responsibleUserId: string
  recurrenceType: AccountingRecurrenceType
  recurrenceUntil: string
  protocol: string
  notes: string
  guideDocumentId: string
  receiptDocumentId: string
  alertDaysBefore: number
  createdAt: string
  updatedAt: string
}

export interface AccountingTaxRecordDetailed {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  taxType: string
  description: string
  competence: string
  dueDate: string
  calculationDate: string
  paidAt: string
  status: AccountingTaxStatus
  principalAmount: number
  penaltyAmount: number
  interestAmount: number
  totalAmount: number
  amount: number
  barcode: string
  pixCode: string
  guideDocumentId: string
  receiptDocumentId: string
  installmentNumber: number
  installmentTotal: number
  notes: string
  alertDaysBefore: number
  createdAt: string
  updatedAt: string
}

export interface AccountingObligationInput {
  clientId: string
  obligationType: string
  competence: string
  periodStart: string
  periodEnd: string
  dueDate: string
  deliveryDate: string
  status: AccountingObligationStatus
  responsibleUserId: string
  recurrenceType: AccountingRecurrenceType
  recurrenceUntil: string
  protocol: string
  notes: string
  guideDocumentId: string
  receiptDocumentId: string
  alertDaysBefore: number
}

export interface AccountingTaxInput {
  clientId: string
  taxType: string
  description: string
  competence: string
  dueDate: string
  calculationDate: string
  paidAt: string
  status: AccountingTaxStatus
  principalAmount: number
  penaltyAmount: number
  interestAmount: number
  totalAmount: number
  barcode: string
  pixCode: string
  guideDocumentId: string
  receiptDocumentId: string
  installmentNumber: number
  installmentTotal: number
  notes: string
  alertDaysBefore: number
}

export interface ComplianceFilters {
  clientId: string
  status: string
  competence: string
  search: string
  page: number
  pageSize: number
}

export type AccountingObligationPage = PaginatedResult<AccountingObligationRecord>
export type AccountingTaxPage = PaginatedResult<AccountingTaxRecordDetailed>

export interface AccountingAlertItem {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  entityType: 'obligation' | 'tax' | 'document' | 'client'
  entityId: string
  alertType: string
  severity: AccountingAlertSeverity
  title: string
  message: string
  dueDate: string
  status: string
}

export interface ClientRegularityItem {
  id: string
  clientId: string
  clientName: string
  source: string
  status: 'regular' | 'attention' | 'critical' | 'not_checked'
  title: string
  detail: string
  impact: string
  action: string
  date: string
}

export interface ClientHealthSummary {
  clientId: string
  clientName: string
  status: 'regular' | 'attention' | 'critical' | 'not_checked'
  score: number
  items: ClientRegularityItem[]
}
