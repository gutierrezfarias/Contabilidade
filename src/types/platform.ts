export type UserRole = 'admin' | 'client'

export interface UserProfile {
  id: string
  fullName: string
  role: UserRole
}

export interface Organization {
  id: string
  name: string
  cnpj: string
  active: boolean
}
