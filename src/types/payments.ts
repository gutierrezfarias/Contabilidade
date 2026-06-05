export type PaymentMethod = 'credit-card' | 'pix'
export type SubscriptionStatus = 'active' | 'inactive'

export interface AppSubscription {
  id: string
  applicationId: string
  customerId: string
  customerName: string
  customerEmail: string
  customerOrganizationName: string
  paymentMethod: PaymentMethod
  purchasedAt: string
  status: SubscriptionStatus
}
