import { useCallback, useEffect, useState } from 'react'
import {
  approveFiscalRule,
  deleteFiscalRule,
  listFiscalProducts,
  listFiscalRules,
  rejectFiscalRule,
  saveFiscalRule,
} from '../../services/fiscalRepository'
import type { FiscalProduct, FiscalRule, FiscalRuleInput } from '../../types/fiscal'
import { validateFiscalRule } from '../../utils/fiscalValidators'

type FiscalRulesPanelProps = {
  clientId: string
  organizationId: string | null
  onError: (message: string) => void
  onFeedback: (message: string) => void
}

const today = new Date().toISOString().slice(0, 10)

const blankRule: FiscalRuleInput = {
  active: true,
  approvalStatus: 'Aguardando revisao',
  cest: '',
  cfop: '',
  cofinsCst: '99',
  cofinsRate: 0,
  destinationUf: '',
  direction: 'saida',
  endDate: '',
  fcpRate: 0,
  finalConsumer: null,
  fiscalBenefitCode: '',
  groupId: '',
  hasIcmsSt: false,
  icmsBaseMode: '',
  icmsBaseReduction: 0,
  icmsCsosn: '',
  icmsCst: '',
  icmsRate: 0,
  ipiCst: '',
  ipiRate: 0,
  merchandiseOrigin: '0',
  mvaRate: 0,
  name: '',
  ncm: '',
  nfePurpose: 'normal',
  notes: '',
  originUf: '',
  pisCst: '99',
  pisRate: 0,
  priority: 100,
  productId: '',
  recipientTaxpayerIndicator: '',
  ruleCode: '',
  startDate: today,
  taxRegime: '',
  version: 1,
}

function ruleToInput(rule: FiscalRule): FiscalRuleInput {
  return {
    active: rule.active,
    approvalStatus: rule.approvalStatus,
    cest: rule.cest,
    cfop: rule.cfop,
    cofinsCst: rule.cofinsCst,
    cofinsRate: rule.cofinsRate,
    destinationUf: rule.destinationUf,
    direction: rule.direction,
    endDate: rule.endDate,
    fcpRate: rule.fcpRate,
    finalConsumer: rule.finalConsumer,
    fiscalBenefitCode: rule.fiscalBenefitCode,
    groupId: rule.groupId,
    hasIcmsSt: rule.hasIcmsSt,
    icmsBaseMode: rule.icmsBaseMode,
    icmsBaseReduction: rule.icmsBaseReduction,
    icmsCsosn: rule.icmsCsosn,
    icmsCst: rule.icmsCst,
    icmsRate: rule.icmsRate,
    ipiCst: rule.ipiCst,
    ipiRate: rule.ipiRate,
    merchandiseOrigin: rule.merchandiseOrigin,
    mvaRate: rule.mvaRate,
    name: rule.name,
    ncm: rule.ncm,
    nfePurpose: rule.nfePurpose,
    notes: rule.notes,
    originUf: rule.originUf,
    pisCst: rule.pisCst,
    pisRate: rule.pisRate,
    priority: rule.priority,
    productId: rule.productId,
    recipientTaxpayerIndicator: rule.recipientTaxpayerIndicator,
    ruleCode: rule.ruleCode,
    startDate: rule.startDate,
    taxRegime: rule.taxRegime,
    version: rule.version,
  }
}

