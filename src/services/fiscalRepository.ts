import { supabase } from './supabase'
import type {
  FiscalCompanyProfile,
  FiscalCompanyProfileInput,
  FiscalProduct,
  FiscalProductInput,
  FiscalRule,
  FiscalRuleInput,
} from '../types/fiscal'
import { formatCnpj, formatMunicipalRegistration, formatStateRegistration } from '../utils/formatters'

function fiscalError(error: { message: string } | null, fallback: string) {
  if (!error) return

  if (
    error.message.includes('does not exist') ||
    error.message.includes('schema cache') ||
    error.message.includes('Could not find')
  ) {
    throw new Error('Banco fiscal incompleto no Supabase. Rode a migration 20260610_fiscal_module_foundation.sql.')
  }

  throw new Error(fallback)
}

function mapProfile(row: Record<string, unknown>): FiscalCompanyProfile {
  const rawSecondaryCnaes = row.secondary_cnaes

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    cnpj: String(row.cnpj ?? ''),
    stateRegistration: String(row.state_registration ?? ''),
    municipalRegistration: String(row.municipal_registration ?? ''),
    stateUf: String(row.state_uf ?? ''),
    city: String(row.city ?? ''),
    cityIbgeCode: String(row.city_ibge_code ?? ''),
    mainCnae: String(row.main_cnae ?? ''),
    secondaryCnaes: Array.isArray(rawSecondaryCnaes) ? rawSecondaryCnaes.map(String) : [],
    taxRegime: String(row.tax_regime ?? 'Nao informado'),
    crt: String(row.crt ?? ''),
    icmsTaxpayerIndicator: String(row.icms_taxpayer_indicator ?? 'Nao informado'),
    defaultFinalConsumer: Boolean(row.default_final_consumer),
    defaultNfeSeries: String(row.default_nfe_series ?? '1'),
    defaultEnvironment: String(row.default_environment ?? 'homologacao') === 'producao' ? 'producao' : 'homologacao',
    pisCofinsRegime: String(row.pis_cofins_regime ?? 'Nao informado'),
    fiscalNotes: String(row.fiscal_notes ?? ''),
    approvalStatus: String(row.approval_status ?? 'Incompleto') as FiscalCompanyProfile['approvalStatus'],
    active: Boolean(row.active),
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapProduct(row: Record<string, unknown>): FiscalProduct {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    productCode: String(row.product_code ?? ''),
    description: String(row.description ?? ''),
    gtin: String(row.gtin ?? ''),
    commercialUnit: String(row.commercial_unit ?? 'UN'),
    ncm: String(row.ncm ?? ''),
    cest: String(row.cest ?? ''),
    merchandiseOrigin: String(row.merchandise_origin ?? '0'),
    itemType: String(row.item_type ?? 'Mercadoria'),
    defaultCfopIn: String(row.default_cfop_in ?? ''),
    defaultCfopOut: String(row.default_cfop_out ?? ''),
    icmsCst: String(row.icms_cst ?? ''),
    icmsCsosn: String(row.icms_csosn ?? ''),
    pisCst: String(row.pis_cst ?? ''),
    pisRate: numberValue(row.pis_rate),
    cofinsCst: String(row.cofins_cst ?? ''),
    cofinsRate: numberValue(row.cofins_rate),
    ipiCst: String(row.ipi_cst ?? ''),
    ipiRate: numberValue(row.ipi_rate),
    icmsRate: numberValue(row.icms_rate),
    icmsBaseReduction: numberValue(row.icms_base_reduction),
    hasIcmsSt: Boolean(row.has_icms_st),
    mvaRate: numberValue(row.mva_rate),
    fcpRate: numberValue(row.fcp_rate),
    fiscalBenefitCode: String(row.fiscal_benefit_code ?? ''),
    fiscalStatus: String(row.fiscal_status ?? 'Pendente') as FiscalProduct['fiscalStatus'],
    groupId: String(row.group_id ?? ''),
    notes: String(row.notes ?? ''),
    active: Boolean(row.active),
  }
}

