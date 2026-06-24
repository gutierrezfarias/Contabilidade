import { useCallback, useEffect, useState } from 'react'
import {
  deleteFiscalProduct,
  listFiscalProducts,
  saveFiscalProduct,
} from '../../services/fiscalRepository'
import { searchNcmCatalog } from '../../services/fiscalBackendService'
import type { FiscalProduct, FiscalProductInput, NcmCatalogItem } from '../../types/fiscal'
import { validateFiscalProduct } from '../../utils/fiscalValidators'

type FiscalProductsPanelProps = {
  clientId: string
  organizationId: string | null
  onError: (message: string) => void
  onFeedback: (message: string) => void
  onChanged?: () => void
}

const blankProduct: FiscalProductInput = {
  active: true,
  cest: '',
  cofinsCst: '99',
  cofinsRate: 0,
  commercialUnit: 'UN',
  defaultCfopIn: '',
  defaultCfopOut: '',
  description: '',
  fcpRate: 0,
  fiscalBenefitCode: '',
  fiscalStatus: 'Pendente',
  groupId: '',
  gtin: '',
  hasIcmsSt: false,
  icmsBaseReduction: 0,
  icmsCsosn: '',
  icmsCst: '',
  icmsRate: 0,
  ipiCst: '',
  ipiRate: 0,
  itemType: 'Mercadoria',
  merchandiseOrigin: '0',
  mvaRate: 0,
  ncm: '',
  notes: '',
  pisCst: '99',
  pisRate: 0,
  productCode: '',
}

function productToInput(product: FiscalProduct): FiscalProductInput {
  return {
    active: product.active,
    cest: product.cest,
    cofinsCst: product.cofinsCst,
    cofinsRate: product.cofinsRate,
    commercialUnit: product.commercialUnit,
    defaultCfopIn: product.defaultCfopIn,
    defaultCfopOut: product.defaultCfopOut,
    description: product.description,
    fcpRate: product.fcpRate,
    fiscalBenefitCode: product.fiscalBenefitCode,
    fiscalStatus: product.fiscalStatus,
    groupId: product.groupId,
    gtin: product.gtin,
    hasIcmsSt: product.hasIcmsSt,
    icmsBaseReduction: product.icmsBaseReduction,
    icmsCsosn: product.icmsCsosn,
    icmsCst: product.icmsCst,
    icmsRate: product.icmsRate,
    ipiCst: product.ipiCst,
    ipiRate: product.ipiRate,
    itemType: product.itemType,
    merchandiseOrigin: product.merchandiseOrigin,
    mvaRate: product.mvaRate,
    ncm: product.ncm,
    notes: product.notes,
    pisCst: product.pisCst,
    pisRate: product.pisRate,
    productCode: product.productCode,
  }
}

