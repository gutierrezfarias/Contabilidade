import { supabase } from './supabase'

export interface PlatformAppPricing {
  applicationId: string
  name: string
  description: string
  monthlyPrice: number
  discountPercent: number
  active: boolean
  isBundle: boolean
  includedApplicationIds: string[]
  sortOrder: number
}

export interface AdminWebsiteTemplate {
  id?: string
  name: string
  description: string
  previewImage: string
  layoutKey: string
  active: boolean
  sortOrder: number
}

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find')
        ? 'Execute a migracao Supabase de aplicativos/precos antes de usar esta tela.'
        : fallback,
    )
  }
}

function mapPricing(row: Record<string, unknown>): PlatformAppPricing {
  return {
    applicationId: String(row.application_id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    monthlyPrice: Number(row.monthly_price ?? 0),
    discountPercent: Number(row.discount_percent ?? 0),
    active: Boolean(row.active),
    isBundle: Boolean(row.is_bundle),
    includedApplicationIds: Array.isArray(row.included_application_ids)
      ? row.included_application_ids.map(String)
      : [],
    sortOrder: Number(row.sort_order ?? 0),
  }
}

function mapTemplate(row: Record<string, unknown>): AdminWebsiteTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    previewImage: String(row.preview_image ?? ''),
    layoutKey: String(row.layout_key ?? ''),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
  }
}

export async function listPlatformAppPricing() {
  const { data, error } = await supabase
    .from('platform_app_pricing')
    .select('*')
    .order('sort_order')

  fail(error, 'Nao foi possivel carregar os precos dos aplicativos.')
  return (data ?? []).map((item) => mapPricing(item))
}

export async function savePlatformAppPricing(input: PlatformAppPricing) {
  const { error } = await supabase
    .from('platform_app_pricing')
    .upsert(
      {
        application_id: input.applicationId,
        name: input.name,
        description: input.description,
        monthly_price: input.monthlyPrice,
        discount_percent: input.discountPercent,
        active: input.active,
        is_bundle: input.isBundle,
        included_application_ids: input.includedApplicationIds,
        sort_order: input.sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'application_id' },
    )

  fail(error, 'Nao foi possivel salvar o preco do aplicativo.')
}

export async function listAdminWebsiteTemplates() {
  const { data, error } = await supabase
    .from('website_templates')
    .select('*')
    .order('sort_order')

  fail(error, 'Nao foi possivel carregar os modelos de site.')
  return (data ?? []).map((item) => mapTemplate(item))
}

export async function saveAdminWebsiteTemplate(input: AdminWebsiteTemplate) {
  const payload = {
    name: input.name,
    description: input.description,
    preview_image: input.previewImage,
    layout_key: input.layoutKey,
    active: input.active,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  }

  const request = input.id
    ? supabase.from('website_templates').update(payload).eq('id', input.id)
    : supabase.from('website_templates').insert(payload)

  const { error } = await request
  fail(error, 'Nao foi possivel salvar o modelo de site.')
}

export async function deleteAdminWebsiteTemplate(templateId: string) {
  const { error } = await supabase.from('website_templates').delete().eq('id', templateId)
  fail(error, 'Nao foi possivel excluir o modelo.')
}
