import { supabase } from './supabase'
import type { AdminClient, AdminClientApp, AdminClientAppStatus } from '../types/adminClients'
import { purchasableApplications } from './appCatalog'

type OrganizationRow = {
  id: string
  name: string
  cnpj: string
  active: boolean
  created_by: string | null
}

type ProfileRow = {
  organization_id: string
  contact_name?: string
  email?: string
  phone?: string
  cep?: string
  address?: string
  address_complement?: string
  neighborhood?: string
  city?: string
  state?: string
  discount_percent?: number
  subscription_exempt?: boolean
  notes?: string
}

type UserProfileRow = {
  id: string
  full_name: string
  email: string
}

type OrganizationMemberRow = {
  organization_id: string
  user_id: string
  member_role: string
}

type SubscriptionRow = {
  id: string
  organization_id: string
  application_id: string
  application_name: string
  status: AdminClientAppStatus
  monthly_price: number
  discount_percent: number
  subscription_exempt: boolean
  exemption_until: string | null
  started_at: string | null
  next_billing_date: string | null
}

type AppPricingRow = {
  application_id: string
  name: string
  monthly_price: number
  active: boolean
  sort_order: number
}

function parseCatalogPrice(value?: string) {
  return Number((value ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
}

function mapPurchasedApps(
  subscriptions: SubscriptionRow[],
  organizationId: string,
  pricingRows: AppPricingRow[],
): AdminClientApp[] {
  const organizationSubscriptions = subscriptions.filter(
    (subscription) => subscription.organization_id === organizationId,
  )
  const pricingById = new Map(pricingRows.map((pricing) => [pricing.application_id, pricing]))
  const knownAppIds = new Set([
    ...purchasableApplications.map((application) => application.id),
    ...pricingRows.map((pricing) => pricing.application_id),
    ...organizationSubscriptions.map((subscription) => subscription.application_id),
  ])

  return Array.from(knownAppIds).map((applicationId) => {
    const subscription = organizationSubscriptions.find((item) => item.application_id === applicationId)
    const catalogApp = purchasableApplications.find((application) => application.id === applicationId)
    const pricing = pricingById.get(applicationId)

    return {
      id: subscription?.id,
      applicationId,
      applicationName: subscription?.application_name ?? pricing?.name ?? catalogApp?.name ?? applicationId,
      status: subscription?.status ?? 'inativo',
      monthlyPrice: Number(subscription?.monthly_price ?? pricing?.monthly_price ?? parseCatalogPrice(catalogApp?.price)),
      discountPercent: Number(subscription?.discount_percent ?? 0),
      subscriptionExempt: Boolean(subscription?.subscription_exempt),
      exemptionUntil: subscription?.exemption_until ?? '',
      startedAt: subscription?.started_at ?? '',
      nextBillingDate: subscription?.next_billing_date ?? '',
    }
  })
}
async function safeSelectProfiles() {
  const { data, error } = await supabase.from('admin_client_profiles').select('*')
  if (error) return []
  return (data ?? []) as ProfileRow[]
}

async function safeSelectUserProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email')
  if (error) return []
  return (data ?? []) as UserProfileRow[]
}

async function safeSelectOrganizationMembers() {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, user_id, member_role')
  if (error) return []
  return (data ?? []) as OrganizationMemberRow[]
}

async function safeSelectSubscriptions() {
  const { data, error } = await supabase.from('organization_app_subscriptions').select('*')
  if (error) return []
  return (data ?? []) as SubscriptionRow[]
}

async function safeSelectAppPricing() {
  const { data, error } = await supabase
    .from('platform_app_pricing')
    .select('application_id, name, monthly_price, active, sort_order')
    .order('sort_order')
  if (error) return []
  return (data ?? []) as AppPricingRow[]
}

export async function listAdminClients(): Promise<AdminClient[]> {
  const [{ data: organizations, error }, profiles, userProfiles, members, subscriptions, pricingRows] = await Promise.all([
    supabase.from('organizations').select('id, name, cnpj, active, created_by').order('name'),
    safeSelectProfiles(),
    safeSelectUserProfiles(),
    safeSelectOrganizationMembers(),
    safeSelectSubscriptions(),
    safeSelectAppPricing(),
  ])

  if (error) {
    throw new Error('Nao foi possivel carregar os clientes da plataforma.')
  }

  return ((organizations ?? []) as OrganizationRow[]).map((organization) => {
    const profile = profiles.find((item) => item.organization_id === organization.id)
    const ownerMember = members.find(
      (item) => item.organization_id === organization.id && item.member_role === 'owner',
    )
    const ownerProfile = userProfiles.find(
      (item) => item.id === (organization.created_by ?? ownerMember?.user_id),
    )

    return {
      id: organization.id,
      name: organization.name,
      cnpj: organization.cnpj,
      active: organization.active,
      contactName: profile?.contact_name || ownerProfile?.full_name || organization.name,
      email: profile?.email || ownerProfile?.email || '',
      phone: profile?.phone ?? '',
      cep: profile?.cep ?? '',
      address: profile?.address ?? '',
      addressComplement: profile?.address_complement ?? '',
      neighborhood: profile?.neighborhood ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      discountPercent: Number(profile?.discount_percent ?? 0),
      subscriptionExempt: Boolean(profile?.subscription_exempt),
      notes: profile?.notes ?? '',
      apps: mapPurchasedApps(subscriptions, organization.id, pricingRows),
    }
  })
}

export async function saveAdminClient(client: AdminClient) {
  const { error: organizationError } = await supabase
    .from('organizations')
    .update({
      name: client.name,
      cnpj: client.cnpj,
      active: client.active,
    })
    .eq('id', client.id)

  if (organizationError) {
    throw new Error('Nao foi possivel atualizar os dados principais do cliente.')
  }

  const profilePayload = {
    organization_id: client.id,
    contact_name: client.contactName,
    email: client.email,
    phone: client.phone,
    cep: client.cep,
    address: client.address,
    address_complement: client.addressComplement,
    neighborhood: client.neighborhood,
    city: client.city,
    state: client.state,
    discount_percent: client.discountPercent,
    subscription_exempt: client.subscriptionExempt,
    notes: client.notes,
    updated_at: new Date().toISOString(),
  }

  const legacyProfilePayload = {
    organization_id: client.id,
    contact_name: client.contactName,
    email: client.email,
    phone: client.phone,
    address: client.address,
    city: client.city,
    state: client.state,
    discount_percent: client.discountPercent,
    subscription_exempt: client.subscriptionExempt,
    notes: client.notes,
    updated_at: new Date().toISOString(),
  }

  const { error: profileError } = await supabase.from('admin_client_profiles').upsert(profilePayload)

  if (profileError) {
    const message = profileError.message.toLowerCase()
    const canFallback =
      message.includes('does not exist') ||
      message.includes('schema cache') ||
      message.includes('could not find') ||
      message.includes('column')

    if (!canFallback) {
      throw new Error('Aplique a migration de clientes Admin no Supabase antes de salvar dados cadastrais.')
    }

    const { error: fallbackError } = await supabase.from('admin_client_profiles').upsert(legacyProfilePayload)
    if (fallbackError) {
      throw new Error('Aplique a migration de clientes Admin no Supabase antes de salvar dados cadastrais.')
    }
  }

  if (client.apps.length) {
    const { error: subscriptionsError } = await supabase
      .from('organization_app_subscriptions')
      .upsert(
        client.apps.map((app) => ({
          organization_id: client.id,
          application_id: app.applicationId,
          application_name: app.applicationName,
          status: app.status,
          monthly_price: app.monthlyPrice,
          discount_percent: app.discountPercent,
          subscription_exempt: app.subscriptionExempt,
          exemption_until: app.exemptionUntil || null,
          started_at: app.startedAt || null,
          next_billing_date: app.nextBillingDate || null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'organization_id,application_id' },
      )

    if (subscriptionsError) {
      throw new Error('Nao foi possivel salvar os aplicativos adquiridos.')
    }
  }
}