function mapRule(row: Record<string, unknown>): FiscalRule {
  const finalConsumer = row.final_consumer

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    ruleCode: String(row.rule_code ?? ''),
    name: String(row.name ?? ''),
    priority: numberValue(row.priority),
    active: Boolean(row.active),
    startDate: String(row.start_date ?? ''),
    endDate: String(row.end_date ?? ''),
    taxRegime: String(row.tax_regime ?? ''),
    direction: String(row.direction ?? 'saida') === 'entrada' ? 'entrada' : 'saida',
    originUf: String(row.origin_uf ?? ''),
    destinationUf: String(row.destination_uf ?? ''),
    recipientTaxpayerIndicator: String(row.recipient_taxpayer_indicator ?? ''),
    finalConsumer: finalConsumer === null || finalConsumer === undefined ? null : Boolean(finalConsumer),
    nfePurpose: String(row.nfe_purpose ?? ''),
    ncm: String(row.ncm ?? ''),
    cest: String(row.cest ?? ''),
    productId: String(row.product_id ?? ''),
    groupId: String(row.group_id ?? ''),
    merchandiseOrigin: String(row.merchandise_origin ?? ''),
    cfop: String(row.cfop ?? ''),
    icmsCst: String(row.icms_cst ?? ''),
    icmsCsosn: String(row.icms_csosn ?? ''),
    icmsBaseMode: String(row.icms_base_mode ?? ''),
    icmsRate: numberValue(row.icms_rate),
    icmsBaseReduction: numberValue(row.icms_base_reduction),
    pisCst: String(row.pis_cst ?? ''),
    pisRate: numberValue(row.pis_rate),
    cofinsCst: String(row.cofins_cst ?? ''),
    cofinsRate: numberValue(row.cofins_rate),
    ipiCst: String(row.ipi_cst ?? ''),
    ipiRate: numberValue(row.ipi_rate),
    hasIcmsSt: Boolean(row.has_icms_st),
    mvaRate: numberValue(row.mva_rate),
    fcpRate: numberValue(row.fcp_rate),
    fiscalBenefitCode: String(row.fiscal_benefit_code ?? ''),
    approvalStatus: String(row.approval_status ?? 'Aguardando revisao') as FiscalRule['approvalStatus'],
    version: numberValue(row.version) || 1,
    notes: String(row.notes ?? ''),
  }
}

function normalizeProfile(input: FiscalCompanyProfileInput) {
  return {
    ...input,
    cnpj: formatCnpj(input.cnpj),
    stateRegistration: formatStateRegistration(input.stateRegistration),
    municipalRegistration: formatMunicipalRegistration(input.municipalRegistration),
    stateUf: input.stateUf.trim().toUpperCase().slice(0, 2),
    secondaryCnaes: input.secondaryCnaes.map((item) => item.trim()).filter(Boolean),
    defaultNfeSeries: input.defaultNfeSeries.trim() || '1',
    defaultEnvironment: input.defaultEnvironment || 'homologacao',
    approvalStatus: input.approvalStatus || 'Incompleto',
  } satisfies FiscalCompanyProfileInput
}

function normalizeProduct(input: FiscalProductInput) {
  return {
    ...input,
    productCode: input.productCode.trim(),
    description: input.description.trim(),
    commercialUnit: input.commercialUnit.trim().toUpperCase() || 'UN',
    ncm: input.ncm.replace(/\D/g, ''),
    cest: input.cest.replace(/\D/g, ''),
    defaultCfopIn: input.defaultCfopIn.replace(/\D/g, ''),
    defaultCfopOut: input.defaultCfopOut.replace(/\D/g, ''),
    fiscalStatus: input.fiscalStatus || 'Pendente',
  } satisfies FiscalProductInput
}

