import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  AuthUser,
  LoginCredentials,
  RegisterData,
  ServiceMessage,
} from '../types/auth'

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    name: String(user.user_metadata.name ?? user.email?.split('@')[0] ?? 'Usuário'),
    email: user.email ?? '',
    organizationName: user.user_metadata.organization_name
      ? String(user.user_metadata.organization_name)
      : undefined,
  }
}

function redirectUrl(path: string) {
  return `${window.location.origin}${path}`
}

function authErrorMessage(message: string) {
  if (message.toLowerCase().includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }

  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.'
  }

  return message
}

async function ensureAuthEmailExists(email: string) {
  const { data, error } = await supabase.rpc('auth_email_exists', {
    candidate_email: email.trim().toLowerCase(),
  })

  if (error) {
    throw new Error('Nao foi possivel validar se o e-mail existe. Execute a migration de verificacao de e-mail no Supabase.')
  }

  if (!data) {
    throw new Error('Este e-mail nao existe no sistema.')
  }
}

export const authService = {
  async getSessionUser(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      return null
    }

    return data.user ? mapUser(data.user) : null
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ? mapUser(session.user) : null)
    })
  },

  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) {
      throw new Error(authErrorMessage(error.message))
    }

    return mapUser(data.user)
  },

  async register(data: RegisterData): Promise<ServiceMessage> {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          phone: data.phone,
        },
        emailRedirectTo: redirectUrl('/login'),
      },
    })

    if (error) {
      throw new Error(authErrorMessage(error.message))
    }

    return {
      message:
        'Cadastro realizado! Enviamos um e-mail de confirmação. Confirme-o antes de entrar.',
    }
  },

  async forgotPassword(email: string): Promise<ServiceMessage> {
    await ensureAuthEmailExists(email)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl('/redefinir-senha'),
    })

    if (error) {
      throw new Error(authErrorMessage(error.message))
    }

    return {
      message: 'Enviamos as instruções de recuperação para o e-mail informado.',
    }
  },

  async updatePassword(newPassword: string): Promise<ServiceMessage> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      throw new Error(authErrorMessage(error.message))
    }

    return { message: 'Senha redefinida com sucesso. Você já pode continuar.' }
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw new Error(authErrorMessage(error.message))
    }
  },
}
