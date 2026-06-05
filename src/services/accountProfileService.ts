import { resolveOrganizationId } from './platformService'
import { supabase } from './supabase'
import { formatCnpj, formatPhone, formatPostalCode } from '../utils/formatters'

export interface AccountProfile {
  organizationId: string
  name: string
  cnpj: string
  contactName: string
  email: string
  phone: string
  cep: string
  address: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  referralCode: string
  referredByReferralCode: string
}

const blankProfile: AccountProfile = {
  organizationId: '',
  name: '',
  cnpj: '',
  contactName: '',
  email: '',
  phone: '',
  cep: '',
  address: '',
  addressComplement: '',
  neighborhood: '',
  city: '',
  state: '',
  referralCode: '',
  referredByReferralCode: '',
}

type ProfileData = Record<string, unknown>

function readText(row: ProfileData | null | undefined, key: string) {
  const value = row?.[key]
  return value === null || value === undefined ? '' : String(value)
}

function isSchemaError(error: { message: string } | null) {
  const message = error?.message.toLowerCase() ?? ''
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('column')
  )
}

function assertProfile(error: { message: string } | null, fallback: string) {
  if (!error) return
  throw new Error(
    isSchemaError(error)
      ? 'Execute a migration de dados da conta no Supabase.'
      : fallback,
  )
}

async function createAccountOrganization(profile: AccountProfile) {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    throw new Error('Usuario nao autenticado.')
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .insert({
      name: profile.name || profile.contactName || authData.user.email || 'Meu escritorio',
      cnpj: formatCnpj(profile.cnpj),
      active: true,
      created_by: authData.user.id,
    })
    .select('id')
    .single()

  assertProfile(organizationError, 'Nao foi possivel criar sua empresa.')

  const organizationId = organization?.id
  if (!organizationId) {
    throw new Error('Nao foi possivel identificar a empresa criada.')
  }

  const { error: memberError } = await supabase.from('organization_members').insert({
    organization_id: organizationId,
    user_id: authData.user.id,
    member_role: 'owner',
  })

  assertProfile(memberError, 'Nao foi possivel vincular seu usuario a empresa.')
  return organizationId
}

function createReferralCode(name: string, organizationId: string) {
  const prefix = (name || 'CONTADOR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase()
  return `${prefix || 'CONT'}-${organizationId.slice(0, 6).toUpperCase()}`
}

export async function loadAccountProfile(): Promise<AccountProfile> {
  const organizationId = await resolveOrganizationId()
  const { data: authData } = await supabase.auth.getUser()

  if (!organizationId) {
    const userName = String(authData.user?.user_metadata.name ?? authData.user?.email?.split('@')[0] ?? '')

    return {
      ...blankProfile,
      name: userName,
      contactName: userName,
      email: authData.user?.email ?? '',
    }
  }

  const [{ data: organization, error: organizationError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, cnpj')
        .eq('id', organizationId)
        .maybeSingle(),
      supabase
        .from('admin_client_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ])

  assertProfile(organizationError, 'Nao foi possivel carregar a empresa.')
  assertProfile(profileError, 'Nao foi possivel carregar os dados da conta.')

  const profileData = (profile ?? null) as ProfileData | null

  return {
    organizationId,
    name: organization?.name ?? '',
    cnpj: organization?.cnpj ?? '',
    contactName: readText(profileData, 'contact_name') || String(authData.user?.user_metadata.name ?? ''),
    email: readText(profileData, 'email') || authData.user?.email || '',
    phone: readText(profileData, 'phone'),
    cep: readText(profileData, 'cep'),
    address: readText(profileData, 'address'),
    addressComplement: readText(profileData, 'address_complement'),
    neighborhood: readText(profileData, 'neighborhood'),
    city: readText(profileData, 'city'),
    state: readText(profileData, 'state'),
    referralCode: readText(profileData, 'referral_code') || createReferralCode(organization?.name ?? '', organizationId),
    referredByReferralCode: readText(profileData, 'referred_by_referral_code'),
  }
}

export async function saveAccountProfile(profile: AccountProfile) {
  const organizationId = profile.organizationId || (await createAccountOrganization(profile))

  const { error: organizationError } = await supabase
    .from('organizations')
    .update({
      name: profile.name,
      cnpj: formatCnpj(profile.cnpj),
    })
    .eq('id', organizationId)

  assertProfile(organizationError, 'Nao foi possivel salvar a empresa.')

  let referrerOrganizationId: string | null = null
  if (profile.referredByReferralCode) {
    const { data: referrer } = await supabase
      .from('admin_client_profiles')
      .select('organization_id')
      .eq('referral_code', profile.referredByReferralCode.trim().toUpperCase())
      .neq('organization_id', organizationId)
      .maybeSingle()

    referrerOrganizationId = referrer?.organization_id ?? null
  }

  const fullProfilePayload = {
    organization_id: organizationId,
    contact_name: profile.contactName,
    email: profile.email,
    phone: formatPhone('BR', profile.phone),
    cep: formatPostalCode('BR', profile.cep),
    address: profile.address,
    address_complement: profile.addressComplement,
    neighborhood: profile.neighborhood,
    city: profile.city,
    state: profile.state,
    referral_code: (profile.referralCode || createReferralCode(profile.name, organizationId)).trim().toUpperCase(),
    referred_by_referral_code: profile.referredByReferralCode.trim().toUpperCase(),
    referred_by_organization_id: referrerOrganizationId,
    updated_at: new Date().toISOString(),
  }

  const legacyProfilePayload = {
    organization_id: organizationId,
    contact_name: profile.contactName,
    email: profile.email,
    phone: formatPhone('BR', profile.phone),
    address: profile.address,
    city: profile.city,
    state: profile.state,
    updated_at: new Date().toISOString(),
  }

  const { error: profileError } = await supabase.from('admin_client_profiles').upsert(fullProfilePayload)

  if (profileError && isSchemaError(profileError)) {
    const { error: fallbackError } = await supabase.from('admin_client_profiles').upsert(legacyProfilePayload)
    assertProfile(fallbackError, 'Nao foi possivel salvar os dados da conta.')
    return
  }

  assertProfile(profileError, 'Nao foi possivel salvar os dados da conta.')
}
