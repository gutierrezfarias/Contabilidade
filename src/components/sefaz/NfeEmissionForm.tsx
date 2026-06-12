import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { findAddressDetailsByCep } from '../../services/cepService'
import {
  authorizeNfe,
  generateNfeXml,
  saveNfeDraft,
  signNfeXml,
  validateNfe,
} from '../../services/nfeEmissionService'
import type { AccountingClient, DigitalCertificate } from '../../types/accounting'
import type { NfeReadinessResult } from '../../types/nfe'
import type { NfeEmissionPayload, NfeEmissionResult } from '../../types/nfeEmission'

type NfeEmissionFormProps = {
  certificate: DigitalCertificate | null
  client: AccountingClient | null
  organizationId: string | null
  readiness: NfeReadinessResult
  onDocumentsChanged: () => Promise<void>
  onError: (message: string) => void
  onFeedback: (message: string) => void
}

type ItemForm = {
  aliquotaCofins: string
  aliquotaIcms: string
  aliquotaIpi: string
  aliquotaPis: string
  cest: string
  cfop: string
  codigo: string
  csosn: string
  cstCofins: string
  cstIcms: string
  cstIpi: string
  cstPis: string
  descricao: string
  desconto: string
  frete: string
  gtin: string
  informacoesAdicionais: string
  ncm: string
  origemIcms: string
  outrasDespesas: string
  quantidade: string
  seguro: string
  unidade: string
  valorBaseCofins: string
  valorBaseIcms: string
  valorBaseIpi: string
  valorBasePis: string
  valorCofins: string
  valorIcms: string
  valorIpi: string
  valorPis: string
  valorTotal: string
  valorUnitario: string
}

type PaymentForm = {
  descricao: string
  indicadorPagamento: string
  tipoPagamento: string
  valor: string
}

const today = new Date().toISOString().slice(0, 10)

const initialItem: ItemForm = {
  aliquotaCofins: '0',
  aliquotaIcms: '0',
  aliquotaIpi: '0',
  aliquotaPis: '0',
  cest: '',
  cfop: '',
  codigo: '1',
  csosn: '',
  cstCofins: '99',
  cstIcms: '00',
  cstIpi: '',
  cstPis: '99',
  descricao: '',
  desconto: '0',
  frete: '0',
  gtin: '',
  informacoesAdicionais: '',
  ncm: '',
  origemIcms: '0',
  outrasDespesas: '0',
  quantidade: '1',
  seguro: '0',
  unidade: 'UN',
  valorBaseCofins: '0',
  valorBaseIcms: '0',
  valorBaseIpi: '0',
  valorBasePis: '0',
  valorCofins: '0',
  valorIcms: '0',
  valorIpi: '0',
  valorPis: '0',
  valorTotal: '0',
  valorUnitario: '0',
}

const initialPayment: PaymentForm = {
  descricao: 'Sem pagamento',
  indicadorPagamento: '0',
  tipoPagamento: '90',
  valor: '0',
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value)
}

