import { supabase } from './supabase'
import type { WebsiteSite, WebsiteTemplate } from '../types/website'

export type WebsiteSiteInput = Omit<WebsiteSite, 'organizationId' | 'updatedAt'>

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find')
        ? 'Execute a migracao Supabase do Criador de Site antes de usar este modulo.'
        : fallback,
    )
  }
}

function mapTemplate(row: Record<string, unknown>): WebsiteTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    previewImage: String(row.preview_image ?? ''),
    layoutKey: String(row.layout_key ?? 'classic'),
    active: Boolean(row.active),
  }
}

function mapSite(row: Record<string, unknown>): WebsiteSite {
  return {
    organizationId: String(row.organization_id),
    templateId: String(row.template_id ?? ''),
    siteName: String(row.site_name ?? ''),
    domain: String(row.domain ?? ''),
    headline: String(row.headline ?? ''),
    subtitle: String(row.subtitle ?? ''),
    aboutText: String(row.about_text ?? ''),
    servicesText: String(row.services_text ?? ''),
    primaryColor: String(row.primary_color ?? '#4f46e5'),
    logoData: String(row.logo_data ?? ''),
    heroImageData: String(row.hero_image_data ?? ''),
    published: Boolean(row.published),
    updatedAt: String(row.updated_at ?? ''),
  }
}

export async function listWebsiteTemplates() {
  const { data, error } = await supabase
    .from('website_templates')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  fail(error, 'Nao foi possivel carregar os modelos de site.')
  return (data ?? []).map((template) => mapTemplate(template))
}

export async function loadWebsiteSite(organizationId: string | null) {
  if (!organizationId) return null

  const { data, error } = await supabase
    .from('website_sites')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  fail(error, 'Nao foi possivel carregar seu site.')
  return data ? mapSite(data) : null
}

export async function saveWebsiteSite(organizationId: string, input: WebsiteSiteInput) {
  const { error } = await supabase
    .from('website_sites')
    .upsert(
      {
        organization_id: organizationId,
        template_id: input.templateId || null,
        site_name: input.siteName,
        domain: input.domain,
        headline: input.headline,
        subtitle: input.subtitle,
        about_text: input.aboutText,
        services_text: input.servicesText,
        primary_color: input.primaryColor || '#4f46e5',
        logo_data: input.logoData || null,
        hero_image_data: input.heroImageData || null,
        published: input.published,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )

  fail(error, 'Nao foi possivel salvar o site.')
}
