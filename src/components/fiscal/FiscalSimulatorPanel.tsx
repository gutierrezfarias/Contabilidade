import { useCallback, useEffect, useMemo, useState } from 'react'
import { previewNfeTaxes } from '../../services/fiscalBackendService'
import { listFiscalProducts } from '../../services/fiscalRepository'
import type { AccountingClient } from '../../types/accounting'
import type { FiscalProduct, NfeTaxPreviewResult } from '../../types/fiscal'
import type { NfeEmissionItem } from '../../types/nfeEmission'
import { formatCurrencyBRL, onlyDigits } from '../../utils/formatters'

type FiscalSimulatorPanelProps = {
  client: AccountingClient | null
  clientId: string
  organizationId: string | null
  onError: (message: string) => void
  onFeedback: (message: string) => void
}

type SimulationForm = {
  destinatarioUf: string
  direction: 'entrada' | 'saida'
  finalidade: string
  operationTypeCode: string
  productId: string
  quantity: number
  unitValue: number
}

const blankForm: SimulationForm = {
  destinatarioUf: '',
  direction: 'saida',
  finalidade: 'normal',
  operationTypeCode: 'VENDA',
  productId: '',
  quantity: 1,
  unitValue: 0,
}

function productToItem(product: FiscalProduct, quantity: number, unitValue: number): NfeEmissionItem {
  const total = quantity * unitValue

  return {
    aliquotaCofins: product.cofinsRate,
    aliquotaIcms: product.icmsRate,
    aliquotaIpi: product.ipiRate,
    aliquotaPis: product.pisRate,
    cest: product.cest,
    cfop: product.defaultCfopOut,
    codigo: product.productCode,
    csosn: product.icmsCsosn,
    cstCofins: product.cofinsCst,
    cstIcms: product.icmsCst,
    cstIpi: product.ipiCst,
    cstPis: product.pisCst,
    desconto: 0,
    descricao: product.description,
    frete: 0,
    gtin: product.gtin,
    informacoesAdicionais: product.notes,
    ncm: product.ncm,
    origemIcms: product.merchandiseOrigin,
    outrasDespesas: 0,
    productGroupId: product.groupId,
    productId: product.id,
    quantidade: quantity,
    seguro: 0,
    unidade: product.commercialUnit,
    valorBaseCofins: total,
    valorBaseIcms: total,
    valorBaseIpi: product.ipiRate > 0 ? total : 0,
    valorBasePis: total,
    valorCofins: total * product.cofinsRate / 100,
    valorIcms: total * product.icmsRate / 100,
    valorIpi: total * product.ipiRate / 100,
    valorPis: total * product.pisRate / 100,
    valorTotal: total,
    valorUnitario: unitValue,
  }
}

