import type {
  NfeMissingField,
  NfeOperationType,
  NfeReadinessInput,
  NfeReadinessResult,
  NfeValidationEntity,
  NfeValidationIssue,
} from '../types/nfe'

function onlyDigits(value: string | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

function issue(
  entity: NfeValidationEntity,
  field: string,
  message: string,
  suggestion?: string,
): NfeValidationIssue {
  return {
    entity,
    field,
    message,
    severity: 'error',
    suggestion,
  }
}

function warning(
  entity: NfeValidationEntity,
  field: string,
  message: string,
  suggestion?: string,
): NfeValidationIssue {
  return {
    entity,
    field,
    message,
    severity: 'warning',
    suggestion,
  }
}

function info(
  entity: NfeValidationEntity,
  field: string,
  message: string,
  suggestion?: string,
): NfeValidationIssue {
  return {
    entity,
    field,
    message,
    severity: 'info',
    suggestion,
  }
}

function normalizeNsu(value: string | undefined) {
  const digits = onlyDigits(value)
  return digits ? digits.padStart(15, '0').slice(-15) : '000000000000000'
}

function formatDateTime(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
}

function missingField(table: string, column: string, reason: string): NfeMissingField {
  return {
    column,
    reason,
    suggestedSql: `alter table public.${table} add column if not exists ${column} text not null default '';`,
    table,
  }
}

function certificateExpired(validUntil: string | undefined) {
  if (!validUntil) return false
  const expiresAt = new Date(`${validUntil.slice(0, 10)}T23:59:59`)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()
}

function serviceMissing(input: NfeReadinessInput, serviceCode: string) {
  const enabledServices = input.enabledServices ?? []
  return enabledServices.length > 0 && !enabledServices.includes(serviceCode)
}

function backendError(input: NfeReadinessInput) {
  return input.backendConfigured === false
    ? issue(
        'integracao',
        'backend',
        'Backend fiscal nao configurado para consulta real.',
        'Configure a API fiscal ou use os endpoints internos preparados antes de liberar operacao real.',
      )
    : null
}

function addCommonCompanyChecks(input: NfeReadinessInput, errors: NfeValidationIssue[], warnings: NfeValidationIssue[]) {
  const company = input.empresa

  if (!company) {
    errors.push(issue('empresa', 'id', 'Selecione uma empresa antes de consultar a NF-e.'))
    return
  }

  if (onlyDigits(company.cnpj).length !== 14) {
    errors.push(issue('empresa', 'cnpj', 'Informe um CNPJ valido para a empresa selecionada.'))
  }

  if (!company.state) {
    errors.push(issue('empresa', 'state', 'UF SEFAZ nao configurada.'))
  }

  if (!company.city) {
    warnings.push(warning('empresa', 'city', 'Municipio da empresa nao informado.'))
  }
}

function addCommonCertificateChecks(input: NfeReadinessInput, errors: NfeValidationIssue[], warnings: NfeValidationIssue[]) {
  const certificate = input.certificado

  if (!certificate) {
    errors.push(issue('certificado', 'id', 'Certificado digital ativo nao encontrado.'))
    return
  }

  if (certificate.status !== 'Ativo') {
    errors.push(issue('certificado', 'status', 'Certificado digital ativo nao encontrado.'))
  }

  if (!certificate.certificateFileData) {
    errors.push(issue('certificado', 'certificate_file_data', 'Nao e possivel buscar notas anteriores sem certificado digital.'))
  }

  if (!input.senhaCertificado) {
    errors.push(issue('certificado', 'certificate_password', 'Senha do certificado nao cadastrada.'))
  }

  if (!input.ambiente) {
    errors.push(issue('certificado', 'environment', 'Ambiente fiscal nao definido.'))
  }

  if (!input.uf) {
    errors.push(issue('certificado', 'state_uf', 'UF SEFAZ nao configurada.'))
  }

  if (certificateExpired(certificate.validUntil)) {
    errors.push(issue('certificado', 'valid_until', 'Certificado vencido.'))
  }

  const companyCnpj = onlyDigits(input.empresa?.cnpj)
  const certificateCnpj = onlyDigits(certificate.taxId)
  if (companyCnpj && certificateCnpj && companyCnpj !== certificateCnpj) {
    warnings.push(
      warning(
        'certificado',
        'tax_id',
        'CNPJ do certificado diferente do CNPJ da empresa selecionada.',
        'Confirme se o certificado pertence ao cliente ou se existe procuracao/autorizacao.',
      ),
    )
  }
}

function addOperationChecks(input: NfeReadinessInput, errors: NfeValidationIssue[], warnings: NfeValidationIssue[]) {
  const cleanKey = onlyDigits(input.chaveAcesso)

  if (input.tipoOperacao === 'consulta_chave') {
    if (!cleanKey) {
      errors.push(issue('nota', 'chave_acesso', 'Informe uma chave de acesso valida com 44 digitos.'))
    } else if (cleanKey.length !== 44) {
      errors.push(issue('nota', 'chave_acesso', 'Informe uma chave de acesso valida com 44 digitos.'))
    }
  }

  if (input.tipoOperacao === 'distribuicao_dfe') {
    if (serviceMissing(input, 'dfe_distribuicao')) {
      warnings.push(
        warning(
          'dfe',
          'dfe_distribuicao',
          'Distribuicao DF-e ainda nao habilitada para esta empresa.',
          'Clique em Habilitar servicos para marcar o servico no certificado.',
        ),
      )
    }

    const syncState = input.dfeSyncState
    if (!syncState?.exists) {
      warnings.push(
        info(
          'dfe',
          'ultimo_nsu',
          'Primeira sincronizacao DF-e ainda nao realizada para este cliente/certificado.',
          'A primeira consulta sera iniciada do NSU zero e, depois disso, o sistema passa a controlar o NSU automaticamente.',
        ),
      )
    } else {
      const lastNsu = normalizeNsu(syncState.lastNsu)
      const maxNsu = normalizeNsu(syncState.maxNsu)
      const nextAllowed = syncState.nextAllowedSyncAt ? new Date(syncState.nextAllowedSyncAt) : null
      const inCooldown = Boolean(nextAllowed && nextAllowed.getTime() > Date.now())

      if (inCooldown) {
        warnings.push(
          warning(
            'dfe',
            'cooldown',
            'Consulta DF-e temporariamente bloqueada pela regra de intervalo da SEFAZ.',
            `Aguarde ate ${formatDateTime(syncState.nextAllowedSyncAt)} para consultar novamente. O ultimo NSU salvo foi preservado.`,
          ),
        )
      } else if (lastNsu === '000000000000000' && maxNsu === '000000000000000') {
        warnings.push(
          info(
            'dfe',
            'ultimo_nsu',
            'Controle NSU carregado, ainda sem documentos retornados.',
            'Isso pode acontecer quando a empresa nao possui DF-e disponivel no Ambiente Nacional para o periodo/situacao consultada.',
          ),
        )
      } else {
        warnings.push(
          info(
            'dfe',
            'ultimo_nsu',
            `Controle NSU carregado: ultimo NSU ${lastNsu}, max NSU ${maxNsu}.`,
            'Novas consultas continuam a partir do ultimo NSU salvo, sem reiniciar do zero.',
          ),
        )
      }
    }
  }

  if (input.tipoOperacao === 'emissao_nfe') {
    if (serviceMissing(input, 'nfe_emissao')) {
      warnings.push(warning('nota', 'nfe_emissao', 'Emissao NF-e ainda nao habilitada no certificado.'))
    }
    if (!input.empresa?.mainCnae) {
      warnings.push(warning('tributacao', 'main_cnae', 'CNAE principal nao informado para emissao.'))
    }
    if (!input.empresa?.legalNature) {
      warnings.push(warning('tributacao', 'legal_nature', 'Natureza juridica nao informada para emissao.'))
    }
  }

  if (input.tipoOperacao === 'manifestacao' && serviceMissing(input, 'manifestacao_destinatario')) {
    warnings.push(warning('dfe', 'manifestacao_destinatario', 'Manifestacao de NF-e ainda nao habilitada no certificado.'))
  }
}

export function validateSefazReadiness(input: NfeReadinessInput): NfeReadinessResult {
  const errors: NfeValidationIssue[] = []
  const warnings: NfeValidationIssue[] = []
  const missingFields: NfeMissingField[] = [
    missingField('clients', 'state_registration', 'Inscricao Estadual pode ser exigida em emissao e consultas por UF.'),
    missingField('clients', 'municipal_registration', 'Inscricao Municipal e util para NFS-e e dados cadastrais.'),
    missingField('clients', 'city_ibge_code', 'Codigo IBGE do municipio e necessario para emissao fiscal.'),
  ]
  const backendIssue = backendError(input)

  addCommonCompanyChecks(input, errors, warnings)
  addCommonCertificateChecks(input, errors, warnings)
  addOperationChecks(input, errors, warnings)

  if (backendIssue) {
    errors.push(backendIssue)
  }

  return {
    errors,
    isReady: errors.length === 0,
    missingFields,
    warnings,
  }
}

export function nfeOperationLabel(operation: NfeOperationType) {
  const labels: Record<NfeOperationType, string> = {
    consulta_chave: 'Consulta por chave',
    distribuicao_dfe: 'Busca DF-e/NSU',
    download_xml: 'Download XML/DANFE',
    emissao_nfe: 'Emissao NF-e',
    manifestacao: 'Manifestacao NF-e',
    status_sefaz: 'Status da integracao',
  }

  return labels[operation]
}
