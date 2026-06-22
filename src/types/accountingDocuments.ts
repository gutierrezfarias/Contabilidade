export type AccountingDocumentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'delivered'
export type AccountingDocumentStatus = 'available' | 'sent' | 'viewed' | 'downloaded' | 'archived' | 'rejected' | 'replaced'

export interface AccountingDocument {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  category: string
  description: string
  documentType: string
  competence: string
  dueDate: string
  filename: string
  originalFileName: string
  storageBucket: string
  storagePath: string
  mimeType: string
  fileSize: number
  checksumSha256: string
  status: AccountingDocumentStatus
  approvalStatus: AccountingDocumentApprovalStatus
  versionNumber: number
  responsibleUserId: string
  approvedAt: string
  deliveredAt: string
  createdAt: string
  updatedAt: string
}

export interface AccountingDocumentInput {
  approvalStatus: AccountingDocumentApprovalStatus
  category: string
  clientId: string
  competence: string
  description: string
  documentType: string
  dueDate: string
  responsibleUserId: string
}

export interface AccountingDocumentFilters {
  category: string
  clientId: string
  page: number
  pageSize: number
  search: string
  status: string
}

export interface AccountingDocumentPage {
  documents: AccountingDocument[]
  total: number
}

export type ClientPortalRole = 'viewer' | 'collaborator' | 'manager' | 'owner'
export type ClientPortalStatus = 'invited' | 'active' | 'disabled' | 'removed'

export interface ClientPortalUser {
  id: string
  organizationId: string
  clientId: string
  clientName: string
  authUserId: string
  email: string
  fullName: string
  role: ClientPortalRole
  status: ClientPortalStatus
  recoveryRequestedAt: string
  lastAccessAt: string
  disabledAt: string
  disabledReason: string
  removedAt: string
  removalReason: string
  createdAt: string
  updatedAt: string
}

export interface ClientPortalInviteInput {
  clientId: string
  email: string
  fullName: string
  role: ClientPortalRole
}

export interface ClientPortalAccessUpdateInput {
  portalAccessId: string
  clientId: string
  fullName: string
  role: ClientPortalRole
}

export interface PortalTaxRecord {
  id: string
  taxType: string
  description: string
  amount: number
  principalAmount: number
  penaltyAmount: number
  interestAmount: number
  totalAmount: number
  competence: string
  dueDate: string
  paidAt: string
  status: string
  barcode: string
  pixCode: string
  guideDocumentId: string
  receiptDocumentId: string
}

export interface PortalObligation {
  id: string
  obligationType: string
  competence: string
  periodStart: string
  periodEnd: string
  dueDate: string
  deliveryDate: string
  status: string
  protocol: string
  notes: string
  guideDocumentId: string
  receiptDocumentId: string
}

export interface PortalNfeDocument {
  id: string
  accessKey: string
  number: string
  series: string
  issueDate: string
  amount: number
  status: string
  recipientName: string
  xmlUrl: string
  danfeUrl: string
}
