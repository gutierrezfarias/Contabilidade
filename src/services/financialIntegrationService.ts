import { supabase } from './supabase'
import type {
  FinancialApiIntegration,
  FinancialIntegrationStatus,
} from '../types/financialIntegrations'

type FinancialIntegrationRow = {
  id: string
  provider: string
  name: string
  status: FinancialIntegrationStatus
  active: boolean
  config: Record<string, string>
  notes: string
}

function isMissingTable(error: { message: string } | null) {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes('does not exist') || message.includes('schema cache')
}

function assertFinancialIntegration(error: { message: string } | null, fallback: string) {
  if (!error) return
  if (isMissingTable(error)) {
    throw new Error('Execute a migration de integracoes financeiras no Supabase.')
  }

  throw new Error(`${fallback} Detalhe: ${error.message}`)
}

export async function listFinancialApiIntegrations() {
  const { data, error } = await supabase
    .from('financial_api_integrations')
    .select('*')
    .order('created_at', { ascending: false })

  if (isMissingTable(error)) return []
  assertFinancialIntegration(error, 'Nao foi possivel carregar as integracoes financeiras.')

  return ((data ?? []) as FinancialIntegrationRow[]).map((item) => ({
    id: item.id,
    provider: item.provider,
    name: item.name,
    status: item.status,
    active: item.active,
    config: item.config ?? {},
    notes: item.notes ?? '',
  }))
}

export async function saveFinancialApiIntegration(integration: FinancialApiIntegration) {
  const payload = {
    provider: integration.provider,
    name: integration.name,
    status: integration.status,
    active: integration.active,
    config: integration.config,
    notes: integration.notes,
    updated_at: new Date().toISOString(),
  }

  const { error } = integration.id
    ? await supabase.from('financial_api_integrations').update(payload).eq('id', integration.id)
    : await supabase.from('financial_api_integrations').insert(payload)

  assertFinancialIntegration(error, 'Nao foi possivel salvar a integracao financeira.')
}

export async function deleteFinancialApiIntegration(integrationId: string) {
  const { error } = await supabase.from('financial_api_integrations').delete().eq('id', integrationId)
  assertFinancialIntegration(error, 'Nao foi possivel excluir a integracao financeira.')
}