export function FiscalProductsPanel({
  clientId,
  organizationId,
  onError,
  onFeedback,
  onChanged,
}: FiscalProductsPanelProps) {
  const [products, setProducts] = useState<FiscalProduct[]>([])
  const [form, setForm] = useState<FiscalProductInput>(blankProduct)
  const [editingId, setEditingId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [ncmSuggestions, setNcmSuggestions] = useState<NcmCatalogItem[]>([])
  const [isSearchingNcm, setIsSearchingNcm] = useState(false)

  const reloadProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      setProducts(await listFiscalProducts(organizationId, clientId))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel carregar produtos fiscais.')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, onError, organizationId])

  function updateField<Field extends keyof FiscalProductInput>(field: Field, value: FiscalProductInput[Field]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setForm(blankProduct)
    setEditingId('')
  }

  async function handleSave() {
    onError('')
    onFeedback('')

    if (!organizationId || !clientId) {
      onError('Selecione um cliente antes de cadastrar produtos fiscais.')
      return
    }

    const validationErrors = validateFiscalProduct(form)
    if (validationErrors.length > 0) {
      onError(validationErrors.join(' '))
      return
    }

    setIsSaving(true)
    onFeedback('Salvando produto fiscal...')

    try {
      await saveFiscalProduct(organizationId, clientId, form, editingId || undefined)
      await reloadProducts()
      onChanged?.()
      resetForm()
      onFeedback('Produto fiscal salvo com sucesso.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel salvar o produto fiscal.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(productId: string) {
    onError('')
    onFeedback('Desativando produto fiscal...')

    try {
      await deleteFiscalProduct(productId)
      await reloadProducts()
      onChanged?.()
      onFeedback('Produto fiscal desativado.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel desativar o produto fiscal.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadProducts()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [reloadProducts])

  useEffect(() => {
    const query = form.ncm.trim()
    if (query.length < 3 || form.itemType === 'Servico') {
      const clearTimer = window.setTimeout(() => setNcmSuggestions([]), 0)
      return () => window.clearTimeout(clearTimer)
    }

    let active = true

    const timer = window.setTimeout(() => {
      if (active) setIsSearchingNcm(true)
      searchNcmCatalog(query, 8)
        .then((items) => {
          if (active) setNcmSuggestions(items)
        })
        .catch(() => {
          if (active) setNcmSuggestions([])
        })
        .finally(() => {
          if (active) setIsSearchingNcm(false)
        })
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [form.itemType, form.ncm])

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Catalogo fiscal</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {editingId ? 'Editar produto/servico' : 'Novo produto/servico'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Estes campos alimentam os itens da NF-e e a pre-visualizacao tributaria.
            </p>
          </div>
          {editingId && (
            <button
              className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={resetForm}
              type="button"
            >
              Novo
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Codigo" required value={form.productCode} onChange={(value) => updateField('productCode', value)} />
          <Field label="Descricao" required value={form.description} onChange={(value) => updateField('description', value)} />
          <NcmAutocomplete
            disabled={form.itemType === 'Servico'}
            isLoading={isSearchingNcm}
            onChange={(value) => updateField('ncm', value)}
            onSelect={(item) => {
              updateField('ncm', item.normalizedCode || item.code)
              setNcmSuggestions([])
            }}
            required={form.itemType !== 'Servico'}
            suggestions={ncmSuggestions}
            value={form.ncm}
          />
          <Field label="CEST" value={form.cest} onChange={(value) => updateField('cest', value)} />
          <Field label="GTIN/EAN" value={form.gtin} onChange={(value) => updateField('gtin', value)} />
          <Field label="Unidade comercial" value={form.commercialUnit} onChange={(value) => updateField('commercialUnit', value)} />
          <Field label="CFOP saida padrao" value={form.defaultCfopOut} onChange={(value) => updateField('defaultCfopOut', value)} />
          <Field label="CFOP entrada padrao" value={form.defaultCfopIn} onChange={(value) => updateField('defaultCfopIn', value)} />

          <SelectField
            label="Origem ICMS"
            value={form.merchandiseOrigin}
            onChange={(value) => updateField('merchandiseOrigin', value)}
            options={[
              ['0', '0 - Nacional'],
              ['1', '1 - Estrangeira importacao direta'],
              ['2', '2 - Estrangeira mercado interno'],
              ['3', '3 - Nacional com conteudo importado > 40%'],
              ['4', '4 - Nacional conforme processos produtivos'],
              ['5', '5 - Nacional com conteudo importado <= 40%'],
              ['8', '8 - Nacional com conteudo importado > 70%'],
            ]}
          />
          <SelectField
            label="Tipo"
            value={form.itemType}
            onChange={(value) => updateField('itemType', value)}
            options={[
              ['Mercadoria', 'Mercadoria'],
              ['Servico', 'Servico'],
              ['Uso e consumo', 'Uso e consumo'],
              ['Ativo imobilizado', 'Ativo imobilizado'],
            ]}
          />
          <Field label="CST ICMS" value={form.icmsCst} onChange={(value) => updateField('icmsCst', value)} />
          <Field label="CSOSN" value={form.icmsCsosn} onChange={(value) => updateField('icmsCsosn', value)} />
          <NumberField label="% ICMS" value={form.icmsRate} onChange={(value) => updateField('icmsRate', value)} />
          <NumberField label="Reducao base ICMS %" value={form.icmsBaseReduction} onChange={(value) => updateField('icmsBaseReduction', value)} />
          <Field label="CST PIS" value={form.pisCst} onChange={(value) => updateField('pisCst', value)} />
          <NumberField label="% PIS" value={form.pisRate} onChange={(value) => updateField('pisRate', value)} />
          <Field label="CST COFINS" value={form.cofinsCst} onChange={(value) => updateField('cofinsCst', value)} />
          <NumberField label="% COFINS" value={form.cofinsRate} onChange={(value) => updateField('cofinsRate', value)} />
          <Field label="CST IPI" value={form.ipiCst} onChange={(value) => updateField('ipiCst', value)} />
          <NumberField label="% IPI" value={form.ipiRate} onChange={(value) => updateField('ipiRate', value)} />
          <NumberField label="% MVA" value={form.mvaRate} onChange={(value) => updateField('mvaRate', value)} />
          <NumberField label="% FCP" value={form.fcpRate} onChange={(value) => updateField('fcpRate', value)} />
          <Field label="Codigo beneficio fiscal" value={form.fiscalBenefitCode} onChange={(value) => updateField('fiscalBenefitCode', value)} />
          <SelectField
            label="Status fiscal"
            value={form.fiscalStatus}
            onChange={(value) => updateField('fiscalStatus', value as FiscalProductInput['fiscalStatus'])}
            options={[
              ['Pendente', 'Pendente'],
              ['Completo', 'Completo'],
              ['Bloqueado', 'Bloqueado'],
            ]}
          />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              checked={form.hasIcmsSt}
              onChange={(event) => updateField('hasIcmsSt', event.target.checked)}
              type="checkbox"
            />
            Possui ICMS-ST
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              checked={form.active}
              onChange={(event) => updateField('active', event.target.checked)}
              type="checkbox"
            />
            Produto ativo
          </label>
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700" htmlFor="product-notes">
            Observacoes
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            id="product-notes"
            onChange={(event) => updateField('notes', event.target.value)}
            value={form.notes}
          />
        </div>

        <button
          className="mt-5 h-12 w-full rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          disabled={isSaving}
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving ? 'Salvando...' : editingId ? 'Atualizar produto' : 'Salvar produto'}
        </button>
      </article>

      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Produtos</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Cadastrados</h3>
          </div>
          <span className="text-sm text-slate-500">{products.length} registro(s)</span>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando produtos...</div>
          ) : products.length ? (
            products.map((product) => (
              <div className="rounded-2xl border border-slate-100 p-4" key={product.id}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {product.productCode} - {product.description}
                    </h4>
                    <p className="mt-1 text-sm text-slate-500">
                      NCM {product.ncm || 'Nao informado'} | CFOP saida {product.defaultCfopOut || '-'} | ICMS {product.icmsRate}%
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{product.fiscalStatus}</span>
                      <span className={product.active ? 'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700' : 'rounded-full bg-rose-50 px-3 py-1 text-rose-700'}>
                        {product.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                      onClick={() => {
                        setEditingId(product.id)
                        setForm(productToInput(product))
                      }}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      onClick={() => void handleDelete(product.id)}
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              Nenhum produto fiscal cadastrado para este cliente.
            </div>
          )}
        </div>
      </article>
    </section>
  )
}

function formatNcmCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

function NcmAutocomplete({
  disabled,
  isLoading,
  onChange,
  onSelect,
  required,
  suggestions,
  value,
}: {
  disabled: boolean
  isLoading: boolean
  onChange: (value: string) => void
  onSelect: (item: NcmCatalogItem) => void
  required: boolean
  suggestions: NcmCatalogItem[]
  value: string
}) {
  return (
    <label className="relative text-sm font-semibold text-slate-700">
      NCM
      {required && <span className="text-rose-500"> *</span>}
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? 'Nao exigido para servico' : 'Digite codigo ou descricao'}
        value={formatNcmCode(value)}
      />
      {isLoading && <span className="mt-1 block text-xs text-slate-400">Buscando NCM...</span>}
      {!disabled && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {suggestions.map((item) => (
            <button
              className="block w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
              key={`${item.normalizedCode || item.code}-${item.description}`}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="font-bold text-slate-900">
                {item.formattedCode || formatNcmCode(item.normalizedCode || item.code)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {item.isActive ? 'Ativo' : 'Inativo'}
              </span>
            </button>
          ))}
        </div>
      )}
    </label>
  )
}

function Field({
  label,
  onChange,
  required,
  value,
}: {
  label: string
  onChange: (value: string) => void
  required?: boolean
  value: string
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {required && <span className="text-rose-500"> *</span>}
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
        onChange={(event) => onChange(Number(event.target.value || 0))}
        step="0.0001"
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