export function FiscalRulesPanel({
  clientId,
  organizationId,
  onError,
  onFeedback,
}: FiscalRulesPanelProps) {
  const [rules, setRules] = useState<FiscalRule[]>([])
  const [products, setProducts] = useState<FiscalProduct[]>([])
  const [form, setForm] = useState<FiscalRuleInput>(blankRule)
  const [editingId, setEditingId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedRules, loadedProducts] = await Promise.all([
        listFiscalRules(organizationId, clientId),
        listFiscalProducts(organizationId, clientId),
      ])
      setRules(loadedRules)
      setProducts(loadedProducts)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel carregar regras fiscais.')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, onError, organizationId])

  function updateField<Field extends keyof FiscalRuleInput>(field: Field, value: FiscalRuleInput[Field]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setEditingId('')
    setForm(blankRule)
  }

  async function handleSave() {
    onError('')
    onFeedback('')

    if (!organizationId || !clientId) {
      onError('Selecione um cliente antes de cadastrar regras fiscais.')
      return
    }

    const validationErrors = validateFiscalRule(form)
    if (validationErrors.length > 0) {
      onError(validationErrors.join(' '))
      return
    }

    setIsSaving(true)
    onFeedback('Salvando regra fiscal...')

    try {
      await saveFiscalRule(organizationId, clientId, form, editingId || undefined)
      await reload()
      resetForm()
      onFeedback('Regra fiscal salva com sucesso.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel salvar a regra fiscal.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(ruleId: string) {
    onError('')
    onFeedback('Desativando regra fiscal...')

    try {
      await deleteFiscalRule(ruleId)
      await reload()
      onFeedback('Regra fiscal desativada.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel desativar a regra fiscal.')
    }
  }

  async function handleApprove(ruleId: string) {
    onError('')
    onFeedback('Aprovando regra fiscal...')

    try {
      await approveFiscalRule(ruleId, 'Aprovacao formal pelo modulo fiscal.')
      await reload()
      onFeedback('Regra fiscal aprovada.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel aprovar a regra fiscal.')
    }
  }

  async function handleReject(ruleId: string) {
    const reason = window.prompt('Informe o motivo da rejeicao da regra fiscal:')
    if (!reason) return

    onError('')
    onFeedback('Rejeitando regra fiscal...')

    try {
      await rejectFiscalRule(ruleId, reason)
      await reload()
      onFeedback('Regra fiscal rejeitada.')
    } catch (error) {
      onFeedback('')
      onError(error instanceof Error ? error.message : 'Nao foi possivel rejeitar a regra fiscal.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [reload])

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Motor de regras</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {editingId ? 'Editar regra fiscal' : 'Nova regra fiscal'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Regras ativas e aprovadas sao usadas no simulador e na validacao antes de emitir NF-e.
            </p>
          </div>
          {editingId && (
            <button
              className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={resetForm}
              type="button"
            >
              Nova
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Codigo da regra" required value={form.ruleCode} onChange={(value) => updateField('ruleCode', value)} />
          <Field label="Nome" required value={form.name} onChange={(value) => updateField('name', value)} />
          <NumberField label="Prioridade" value={form.priority} onChange={(value) => updateField('priority', value)} />
          <NumberField label="Versao" value={form.version} onChange={(value) => updateField('version', value)} />
          <SelectField
            label="Direcao"
            value={form.direction}
            onChange={(value) => updateField('direction', value === 'entrada' ? 'entrada' : 'saida')}
            options={[
              ['saida', 'Saida'],
              ['entrada', 'Entrada'],
            ]}
          />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="block font-semibold">Status de aprovacao</span>
            <span className="mt-1 block">
              Ao salvar, a regra fica como Aguardando revisao. Use Aprovar/Rejeitar na lista.
            </span>
          </div>
          <Field label="Regime tributario" value={form.taxRegime} onChange={(value) => updateField('taxRegime', value)} placeholder="Ex: Simples Nacional" />
          <Field label="Finalidade NF-e" value={form.nfePurpose} onChange={(value) => updateField('nfePurpose', value)} />
          <Field label="UF origem" value={form.originUf} onChange={(value) => updateField('originUf', value.toUpperCase())} />
          <Field label="UF destino" value={form.destinationUf} onChange={(value) => updateField('destinationUf', value.toUpperCase())} />
          <Field label="Indicador IE destinatario" value={form.recipientTaxpayerIndicator} onChange={(value) => updateField('recipientTaxpayerIndicator', value)} />
          <SelectField
            label="Consumidor final"
            value={form.finalConsumer === null ? '' : String(form.finalConsumer)}
            onChange={(value) =>
              updateField('finalConsumer', value === '' ? null : value === 'true')
            }
            options={[
              ['', 'Nao filtrar'],
              ['true', 'Sim'],
              ['false', 'Nao'],
            ]}
          />
          <SelectField
            label="Produto especifico"
            value={form.productId}
            onChange={(value) => updateField('productId', value)}
            options={[
              ['', 'Nao vincular produto'],
              ...products.map((product) => [product.id, `${product.productCode} - ${product.description}`] as [string, string]),
            ]}
          />
          <Field label="NCM" value={form.ncm} onChange={(value) => updateField('ncm', value)} />
          <Field label="CEST" value={form.cest} onChange={(value) => updateField('cest', value)} />
          <Field label="CFOP" required value={form.cfop} onChange={(value) => updateField('cfop', value)} />
          <Field label="Origem mercadoria" value={form.merchandiseOrigin} onChange={(value) => updateField('merchandiseOrigin', value)} />
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
          <Field label="Codigo beneficio fiscal" value={form.fiscalBenefitCode} onChange={(value) => updateField('fiscalBenefitCode', value)} />
          <Field label="Inicio vigencia" type="date" value={form.startDate} onChange={(value) => updateField('startDate', value)} />
          <Field label="Fim vigencia" type="date" value={form.endDate} onChange={(value) => updateField('endDate', value)} />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <input checked={form.active} onChange={(event) => updateField('active', event.target.checked)} type="checkbox" />
            Regra ativa
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <input checked={form.hasIcmsSt} onChange={(event) => updateField('hasIcmsSt', event.target.checked)} type="checkbox" />
            Possui ICMS-ST
          </label>
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700" htmlFor="rule-notes">
            Observacoes
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            id="rule-notes"
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
          {isSaving ? 'Salvando...' : editingId ? 'Atualizar regra' : 'Salvar regra'}
        </button>
      </article>

      <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Regras</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Cadastradas</h3>
          </div>
          <span className="text-sm text-slate-500">{rules.length} registro(s)</span>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Para aplicar no simulador, a regra precisa estar <strong>Ativa</strong> e com status <strong>Aprovada</strong>.
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando regras...</div>
          ) : rules.length ? (
            rules.map((rule) => (
              <div className="rounded-2xl border border-slate-100 p-4" key={rule.id}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {rule.ruleCode} - {rule.name}
                    </h4>
                    <p className="mt-1 text-sm text-slate-500">
                      Prioridade {rule.priority} | {rule.direction} | CFOP {rule.cfop || '-'} | NCM {rule.ncm || 'qualquer'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={rule.approvalStatus === 'Aprovada' ? 'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700' : 'rounded-full bg-amber-50 px-3 py-1 text-amber-700'}>
                        {rule.approvalStatus}
                      </span>
                      <span className={rule.active ? 'rounded-full bg-indigo-50 px-3 py-1 text-indigo-700' : 'rounded-full bg-slate-100 px-3 py-1 text-slate-500'}>
                        {rule.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                      onClick={() => {
                        setEditingId(rule.id)
                        setForm(ruleToInput(rule))
                      }}
                      type="button"
                    >
                      Editar
                    </button>
                    {rule.approvalStatus !== 'Aprovada' && (
                      <button
                        className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        onClick={() => void handleApprove(rule.id)}
                        type="button"
                      >
                        Aprovar
                      </button>
                    )}
                    {rule.approvalStatus !== 'Bloqueada' && (
                      <button
                        className="rounded-xl border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
                        onClick={() => void handleReject(rule.id)}
                        type="button"
                      >
                        Rejeitar
                      </button>
                    )}
                    <button
                      className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      onClick={() => void handleDelete(rule.id)}
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
              Nenhuma regra fiscal cadastrada para este cliente.
            </div>
          )}
        </div>
      </article>
    </section>
  )
}

function Field({
  label,
  onChange,
  placeholder,
  required,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  value: string
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {required && <span className="text-rose-500"> *</span>}
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
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
