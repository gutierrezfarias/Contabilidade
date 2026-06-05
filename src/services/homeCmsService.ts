import { supabase } from './supabase'
import { loadHomeSettings, saveHomeSettings } from './accountingSettingsService'
import { footerContent, homeBanners, homeSlides } from './homeContent'
import type {
  FooterContent,
  FooterGroupRecord,
  FooterLinkRecord,
  HomeBanner,
  HomeContent,
  HomeSlide,
  SlideTheme,
} from '../types/home'
import type { HomeSettings } from '../types/accountingSettings'

type SlideInput = Omit<HomeSlide, 'id'>
type BannerInput = Omit<HomeBanner, 'id'>
type FooterGroupInput = Omit<FooterGroupRecord, 'id' | 'links'>
type FooterLinkInput = Omit<FooterLinkRecord, 'id'>

function dbError(error: { message: string } | null, fallback: string) {
  if (!error) return
  const message = error.message.toLowerCase()
  const details = error.message ? ` Detalhe: ${error.message}` : ''

  throw new Error(
      message.includes('row-level security') ||
      message.includes('permission denied') ||
      message.includes('not authorized')
      ? "O Supabase bloqueou o salvamento. Confirme se seu usuario esta com role = 'admin' na tabela public.user_roles."
      : message.includes('does not exist') || message.includes('schema cache')
      ? 'Execute a migracao da pagina inicial no Supabase.'
      : `${fallback}${details}`,
  )
}

function isMissingCmsTable(error: { message: string } | null) {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes('does not exist') || message.includes('schema cache')
}

