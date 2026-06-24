import { consultPublicCnpj } from './cnpjService'
import { resolveMunicipalityByCityUf } from './municipalityService'
import type { AccountingClient, ClientCompanySize, ClientTaxRegime } from '../types/accounting'
import type { FiscalCompanyProfileInput } from '../types/fiscal'
import { formatCnpj, formatMunicipalRegistration, formatPhone, formatStateRegistration, onlyDigits } from '../utils/formatters'

export type FiscalEnrichmentField = keyof Pick<
  FiscalCompanyProfileInput,
  | 'cnpj'
  | 'stateRegistration'
  | 'municipalRegistration'
  | 'stateUf'
  | 'city'
  | 'cityIbgeCode'
  | 'mainCnae'
  | 'secondaryCnaes'
  | 'taxRegime'
  | 'crt'
  | 'icmsTaxpayerIndicator'
>

export type FiscalEnrichmentSuggestion = {
  field: FiscalEnrichmentField
  label: string
  currentValue: string
  suggestedValue: string
  source: 'client_registration' | 'cnpj_provider' | 'ibge' | 'manual'
  reason: string
  selected: boolean
  blocked: boolean
}

export type FiscalClientEnrichmentResult = {
  rawData: Record<string, unknown> | null
  suggestions: FiscalEnrichmentSuggestion[]
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getText(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function cnpjFromData(data: Record<string, unknown>) {
  const establishment = getRecord(data.estabelecimento)
  return onlyDigits(
    `${getText(data.cnpj_raiz)}${getText(establishment.cnpj_ordem)}${getText(establishment.cnpj_digito_verificador)}`,
  )
}

function mapTaxRegime(data: Record<string, unknown>): ClientTaxRegime {
  const simples = getRecord(data.simples)
  const mei = getRecord(data.mei)
  const simplesValue = getText(simples.simples ?? simples.optante).toLowerCase()
  const meiValue = getText(mei.mei ?? mei.optante).toLowerCase()

  if (meiValue === 'sim' || meiValue === 'true') return 'MEI'
  if (simplesValue === 'sim' || simplesValue === 'true') return 'Simples Nacional'
  return 'Nao informado'
}

function mapCompanySize(value: unknown): ClientCompanySize {
  const text = getText(value).toLowerCase()
  if (text.includes('microempreendedor')) return 'MEI'
  if (text.includes('micro')) return 'ME'
  if (text.includes('pequeno')) return 'EPP'
  if (text.includes('medio') || text.includes('médio')) return 'Medio porte'
  if (text.includes('grande')) return 'Grande porte'
  return value ? 'Demais' : 'Nao informado'
}

function extractSecondaryCnaes(data: Record<string, unknown>) {
  const establishment = getRecord(data.estabelecimento)
  const activities = Array.isArray(establishment.atividades_secundarias)
    ? establishment.atividades_secundarias
    : []

  return activities
    .map((item) => {
      const activity = getRecord(item)
      return [activity.id, activity.descricao].filter(Boolean).join(' - ')
    })
    .filter(Boolean)
}

function buildProviderData(data: Record<string, unknown>) {
  const establishment = getRecord(data.estabelecimento)
  const city = getRecord(establishment.cidade)
  const state = getRecord(establishment.estado)
  const mainActivity = getRecord(establishment.atividade_principal)
  const phone = [establishment.ddd1, establishment.telefone1].filter(Boolean).join('')

  return {
    city: getText(city.nome),
    cityIbgeCode: getText(city.ibge_id ?? city.codigo_ibge),
    cnpj: formatCnpj(cnpjFromData(data)),
    email: getText(establishment.email).toLowerCase(),
    mainCnae: [mainActivity.id, mainActivity.descricao].filter(Boolean).join(' - '),
    phone: formatPhone('BR', phone),
    secondaryCnaes: extractSecondaryCnaes(data),
    stateRegistration: '',
    stateUf: getText(state.sigla),
    taxRegime: mapTaxRegime(data),
  }
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.join('\n')
  return value === null || value === undefined ? '' : String(value)
}

function addSuggestion(
  suggestions: FiscalEnrichmentSuggestion[],
  field: FiscalEnrichmentField,
  label: string,
  currentValue: unknown,
  suggestedValue: unknown,
  source: FiscalEnrichmentSuggestion['source'],
  reason: string,
  profile: FiscalCompanyProfileInput,
) {
  const current = stringifyValue(currentValue).trim()
  const suggested = stringifyValue(suggestedValue).trim()

  if (!suggested || suggested === current) {
    return
  }

  const hasConfirmedProfile = profile.approvalStatus === 'Aprovado'
  const blocked = hasConfirmedProfile && Boolean(current)

  suggestions.push({
    blocked,
    currentValue: current || 'Nao informado',
    field,
    label,
    reason,
    selected: !blocked && !current,
    source,
    suggestedValue: suggested,
  })
}

export async function consultFiscalClientEnrichment(
  client: AccountingClient,
  profile: FiscalCompanyProfileInput,
): Promise<FiscalClientEnrichmentResult> {
  const suggestions: FiscalEnrichmentSuggestion[] = []

  addSuggestion(suggestions, 'cnpj', 'CNPJ', profile.cnpj, formatCnpj(client.cnpj), 'client_registration', 'Cadastro atual do cliente.', profile)
  addSuggestion(suggestions, 'stateUf', 'UF', profile.stateUf, client.state, 'client_registration', 'UF salva no cadastro do cliente.', profile)
  addSuggestion(suggestions, 'city', 'Cidade', profile.city, client.city, 'client_registration', 'Cidade salva no cadastro do cliente.', profile)
  addSuggestion(suggestions, 'cityIbgeCode', 'Codigo IBGE', profile.cityIbgeCode, client.cityIbgeCode, 'client_registration', 'Codigo IBGE salvo no cadastro.', profile)
  addSuggestion(suggestions, 'mainCnae', 'CNAE principal', profile.mainCnae, client.mainCnae, 'client_registration', 'CNAE salvo no cadastro do cliente.', profile)
  addSuggestion(suggestions, 'stateRegistration', 'Inscricao estadual', profile.stateRegistration, formatStateRegistration(client.stateRegistration), 'client_registration', 'Inscricao estadual salva no cadastro.', profile)
  addSuggestion(suggestions, 'municipalRegistration', 'Inscricao municipal', profile.municipalRegistration, formatMunicipalRegistration(client.municipalRegistration), 'client_registration', 'Inscricao municipal salva no cadastro.', profile)
  addSuggestion(suggestions, 'taxRegime', 'Regime tributario', profile.taxRegime, client.taxRegime, 'client_registration', 'Regime tributario salvo no cadastro.', profile)

  let rawData: Record<string, unknown> | null = null
  const clientCnpj = onlyDigits(client.cnpj || profile.cnpj)

  if (clientCnpj.length === 14) {
    rawData = await consultPublicCnpj(clientCnpj)
    const providerData = buildProviderData(rawData)

    addSuggestion(suggestions, 'cnpj', 'CNPJ', profile.cnpj, providerData.cnpj, 'cnpj_provider', 'Retornado pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'stateUf', 'UF', profile.stateUf, providerData.stateUf, 'cnpj_provider', 'UF retornada pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'city', 'Cidade', profile.city, providerData.city, 'cnpj_provider', 'Cidade retornada pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'cityIbgeCode', 'Codigo IBGE', profile.cityIbgeCode, providerData.cityIbgeCode, 'cnpj_provider', 'Codigo IBGE retornado pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'mainCnae', 'CNAE principal', profile.mainCnae, providerData.mainCnae, 'cnpj_provider', 'CNAE principal retornado pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'secondaryCnaes', 'CNAEs secundarios', profile.secondaryCnaes, providerData.secondaryCnaes, 'cnpj_provider', 'CNAEs secundarios retornados pela Consulta CNPJ.', profile)
    addSuggestion(suggestions, 'taxRegime', 'Regime tributario', profile.taxRegime, providerData.taxRegime, 'cnpj_provider', `Sugestao baseada em optante Simples/MEI. Porte: ${mapCompanySize(getRecord(rawData.porte).descricao)}.`, profile)
  }

  const city = profile.city || client.city
  const uf = profile.stateUf || client.state
  if (!profile.cityIbgeCode && city && uf) {
    const municipality = await resolveMunicipalityByCityUf(city, uf)
    if (municipality?.matched) {
      addSuggestion(suggestions, 'cityIbgeCode', 'Codigo IBGE', profile.cityIbgeCode, municipality.code, 'ibge', `Municipio oficial localizado: ${municipality.name}/${municipality.stateUf}.`, profile)
    }
  }

  if ((profile.taxRegime === 'MEI' || profile.taxRegime === 'Simples Nacional') && !profile.crt) {
    addSuggestion(suggestions, 'crt', 'CRT', profile.crt, '1', 'manual', 'Sugestao conservadora para Simples Nacional/MEI. Confirme antes da emissao.', profile)
  }

  if (!profile.icmsTaxpayerIndicator || profile.icmsTaxpayerIndicator === 'Nao informado') {
    suggestions.push({
      blocked: true,
      currentValue: profile.icmsTaxpayerIndicator || 'Nao informado',
      field: 'icmsTaxpayerIndicator',
      label: 'Indicador ICMS',
      reason: 'Nao foi possivel confirmar automaticamente a IE. Revise manualmente.',
      selected: false,
      source: 'manual',
      suggestedValue: 'Pendente de confirmacao pelo contador',
    })
  }

  return { rawData, suggestions }
}

export function applyFiscalEnrichmentSuggestions(
  profile: FiscalCompanyProfileInput,
  suggestions: FiscalEnrichmentSuggestion[],
  selectedFields: Set<FiscalEnrichmentField>,
) {
  return suggestions.reduce<FiscalCompanyProfileInput>((current, suggestion) => {
    if (!selectedFields.has(suggestion.field) || suggestion.blocked) {
      return current
    }

    if (suggestion.field === 'secondaryCnaes') {
      return {
        ...current,
        secondaryCnaes: suggestion.suggestedValue
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      }
    }

    return { ...current, [suggestion.field]: suggestion.suggestedValue }
  }, profile)
}

export function fieldSourceLabel(source: FiscalEnrichmentSuggestion['source']) {
  const labels: Record<FiscalEnrichmentSuggestion['source'], string> = {
    client_registration: 'Cadastro do cliente',
    cnpj_provider: 'Consulta CNPJ',
    ibge: 'IBGE',
    manual: 'Confirmacao manual',
  }

  return labels[source]
}
