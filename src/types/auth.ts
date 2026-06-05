export interface AuthUser {
  id: string
  name: string
  email: string
  organizationName?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData extends LoginCredentials {
  name: string
  phone: string
  confirmPassword: string
}

export interface ServiceMessage {
  message: string
}

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<ServiceMessage>
  forgotPassword: (email: string) => Promise<ServiceMessage>
  updatePassword: (newPassword: string) => Promise<ServiceMessage>
  logout: () => Promise<void>
}
