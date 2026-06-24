import type { AccountingClient } from '../types/accounting'
import type { FiscalCompanyProfileInput, FiscalProduct, FiscalRule, NcmSyncStatus } from '../types/fiscal'
import { onlyDigits } from '../utils/formatters'

export type FiscalReadinessStatus = 'Concluido' | 'Parcial' | 'Pendente' | 'Bloqueado' | 'Atencao' | 'Erro'
export type FiscalReadinessTarget = 'perfil' | 'ncm' | 'produtos' | 'regras' | 'simulador'

export type FiscalReadinessStep = {
  id: string
  title: string
  status: FiscalReadinessStatus
  scope: 'Empresa' | 'Global'
  completed: boolean
  details: string[]
  missing: string[]
  nextAction: string
  targetTab: FiscalReadinessTarget
}

export type FiscalReadiness = {
  completedCount: number
  totalCount: number
  nextAction: string
  steps: FiscalReadinessStep[]
}

function hasValue(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function buildStep(
  id: string,
  title: string,
  targetTab: FiscalReadinessTarget,
  missing: string[],
  details: string[],
  nextAction: string,
  options: { scope?: 'Empresa' | 'Global'; warning?: boolean; blocked?: boolean; error?: boolean } = {},
): FiscalReadinessStep {
  let status: FiscalReadinessStatus = 'Concluido'

  if (options.error) status = 'Erro'
  else if (options.blocked) status = 'Bloqueado'
  else if (options.warning) status = 'Atencao'
  else if (missing.length) status = details.length ? 'Parcial' : 'Pendente'

  return {
    completed: status === 'Concluido',
    details,
    id,
    missing,
    nextAction,
    scope: options.scope ?? 'Empresa',
    status,
    targetTab,
    title,
  }
}

function approvedRules(rules: FiscalRule[]) {
  return rules.filter((rule) => rule.active && rule.approvalStatus === 'Aprovada')
}

function detectRuleConflicts(rules: FiscalRule[]) {
  const buckets = new Map<string, FiscalRule[]>()

  for (const rule of approvedRules(rules)) {
    const key = [
      rule.direction,
      rule.originUf || '*',
      rule.destinationUf || '*',
      rule.taxRegime || '*',
      rule.ncm || '*',
      rule.cest || '*',
      rule.productId || '*',
      rule.groupId || '*',
      rule.priority,
    ].join('|')

    buckets.set(key, [...(buckets.get(key) ?? []), rule])
  }

  return Array.from(buckets.values()).filter((items) => items.length > 1)
}

export function calculateFiscalReadiness(input: {
  client: AccountingClient | null
  profile: FiscalCompanyProfileInput
  products: FiscalProduct[]
  rules: FiscalRule[]
  ncmSyncStatus: NcmSyncStatus | null
}): FiscalReadiness {
  const { client, ncmSyncStatus, products, profile, rules } = input
  const registrationMissing = [
    !hasValue(client?.companyName) && 'Razao social',
    onlyDigits(client?.cnpj ?? profile.cnpj).length !== 14 && 'CNPJ valido',
    !hasValue(client?.address) && 'Endereco',
    !hasValue(client?.cep) && 'CEP',
    !hasValue(client?.city ?? profile.city) && 'Cidade',
    !hasValue(client?.state ?? profile.stateUf) && 'UF',
    !hasValue(client?.mainCnae ?? profile.mainCnae) && 'CNAE principal',
  ].filter(Boolean) as string[]

  const enrichmentMissing = [
    onlyDigits(profile.cityIbgeCode || client?.cityIbgeCode || '').length !== 7 && 'Codigo IBGE',
    !hasValue(profile.stateRegistration || client?.stateRegistration) && 'Inscricao estadual ou confirmacao de nao contribuinte',
    !hasValue(profile.municipalRegistration || client?.municipalRegistration) && 'Inscricao municipal quando aplicavel',
  ].filter(Boolean) as string[]

  const profileMissing = [
    !hasValue(profile.taxRegime) || profile.taxRegime === 'Nao informado' ? 'Regime tributario' : '',
    !hasValue(profile.crt) && 'CRT',
    !hasValue(profile.icmsTaxpayerIndicator) || profile.icmsTaxpayerIndicator === 'Nao informado' ? 'Indicador ICMS' : '',
    !hasValue(profile.pisCofinsRegime) || profile.pisCofinsRegime === 'Nao informado' ? 'Regime PIS/COFINS' : '',
    !hasValue(profile.defaultNfeSeries) && 'Serie padrao',
  ].filter(Boolean) as string[]

  const activeProducts = products.filter((product) => product.active)
  const productsWithoutNcm = activeProducts.filter(
    (product) => product.itemType !== 'Servico' && onlyDigits(product.ncm).length !== 8,
  )
  const incompleteProducts = activeProducts.filter(
    (product) => !product.productCode || !product.description || !product.commercialUnit,
  )
  const ruleConflicts = detectRuleConflicts(rules)
  const validRules = approvedRules(rules)

  const steps = [
    buildStep(
      'registration',
      'Cadastro da empresa',
      'perfil',
      registrationMissing,
      [
        client?.companyName ? `Empresa: ${client.companyName}` : '',
        client?.city || profile.city ? `${client?.city || profile.city}/${client?.state || profile.stateUf}` : '',
      ].filter(Boolean),
      'Completar cadastro',
    ),
    buildStep(
      'enrichment',
      'Enriquecimento cadastral',
      'perfil',
      enrichmentMissing,
      [
        profile.cityIbgeCode ? `IBGE: ${profile.cityIbgeCode}` : '',
        profile.mainCnae ? `CNAE: ${profile.mainCnae}` : '',
      ].filter(Boolean),
      'Atualizar dados cadastrais',
    ),
    buildStep(
      'profile',
      'Perfil fiscal',
      'perfil',
      profileMissing,
      [
        profile.taxRegime && profile.taxRegime !== 'Nao informado' ? `Regime: ${profile.taxRegime}` : '',
        profile.crt ? `CRT: ${profile.crt}` : '',
        `Status: ${profile.approvalStatus}`,
      ].filter(Boolean),
      profile.approvalStatus === 'Aprovado' ? 'Revisar perfil fiscal' : 'Aprovar perfil fiscal',
      { blocked: profile.approvalStatus === 'Bloqueado' },
    ),
    buildStep(
      'ncm',
      'Catalogo NCM',
      'ncm',
      !ncmSyncStatus || ncmSyncStatus.totalCodes <= 0 ? ['Tabela NCM ainda nao sincronizada'] : [],
      ncmSyncStatus
        ? [
            `Status: ${ncmSyncStatus.status}`,
            `Registros: ${ncmSyncStatus.totalCodes}`,
            ncmSyncStatus.source ? `Fonte: ${ncmSyncStatus.source}` : '',
          ].filter(Boolean)
        : [],
      'Sincronizar NCM',
      { error: Boolean(ncmSyncStatus?.errorMessage), scope: 'Global' },
    ),
    buildStep(
      'products',
      'Produtos e servicos',
      'produtos',
      [
        activeProducts.length === 0 && 'Cadastre pelo menos um produto ou servico',
        productsWithoutNcm.length > 0 && `${productsWithoutNcm.length} produto(s) sem NCM`,
        incompleteProducts.length > 0 && `${incompleteProducts.length} produto(s) com cadastro incompleto`,
      ].filter(Boolean) as string[],
      [`Produtos ativos: ${activeProducts.length}`],
      'Revisar produtos',
    ),
    buildStep(
      'rules',
      'Regras fiscais',
      'regras',
      [
        validRules.length === 0 && 'Nenhuma regra ativa e aprovada',
        ruleConflicts.length > 0 && `${ruleConflicts.length} conflito(s) entre regras aprovadas`,
      ].filter(Boolean) as string[],
      [`Regras aprovadas: ${validRules.length}`],
      ruleConflicts.length ? 'Resolver regras' : 'Criar/aprovar regra fiscal',
      { blocked: ruleConflicts.length > 0 },
    ),
    buildStep(
      'simulation',
      'Simulacao fiscal',
      'simulador',
      validRules.length && activeProducts.length ? ['Execute uma simulacao fiscal antes da emissao'] : ['Produtos e regras precisam estar prontos'],
      [],
      'Executar simulacao',
      { blocked: !validRules.length || !activeProducts.length },
    ),
    buildStep(
      'ready',
      'Pronto para emissao',
      'simulador',
      [],
      [],
      'Revisar bloqueios',
      {
        blocked:
          registrationMissing.length > 0 ||
          profileMissing.length > 0 ||
          profile.approvalStatus !== 'Aprovado' ||
          productsWithoutNcm.length > 0 ||
          validRules.length === 0 ||
          ruleConflicts.length > 0,
      },
    ),
  ]

  const completedCount = steps.filter((step) => step.completed).length
  const nextAction = steps.find((step) => !step.completed)?.nextAction ?? 'Empresa pronta para emissao'

  return {
    completedCount,
    nextAction,
    steps,
    totalCount: steps.length,
  }
}