function mapSlide(row: Record<string, unknown>): HomeSlide {
  return {
    id: String(row.id),
    eyebrow: String(row.eyebrow ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    theme: String(row.theme ?? 'focus') as SlideTheme,
    buttonLabel: String(row.button_label ?? ''),
    buttonUrl: String(row.button_url ?? ''),
    imageUrl: String(row.image_url ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }
}

function mapBanner(row: Record<string, unknown>): HomeBanner {
  return {
    id: String(row.id),
    category: String(row.category ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    imageUrl: String(row.image_url ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }
}

function mapFooterLink(row: Record<string, unknown>): FooterLinkRecord {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    label: String(row.label ?? ''),
    url: String(row.url ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }
}

export async function listHomeSlides(includeInactive = false) {
  let query = supabase.from('home_slides').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (isMissingCmsTable(error)) return []
  dbError(error, 'Nao foi possivel carregar os slides.')
  return (data ?? []).map(mapSlide)
}

export async function saveHomeSlide(slide: SlideInput, slideId?: string) {
  const payload = {
    eyebrow: slide.eyebrow,
    title: slide.title,
    description: slide.description,
    theme: slide.theme,
    button_label: slide.buttonLabel ?? '',
    button_url: slide.buttonUrl ?? '',
    image_url: slide.imageUrl ?? '',
    sort_order: slide.sortOrder ?? 0,
    active: slide.active ?? true,
    updated_at: new Date().toISOString(),
  }

  const { error } = slideId
    ? await supabase.from('home_slides').update(payload).eq('id', slideId)
    : await supabase.from('home_slides').insert(payload)
  dbError(error, 'Nao foi possivel salvar o slide.')
}

export async function deleteHomeSlide(slideId: string) {
  const { error } = await supabase.from('home_slides').delete().eq('id', slideId)
  dbError(error, 'Nao foi possivel excluir o slide.')
}

export async function listHomeBanners(includeInactive = false) {
  let query = supabase.from('home_banners').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (isMissingCmsTable(error)) return []
  dbError(error, 'Nao foi possivel carregar os banners.')
  return (data ?? []).map(mapBanner)
}

export async function saveHomeBanner(banner: BannerInput, bannerId?: string) {
  const payload = {
    category: banner.category,
    title: banner.title,
    description: banner.description,
    image_url: banner.imageUrl ?? '',
    sort_order: banner.sortOrder ?? 0,
    active: banner.active ?? true,
    updated_at: new Date().toISOString(),
  }

  const { error } = bannerId
    ? await supabase.from('home_banners').update(payload).eq('id', bannerId)
    : await supabase.from('home_banners').insert(payload)
  dbError(error, 'Nao foi possivel salvar o banner.')
}

export async function deleteHomeBanner(bannerId: string) {
  const { error } = await supabase.from('home_banners').delete().eq('id', bannerId)
  dbError(error, 'Nao foi possivel excluir o banner.')
}

export async function listFooterGroups() {
  const { data: groups, error } = await supabase
    .from('home_footer_groups')
    .select('*')
    .order('sort_order')
  if (isMissingCmsTable(error)) return []
  dbError(error, 'Nao foi possivel carregar grupos do footer.')

  const { data: links, error: linksError } = await supabase
    .from('home_footer_links')
    .select('*')
    .order('sort_order')
  if (isMissingCmsTable(linksError)) return []
  dbError(linksError, 'Nao foi possivel carregar links do footer.')

  return (groups ?? []).map((group) => ({
    id: group.id,
    title: group.title,
    sortOrder: group.sort_order,
    links: (links ?? [])
      .filter((link) => link.group_id === group.id)
      .map(mapFooterLink),
  })) as FooterGroupRecord[]
}

export async function saveFooterGroup(group: FooterGroupInput, groupId?: string) {
  const payload = {
    title: group.title,
    sort_order: group.sortOrder,
    updated_at: new Date().toISOString(),
  }
  const { error } = groupId
    ? await supabase.from('home_footer_groups').update(payload).eq('id', groupId)
    : await supabase.from('home_footer_groups').insert(payload)
  dbError(error, 'Nao foi possivel salvar o grupo do footer.')
}

export async function deleteFooterGroup(groupId: string) {
  const { error } = await supabase.from('home_footer_groups').delete().eq('id', groupId)
  dbError(error, 'Nao foi possivel excluir o grupo do footer.')
}

export async function saveFooterLink(link: FooterLinkInput, linkId?: string) {
  const payload = {
    group_id: link.groupId,
    label: link.label,
    url: link.url,
    sort_order: link.sortOrder,
    active: link.active,
    updated_at: new Date().toISOString(),
  }
  const { error } = linkId
    ? await supabase.from('home_footer_links').update(payload).eq('id', linkId)
    : await supabase.from('home_footer_links').insert(payload)
  dbError(error, 'Nao foi possivel salvar o link do footer.')
}

export async function deleteFooterLink(linkId: string) {
  const { error } = await supabase.from('home_footer_links').delete().eq('id', linkId)
  dbError(error, 'Nao foi possivel excluir o link do footer.')
}

export async function loadHomeContent(): Promise<HomeContent> {
  const [settings, slides, banners, footerGroups] = await Promise.all([
    loadHomeSettings(),
    listHomeSlides(),
    listHomeBanners(),
    listFooterGroups(),
  ])

  const footer: FooterContent = {
    ...footerContent,
    description: settings.footerDescription || footerContent.description,
    email: settings.footerEmail || footerContent.email,
    phone: settings.footerPhone || footerContent.phone,
    address: settings.footerAddress || footerContent.address,
    groups: footerGroups.length
      ? footerGroups.map((group) => ({
          id: group.id,
          title: group.title,
          links: group.links
            .filter((link) => link.active)
            .map((link) => ({ label: link.label, url: link.url })),
        }))
      : footerContent.groups,
  }

  return {
    slides: slides.length ? slides : homeSlides,
    banners: banners.length ? banners : homeBanners,
    footer,
    footerGroups,
  }
}

export async function saveFooterContact(settings: Pick<
  HomeSettings,
  'footerDescription' | 'footerEmail' | 'footerPhone' | 'footerAddress'
>) {
  const currentSettings = await loadHomeSettings()
  await saveHomeSettings({ ...currentSettings, ...settings })
}