function normalizeRule(input: FiscalRuleInput) {
  return {
    ...input,
    ruleCode: input.ruleCode.trim(),
    name: input.name.trim(),
    priority: Number(input.priority || 100),
    startDate: input.startDate || new Date().toISOString().slice(0, 10),
    endDate: input.endDate || '',
    originUf: input.originUf.trim().toUpperCase().slice(0, 2),
    destinationUf: input.destinationUf.trim().toUpperCase().slice(0, 2),
    ncm: input.ncm.replace(/\D/g, ''),
    cest: input.cest.replace(/\D/g, ''),
    cfop: input.cfop.replace(/\D/g, ''),
    approvalStatus: input.approvalStatus || 'Aguardando revisao',
    version: Number(input.version || 1),
  } satisfies FiscalRuleInput
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getFiscalCompanyProfile(organizationId: string, clientId: string) {
  const { data, error } = await supabase
    .from('fiscal_company_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .maybeSingle()

  fiscalError(error, 'Nao foi possivel carregar o perfil fiscal.')
  return data ? mapProfile(data) : null
}

export async function upsertFiscalCompanyProfile(
  organizationId: string,
  clientId: string,
  input: FiscalCompanyProfileInput,
) {
  const profile = normalizeProfile(input)
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const { data, error } = await supabase
    .from('fiscal_company_profiles')
    .upsert(
      {
        organization_id: organizationId,
        client_id: clientId,
        cnpj: profile.cnpj,
        state_registration: profile.stateRegistration,
        municipal_registration: profile.municipalRegistration,
        state_uf: profile.stateUf,
        city: profile.city,
        city_ibge_code: profile.cityIbgeCode,
        main_cnae: profile.mainCnae,
        secondary_cnaes: profile.secondaryCnaes,
        tax_regime: profile.taxRegime,
        crt: profile.crt,
        icms_taxpayer_indicator: profile.icmsTaxpayerIndicator,
        default_final_consumer: profile.defaultFinalConsumer,
        default_nfe_series: profile.defaultNfeSeries,
        default_environment: profile.defaultEnvironment,
        pis_cofins_regime: profile.pisCofinsRegime,
        fiscal_notes: profile.fiscalNotes,
        approval_status: profile.approvalStatus,
        active: profile.active,
        created_by: userId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,client_id' },
    )
    .select('*')
    .single()

  fiscalError(error, 'Nao foi possivel salvar o perfil fiscal.')
  return mapProfile(data)
}

export async function approveFiscalCompanyProfile(profileId: string, reason = '') {
  const { data, error } = await supabase.rpc('approve_fiscal_profile', {
    approval_reason: reason,
    target_profile_id: profileId,
  })

  fiscalError(error, 'Nao foi possivel aprovar o perfil fiscal.')
  return mapProfile(data as Record<string, unknown>)
}

export async function rejectFiscalCompanyProfile(profileId: string, reason: string) {
  const { data, error } = await supabase.rpc('reject_fiscal_profile', {
    rejection_reason: reason,
    target_profile_id: profileId,
  })

  fiscalError(error, 'Nao foi possivel rejeitar o perfil fiscal.')
  return mapProfile(data as Record<string, unknown>)
}

export async function listFiscalProducts(organizationId: string | null, clientId: string | null) {
  if (!organizationId || !clientId) return []

  const { data, error } = await supabase
    .from('fiscal_products')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .order('product_code')

  fiscalError(error, 'Nao foi possivel carregar produtos fiscais.')
  return (data ?? []).map((product) => mapProduct(product))
}

export async function saveFiscalProduct(
  organizationId: string,
  clientId: string,
  input: FiscalProductInput,
  productId?: string,
) {
  const product = normalizeProduct(input)
  const userId = await currentUserId()
  const payload = {
    active: product.active,
    cest: product.cest,
    client_id: clientId,
    cofins_cst: product.cofinsCst,
    cofins_rate: product.cofinsRate,
    commercial_unit: product.commercialUnit,
    default_cfop_in: product.defaultCfopIn,
    default_cfop_out: product.defaultCfopOut,
    description: product.description,
    fcp_rate: product.fcpRate,
    fiscal_benefit_code: product.fiscalBenefitCode,
    fiscal_status: product.fiscalStatus,
    gtin: product.gtin,
    group_id: product.groupId || null,
    has_icms_st: product.hasIcmsSt,
    icms_base_reduction: product.icmsBaseReduction,
    icms_csosn: product.icmsCsosn,
    icms_cst: product.icmsCst,
    icms_rate: product.icmsRate,
    ipi_cst: product.ipiCst,
    ipi_rate: product.ipiRate,
    item_type: product.itemType,
    merchandise_origin: product.merchandiseOrigin,
    mva_rate: product.mvaRate,
    ncm: product.ncm,
    notes: product.notes,
    organization_id: organizationId,
    pis_cst: product.pisCst,
    pis_rate: product.pisRate,
    product_code: product.productCode,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  const query = productId
    ? supabase.from('fiscal_products').update(payload).eq('id', productId).select('*').single()
    : supabase
        .from('fiscal_products')
        .insert({ ...payload, created_by: userId })
        .select('*')
        .single()

  const { data, error } = await query
  fiscalError(error, 'Nao foi possivel salvar o produto fiscal.')
  return mapProduct(data)
}

export async function deleteFiscalProduct(productId: string) {
  const userId = await currentUserId()
  const { error } = await supabase
    .from('fiscal_products')
    .update({ active: false, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', productId)
  fiscalError(error, 'Nao foi possivel desativar o produto fiscal.')
}

export async function listFiscalRules(organizationId: string | null, clientId: string | null) {
  if (!organizationId || !clientId) return []

  const { data, error } = await supabase
    .from('fiscal_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .order('priority', { ascending: true })
    .order('rule_code', { ascending: true })

  fiscalError(error, 'Nao foi possivel carregar regras fiscais.')
  return (data ?? []).map((rule) => mapRule(rule))
}

export async function saveFiscalRule(
  organizationId: string,
  clientId: string,
  input: FiscalRuleInput,
  ruleId?: string,
) {
  const rule = normalizeRule(input)
  const userId = await currentUserId()
  const payload = {
    active: rule.active,
    approval_status: 'Aguardando revisao',
    cest: rule.cest,
    cfop: rule.cfop,
    client_id: clientId,
    cofins_cst: rule.cofinsCst,
    cofins_rate: rule.cofinsRate,
    destination_uf: rule.destinationUf,
    direction: rule.direction,
    end_date: rule.endDate || null,
    fcp_rate: rule.fcpRate,
    final_consumer: rule.finalConsumer,
    fiscal_benefit_code: rule.fiscalBenefitCode,
    has_icms_st: rule.hasIcmsSt,
    group_id: rule.groupId || null,
    icms_base_mode: rule.icmsBaseMode,
    icms_base_reduction: rule.icmsBaseReduction,
    icms_csosn: rule.icmsCsosn,
    icms_cst: rule.icmsCst,
    icms_rate: rule.icmsRate,
    ipi_cst: rule.ipiCst,
    ipi_rate: rule.ipiRate,
    merchandise_origin: rule.merchandiseOrigin,
    mva_rate: rule.mvaRate,
    name: rule.name,
    ncm: rule.ncm,
    nfe_purpose: rule.nfePurpose,
    notes: rule.notes,
    operation_type_id: null,
    organization_id: organizationId,
    origin_uf: rule.originUf,
    pis_cst: rule.pisCst,
    pis_rate: rule.pisRate,
    priority: rule.priority,
    product_id: rule.productId || null,
    recipient_taxpayer_indicator: rule.recipientTaxpayerIndicator,
    rule_code: rule.ruleCode,
    start_date: rule.startDate,
    tax_regime: rule.taxRegime,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    version: rule.version,
  }

  const query = ruleId
    ? supabase.from('fiscal_rules').update(payload).eq('id', ruleId).select('*').single()
    : supabase
        .from('fiscal_rules')
        .insert({ ...payload, created_by: userId })
        .select('*')
        .single()

  const { data, error } = await query
  fiscalError(error, 'Nao foi possivel salvar a regra fiscal.')
  return mapRule(data)
}

export async function approveFiscalRule(ruleId: string, reason = '') {
  const { data, error } = await supabase.rpc('approve_fiscal_rule', {
    approval_reason: reason,
    target_rule_id: ruleId,
  })

  fiscalError(error, 'Nao foi possivel aprovar a regra fiscal.')
  return mapRule(data as Record<string, unknown>)
}

export async function rejectFiscalRule(ruleId: string, reason: string) {
  const { data, error } = await supabase.rpc('reject_fiscal_rule', {
    rejection_reason: reason,
    target_rule_id: ruleId,
  })

  fiscalError(error, 'Nao foi possivel rejeitar a regra fiscal.')
  return mapRule(data as Record<string, unknown>)
}

export async function deleteFiscalRule(ruleId: string) {
  const userId = await currentUserId()
  const { error } = await supabase
    .from('fiscal_rules')
    .update({ active: false, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', ruleId)
  fiscalError(error, 'Nao foi possivel desativar a regra fiscal.')
}
