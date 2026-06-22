import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Button } from '../../components/ui/Button'
import { PaginationControls } from '../../components/ui/PaginationControls'
import { usePagination } from '../../hooks/usePagination'
import { listAccountingClients } from '../../services/accountingRepository'
import { resolveOrganizationId } from '../../services/platformService'
import {
  archiveObligation,
  archiveTax,
  buildComplianceAlerts,
  buildRegularityAndHealth,
  generateRecurringObligations,
  listObligations,
  listTaxes,
  saveObligation,
  saveTax,
  uploadComplianceDocument,
  upsertComplianceAlerts,
} from '../../services/accountingComplianceService'
import type { AccountingClient } from '../../types/accounting'
import type {
  AccountingAlertItem,
  AccountingObligationInput,
  AccountingObligationRecord,
  AccountingTaxInput,
  AccountingTaxRecordDetailed,
  ClientHealthSummary,
  ComplianceFilters,
} from '../../types/accountingCompliance'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'

const tabClass = (active: boolean) =>
  `rounded-xl px-5 py-3 text-sm font-semibold transition ${
    active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

const obligationStatuses = [
  ['pending', 'Pendente'],
  ['processing', 'Em processo'],
  ['delivered', 'Entregue'],
  ['overdue', 'Vencida'],
  ['exempt', 'Isenta'],
  ['cancelled', 'Cancelada'],
] as const

const taxStatuses = [
  ['pending', 'Pendente'],
  ['available', 'Guia disponivel'],
  ['sent', 'Enviada'],
  ['paid', 'Paga'],
  ['overdue', 'Vencida'],
  ['installment', 'Parcelada'],
  ['cancelled', 'Cancelada'],
] as const

const recurrenceOptions = [
  ['none', 'Sem recorrencia'],
  ['monthly', 'Mensal'],
  ['quarterly', 'Trimestral'],
  ['semiannual', 'Semestral'],
  ['annual', 'Anual'],
] as const

const blankFilters: ComplianceFilters = {
  clientId: '',
  competence: '',
  page: 1,
  pageSize: 10,
  search: '',
  status: '',
}

const blankObligation: AccountingObligationInput = {
  alertDaysBefore: 7,
  clientId: '',
  competence: '',
  deliveryDate: '',
  dueDate: '',
  guideDocumentId: '',
  notes: '',
  obligationType: '',
  periodEnd: '',
  periodStart: '',
  protocol: '',
  receiptDocumentId: '',
  recurrenceType: 'none',
  recurrenceUntil: '',
  responsibleUserId: '',
  status: 'pending',
}

const blankTax: AccountingTaxInput = {
  alertDaysBefore: 7,
  barcode: '',
  calculationDate: '',
  clientId: '',
  competence: '',
  description: '',
  dueDate: '',
  guideDocumentId: '',
  installmentNumber: 0,
  installmentTotal: 0,
  interestAmount: 0,
  notes: '',
  paidAt: '',
  penaltyAmount: 0,
  pixCode: '',
  principalAmount: 0,
  receiptDocumentId: '',
  status: 'pending',
  taxType: '',
  totalAmount: 0,
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

function formatDate(value: string) {
  if (!value) return 'Nao informado'
  const [dateOnly] = value.split('T')
  const parts = dateOnly.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

function statusBadge(status: string) {
  if (['paid', 'delivered', 'available', 'regular'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['overdue', 'late', 'critical', 'cancelled'].includes(status)) return 'bg-rose-50 text-rose-700'
  if (['attention', 'processing', 'in_progress', 'installment', 'parcelled'].includes(status)) return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function monthValue(value: string) {
  return value ? value.slice(0, 7) : ''
}

function InputLabel({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <label className="space-y-2 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  )
}

function Field({
  label,
  onChange,
  required = false,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  value: string | number
}) {
  return (
    <InputLabel label={`${label}${required ? ' *' : ''}`}>
      <input className={inputClass} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </InputLabel>
  )
}

export function ObligationsTaxes() {
  const [searchParams] = useSearchParams()
  const requestedOrganizationId = searchParams.get('organization')
  const [organizationId, setOrganizationId] = useState('')
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [activeTab, setActiveTab] = useState<'obligations' | 'taxes' | 'alerts' | 'regularity'>('obligations')
  const [obligationForm, setObligationForm] = useState<AccountingObligationInput>(blankObligation)
  const [taxForm, setTaxForm] = useState<AccountingTaxInput>(blankTax)
  const [editingObligationId, setEditingObligationId] = useState('')
  const [editingTaxId, setEditingTaxId] = useState('')
  const [obligations, setObligations] = useState<AccountingObligationRecord[]>([])
  const [taxes, setTaxes] = useState<AccountingTaxRecordDetailed[]>([])
  const [regularity, setRegularity] = useState<ClientHealthSummary[]>([])
  const [obligationFilters, setObligationFilters] = useState<ComplianceFilters>(blankFilters)
  const [taxFilters, setTaxFilters] = useState<ComplianceFilters>(blankFilters)
  const [obligationTotal, setObligationTotal] = useState(0)
  const [taxTotal, setTaxTotal] = useState(0)
  const [obligationGuideFile, setObligationGuideFile] = useState<File | null>(null)
  const [obligationReceiptFile, setObligationReceiptFile] = useState<File | null>(null)
  const [taxGuideFile, setTaxGuideFile] = useState<File | null>(null)
  const [taxReceiptFile, setTaxReceiptFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const obligationPagination = usePagination({ initialPageSize: 10 })
  const taxPagination = usePagination({ initialPageSize: 10 })

  const alerts = useMemo(() => buildComplianceAlerts(obligations, taxes), [obligations, taxes])
  const selectedClientName = useMemo(
    () => clients.find((client) => client.id === (obligationForm.clientId || taxForm.clientId))?.companyName ?? '',
    [clients, obligationForm.clientId, taxForm.clientId],
  )

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resolvedOrganizationId = await resolveOrganizationId(requestedOrganizationId)
      if (!resolvedOrganizationId) {
        setError('Nenhuma organizacao encontrada para obrigacoes e impostos.')
        return
      }

      setOrganizationId(resolvedOrganizationId)
      const loadedClients = await listAccountingClients(resolvedOrganizationId)
      setClients(loadedClients)
      const defaultClientId = loadedClients[0]?.id ?? ''
      setObligationForm((current) => ({ ...current, clientId: current.clientId || defaultClientId }))
      setTaxForm((current) => ({ ...current, clientId: current.clientId || defaultClientId }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar a base.')
    } finally {
      setLoading(false)
    }
  }, [requestedOrganizationId])

  const loadObligations = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError('')
    try {
      const result = await listObligations(organizationId, {
        ...obligationFilters,
        page: obligationPagination.page,
        pageSize: obligationPagination.pageSize,
      })
      setObligations(result.data)
      setObligationTotal(result.total)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar obrigacoes.')
    } finally {
      setLoading(false)
    }
  }, [obligationFilters, obligationPagination.page, obligationPagination.pageSize, organizationId])

  const loadTaxes = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError('')
    try {
      const result = await listTaxes(organizationId, {
        ...taxFilters,
        page: taxPagination.page,
        pageSize: taxPagination.pageSize,
      })
      setTaxes(result.data)
      setTaxTotal(result.total)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar impostos.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, taxFilters, taxPagination.page, taxPagination.pageSize])

  const loadRegularity = useCallback(async () => {
    if (!organizationId) return
    try {
      const result = await buildRegularityAndHealth(organizationId)
      setRegularity(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar regularidade.')
    }
  }, [organizationId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBase()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBase])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadObligations()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadObligations])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTaxes()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadTaxes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRegularity()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRegularity])

  function updateObligation(field: keyof AccountingObligationInput, value: string | number) {
    setObligationForm((current) => ({ ...current, [field]: value }))
  }

  function updateTax(field: keyof AccountingTaxInput, value: string | number) {
    setTaxForm((current) => {
      const next = { ...current, [field]: value }
      if (['principalAmount', 'penaltyAmount', 'interestAmount'].includes(field)) {
        next.totalAmount = Number(next.principalAmount || 0) + Number(next.penaltyAmount || 0) + Number(next.interestAmount || 0)
      }
      return next
    })
  }

  function updateObligationFilter(field: keyof ComplianceFilters, value: string) {
    setObligationFilters((current) => ({ ...current, [field]: value }))
    obligationPagination.resetPage()
  }

  function updateTaxFilter(field: keyof ComplianceFilters, value: string) {
    setTaxFilters((current) => ({ ...current, [field]: value }))
    taxPagination.resetPage()
  }

  async function saveObligationWithDocuments() {
    if (!organizationId) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      let guideDocumentId = obligationForm.guideDocumentId
      let receiptDocumentId = obligationForm.receiptDocumentId
      if (obligationGuideFile) {
        guideDocumentId = await uploadComplianceDocument(organizationId, obligationForm.clientId, 'Obrigacao fiscal', obligationGuideFile, obligationForm.competence, obligationForm.obligationType)
      }
      if (obligationReceiptFile) {
        receiptDocumentId = await uploadComplianceDocument(organizationId, obligationForm.clientId, 'Recibo', obligationReceiptFile, obligationForm.competence, `Recibo - ${obligationForm.obligationType}`)
      }

      const savedInput = { ...obligationForm, guideDocumentId, receiptDocumentId }
      await saveObligation(organizationId, savedInput, editingObligationId)
      const recurringCount = await generateRecurringObligations(organizationId, savedInput)
      setFeedback(recurringCount ? `Obrigacao salva e ${recurringCount} competencia(s) recorrente(s) criada(s).` : 'Obrigacao salva com sucesso.')
      setObligationForm((current) => ({ ...blankObligation, clientId: current.clientId }))
      setEditingObligationId('')
      setObligationGuideFile(null)
      setObligationReceiptFile(null)
      await loadObligations()
      await loadRegularity()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar a obrigacao.')
    } finally {
      setSaving(false)
    }
  }

  async function saveTaxWithDocuments() {
    if (!organizationId) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      let guideDocumentId = taxForm.guideDocumentId
      let receiptDocumentId = taxForm.receiptDocumentId
      if (taxGuideFile) {
        guideDocumentId = await uploadComplianceDocument(organizationId, taxForm.clientId, 'Guia de imposto', taxGuideFile, taxForm.competence, taxForm.taxType)
      }
      if (taxReceiptFile) {
        receiptDocumentId = await uploadComplianceDocument(organizationId, taxForm.clientId, 'Recibo', taxReceiptFile, taxForm.competence, `Recibo - ${taxForm.taxType}`)
      }

      await saveTax(organizationId, { ...taxForm, guideDocumentId, receiptDocumentId }, editingTaxId)
      setFeedback('Imposto/guia salvo com sucesso.')
      setTaxForm((current) => ({ ...blankTax, clientId: current.clientId }))
      setEditingTaxId('')
      setTaxGuideFile(null)
      setTaxReceiptFile(null)
      await loadTaxes()
      await loadRegularity()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o imposto.')
    } finally {
      setSaving(false)
    }
  }

  function editObligation(obligation: AccountingObligationRecord) {
    setActiveTab('obligations')
    setEditingObligationId(obligation.id)
    setObligationForm({
      alertDaysBefore: obligation.alertDaysBefore,
      clientId: obligation.clientId,
      competence: monthValue(obligation.competence),
      deliveryDate: obligation.deliveryDate,
      dueDate: obligation.dueDate,
      guideDocumentId: obligation.guideDocumentId,
      notes: obligation.notes,
      obligationType: obligation.obligationType,
      periodEnd: obligation.periodEnd,
      periodStart: obligation.periodStart,
      protocol: obligation.protocol,
      receiptDocumentId: obligation.receiptDocumentId,
      recurrenceType: obligation.recurrenceType,
      recurrenceUntil: obligation.recurrenceUntil,
      responsibleUserId: obligation.responsibleUserId,
      status: obligation.status,
    })
  }

  function editTax(tax: AccountingTaxRecordDetailed) {
    setActiveTab('taxes')
    setEditingTaxId(tax.id)
    setTaxForm({
      alertDaysBefore: tax.alertDaysBefore,
      barcode: tax.barcode,
      calculationDate: tax.calculationDate,
      clientId: tax.clientId,
      competence: monthValue(tax.competence),
      description: tax.description,
      dueDate: tax.dueDate,
      guideDocumentId: tax.guideDocumentId,
      installmentNumber: tax.installmentNumber,
      installmentTotal: tax.installmentTotal,
      interestAmount: tax.interestAmount,
      notes: tax.notes,
      paidAt: tax.paidAt,
      penaltyAmount: tax.penaltyAmount,
      pixCode: tax.pixCode,
      principalAmount: tax.principalAmount,
      receiptDocumentId: tax.receiptDocumentId,
      status: tax.status,
      taxType: tax.taxType,
      totalAmount: tax.totalAmount,
    })
  }

  async function handleArchiveObligation(id: string) {
    if (!organizationId) return
    setSaving(true)
    setError('')
    try {
      await archiveObligation(organizationId, id)
      setFeedback('Obrigacao arquivada sem apagar o historico.')
      await loadObligations()
      await loadRegularity()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Nao foi possivel arquivar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveTax(id: string) {
    if (!organizationId) return
    setSaving(true)
    setError('')
    try {
      await archiveTax(organizationId, id)
      setFeedback('Imposto/guia arquivado sem apagar o historico.')
      await loadTaxes()
      await loadRegularity()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Nao foi possivel arquivar.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePersistAlerts() {
    if (!organizationId) return
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const count = await upsertComplianceAlerts(organizationId)
      setFeedback(`${count} alerta(s) sincronizado(s) sem duplicar eventos.`)
    } catch (alertError) {
      setError(alertError instanceof Error ? alertError.message : 'Nao foi possivel sincronizar alertas.')
    } finally {
      setSaving(false)
    }
  }

  const obligationTotalPages = Math.max(Math.ceil(obligationTotal / obligationPagination.pageSize), 1)
  const taxTotalPages = Math.max(Math.ceil(taxTotal / taxPagination.pageSize), 1)

  return (
    <DashboardLayout title="Obrigacoes e Impostos">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-indigo-600">Controle fiscal</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-950">Obrigacoes, impostos e regularidade</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Cadastre vencimentos, guias, recibos e acompanhe riscos reais por cliente. O portal mostra apenas os registros do proprio cliente.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {selectedClientName ? `Cliente selecionado: ${selectedClientName}` : 'Selecione um cliente para iniciar.'}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className={tabClass(activeTab === 'obligations')} onClick={() => setActiveTab('obligations')} type="button">Obrigacoes</button>
            <button className={tabClass(activeTab === 'taxes')} onClick={() => setActiveTab('taxes')} type="button">Impostos e guias</button>
            <button className={tabClass(activeTab === 'alerts')} onClick={() => setActiveTab('alerts')} type="button">Alertas</button>
            <button className={tabClass(activeTab === 'regularity')} onClick={() => setActiveTab('regularity')} type="button">Regularidade e saude</button>
          </div>
        </section>

        {feedback && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{feedback}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        {activeTab === 'obligations' && (
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">{editingObligationId ? 'Editar obrigacao' : 'Nova obrigacao'}</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InputLabel label="Cliente *">
                  <select className={inputClass} value={obligationForm.clientId} onChange={(event) => updateObligation('clientId', event.target.value)}>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                  </select>
                </InputLabel>
                <Field label="Tipo" onChange={(value) => updateObligation('obligationType', value)} required value={obligationForm.obligationType} />
                <Field label="Competencia" onChange={(value) => updateObligation('competence', value)} required type="month" value={obligationForm.competence} />
                <Field label="Vencimento" onChange={(value) => updateObligation('dueDate', value)} type="date" value={obligationForm.dueDate} />
                <Field label="Periodo inicial" onChange={(value) => updateObligation('periodStart', value)} type="date" value={obligationForm.periodStart} />
                <Field label="Periodo final" onChange={(value) => updateObligation('periodEnd', value)} type="date" value={obligationForm.periodEnd} />
                <InputLabel label="Status">
                  <select className={inputClass} value={obligationForm.status} onChange={(event) => updateObligation('status', event.target.value)}>
                    {obligationStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </InputLabel>
                <InputLabel label="Recorrencia">
                  <select className={inputClass} value={obligationForm.recurrenceType} onChange={(event) => updateObligation('recurrenceType', event.target.value)}>
                    {recurrenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </InputLabel>
                <Field label="Gerar ate" onChange={(value) => updateObligation('recurrenceUntil', value)} type="date" value={obligationForm.recurrenceUntil} />
                <Field label="Dias para alerta" onChange={(value) => updateObligation('alertDaysBefore', Number(value))} type="number" value={obligationForm.alertDaysBefore} />
                <Field label="Data de entrega" onChange={(value) => updateObligation('deliveryDate', value)} type="date" value={obligationForm.deliveryDate} />
                <Field label="Protocolo" onChange={(value) => updateObligation('protocol', value)} value={obligationForm.protocol} />
                <InputLabel label="Guia/documento">
                  <input className={inputClass} onChange={(event) => setObligationGuideFile(event.target.files?.[0] ?? null)} type="file" />
                </InputLabel>
                <InputLabel label="Recibo/comprovante">
                  <input className={inputClass} onChange={(event) => setObligationReceiptFile(event.target.files?.[0] ?? null)} type="file" />
                </InputLabel>
                <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Observacoes
                  <textarea className={`${inputClass} min-h-28`} onChange={(event) => updateObligation('notes', event.target.value)} value={obligationForm.notes} />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={saving || loading} isLoading={saving} onClick={() => void saveObligationWithDocuments()}>
                  {editingObligationId ? 'Atualizar obrigacao' : 'Salvar obrigacao'}
                </Button>
                {editingObligationId && (
                  <Button disabled={saving} onClick={() => {
                    setEditingObligationId('')
                    setObligationForm((current) => ({ ...blankObligation, clientId: current.clientId }))
                  }} variant="secondary">
                    Cancelar edicao
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">Obrigacoes cadastradas</h3>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <input className={inputClass} onChange={(event) => updateObligationFilter('search', event.target.value)} placeholder="Buscar tipo" value={obligationFilters.search} />
                <select className={inputClass} onChange={(event) => updateObligationFilter('clientId', event.target.value)} value={obligationFilters.clientId}>
                  <option value="">Todos os clientes</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                </select>
                <input className={inputClass} onChange={(event) => updateObligationFilter('competence', event.target.value)} type="month" value={obligationFilters.competence} />
                <select className={inputClass} onChange={(event) => updateObligationFilter('status', event.target.value)} value={obligationFilters.status}>
                  <option value="">Todos os status</option>
                  {obligationStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="mt-5 space-y-3">
                {obligations.map((obligation) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={obligation.id}>
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                      <div>
                        <strong className="text-slate-950">{obligation.obligationType}</strong>
                        <p className="mt-1 text-sm text-slate-500">{obligation.clientName} | Competencia {formatDate(obligation.competence)} | Vence {formatDate(obligation.dueDate)}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full px-3 py-1 font-semibold ${statusBadge(obligation.status)}`}>{obligation.status}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Guia {obligation.guideDocumentId ? 'vinculada' : 'pendente'}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Recibo {obligation.receiptDocumentId ? 'vinculado' : 'pendente'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="h-10 px-4 text-xs" onClick={() => editObligation(obligation)} variant="secondary">Editar</Button>
                        <Button className="h-10 px-4 text-xs" disabled={saving} onClick={() => void handleArchiveObligation(obligation.id)} variant="ghost">Arquivar</Button>
                      </div>
                    </div>
                  </article>
                ))}
                {obligations.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma obrigacao encontrada.</p>}
              </div>
              <PaginationControls
                disabled={loading}
                label="obrigacao(oes)"
                onPageChange={obligationPagination.setPage}
                onPageSizeChange={obligationPagination.setPageSize}
                page={obligationPagination.page}
                pageSize={obligationPagination.pageSize}
                total={obligationTotal}
                totalPages={obligationTotalPages}
              />
            </div>
          </section>
        )}

        {activeTab === 'taxes' && (
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">{editingTaxId ? 'Editar imposto/guia' : 'Novo imposto/guia'}</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InputLabel label="Cliente *">
                  <select className={inputClass} value={taxForm.clientId} onChange={(event) => updateTax('clientId', event.target.value)}>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                  </select>
                </InputLabel>
                <Field label="Tipo de imposto" onChange={(value) => updateTax('taxType', value)} required value={taxForm.taxType} />
                <Field label="Descricao" onChange={(value) => updateTax('description', value)} value={taxForm.description} />
                <Field label="Competencia" onChange={(value) => updateTax('competence', value)} required type="month" value={taxForm.competence} />
                <Field label="Vencimento" onChange={(value) => updateTax('dueDate', value)} type="date" value={taxForm.dueDate} />
                <Field label="Data de pagamento" onChange={(value) => updateTax('paidAt', value)} type="date" value={taxForm.paidAt} />
                <InputLabel label="Status">
                  <select className={inputClass} value={taxForm.status} onChange={(event) => updateTax('status', event.target.value)}>
                    {taxStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </InputLabel>
                <Field label="Dias para alerta" onChange={(value) => updateTax('alertDaysBefore', Number(value))} type="number" value={taxForm.alertDaysBefore} />
                <Field label="Principal" onChange={(value) => updateTax('principalAmount', Number(value))} type="number" value={taxForm.principalAmount} />
                <Field label="Multa" onChange={(value) => updateTax('penaltyAmount', Number(value))} type="number" value={taxForm.penaltyAmount} />
                <Field label="Juros" onChange={(value) => updateTax('interestAmount', Number(value))} type="number" value={taxForm.interestAmount} />
                <Field label="Total" onChange={(value) => updateTax('totalAmount', Number(value))} type="number" value={taxForm.totalAmount} />
                <Field label="Linha digitavel / codigo de barras" onChange={(value) => updateTax('barcode', value)} value={taxForm.barcode} />
                <Field label="Pix copia e cola" onChange={(value) => updateTax('pixCode', value)} value={taxForm.pixCode} />
                <Field label="Parcela" onChange={(value) => updateTax('installmentNumber', Number(value))} type="number" value={taxForm.installmentNumber} />
                <Field label="Total de parcelas" onChange={(value) => updateTax('installmentTotal', Number(value))} type="number" value={taxForm.installmentTotal} />
                <InputLabel label="Guia">
                  <input className={inputClass} onChange={(event) => setTaxGuideFile(event.target.files?.[0] ?? null)} type="file" />
                </InputLabel>
                <InputLabel label="Comprovante">
                  <input className={inputClass} onChange={(event) => setTaxReceiptFile(event.target.files?.[0] ?? null)} type="file" />
                </InputLabel>
                <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Observacoes
                  <textarea className={`${inputClass} min-h-28`} onChange={(event) => updateTax('notes', event.target.value)} value={taxForm.notes} />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={saving || loading} isLoading={saving} onClick={() => void saveTaxWithDocuments()}>
                  {editingTaxId ? 'Atualizar imposto' : 'Salvar imposto'}
                </Button>
                {editingTaxId && (
                  <Button disabled={saving} onClick={() => {
                    setEditingTaxId('')
                    setTaxForm((current) => ({ ...blankTax, clientId: current.clientId }))
                  }} variant="secondary">
                    Cancelar edicao
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">Impostos e guias cadastrados</h3>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <input className={inputClass} onChange={(event) => updateTaxFilter('search', event.target.value)} placeholder="Buscar imposto" value={taxFilters.search} />
                <select className={inputClass} onChange={(event) => updateTaxFilter('clientId', event.target.value)} value={taxFilters.clientId}>
                  <option value="">Todos os clientes</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                </select>
                <input className={inputClass} onChange={(event) => updateTaxFilter('competence', event.target.value)} type="month" value={taxFilters.competence} />
                <select className={inputClass} onChange={(event) => updateTaxFilter('status', event.target.value)} value={taxFilters.status}>
                  <option value="">Todos os status</option>
                  {taxStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="mt-5 space-y-3">
                {taxes.map((tax) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={tax.id}>
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                      <div>
                        <strong className="text-slate-950">{tax.taxType}</strong>
                        <p className="mt-1 text-sm text-slate-500">{tax.clientName} | Competencia {formatDate(tax.competence)} | Vence {formatDate(tax.dueDate)}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full px-3 py-1 font-semibold ${statusBadge(tax.status)}`}>{tax.status}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Guia {tax.guideDocumentId ? 'vinculada' : 'pendente'}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Recibo {tax.receiptDocumentId ? 'vinculado' : 'pendente'}</span>
                        </div>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="font-bold text-slate-950">{formatCurrency(tax.totalAmount)}</p>
                        <div className="mt-3 flex gap-2">
                          <Button className="h-10 px-4 text-xs" onClick={() => editTax(tax)} variant="secondary">Editar</Button>
                          <Button className="h-10 px-4 text-xs" disabled={saving} onClick={() => void handleArchiveTax(tax.id)} variant="ghost">Arquivar</Button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {taxes.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhum imposto/guia encontrado.</p>}
              </div>
              <PaginationControls
                disabled={loading}
                label="imposto(s)"
                onPageChange={taxPagination.setPage}
                onPageSizeChange={taxPagination.setPageSize}
                page={taxPagination.page}
                pageSize={taxPagination.pageSize}
                total={taxTotal}
                totalPages={taxTotalPages}
              />
            </div>
          </section>
        )}

        {activeTab === 'alerts' && (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-950">Alertas calculados</h3>
                <p className="mt-2 text-sm text-slate-600">Alertas sao gerados a partir dos vencimentos, guias e recibos reais cadastrados.</p>
              </div>
              <Button disabled={saving} isLoading={saving} onClick={() => void handlePersistAlerts()}>Sincronizar alertas</Button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {alerts.map((alert: AccountingAlertItem) => (
                <article className="rounded-2xl border border-slate-100 p-4" key={alert.id}>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(alert.severity === 'critical' ? 'critical' : 'attention')}`}>{alert.severity}</span>
                  <h4 className="mt-3 font-bold text-slate-950">{alert.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{alert.clientName} | {alert.message}</p>
                  <p className="mt-2 text-xs text-slate-400">Vencimento: {formatDate(alert.dueDate)}</p>
                </article>
              ))}
              {alerts.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500 md:col-span-2">Nenhum alerta calculado para os registros carregados.</p>}
            </div>
          </section>
        )}

        {activeTab === 'regularity' && (
          <section className="space-y-4">
            {regularity.map((client) => (
              <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" key={client.clientId}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">{client.clientName}</h3>
                    <p className="mt-1 text-sm text-slate-500">Saude calculada por pendencias reais, sem consulta externa inventada.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(client.status)}`}>{client.status}</span>
                    <strong className="text-2xl text-slate-950">{client.score}%</strong>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {client.items.map((item) => (
                    <div className="rounded-2xl border border-slate-100 p-4" key={item.id}>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(item.status)}`}>{item.status}</span>
                      <h4 className="mt-3 font-bold text-slate-950">{item.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                      <p className="mt-2 text-xs text-slate-500"><strong>Origem:</strong> {item.source}</p>
                      <p className="mt-1 text-xs text-slate-500"><strong>Impacto:</strong> {item.impact}</p>
                      <p className="mt-1 text-xs text-slate-500"><strong>Acao:</strong> {item.action}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {regularity.length === 0 && <p className="rounded-3xl bg-white p-8 text-sm text-slate-500 shadow-sm">Nenhum cliente encontrado para regularidade.</p>}
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