function numberValue(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function itemTotal(item: ItemForm) {
  const product = numberValue(item.valorTotal) || numberValue(item.quantidade) * numberValue(item.valorUnitario)
  return (
    product +
    numberValue(item.frete) +
    numberValue(item.seguro) +
    numberValue(item.outrasDespesas) +
    numberValue(item.valorIpi) -
    numberValue(item.desconto)
  )
}

function fiscalDocumentLabel(client: AccountingClient | null) {
  if (!client) return 'Selecione uma empresa'
  return `${client.companyName} - ${client.cnpj || 'CNPJ nao informado'}`
}

function destinatarioFromClient(client: AccountingClient) {
  return {
    bairro: client.neighborhood ?? '',
    cep: client.cep ?? '',
    codigoMunicipioIbge: client.cityIbgeCode ?? '',
    codigoPais: '1058',
    complemento: client.addressComplement ?? '',
    documento: client.cnpj ?? '',
    email: client.email ?? '',
    indicadorIe: client.stateRegistration ? '1' : '9',
    inscricaoEstadual: client.stateRegistration ?? '',
    logradouro: client.address ?? '',
    municipio: client.city ?? '',
    nome: client.companyName ?? '',
    numero: client.addressNumber ?? '',
    pais: 'BRASIL',
    telefone: client.phone ?? '',
    uf: client.state ?? '',
  }
}

function blankDestinatario() {
  return {
    bairro: '',
    cep: '',
    codigoMunicipioIbge: '',
    codigoPais: '1058',
    complemento: '',
    documento: '',
    email: '',
    indicadorIe: '9',
    inscricaoEstadual: '',
    logradouro: '',
    municipio: '',
    nome: '',
    numero: '',
    pais: 'BRASIL',
    telefone: '',
    uf: '',
  }
}

export function NfeEmissionForm({
  certificate,
  client,
  onDocumentsChanged,
  onError,
  onFeedback,
  organizationId,
  readiness,
}: NfeEmissionFormProps) {
  const [documentId, setDocumentId] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isSearchingDestinatarioCep, setIsSearchingDestinatarioCep] = useState(false)
  const [lastResult, setLastResult] = useState<NfeEmissionResult | null>(null)
  const [xmlPreview, setXmlPreview] = useState('')
  const hydratedCepRef = useRef('')
  const [form, setForm] = useState({
    consumidorFinal: '1',
    dataEmissao: today,
    destinoOperacao: '',
    finalidade: 'normal',
    indicadorPresenca: '0',
    informacoesAdicionais: '',
    naturezaOperacao: '',
    numero: '',
    serie: '1',
    tipoOperacao: 'saida' as 'entrada' | 'saida',
  })
  const [destinatario, setDestinatario] = useState(() =>
    client ? destinatarioFromClient(client) : blankDestinatario(),
  )
  const [items, setItems] = useState<ItemForm[]>([initialItem])
  const [payments, setPayments] = useState<PaymentForm[]>([initialPayment])
  const [transporte, setTransporte] = useState({
    especie: '',
    modalidadeFrete: '9',
    pesoBruto: '0',
    pesoLiquido: '0',
    placa: '',
    quantidadeVolumes: '0',
    transportadoraDocumento: '',
    transportadoraEndereco: '',
    transportadoraIe: '',
    transportadoraMunicipio: '',
    transportadoraNome: '',
    transportadoraUf: '',
    ufVeiculo: '',
  })
  const total = useMemo(() => items.reduce((sum, item) => sum + itemTotal(item), 0), [items])
  const hasIssWarning = items.some((item) => ['5933', '6933'].includes(onlyDigits(item.cfop)) || onlyDigits(item.ncm) === '00000000')

  const hydrateDestinatarioFromCep = useCallback(async (cep: string, overwriteAddress = false) => {
    const cleanCep = onlyDigits(cep)

    if (cleanCep.length !== 8) return

    setIsSearchingDestinatarioCep(true)
    try {
      const result = await findAddressDetailsByCep(cleanCep)
      setDestinatario((current) => {
        if (onlyDigits(current.cep) !== cleanCep) return current

        return {
          ...current,
          bairro: overwriteAddress ? result.neighborhood || current.bairro : current.bairro || result.neighborhood,
          cep: result.cep,
          codigoMunicipioIbge: result.ibge || current.codigoMunicipioIbge,
          complemento: overwriteAddress ? result.complement || current.complemento : current.complemento || result.complement,
          logradouro: overwriteAddress ? result.address || current.logradouro : current.logradouro || result.address,
          municipio: overwriteAddress ? result.city || current.municipio : current.municipio || result.city,
          uf: overwriteAddress ? result.state || current.uf : current.uf || result.state,
        }
      })
    } finally {
      setIsSearchingDestinatarioCep(false)
    }
  }, [])

  useEffect(() => {
    const cleanCep = onlyDigits(destinatario.cep)

    if (cleanCep.length !== 8 || destinatario.codigoMunicipioIbge || hydratedCepRef.current === cleanCep) {
      return
    }

    hydratedCepRef.current = cleanCep
    void hydrateDestinatarioFromCep(destinatario.cep)
  }, [destinatario.cep, destinatario.codigoMunicipioIbge, hydrateDestinatarioFromCep])

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateDestinatario(field: keyof typeof destinatario, value: string) {
    setDestinatario((current) => ({ ...current, [field]: value }))
  }

  function updateTransporte(field: keyof typeof transporte, value: string) {
    setTransporte((current) => ({ ...current, [field]: value }))
  }

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    )
  }

  function updatePayment(index: number, field: keyof PaymentForm, value: string) {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, [field]: value } : payment,
      ),
    )
  }

  function addItem() {
    setItems((current) => [...current, { ...initialItem, codigo: String(current.length + 1) }])
  }

  function removeItem(index: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)))
  }

  function buildPayload(): NfeEmissionPayload {
    return {
      consumidorFinal: form.consumidorFinal,
      dataEmissao: form.dataEmissao,
      destinoOperacao: form.destinoOperacao,
      destinatario,
      finalidade: form.finalidade,
      indicadorPresenca: form.indicadorPresenca,
      informacoesAdicionais: form.informacoesAdicionais,
      itens: items.map((item) => ({
        aliquotaCofins: numberValue(item.aliquotaCofins),
        aliquotaIcms: numberValue(item.aliquotaIcms),
        aliquotaIpi: numberValue(item.aliquotaIpi),
        aliquotaPis: numberValue(item.aliquotaPis),
        cest: item.cest,
        cfop: item.cfop,
        codigo: item.codigo,
        csosn: item.csosn,
        cstCofins: item.cstCofins,
        cstIcms: item.cstIcms,
        cstIpi: item.cstIpi,
        cstPis: item.cstPis,
        descricao: item.descricao,
        desconto: numberValue(item.desconto),
        frete: numberValue(item.frete),
        gtin: item.gtin,
        informacoesAdicionais: item.informacoesAdicionais,
        ncm: item.ncm,
        origemIcms: item.origemIcms,
        outrasDespesas: numberValue(item.outrasDespesas),
        quantidade: numberValue(item.quantidade),
        seguro: numberValue(item.seguro),
        unidade: item.unidade,
        valorBaseCofins: numberValue(item.valorBaseCofins),
        valorBaseIcms: numberValue(item.valorBaseIcms),
        valorBaseIpi: numberValue(item.valorBaseIpi),
        valorBasePis: numberValue(item.valorBasePis),
        valorCofins: numberValue(item.valorCofins),
        valorIcms: numberValue(item.valorIcms),
        valorIpi: numberValue(item.valorIpi),
        valorPis: numberValue(item.valorPis),
        valorTotal: numberValue(item.valorTotal),
        valorUnitario: numberValue(item.valorUnitario),
      })),
      naturezaOperacao: form.naturezaOperacao,
      numero: form.numero,
      pagamentos: payments.map((payment) => ({
        descricao: payment.descricao,
        indicadorPagamento: payment.indicadorPagamento,
        tipoPagamento: payment.tipoPagamento,
        valor: numberValue(payment.valor) || total,
      })),
      serie: form.serie,
      tipoOperacao: form.tipoOperacao === 'entrada' ? 'entrada' : 'saida',
      totais: {
        valorDesconto: items.reduce((sum, item) => sum + numberValue(item.desconto), 0),
        valorFrete: items.reduce((sum, item) => sum + numberValue(item.frete), 0),
        valorOutrasDespesas: items.reduce((sum, item) => sum + numberValue(item.outrasDespesas), 0),
        valorSeguro: items.reduce((sum, item) => sum + numberValue(item.seguro), 0),
      },
      transporte: {
        ...transporte,
        pesoBruto: numberValue(transporte.pesoBruto),
        pesoLiquido: numberValue(transporte.pesoLiquido),
        quantidadeVolumes: numberValue(transporte.quantidadeVolumes),
      },
    }
  }

  function buildRequest() {
    if (!organizationId || !client?.id || !certificate?.id) {
      throw new Error('Selecione empresa e certificado antes de emitir NF-e.')
    }

    return {
      certificateId: certificate.id,
      clientId: client.id,
      documentId: documentId || undefined,
      nota: buildPayload(),
      organizationId,
    }
  }

  function validateLocal() {
    const errors: string[] = []
    if (!readiness.isReady) errors.push(readiness.errors[0]?.message ?? 'Revise as pendencias do certificado.')
    if (!form.naturezaOperacao.trim()) errors.push('Informe a natureza da operacao.')
    if (!onlyDigits(form.serie)) errors.push('Informe a serie da NF-e.')
    if (!onlyDigits(form.numero)) errors.push('Informe o numero da NF-e.')
    if (!destinatario.nome.trim()) errors.push('Informe o destinatario.')
    if (![11, 14].includes(onlyDigits(destinatario.documento).length)) errors.push('CPF/CNPJ do destinatario invalido.')
    if (hasIssWarning) errors.push('Servico ISS deve ser emitido por NFS-e, nao NF-e modelo 55.')
    items.forEach((item, index) => {
      if (!item.descricao.trim()) errors.push(`Item ${index + 1}: informe a descricao.`)
      if (onlyDigits(item.ncm).length !== 8) errors.push(`Item ${index + 1}: informe NCM com 8 digitos.`)
      if (onlyDigits(item.cfop).length !== 4) errors.push(`Item ${index + 1}: informe CFOP com 4 digitos.`)
      if (numberValue(item.quantidade) <= 0) errors.push(`Item ${index + 1}: quantidade obrigatoria.`)
      if (numberValue(item.valorUnitario) <= 0) errors.push(`Item ${index + 1}: valor unitario obrigatorio.`)
      if (!item.cstIcms.trim() && !item.csosn.trim()) errors.push(`Item ${index + 1}: informe CST ICMS ou CSOSN.`)
    })
    return errors
  }

  async function runAction(action: 'draft' | 'validate' | 'generate' | 'sign' | 'authorize') {
    setIsBusy(true)
    onError('')
    onFeedback('')

    try {
      const request = buildRequest()
      let result: NfeEmissionResult

      if (action !== 'draft') {
        const localErrors = validateLocal()
        if (localErrors.length) throw new Error(localErrors.join(' '))
      }

      if (action === 'draft') {
        result = await saveNfeDraft(request)
      } else if (action === 'validate') {
        result = await validateNfe(request)
      } else if (action === 'generate') {
        result = await generateNfeXml(request)
        setXmlPreview(result.xml ?? '')
      } else if (action === 'sign') {
        if (!documentId) throw new Error('Gere o XML antes de assinar.')
        result = await signNfeXml({
          certificateId: request.certificateId,
          clientId: request.clientId,
          documentId,
          organizationId: request.organizationId,
        })
        setXmlPreview(result.xml ?? xmlPreview)
      } else {
        if (!documentId) throw new Error('Gere e assine o XML antes de transmitir.')
        result = await authorizeNfe({
          certificateId: request.certificateId,
          clientId: request.clientId,
          documentId,
          organizationId: request.organizationId,
        })
      }

      if (result.documentId) setDocumentId(result.documentId)
      setLastResult(result)
      onFeedback(result.message ?? 'Operacao NF-e concluida.')
      await onDocumentsChanged()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel processar a NF-e.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="mt-5 space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Gerar nota fiscal NF-e modelo 55</h3>
            <p className="mt-2 text-sm text-slate-500">
              Preencha os dados fiscais reais. Homologacao transmite para ambiente de teste; producao deve ser usada somente com credenciamento e dados revisados.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Empresa emissora</span>
            <strong className="text-slate-900">{fiscalDocumentLabel(client)}</strong>
          </div>
        </div>

        {!readiness.isReady && (
          <div className="mt-5">
            <Alert type="warning">{readiness.errors[0]?.message ?? 'Existem pendencias antes da emissao real.'}</Alert>
          </div>
        )}

        {hasIssWarning && (
          <div className="mt-5">
            <Alert type="warning">CFOP de servico/ISS detectado. Use NFS-e; este fluxo e somente NF-e modelo 55.</Alert>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Input label="Natureza da operacao" onChange={(event) => updateForm('naturezaOperacao', event.target.value)} required value={form.naturezaOperacao} />
          <Input label="Serie" onChange={(event) => updateForm('serie', event.target.value)} required value={form.serie} />
          <Input label="Numero" onChange={(event) => updateForm('numero', event.target.value)} required value={form.numero} />
          <Input label="Data de emissao" onChange={(event) => updateForm('dataEmissao', event.target.value)} type="date" value={form.dataEmissao} />
          <Select label="Tipo de operacao" onChange={(value) => updateForm('tipoOperacao', value)} value={form.tipoOperacao}>
            <option value="saida">Saida</option>
            <option value="entrada">Entrada</option>
          </Select>
          <Select label="Finalidade" onChange={(value) => updateForm('finalidade', value)} value={form.finalidade}>
            <option value="normal">Normal</option>
            <option value="complementar">Complementar</option>
            <option value="ajuste">Ajuste</option>
            <option value="devolucao">Devolucao</option>
          </Select>
          <Select label="Presenca" onChange={(value) => updateForm('indicadorPresenca', value)} value={form.indicadorPresenca}>
            <option value="0">Nao se aplica</option>
            <option value="1">Presencial</option>
            <option value="2">Internet</option>
            <option value="3">Teleatendimento</option>
            <option value="9">Outros</option>
          </Select>
          <Select label="Consumidor final" onChange={(value) => updateForm('consumidorFinal', value)} value={form.consumidorFinal}>
            <option value="1">Sim</option>
            <option value="0">Nao</option>
          </Select>
        </div>
      </div>

      <FormCard title="Destinatario">
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Nome / razao social" onChange={(event) => updateDestinatario('nome', event.target.value)} required value={destinatario.nome} />
          <Input label="CPF/CNPJ" onChange={(event) => updateDestinatario('documento', event.target.value)} required value={destinatario.documento} />
          <Input label="Inscricao estadual" onChange={(event) => updateDestinatario('inscricaoEstadual', event.target.value)} value={destinatario.inscricaoEstadual} />
          <Select label="Indicador IE" onChange={(value) => updateDestinatario('indicadorIe', value)} value={destinatario.indicadorIe}>
            <option value="1">Contribuinte ICMS</option>
            <option value="2">Contribuinte isento</option>
            <option value="9">Nao contribuinte</option>
          </Select>
          <Input label="E-mail" onChange={(event) => updateDestinatario('email', event.target.value)} type="email" value={destinatario.email} />
          <Input label="Telefone" onChange={(event) => updateDestinatario('telefone', event.target.value)} value={destinatario.telefone} />
          <Input
            label="CEP"
            onBlur={() => void hydrateDestinatarioFromCep(destinatario.cep, true)}
            onChange={(event) => updateDestinatario('cep', event.target.value)}
            value={destinatario.cep}
          />
          <Input label="Endereco" onChange={(event) => updateDestinatario('logradouro', event.target.value)} value={destinatario.logradouro} />
          <Input label="Numero" onChange={(event) => updateDestinatario('numero', event.target.value)} value={destinatario.numero} />
          <Input label="Complemento" onChange={(event) => updateDestinatario('complemento', event.target.value)} value={destinatario.complemento} />
          <Input label="Bairro" onChange={(event) => updateDestinatario('bairro', event.target.value)} value={destinatario.bairro} />
          <Input label="Codigo IBGE municipio" onChange={(event) => updateDestinatario('codigoMunicipioIbge', event.target.value)} value={destinatario.codigoMunicipioIbge} />
          <Input label="Municipio" onChange={(event) => updateDestinatario('municipio', event.target.value)} value={destinatario.municipio} />
          <Input label="UF" maxLength={2} onChange={(event) => updateDestinatario('uf', event.target.value.toUpperCase())} value={destinatario.uf} />
        </div>
        {isSearchingDestinatarioCep && (
          <p className="mt-3 text-xs font-semibold text-indigo-600">Buscando endereco e codigo IBGE pelo ViaCEP...</p>
        )}
      </FormCard>

      <FormCard
        action={<Button onClick={addItem} variant="secondary">Adicionar item</Button>}
        title="Itens, produtos e tributacao"
      >
        <div className="space-y-5">
          {items.map((item, index) => (
            <div className="rounded-2xl border border-slate-200 p-4" key={`${item.codigo}-${index}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <strong className="text-slate-900">Item {index + 1}</strong>
                <button className="text-sm font-semibold text-rose-600 disabled:opacity-40" disabled={items.length === 1} onClick={() => removeItem(index)} type="button">
                  Remover
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <Input label="Codigo" onChange={(event) => updateItem(index, 'codigo', event.target.value)} value={item.codigo} />
                <Input label="Descricao" onChange={(event) => updateItem(index, 'descricao', event.target.value)} required value={item.descricao} />
                <Input label="GTIN/EAN" onChange={(event) => updateItem(index, 'gtin', event.target.value)} placeholder="SEM GTIN se vazio" value={item.gtin} />
                <Input label="NCM" onChange={(event) => updateItem(index, 'ncm', event.target.value)} required value={item.ncm} />
                <Input label="CEST" onChange={(event) => updateItem(index, 'cest', event.target.value)} value={item.cest} />
                <Input label="CFOP" onChange={(event) => updateItem(index, 'cfop', event.target.value)} required value={item.cfop} />
                <Input label="Unidade" onChange={(event) => updateItem(index, 'unidade', event.target.value)} value={item.unidade} />
                <Input label="Quantidade" onChange={(event) => updateItem(index, 'quantidade', event.target.value)} type="number" value={item.quantidade} />
                <Input label="Valor unitario" onChange={(event) => updateItem(index, 'valorUnitario', event.target.value)} type="number" value={item.valorUnitario} />
                <Input label="Valor produto" onChange={(event) => updateItem(index, 'valorTotal', event.target.value)} type="number" value={item.valorTotal} />
                <Input label="Desconto" onChange={(event) => updateItem(index, 'desconto', event.target.value)} type="number" value={item.desconto} />
                <Input label="Frete" onChange={(event) => updateItem(index, 'frete', event.target.value)} type="number" value={item.frete} />
                <Input label="Seguro" onChange={(event) => updateItem(index, 'seguro', event.target.value)} type="number" value={item.seguro} />
                <Input label="Outras despesas" onChange={(event) => updateItem(index, 'outrasDespesas', event.target.value)} type="number" value={item.outrasDespesas} />
                <Input label="Origem ICMS" onChange={(event) => updateItem(index, 'origemIcms', event.target.value)} value={item.origemIcms} />
                <Input label="CST ICMS" onChange={(event) => updateItem(index, 'cstIcms', event.target.value)} value={item.cstIcms} />
                <Input label="CSOSN" onChange={(event) => updateItem(index, 'csosn', event.target.value)} value={item.csosn} />
                <Input label="Base ICMS" onChange={(event) => updateItem(index, 'valorBaseIcms', event.target.value)} type="number" value={item.valorBaseIcms} />
                <Input label="% ICMS" onChange={(event) => updateItem(index, 'aliquotaIcms', event.target.value)} type="number" value={item.aliquotaIcms} />
                <Input label="Valor ICMS" onChange={(event) => updateItem(index, 'valorIcms', event.target.value)} type="number" value={item.valorIcms} />
                <Input label="CST PIS" onChange={(event) => updateItem(index, 'cstPis', event.target.value)} value={item.cstPis} />
                <Input label="% PIS" onChange={(event) => updateItem(index, 'aliquotaPis', event.target.value)} type="number" value={item.aliquotaPis} />
                <Input label="CST COFINS" onChange={(event) => updateItem(index, 'cstCofins', event.target.value)} value={item.cstCofins} />
                <Input label="% COFINS" onChange={(event) => updateItem(index, 'aliquotaCofins', event.target.value)} type="number" value={item.aliquotaCofins} />
                <Input label="CST IPI" onChange={(event) => updateItem(index, 'cstIpi', event.target.value)} value={item.cstIpi} />
                <Input label="% IPI" onChange={(event) => updateItem(index, 'aliquotaIpi', event.target.value)} type="number" value={item.aliquotaIpi} />
                <Input label="Valor IPI" onChange={(event) => updateItem(index, 'valorIpi', event.target.value)} type="number" value={item.valorIpi} />
              </div>
            </div>
          ))}
        </div>
      </FormCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <FormCard title="Pagamento">
          {payments.map((payment, index) => (
            <div className="grid gap-4 md:grid-cols-3" key={index}>
              <Select label="Tipo" onChange={(value) => updatePayment(index, 'tipoPagamento', value)} value={payment.tipoPagamento}>
                <option value="90">Sem pagamento</option>
                <option value="01">Dinheiro</option>
                <option value="03">Cartao de credito</option>
                <option value="04">Cartao de debito</option>
                <option value="15">Boleto</option>
                <option value="17">Pix</option>
              </Select>
              <Input label="Descricao" onChange={(event) => updatePayment(index, 'descricao', event.target.value)} value={payment.descricao} />
              <Input label="Valor" onChange={(event) => updatePayment(index, 'valor', event.target.value)} type="number" value={payment.valor} />
            </div>
          ))}
        </FormCard>

        <FormCard title="Transporte">
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Modalidade frete" onChange={(value) => updateTransporte('modalidadeFrete', value)} value={transporte.modalidadeFrete}>
              <option value="9">Sem frete</option>
              <option value="0">Por conta do emitente</option>
              <option value="1">Por conta do destinatario</option>
              <option value="2">Por conta de terceiros</option>
            </Select>
            <Input label="Transportadora" onChange={(event) => updateTransporte('transportadoraNome', event.target.value)} value={transporte.transportadoraNome} />
            <Input label="CPF/CNPJ transportadora" onChange={(event) => updateTransporte('transportadoraDocumento', event.target.value)} value={transporte.transportadoraDocumento} />
            <Input label="Placa" onChange={(event) => updateTransporte('placa', event.target.value)} value={transporte.placa} />
            <Input label="Volumes" onChange={(event) => updateTransporte('quantidadeVolumes', event.target.value)} type="number" value={transporte.quantidadeVolumes} />
            <Input label="Especie" onChange={(event) => updateTransporte('especie', event.target.value)} value={transporte.especie} />
          </div>
        </FormCard>
      </div>

      <FormCard title="Totais e acoes">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Total calculado</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{money(total)}</p>
            {documentId && <p className="mt-1 text-xs text-slate-500">Documento: {documentId}</p>}
            {lastResult?.accessKey && <p className="mt-1 font-mono text-xs text-slate-500">Chave: {lastResult.accessKey}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button isLoading={isBusy} onClick={() => void runAction('draft')} variant="secondary">Salvar rascunho</Button>
            <Button isLoading={isBusy} onClick={() => void runAction('validate')} variant="secondary">Validar NF-e</Button>
            <Button isLoading={isBusy} onClick={() => void runAction('generate')}>Gerar XML</Button>
            <Button isLoading={isBusy} onClick={() => void runAction('sign')} variant="secondary">Assinar XML</Button>
            <Button isLoading={isBusy} onClick={() => void runAction('authorize')}>Transmitir em homologacao</Button>
          </div>
        </div>

        <label className="mt-6 block space-y-2 text-sm font-medium text-slate-700">
          <span>Informacoes adicionais</span>
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-500"
            onChange={(event) => updateForm('informacoesAdicionais', event.target.value)}
            value={form.informacoesAdicionais}
          />
        </label>

        {xmlPreview && (
          <pre className="mt-5 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {xmlPreview}
          </pre>
        )}
      </FormCard>
    </section>
  )
}

function FormCard({
  action,
  children,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  title: string
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}

function Select({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  )
}
