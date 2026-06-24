import type { FiscalCompanyProfileInput, FiscalProductInput, FiscalRuleInput } from '../types/fiscal'

function digits(value: string) {
  return value.replace(/\D/g, '')
}

export function validateFiscalProfile(profile: FiscalCompanyProfileInput) {
  const errors: string[] = []

  if (digits(profile.cnpj).length !== 14) errors.push('CNPJ do perfil fiscal deve possuir 14 digitos.')
  if (!profile.stateUf.trim() || profile.stateUf.trim().length !== 2) errors.push('UF do perfil fiscal deve possuir 2 letras.')
  if (digits(profile.cityIbgeCode).length !== 7) errors.push('Codigo IBGE do municipio deve possuir 7 digitos.')
  if (!profile.taxRegime || profile.taxRegime === 'Nao informado') errors.push('Informe o regime tributario.')
  if (!profile.crt) errors.push('Informe o CRT.')
  if (!profile.icmsTaxpayerIndicator || profile.icmsTaxpayerIndicator === 'Nao informado') {
    errors.push('Informe o indicador de contribuinte ICMS.')
  }

  return errors
}

export function validateFiscalProduct(product: FiscalProductInput) {
  const errors: string[] = []

  if (!product.productCode.trim()) errors.push('Informe o codigo interno do produto.')
  if (!product.description.trim()) errors.push('Informe a descricao do produto.')
  if (product.itemType !== 'Servico' && digits(product.ncm).length !== 8) {
    errors.push('NCM do produto deve possuir 8 digitos para mercadorias.')
  }
  if (!product.commercialUnit.trim()) errors.push('Informe a unidade comercial.')
  if (product.hasIcmsSt && (!digits(product.cest) || product.mvaRate <= 0)) {
    errors.push('Produto com ICMS-ST precisa de CEST e MVA.')
  }

  return errors
}

export function validateFiscalRule(rule: FiscalRuleInput) {
  const errors: string[] = []

  if (!rule.ruleCode.trim()) errors.push('Informe o codigo da regra fiscal.')
  if (!rule.name.trim()) errors.push('Informe o nome da regra fiscal.')
  if (digits(rule.cfop).length !== 4) errors.push('CFOP da regra deve possuir 4 digitos.')
  if (!rule.icmsCst && !rule.icmsCsosn) errors.push('Informe CST ou CSOSN de ICMS.')
  if (rule.icmsCst && rule.icmsCsosn) errors.push('Use CST ou CSOSN, nunca os dois ao mesmo tempo.')
  if (!rule.pisCst) errors.push('Informe CST de PIS.')
  if (!rule.cofinsCst) errors.push('Informe CST de COFINS.')
  if (['01', '02'].includes(digits(rule.pisCst)) && rule.pisRate <= 0) errors.push('CST de PIS exige aliquota.')
  if (['01', '02'].includes(digits(rule.cofinsCst)) && rule.cofinsRate <= 0) errors.push('CST de COFINS exige aliquota.')
  if (rule.hasIcmsSt && (!digits(rule.cest) || rule.mvaRate <= 0)) errors.push('Regra com ICMS-ST precisa de CEST e MVA.')

  return errors
}
