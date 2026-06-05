import { createAccountingClient } from './accountingRepository'
import { supabase } from './supabase'
import type { MiniCrmLead, MiniCrmStage } from '../types/miniCrm'
import { formatCnpj, formatPhone } from '../utils/formatters'

export type MiniCrmLeadInput = Omit<
  MiniCrmLead,
  'id' | 'organizationId' | 'convertedClientId' | 'createdAt' | 'updatedAt'
>

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find')
        ? 'Execute a migracao Supabase do Mini CRM antes de usar este modulo.'
        : fallback,
    )
  }
}

function mapLead(row: Record<string, unknown>): MiniCrmLead {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    contactName: String(row.contact_name ?? ''),
    companyName: String(row.company_name ?? ''),
    cnpj: String(row.cnpj ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    source: String(row.source ?? ''),
    stage: String(row.stage ?? 'Lead') as MiniCrmStage,
    estimatedValue: Number(row.estimated_value ?? 0),
    nextActionDate: String(row.next_action_date ?? ''),
    notes: String(row.notes ?? ''),
    convertedClientId: row.converted_client_id ? String(row.converted_client_id) : undefined,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function normalizeLead(input: MiniCrmLeadInput) {
  return {
    contact_name: input.contactName,
    company_name: input.companyName,
    cnpj: formatCnpj(input.cnpj),
    email: input.email,
    phone: formatPhone('BR', input.phone),
    source: input.source,
    stage: input.stage,
    estimated_value: Number(input.estimatedValue || 0),
    next_action_date: input.nextActionDate || null,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  }
}

export async function listMiniCrmLeads(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('mini_crm_leads')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })

  fail(error, 'Nao foi possivel carregar os leads.')
  return (data ?? []).map((lead) => mapLead(lead))
}

export async function saveMiniCrmLead(
  organizationId: string,
  input: MiniCrmLeadInput,
  leadId?: string | null,
) {
  const payload = {
    organization_id: organizationId,
    ...normalizeLead(input),
  }

  const request = leadId
    ? supabase.from('mini_crm_leads').update(payload).eq('id', leadId)
    : supabase.from('mini_crm_leads').insert(payload)

  const { error } = await request
  fail(error, 'Nao foi possivel salvar o lead.')
}

export async function deleteMiniCrmLead(leadId: string) {
  const { error } = await supabase.from('mini_crm_leads').delete().eq('id', leadId)
  fail(error, 'Nao foi possivel excluir o lead.')
}

export async function convertLeadToAccountingClient(organizationId: string, lead: MiniCrmLead) {
  await createAccountingClient(organizationId, {
    companyName: lead.companyName || lead.contactName,
    cnpj: lead.cnpj,
    phone: lead.phone,
    email: lead.email,
    cep: '',
    address: '',
    neighborhood: '',
    city: '',
    state: '',
    taxRegime: 'Nao informado',
    companySize: 'Nao informado',
    mainCnae: '',
    legalNature: '',
    photoData: '',
    isMonthly: true,
    monthlyFee: 0,
  })

  const { error } = await supabase
    .from('mini_crm_leads')
    .update({ stage: 'Cliente', updated_at: new Date().toISOString() })
    .eq('id', lead.id)

  fail(error, 'Cliente criado, mas nao foi possivel atualizar o lead.')
}
