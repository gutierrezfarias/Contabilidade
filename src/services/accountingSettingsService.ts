import { supabase } from './supabase'
import type {
  AccountingCompanySettings,
  AccountingEmployee,
  CompanyPartner,
  HomeSettings,
} from '../types/accountingSettings'
import {
  formatCnpj,
  formatMunicipalRegistration,
  formatPhone,
  formatPostalCode,
  formatStateRegistration,
} from '../utils/formatters'

export const blankCompanySettings: AccountingCompanySettings = {
  companyName: '',
  logoData: '',
  cep: '',
  address: '',
  addressComplement: '',
  neighborhood: '',
  city: '',
  state: '',
  phone: '',
  whatsapp: '',
  website: '',
  openingHours: '',
  businessDescription: '',
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  articlesOfAssociation: '',
  commercialAddressProof: '',
  cnpjDocumentData: '',
  cnpjDocumentName: '',
  cnpjDocumentText: '',
}

export const blankPartner: Omit<CompanyPartner, 'id' | 'organizationId'> = {
  name: '',
  rg: '',
  cnh: '',
  cpf: '',
  residenceProofData: '',
  residenceProofName: '',
  notes: '',
}

export const blankHomeSettings: HomeSettings = {
  heroTitle: '',
  heroDescription: '',
  footerDescription: '',
  footerEmail: '',
  footerPhone: '',
  footerAddress: '',
}

const googleTrackedFields: Array<keyof AccountingCompanySettings> = [
  'phone',
  'whatsapp',
  'address',
  'addressComplement',
  'city',
  'state',
  'cep',
  'website',
  'openingHours',
  'businessDescription',
]

function assertDatabase(error: { message: string } | null, fallback: string) {
  if (error) {
    const message = error.message.toLowerCase()
    const details = error.message ? ` Detalhe: ${error.message}` : ''

    throw new Error(
      message.includes('row-level security') ||
        message.includes('permission denied') ||
        message.includes('not authorized')
        ? 'O Supabase bloqueou o salvamento. Confirme se este usuario esta vinculado ao escritorio na tabela public.organization_members e rode a migration de permissoes das configuracoes.'
        : message.includes('does not exist') || message.includes('schema cache')
        ? 'Execute a migracao Supabase para habilitar configuracoes.'
        : `${fallback}${details}`,
    )
  }
}

function hasGoogleTrackedChanges(
  before: AccountingCompanySettings,
  after: AccountingCompanySettings,
) {
  return googleTrackedFields.some((field) => String(before[field] ?? '') !== String(after[field] ?? ''))
}

async function markGoogleBusinessOutdated(organizationId: string) {
  const { error } = await supabase
    .from('accountant_google_locations')
    .update({
      sync_status: 'Google desatualizado',
      updated_at: new Date().toISOString(),
    })
    .eq('accountant_id', organizationId)
    .neq('sync_status', 'Nao vinculado')

  if (error?.message.includes('does not exist') || error?.message.includes('schema cache')) {
    return
  }

  assertDatabase(error, 'Nao foi possivel marcar o Google como desatualizado.')
}

export async function loadCompanySettings(organizationId: string | null) {
  if (!organizationId) return blankCompanySettings

  const [
    { data, error },
    { data: organization, error: organizationError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from('company_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name, cnpj')
      .eq('id', organizationId)
      .maybeSingle(),
    supabase
      .from('admin_client_profiles')
      .select('cep, address, address_complement, neighborhood, city, state')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ])

  assertDatabase(error, 'Nao foi possivel carregar as configuracoes.')
  assertDatabase(organizationError, 'Nao foi possivel carregar os dados do escritorio.')
  assertDatabase(profileError, 'Nao foi possivel carregar o endereco do escritorio.')

  return {
    companyName: data?.company_name || organization?.name || '',
    logoData: data?.logo_data || data?.logo_url || '',
    cep: data?.cep || profile?.cep || '',
    address: data?.address || profile?.address || '',
    addressComplement: data?.address_complement || profile?.address_complement || '',
    neighborhood: data?.neighborhood || profile?.neighborhood || '',
    city: data?.city || profile?.city || '',
    state: data?.state || profile?.state || '',
    phone: data?.phone || '',
    whatsapp: data?.whatsapp || '',
    website: data?.website || '',
    openingHours: data?.opening_hours || '',
    businessDescription: data?.business_description || '',
    cnpj: data?.cnpj || organization?.cnpj || '',
    municipalRegistration: data?.municipal_registration || '',
    stateRegistration: data?.state_registration || '',
    articlesOfAssociation: data?.articles_of_association || '',
    commercialAddressProof: data?.commercial_address_proof || '',
    cnpjDocumentData: data?.cnpj_document_data || '',
    cnpjDocumentName: data?.cnpj_document_name || '',
    cnpjDocumentText: data?.cnpj_document_text || '',
  } satisfies AccountingCompanySettings
}

