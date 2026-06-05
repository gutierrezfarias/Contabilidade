import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import {
  convertLeadToAccountingClient,
  deleteMiniCrmLead,
  listMiniCrmLeads,
  saveMiniCrmLead,
  type MiniCrmLeadInput,
} from '../../services/miniCrmService'
import { resolveOrganizationId } from '../../services/platformService'
import type { MiniCrmLead, MiniCrmStage } from '../../types/miniCrm'
import { formatCnpj, formatPhone, isValidEmail } from '../../utils/formatters'

const stages: MiniCrmStage[] = ['Lead', 'Qualificado', 'Proposta', 'Cliente', 'Perdido']

const blankLead: MiniCrmLeadInput = {
  contactName: '',
  companyName: '',
  cnpj: '',
  email: '',
  phone: '',
  source: '',
  stage: 'Lead',
  estimatedValue: 0,
  nextActionDate: '',
  notes: '',
}

const currency = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

export function MiniCrm() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [leads, setLeads] = useState<MiniCrmLead[]>([])
  const [form, setForm] = useState<MiniCrmLeadInput>(blankLead)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const totals = useMemo(() => {
    const openLeads = leads.filter((lead) => !['Cliente', 'Perdido'].includes(lead.stage))
    return {
      total: leads.length,
      open: openLeads.length,
      forecast: openLeads.reduce((sum, lead) => sum + lead.estimatedValue, 0),
      converted: leads.filter((lead) => lead.stage === 'Cliente').length,
    }
  }, [leads])

  async function reload(targetOrganizationId = organizationId) {
    setLeads(await listMiniCrmLeads(targetOrganizationId))
  }

  useEffect(() => {
    let active = true

    resolveOrganizationId()
      .then(async (id) => {
        if (!active) return
        setOrganizationId(id)
        setLeads(await listMiniCrmLeads(id))
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar Mini CRM.')
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function updateField(field: keyof MiniCrmLeadInput, value: string | number) {
    const nextValue =
      field === 'cnpj'
        ? formatCnpj(String(value))
        : field === 'phone'
          ? formatPhone('BR', String(value))
          : value

    setForm((current) => ({ ...current, [field]: nextValue }))
    setError('')
  }

  function editLead(lead: MiniCrmLead) {
    setEditingId(lead.id)
    setForm({
      contactName: lead.contactName,
      companyName: lead.companyName,
      cnpj: lead.cnpj,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      estimatedValue: lead.estimatedValue,
      nextActionDate: lead.nextActionDate,
      notes: lead.notes,
    })
    setFeedback(`Editando lead: ${lead.contactName || lead.companyName}.`)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId) {
      setError('Nenhum escritorio vinculado ao usuario.')
      return
    }
    if (!form.contactName && !form.companyName) {
      setError('Informe pelo menos o contato ou a empresa.')
      return
    }
    if (form.email && !isValidEmail(form.email)) {
      setError('Informe um e-mail valido.')
      return
    }

    try {
      await saveMiniCrmLead(organizationId, form, editingId)
      setFeedback(editingId ? 'Lead atualizado.' : 'Lead cadastrado.')
      setEditingId(null)
      setForm(blankLead)
      await reload(organizationId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o lead.')
    }
  }

  async function removeLead(leadId: string) {
    if (!window.confirm('Excluir este lead?')) return

    try {
      await deleteMiniCrmLead(leadId)
      await reload()
      setFeedback('Lead excluido.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Nao foi possivel excluir.')
    }
  }

  async function convertLead(lead: MiniCrmLead) {
    if (!organizationId) return
    if (!window.confirm('Converter este lead em cliente da Gestao Contabil?')) return

    try {
      await convertLeadToAccountingClient(organizationId, lead)
      await reload(organizationId)
      setFeedback('Lead convertido em cliente da Gestao Contabil.')
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : 'Nao foi possivel converter o lead.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3 text-lg font-semibold text-slate-900" to="/aplicativos">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">A</span>
            Mini CRM
          </Link>
          <div className="flex items-center gap-4">
            <Link className="hidden text-sm font-semibold text-indigo-600 md:block" to="/aplicativos">Aplicativos</Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button onClick={handleLogout} variant="secondary">Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">CRM</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Mini CRM</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Um CRM basico no estilo funil: lead, qualificado, proposta, cliente e perdido.
            Quando virar cliente, ele pode ser enviado para a Gestao Contabil.
          </p>
        </div>

        {feedback && <div className="mb-5"><Alert type="success">{feedback}</Alert></div>}
        {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

        <section className="mb-7 grid gap-4 md:grid-cols-4">
          <Metric label="Leads totais" value={String(totals.total)} />
          <Metric label="Em aberto" value={String(totals.open)} />
          <Metric label="Previsao" value={currency.format(totals.forecast)} />
          <Metric label="Convertidos" value={String(totals.converted)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
          <form className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={handleSave}>
            <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Editar lead' : 'Novo lead'}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input id="lead-contact" label="Contato" onChange={(event) => updateField('contactName', event.target.value)} value={form.contactName} />
              <Input id="lead-company" label="Empresa" onChange={(event) => updateField('companyName', event.target.value)} value={form.companyName} />
              <Input id="lead-cnpj" label="CNPJ" onChange={(event) => updateField('cnpj', event.target.value)} placeholder="00.000.000/0000-00" value={form.cnpj} />
              <Input id="lead-phone" label="Telefone" onChange={(event) => updateField('phone', event.target.value)} placeholder="(00) 00000-0000" value={form.phone} />
              <Input id="lead-email" label="E-mail" onChange={(event) => updateField('email', event.target.value)} type="email" value={form.email} />
              <Input id="lead-source" label="Origem" onChange={(event) => updateField('source', event.target.value)} placeholder="Indicacao, Instagram, site..." value={form.source} />
              <Select id="lead-stage" label="Etapa" onChange={(value) => updateField('stage', value as MiniCrmStage)} value={form.stage}>
                {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </Select>
              <Input id="lead-value" label="Valor estimado" min="0" onChange={(event) => updateField('estimatedValue', Number(event.target.value || 0))} type="number" value={form.estimatedValue} />
              <Input id="lead-next-action" label="Proxima acao" onChange={(event) => updateField('nextActionDate', event.target.value)} type="date" value={form.nextActionDate} />
            </div>
            <label className="mt-4 block space-y-2 text-sm font-medium text-slate-700">
              <span>Observacoes</span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => updateField('notes', event.target.value)}
                value={form.notes}
              />
            </label>
            <div className="mt-6 flex gap-3">
              <Button type="submit">{editingId ? 'Atualizar lead' : 'Salvar lead'}</Button>
              {editingId && <Button onClick={() => { setEditingId(null); setForm(blankLead) }} variant="secondary">Cancelar</Button>}
            </div>
          </form>

          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Pipeline</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              {stages.map((stage) => (
                <div className="rounded-2xl bg-slate-50 p-3" key={stage}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-700">{stage}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                      {leads.filter((lead) => lead.stage === stage).length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {leads.filter((lead) => lead.stage === stage).map((lead) => (
                      <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" key={lead.id}>
                        <p className="font-semibold text-slate-900">{lead.companyName || lead.contactName}</p>
                        <p className="mt-1 text-sm text-slate-500">{lead.contactName}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{currency.format(lead.estimatedValue)}</p>
                        {lead.nextActionDate && <p className="mt-1 text-xs text-slate-500">Proxima acao: {lead.nextActionDate}</p>}
                        <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
                          <button className="text-indigo-600" onClick={() => editLead(lead)} type="button">Editar</button>
                          {lead.stage !== 'Cliente' && (
                            <button className="text-emerald-700" onClick={() => void convertLead(lead)} type="button">Virar cliente</button>
                          )}
                          <button className="text-rose-600" onClick={() => void removeLead(lead.id)} type="button">Excluir</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

function Select({
  children,
  id,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode
  id: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  )
}
