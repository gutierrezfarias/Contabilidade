import { supabase } from './supabase'
import type { Organization, UserProfile, UserRole } from '../types/platform'

function databaseError(message: string, fallback: string) {
  return message.includes('does not exist') ? 'Recurso administrativo ainda nao configurado no Supabase.' : fallback
}

function isBootstrapAdminEmail(email?: string) {
  const fallbackAdminEmails = 'gutierrezfarias1@hotmail.com,gutierrezfarias7@gmail.com'
  const adminEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? fallbackAdminEmails)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  return email ? adminEmails.includes(email.toLowerCase()) : false
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    return null
  }

  const fullName = String(
    authData.user.user_metadata.name ?? authData.user.email ?? 'Usuario',
  )

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (roleData?.role) {
    return {
      id: authData.user.id,
      fullName,
      role: isBootstrapAdminEmail(authData.user.email) ? 'admin' : (roleData.role as UserRole),
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (error) {
    return isBootstrapAdminEmail(authData.user.email)
      ? {
          id: authData.user.id,
          fullName,
          role: 'admin',
        }
      : null
  }

  return data
    ? {
        id: data.id,
        fullName: data.full_name,
        role: isBootstrapAdminEmail(authData.user.email) ? 'admin' : (data.role as UserRole),
      }
    : {
        id: authData.user.id,
        fullName,
        role: isBootstrapAdminEmail(authData.user.email) ? 'admin' : 'client',
      }
}

export async function listOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, cnpj, active')
    .order('name')

  if (error) {
    return []
  }

  return (data ?? []).map((organization) => ({
    id: organization.id,
    name: organization.name,
    cnpj: organization.cnpj,
    active: organization.active,
  }))
}

export async function resolveOrganizationId(requestedOrganizationId?: string | null) {
  if (requestedOrganizationId) {
    return requestedOrganizationId
  }

  const organizations = await listOrganizations()
  return organizations[0]?.id ?? null
}

export async function startSupportSession(organizationId: string, reason: string) {
  const { error } = await supabase
    .from('support_sessions')
    .insert({ organization_id: organizationId, reason })

  if (error) {
    throw new Error(databaseError(error.message, 'Nao foi possivel registrar o atendimento.'))
  }
}