export async function saveCompanySettings(organizationId: string, settings: AccountingCompanySettings) {
  const beforeSettings = await loadCompanySettings(organizationId)
  const normalizedSettings = {
    ...settings,
    cep: formatPostalCode('BR', settings.cep),
    cnpj: formatCnpj(settings.cnpj),
    municipalRegistration: formatMunicipalRegistration(settings.municipalRegistration),
    phone: formatPhone('BR', settings.phone),
    stateRegistration: formatStateRegistration(settings.stateRegistration),
    whatsapp: formatPhone('BR', settings.whatsapp),
  }

  const [{ error: organizationError }, { error: profileError }, { error }] = await Promise.all([
    supabase
      .from('organizations')
      .update({
        name: normalizedSettings.companyName,
        cnpj: normalizedSettings.cnpj,
      })
      .eq('id', organizationId),
    supabase.from('admin_client_profiles').upsert({
      organization_id: organizationId,
      cep: normalizedSettings.cep,
      address: normalizedSettings.address,
      address_complement: normalizedSettings.addressComplement,
      neighborhood: normalizedSettings.neighborhood,
      city: normalizedSettings.city,
      state: normalizedSettings.state,
      updated_at: new Date().toISOString(),
    }),
    supabase.from('company_settings').upsert({
      organization_id: organizationId,
      company_name: normalizedSettings.companyName,
      logo_data: normalizedSettings.logoData || null,
      cep: normalizedSettings.cep,
      address: normalizedSettings.address,
      address_complement: normalizedSettings.addressComplement,
      neighborhood: normalizedSettings.neighborhood,
      city: normalizedSettings.city,
      state: normalizedSettings.state,
      phone: normalizedSettings.phone,
      whatsapp: normalizedSettings.whatsapp,
      website: normalizedSettings.website,
      opening_hours: normalizedSettings.openingHours,
      business_description: normalizedSettings.businessDescription,
      cnpj: normalizedSettings.cnpj,
      municipal_registration: normalizedSettings.municipalRegistration,
      state_registration: normalizedSettings.stateRegistration,
      articles_of_association: normalizedSettings.articlesOfAssociation,
      commercial_address_proof: normalizedSettings.commercialAddressProof,
      cnpj_document_data: normalizedSettings.cnpjDocumentData || null,
      cnpj_document_name: normalizedSettings.cnpjDocumentName,
      cnpj_document_text: normalizedSettings.cnpjDocumentText,
      updated_at: new Date().toISOString(),
    }),
  ])

  assertDatabase(organizationError, 'Nao foi possivel salvar os dados principais.')
  assertDatabase(profileError, 'Nao foi possivel salvar o endereco do escritorio.')
  assertDatabase(error, 'Nao foi possivel salvar as configuracoes.')

  if (hasGoogleTrackedChanges(beforeSettings, normalizedSettings)) {
    await markGoogleBusinessOutdated(organizationId)
  }
}

export async function loadPartners(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('company_partners')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  assertDatabase(error, 'Nao foi possivel carregar socios.')
  return (data ?? []).map((partner) => ({
    id: partner.id,
    organizationId: partner.organization_id,
    name: partner.name,
    rg: partner.rg,
    cnh: partner.cnh,
    cpf: partner.cpf,
    residenceProofData: partner.residence_proof_data ?? '',
    residenceProofName: partner.residence_proof_name ?? '',
    notes: partner.notes ?? '',
  })) satisfies CompanyPartner[]
}

export async function savePartner(
  organizationId: string,
  partner: Omit<CompanyPartner, 'organizationId'>,
) {
  const payload = {
    organization_id: organizationId,
    name: partner.name,
    rg: partner.rg,
    cnh: partner.cnh,
    cpf: partner.cpf,
    residence_proof_data: partner.residenceProofData || null,
    residence_proof_name: partner.residenceProofName,
    notes: partner.notes,
    updated_at: new Date().toISOString(),
  }

  const query = partner.id
    ? supabase.from('company_partners').update(payload).eq('id', partner.id)
    : supabase.from('company_partners').insert(payload)

  const { error } = await query
  assertDatabase(error, 'Nao foi possivel salvar o socio.')
}

export async function deletePartner(partnerId: string) {
  const { error: deleteError } = await supabase.from('company_partners').delete().eq('id', partnerId)
  assertDatabase(deleteError, 'Nao foi possivel excluir o socio.')
}

export async function loadEmployees(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('employees')
    .select('id, name, role, email')
    .eq('organization_id', organizationId)
    .order('created_at')

  assertDatabase(error, 'Nao foi possivel carregar funcionarios.')
  return (data ?? []) as AccountingEmployee[]
}

export async function addEmployee(organizationId: string, employee: Omit<AccountingEmployee, 'id'>) {
  const { error } = await supabase.from('employees').insert({
    organization_id: organizationId,
    name: employee.name,
    role: employee.role,
    email: employee.email,
  })

  assertDatabase(error, 'Nao foi possivel adicionar funcionario.')
}

export async function loadHomeSettings() {
  const { data, error } = await supabase.from('home_settings').select('*').eq('id', true).maybeSingle()
  if (error?.message.toLowerCase().includes('schema cache') || error?.message.includes('does not exist')) {
    return blankHomeSettings
  }
  assertDatabase(error, 'Nao foi possivel carregar a pagina inicial.')
  if (!data) return blankHomeSettings

  return {
    heroTitle: data.hero_title,
    heroDescription: data.hero_description,
    footerDescription: data.footer_description,
    footerEmail: data.footer_email,
    footerPhone: data.footer_phone,
    footerAddress: data.footer_address,
  } satisfies HomeSettings
}

export async function saveHomeSettings(settings: HomeSettings) {
  const { error } = await supabase.from('home_settings').upsert({
    id: true,
    hero_title: settings.heroTitle,
    hero_description: settings.heroDescription,
    footer_description: settings.footerDescription,
    footer_email: settings.footerEmail,
    footer_phone: settings.footerPhone,
    footer_address: settings.footerAddress,
    updated_at: new Date().toISOString(),
  })

  assertDatabase(error, 'Nao foi possivel salvar a pagina inicial.')
}
