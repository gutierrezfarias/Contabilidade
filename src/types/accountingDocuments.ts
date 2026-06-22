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

export interface ClientPortalUser {
  id: string
  organizationId: string
  clientId: string
  email: string
  fullName: string
  role: 'owner' | 'viewer'
  status: 'invited' | 'active' | 'disabled'
}

export interface ClientPortalInviteInput {
  clientId: string
  email: string
  fullName: string
  role: 'owner' | 'viewer'
}

export interface PortalTaxRecord {
  id: string
  taxType: string
  description: string
  amount: number
  competence: string
  dueDate: string
  status: string
}

export interface PortalObligation {
  id: string
  obligationType: string
  competence: string
  dueDate: string
  deliveryDate: string
  status: string
  protocol: string
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
