export type NfeEmissionAction = 'draft' | 'validate' | 'generateXml' | 'sign' | 'authorize'

export type NfeEmissionPayload = {
  naturezaOperacao: string
  serie: string
  numero: string
  dataEmissao: string
  tipoOperacao: 'entrada' | 'saida'
  destinoOperacao: string
  finalidade: string
  indicadorPresenca: string
  consumidorFinal: string
  informacoesAdicionais: string
  destinatario: {
    nome: string
    documento: string
    inscricaoEstadual: string
    indicadorIe: string
    email: string
    telefone: string
    cep: string
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    codigoMunicipioIbge: string
    municipio: string
    uf: string
    codigoPais: string
    pais: string
  }
  itens: NfeEmissionItem[]
  pagamentos: NfeEmissionPayment[]
  transporte: {
    modalidadeFrete: string
    transportadoraNome: string
    transportadoraDocumento: string
    transportadoraIe: string
    transportadoraEndereco: string
    transportadoraMunicipio: string
    transportadoraUf: string
    placa: string
    ufVeiculo: string
    quantidadeVolumes: number
    especie: string
    pesoLiquido: number
    pesoBruto: number
  }
  totais: {
    valorFrete: number
    valorSeguro: number
    valorDesconto: number
    valorOutrasDespesas: number
  }
}

export type NfeEmissionItem = {
  productId?: string
  productGroupId?: string
  codigo: string
  descricao: string
  gtin: string
  ncm: string
  cest: string
  cfop: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  desconto: number
  frete: number
  seguro: number
  outrasDespesas: number
  origemIcms: string
  cstIcms: string
  csosn: string
  valorBaseIcms: number
  aliquotaIcms: number
  valorIcms: number
  cstPis: string
  valorBasePis: number
  aliquotaPis: number
  valorPis: number
  cstCofins: string
  valorBaseCofins: number
  aliquotaCofins: number
  valorCofins: number
  cstIpi: string
  valorBaseIpi: number
  aliquotaIpi: number
  valorIpi: number
  informacoesAdicionais: string
}

export type NfeEmissionPayment = {
  indicadorPagamento: string
  tipoPagamento: string
  descricao: string
  valor: number
}

export type NfeEmissionRequest = {
  certificateId: string
  clientId: string
  documentId?: string
  nota: NfeEmissionPayload
  organizationId: string
}

export type NfeDocumentActionRequest = {
  certificateId: string
  clientId: string
  documentId: string
  organizationId: string
}

export type NfeEmissionResult = {
  accessKey?: string
  cStat?: string
  danfePdfBase64?: string
  documentId?: string
  errors?: string[]
  message?: string
  mode?: string
  protocolNumber?: string
  receiptNumber?: string
  status?: string
  success?: boolean
  xMotivo?: string
  xml?: string
}