export function FiscalSimulatorPanel({
  client,
  clientId,
  organizationId,
  onError,
  onFeedback,
}: FiscalSimulatorPanelProps) {
  const [products, setProducts] = useState<FiscalProduct[]>([])
  const [form, setForm] = useState<SimulationForm>(blankForm)
  const [result, setResult] = useState<NfeTaxPreviewResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [form.productId, products],
  )

  const reloadProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const loadedProducts = await listFiscalProducts(organizationId, clientId)
      setProducts(loadedProducts.filter((product) => product.active))
      setForm((current) => ({
        ...current,
        destinatarioUf: current.destinatarioUf || client?.state || '',
        productId: current.productId || loadedProducts.find((product) => product.active)?.id || '',
      }))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel carregar produtos para simulacao.')
    } finally {
      setIsLoading(false)
    }
  }, [client?.state, clientId, onError, organizationId])

  function updateField<Field extends keyof SimulationForm>(field: Field, value: SimulationForm[Field]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handlePreview() {
    onError('')
    onFeedback('')
    setResult(null)

    if (!organizationId || !clientId || !client) {
      onError('Selecione um cliente para simular impostos.')
      return
    }

    if (!selectedProduct) {
      onError('Selecione um produto fiscal ativo.')
      return
    }

    if (form.quantity <= 0 || form.unitValue <= 0) {
      onError('Informe quantidade e valor unitario maiores que zero.')
      return
    }

    setIsCalculating(true)
    onFeedback('Calculando pre-visualizacao fiscal...')

    try {
      const preview = await previewNfeTaxes({
        clientId,
        destinatario: {
          bairro: client.neighborhood,
          cep: client.cep,
          codigoMunicipioIbge: client.cityIbgeCode,
          codigoPais: '1058',
          complemento: client.addressComplement,
          documento: client.cnpj,
          email: client.email,
          indicadorIe: client.stateRegistration ? '1' : '9',
          inscricaoEstadual: client.stateRegistration,
          logradouro: client.address,
          municipio: client.city,
          nome: client.companyName,
          numero: client.addressNumber,
          pais: 'Brasil',
          telefone: client.phone,
          uf: form.destinatarioUf || client.state,
        },
        direction: form.direction,
        finalidade: form.finalidade,
        itens: [productToItem(selectedProduct, form.quantity, form.unitValue)],
        operationTypeCode: form.operationTypeCode,
        organizationId,
      })
      setResult(preview)
      onFeedback(preview.message || 'Pre-visualizacao fiscal concluida.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel calcular a pre-visualizacao fiscal.')
    } finally {
      setIsCalculating(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadProducts()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [reloadProducts])

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Simulador fiscal</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-900">Previa de impostos</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Use produtos e regras aprovadas para prever CFOP, CST/CSOSN e aliquotas antes da emissao.
        </p>

        <div className="mt-5 grid gap-4">
          <label className="text-sm font-semibold text-slate-700">
            Produto
            <select
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              disabled={isLoading}
              onChange={(event) => updateField('productId', event.target.value)}
              value={form.productId}
            >
              <option value="">{isLoading ? 'Carregando produtos...' : 'Selecione...'}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.productCode} - {product.description}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Direcao"
              value={form.direction}
              onChange={(value) => updateField('direction', value === 'entrada' ? 'entrada' : 'saida')}
              options={[
                ['saida', 'Saida'],
                ['entrada', 'Entrada'],
              ]}
            />
            <Field label="Tipo de operacao" value={form.operationTypeCode} onChange={(value) => updateField('operationTypeCode', value)} />
            <Field label="Finalidade" value={form.finalidade} onChange={(value) => updateField('finalidade', value)} />
            <Field label="UF destino" value={form.destinatarioUf} onChange={(value) => updateField('destinatarioUf', value.toUpperCase())} />
            <NumberField label="Quantidade" value={form.quantity} onChange={(value) => updateField('quantity', value)} />
            <NumberField label="Valor unitario" value={form.unitValue} onChange={(value) => updateField('unitValue', value)} />
          </div>
        </div>

        <button
          className="mt-5 h-12 w-full rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          disabled={isCalculating}
          onClick={() => void handlePreview()}
          type="button"
        >
          {isCalculating ? 'Calculando...' : 'Calcular preview fiscal'}
        </button>

        {client && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{client.companyName}</p>
            <p className="mt-1">CNPJ {client.cnpj || 'Nao informado'} | UF {client.state || '-'}</p>
            <p className="mt-1">Documento limpo: {onlyDigits(client.cnpj) || 'Nao informado'}</p>
          </div>
        )}
      </article>

      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Resultado</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Preview tributario</h3>
          </div>
          {result && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {result.status}
            </span>
          )}
        </div>

        {!result ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500">
            Execute uma simulacao para ver regras aplicadas, pendencias e impostos calculados.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-100 p-4 text-sm">
              <p className="font-semibold text-slate-900">{result.message}</p>
              <p className="mt-1 text-slate-500">Perfil fiscal: {result.fiscalProfileStatus}</p>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <strong>Erros bloqueantes</strong>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {result.errors.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <strong>Avisos</strong>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {result.warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {result.items.map((item) => (
              <div className="rounded-2xl border border-slate-100 p-4" key={item.index}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <h4 className="font-semibold text-slate-900">Item {item.index}</h4>
                    <p className="mt-1 text-sm text-slate-500">{item.justification}</p>
                  </div>
                  <span className="h-fit rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    {item.appliedRuleCode || 'Sem regra'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="CFOP" value={item.calculatedItem.cfop || '-'} />
                  <Metric label="ICMS" value={`${item.calculatedItem.aliquotaIcms}% / ${formatCurrencyBRL(item.calculatedItem.valorIcms)}`} />
                  <Metric label="PIS" value={`${item.calculatedItem.aliquotaPis}% / ${formatCurrencyBRL(item.calculatedItem.valorPis)}`} />
                  <Metric label="COFINS" value={`${item.calculatedItem.aliquotaCofins}% / ${formatCurrencyBRL(item.calculatedItem.valorCofins)}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: number) => void
  value: number
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        min="0"
        onChange={(event) => onChange(Number(event.target.value || 0))}
        step="0.01"
        type="number"
        value={value}
      />
    </label>
  )
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: Array<[string, string]>
  value: string
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  )
}
