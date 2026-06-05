import { supabase } from './supabase'

export interface PlatformCompanySettings {
  countryCode: string
  fields: Record<string, string>
}

export const blankPlatformCompanySettings: PlatformCompanySettings = {
  countryCode: 'BR',
  fields: {},
}

function isMissingTable(error: { message: string } | null) {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes('does not exist') || message.includes('schema cache')
}

function assertAdminSettings(error: { message: string } | null, fallback: string) {
  if (!error) return
  const message = error.message.toLowerCase()
  const details = error.message ? ` Detalhe: ${error.message}` : ''

  throw new Error(
    message.includes('row-level security') ||
      message.includes('permission denied') ||
      message.includes('not authorized')
      ? "O Supabase bloqueou o salvamento. Confirme se seu usuario esta com role = 'admin' na tabela public.user_roles."
      : message.includes('does not exist') || message.includes('schema cache')
      ? 'Execute a migration de configuracoes Admin no Supabase.'
      : `${fallback}${details}`,
  )
}

export async function loadPlatformCompanySettings() {
  const { data, error } = await supabase
    .from('platform_company_settings')
    .select('country_code, fields')
    .eq('id', true)
    .maybeSingle()

  if (isMissingTable(error)) {
    return blankPlatformCompanySettings
  }

  assertAdminSettings(error, 'Nao foi possivel carregar os dados da empresa.')

  return data
    ? {
        countryCode: String(data.country_code ?? 'BR'),
        fields: (data.fields ?? {}) as Record<string, string>,
      }
    : blankPlatformCompanySettings
}

export async function savePlatformCompanySettings(settings: PlatformCompanySettings) {
  const { error } = await supabase.from('platform_company_settings').upsert({
    id: true,
    country_code: settings.countryCode,
    fields: settings.fields,
    updated_at: new Date().toISOString(),
  })

  assertAdminSettings(error, 'Nao foi possivel salvar os dados da empresa.')
}
