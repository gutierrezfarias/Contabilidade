import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Button } from '../../components/ui/Button'
import { listAccountingClients } from '../../services/accountingRepository'
import {
  confirmAccountingImport,
  deleteAccountingIntegration,
  linkIntegrationClient,
  listAccountingIntegrations,
  listAccountingObligations,
  listAccountingTaxes,
  listIntegrationClients,
  listIntegrationSyncRuns,
  previewAccountingImport,
  saveAccountingIntegration,
  syncAccountingIntegration,
  testAccountingIntegration,
  unlinkIntegrationClient,
} from '../../services/accountingIntegrationsService'
import { resolveOrganizationId } from '../../services/platformService'
import type { AccountingClient } from '../../types/accounting'
import type {
  AccountingConnectionType,
  AccountingImportPreviewResult,
  AccountingIntegration,
  AccountingIntegrationInput,
  AccountingProvider,
  AccountingRecordType,
  AccountingTaxRecord,
  AccountingObligation,
  AccountingSyncRun,
  AccountingIntegrationClient,
} from '../../types/accountingIntegrations'

type TabId = 'overview' | 'integrations' | 'links' | 'import' | 'records' | 'diagnostics'

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  { id: 'overview', label: 'Visao geral', description: 'Status, alertas e ultimas sincronizacoes.' },
  { id: 'integrations', label: 'Integracoes', description: 'Cadastro de provedores e conexoes.' },
  { id: 'links', label: 'Vinculos', description: 'Relacione empresas externas aos clientes.' },
  { id: 'import', label: 'Importacao manual', description: 'CSV/JSON com previa, validacao e confirmacao.' },
  { id: 'records', label: 'Dados importados', description: 'Impostos, guias e obrigacoes recebidas.' },
  { id: 'diagnostics', label: 'Diagnostico', description: 'Teste conexao, sincronize e veja historico.' },
]

const providers: Array<{ value: AccountingProvider; label: string }> = [
  { value: 'manual', label: 'Importacao manual' },
  { value: 'netspeed', label: 'NetSpeed' },
  { value: 'dominio', label: 'Dominio' },
  { value: 'alterdata', label: 'Alterdata' },
  { value: 'sci', label: 'SCI' },
  { value: 'questor', label: 'Questor' },
  { value: 'contmatic', label: 'Contmatic' },
  { value: 'generic', label: 'Generico' },
]

const connectionTypes: Array<{ value: AccountingConnectionType; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'file_import', label: 'Arquivos exportados' },
  { value: 'api', label: 'API REST' },
  { value: 'webservice', label: 'Web Service' },
  { value: 'local_connector', label: 'Conector local' },
]

const blankIntegration: AccountingIntegrationInput = {
  active: true,
  automaticSync: false,
  baseUrl: '',
  connectionType: 'manual',
  credentialsReference: '',
  environment: 'production',
  name: '',
  organizationId: '',
  provider: 'manual',
  settings: {},
  status: 'draft',
  syncFrequency: 'manual',
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value)
}

function formatDateTime(value: string) {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (['active', 'completed', 'available', 'paid', 'delivered'].includes(normalized)) {
    return 'bg-emerald-50 text-emerald-700'
  }
  if (['error', 'failed', 'overdue', 'late'].includes(normalized)) {
    return 'bg-rose-50 text-rose-700'
  }
  if (['running', 'pending', 'draft'].includes(normalized)) {
    return 'bg-amber-50 text-amber-700'
  }
  return 'bg-slate-100 text-slate-600'
}

export function Integrations() {
  const [searchParams] = useSearchParams()
  const requestedOrganizationId = searchParams.get('organization')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [organizationId, setOrganizationId] = useState('')
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [integrations, setIntegrations] = useState<AccountingIntegration[]>([])
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('')
  const [form, setForm] = useState<AccountingIntegrationInput>(blankIntegration)
  const [linkedClients, setLinkedClients] = useState<AccountingIntegrationClient[]>([])
  const [syncRuns, setSyncRuns] = useState<AccountingSyncRun[]>([])
  const [taxes, setTaxes] = useState<AccountingTaxRecord[]>([])
  const [obligations, setObligations] = useState<AccountingObligation[]>([])
  const [importRecordType, setImportRecordType] = useState<AccountingRecordType>('tax')
  const [importClientId, setImportClientId] = useState('')
  const [importCompetence, setImportCompetence] = useState('')
  const [preview, setPreview] = useState<AccountingImportPreviewResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedIntegrationId) ?? null,
    [integrations, selectedIntegrationId],
  )

  const overview = useMemo(() => {
    const active = integrations.filter((integration) => integration.status === 'active' && integration.active).length
    const disconnected = integrations.filter((integration) =>
      ['disconnected', 'error', 'paused'].includes(integration.status),
    ).length
    const totalErrors = syncRuns.reduce((sum, run) => sum + run.errorCount, 0)
    const imported = syncRuns.reduce((sum, run) => sum + run.createdCount + run.updatedCount, 0)

    return {
      active,
      disconnected,
      imported,
      linkedClients: linkedClients.length,
      totalErrors,
    }
  }, [integrations, linkedClients.length, syncRuns])

  const selectedProvider = selectedIntegration?.provider ?? form.provider

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resolvedOrganizationId = await resolveOrganizationId(requestedOrganizationId)
      if (!resolvedOrganizationId) {
        setError('Nenhuma organizacao encontrada para carregar integracoes contabeis.')
        return
      }

      setOrganizationId(resolvedOrganizationId)
      const [loadedClients, loadedIntegrations] = await Promise.all([
        listAccountingClients(resolvedOrganizationId),
        listAccountingIntegrations(resolvedOrganizationId),
      ])
      setClients(loadedClients)
      setIntegrations(loadedIntegrations)

      const nextSelected = selectedIntegrationId || loadedIntegrations[0]?.id || ''
      setSelectedIntegrationId(nextSelected)
      if (!form.organizationId) {
        setForm((current) => ({ ...current, organizationId: resolvedOrganizationId }))
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar integracoes.')
    } finally {
      setLoading(false)
    }
  }, [form.organizationId, requestedOrganizationId, selectedIntegrationId])

  const loadIntegrationDetails = useCallback(async () => {
    if (!organizationId || !selectedIntegrationId) return

    try {
      const [clientsLinked, runs, taxRecords, obligationRecords] = await Promise.all([
        listIntegrationClients(organizationId, selectedIntegrationId),
        listIntegrationSyncRuns(organizationId, selectedIntegrationId),
        listAccountingTaxes(organizationId),
        listAccountingObligations(organizationId),
      ])
      setLinkedClients(clientsLinked)
      setSyncRuns(runs)
      setTaxes(taxRecords)
      setObligations(obligationRecords)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar detalhes da integracao.')
    }
  }, [organizationId, selectedIntegrationId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBase()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadBase])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadIntegrationDetails()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadIntegrationDetails])

  useEffect(() => {
    if (!selectedIntegration) return
    const timer = window.setTimeout(() => {
      setForm({
        active: selectedIntegration.active,
        automaticSync: selectedIntegration.automaticSync,
        baseUrl: selectedIntegration.baseUrl,
        connectionType: selectedIntegration.connectionType,
        credentialsReference: selectedIntegration.credentialsReference,
        environment: selectedIntegration.environment,
        name: selectedIntegration.name,
        nextSyncAt: selectedIntegration.nextSyncAt,
        organizationId: selectedIntegration.organizationId,
        provider: selectedIntegration.provider,
        settings: selectedIntegration.settings,
        status: selectedIntegration.status,
        syncFrequency: selectedIntegration.syncFrequency,
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [selectedIntegration])

  async function handleSaveIntegration() {
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      const saved = await saveAccountingIntegration(
        { ...form, organizationId },
        selectedIntegration?.id,
      )
      setFeedback('Integracao contabil salva com sucesso.')
      setSelectedIntegrationId(saved.id)
      await loadBase()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar a integracao.')
    } finally {
      setLoading(false)
    }
  }

  async function handleNewIntegration() {
    setSelectedIntegrationId('')
    setForm({ ...blankIntegration, organizationId })
    setActiveTab('integrations')
  }

  async function handleDeleteIntegration() {
    if (!organizationId || !selectedIntegrationId) return
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      await deleteAccountingIntegration(organizationId, selectedIntegrationId)
      setFeedback('Integracao desativada sem apagar historico.')
      setSelectedIntegrationId('')
      await loadBase()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Nao foi possivel desativar a integracao.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTestConnection() {
    if (!organizationId || !selectedIntegrationId) return
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      const result = await testAccountingIntegration(organizationId, selectedIntegrationId)
      setFeedback(`${result.message} ${result.recommendedAction}`)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Nao foi possivel testar a integracao.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    if (!organizationId || !selectedIntegrationId) return
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      const result = await syncAccountingIntegration(organizationId, selectedIntegrationId)
      setFeedback(result.message)
      await loadIntegrationDetails()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Nao foi possivel sincronizar.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkClient(clientId: string) {
    if (!organizationId || !selectedIntegrationId || !clientId) return
    const client = clients.find((item) => item.id === clientId)
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      await linkIntegrationClient(selectedIntegrationId, {
        clientId,
        externalCnpj: client?.cnpj ?? '',
        externalCode: '',
        externalCompanyId: client?.cnpj ?? clientId,
        externalCompanyName: client?.companyName ?? '',
        organizationId,
        status: 'linked',
      })
      setFeedback('Cliente vinculado a integracao.')
      await loadIntegrationDetails()
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Nao foi possivel vincular o cliente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFileSelected(file?: File) {
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    setError('')

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setError('XLSX ainda exige parser dedicado. Exporte a planilha para CSV ou JSON nesta fase.')
      setFileContent('')
      return
    }

    setFileContent(await file.text())
  }

  async function handlePreviewImport() {
    if (!organizationId || !fileContent || !fileName) return
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      const result = await previewAccountingImport({
        clientId: importClientId,
        columnMapping: {},
        competence: importCompetence,
        content: fileContent,
        fileFormat: fileName.split('.').pop() ?? 'csv',
        fileName,
        integrationId: selectedIntegrationId,
        organizationId,
        provider: selectedProvider,
        recordType: importRecordType,
        templateId: '',
      })
      setPreview(result)
      setFeedback(result.message)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Nao foi possivel gerar a previa.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmImport() {
    if (!organizationId || !preview?.batchId) return
    setLoading(true)
    setFeedback('')
    setError('')
    try {
      const result = await confirmAccountingImport(organizationId, preview.batchId)
      setFeedback(result.message)
      await loadIntegrationDetails()
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Nao foi possivel confirmar a importacao.')
    } finally {
      setLoading(false)
    }
  }

  const metricCards = [
    { label: 'Integracoes ativas', value: overview.active },
    { label: 'Desconectadas/pausadas', value: overview.disconnected },
    { label: 'Clientes vinculados', value: overview.linkedClients },
    { label: 'Registros importados', value: overview.imported },
    { label: 'Erros', value: overview.totalErrors },
  ]

  return (
    <DashboardLayout title="Integracoes">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Central contabil</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Central de Integracoes Contabeis</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Conecte provedores como NetSpeed por API, Web Service, arquivos exportados ou importacao manual.
            O Cont Hub recebe resultados, organiza por cliente e evita chamadas externas desnecessarias.
          </p>
        </div>
        <Button disabled={loading} onClick={handleNewIntegration}>
          Nova integracao
        </Button>
      </div>

      {feedback && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{feedback}</div>}
      {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <div className="mb-6 grid gap-3 rounded-3xl border border-slate-100 bg-white p-3 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        {tabs.map((tab) => (
          <button
            className={`rounded-2xl px-4 py-3 text-left text-sm transition ${
              activeTab === tab.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <span className="block font-semibold">{tab.label}</span>
            <span className={`mt-1 block text-xs ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {tab.description}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-5">
            {metricCards.map((card) => (
              <article className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" key={card.label}>
                <p className="text-sm text-slate-500">{card.label}</p>
                <strong className="mt-3 block text-3xl text-slate-950">{card.value}</strong>
              </article>
            ))}
          </section>
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Provedores cadastrados</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {integrations.map((integration) => (
                <button
                  className={`rounded-2xl border p-5 text-left transition ${
                    selectedIntegrationId === integration.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-200'
                  }`}
                  key={integration.id}
                  onClick={() => setSelectedIntegrationId(integration.id)}
                  type="button"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{integration.provider}</span>
                  <strong className="mt-2 block text-lg text-slate-950">{integration.name}</strong>
                  <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(integration.status)}`}>
                    {integration.status}
                  </span>
                  <p className="mt-3 text-xs text-slate-500">Ultima sincronizacao: {formatDateTime(integration.lastSyncAt)}</p>
                </button>
              ))}
              {integrations.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-sm text-slate-500">
                  Nenhuma integracao cadastrada ainda. Comece pela importacao manual.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'integrations' && (
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Nome da integracao
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Provedor
              <select className={inputClass} value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as AccountingProvider })}>
                {providers.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tipo de conexao
              <select className={inputClass} value={form.connectionType} onChange={(event) => setForm({ ...form, connectionType: event.target.value as AccountingConnectionType })}>
                {connectionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ambiente
              <select className={inputClass} value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value as AccountingIntegrationInput['environment'] })}>
                <option value="production">Producao</option>
                <option value="homologation">Homologacao</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AccountingIntegrationInput['status'] })}>
                <option value="draft">Rascunho</option>
                <option value="active">Ativa</option>
                <option value="disconnected">Desconectada</option>
                <option value="error">Erro</option>
                <option value="paused">Pausada</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Frequencia
              <input className={inputClass} placeholder="manual, diario, semanal" value={form.syncFrequency} onChange={(event) => setForm({ ...form, syncFrequency: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700 lg:col-span-2">
              URL base, quando existir API oficial
              <input className={inputClass} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Referencia de credencial/cofre
              <input className={inputClass} placeholder="vault://cont-hub/netspeed" value={form.credentialsReference} onChange={(event) => setForm({ ...form, credentialsReference: event.target.value })} />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button disabled={loading || !organizationId || !form.name} onClick={handleSaveIntegration}>
              {loading ? 'Salvando...' : 'Salvar integracao'}
            </Button>
            <Button disabled={!selectedIntegrationId || loading} onClick={handleTestConnection} variant="secondary">
              Testar conexao
            </Button>
            <Button disabled={!selectedIntegrationId || loading} onClick={handleDeleteIntegration} variant="secondary">
              Desativar
            </Button>
          </div>
        </section>
      )}

      {activeTab === 'links' && (
        <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Vincular cliente</h3>
            <p className="mt-2 text-sm text-slate-500">Cada vinculo liga a empresa externa ao cliente do Cont Hub.</p>
            <div className="mt-5 space-y-3">
              {clients.map((client) => (
                <button
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 p-4 text-left text-sm hover:border-indigo-200"
                  key={client.id}
                  onClick={() => handleLinkClient(client.id)}
                  type="button"
                >
                  <span>
                    <strong className="block text-slate-950">{client.companyName}</strong>
                    <span className="text-slate-500">{client.cnpj}</span>
                  </span>
                  <span className="font-semibold text-indigo-600">Vincular</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Clientes vinculados</h3>
            <div className="mt-5 space-y-3">
              {linkedClients.map((client) => (
                <div className="rounded-2xl border border-slate-100 p-4" key={client.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-slate-950">{client.clientName || client.externalCompanyName}</strong>
                      <p className="text-sm text-slate-500">CNPJ externo: {client.externalCnpj || client.clientCnpj || 'Nao informado'}</p>
                      <p className="text-xs text-slate-400">Vinculado em {formatDateTime(client.linkedAt)}</p>
                    </div>
                    <button
                      className="text-sm font-semibold text-rose-600"
                      onClick={() => unlinkIntegrationClient(organizationId, selectedIntegrationId, client.id).then(loadIntegrationDetails)}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              {linkedClients.length === 0 && <p className="text-sm text-slate-500">Nenhum cliente vinculado nesta integracao.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'import' && (
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Importacao manual</h3>
            <p className="mt-2 text-sm text-slate-500">Use arquivos CSV ou JSON exportados de sistemas contabeis. Nada e salvo sem confirmacao.</p>
            <div className="mt-5 space-y-4">
              <label className="text-sm font-medium text-slate-700">
                Tipo de registro
                <select className={inputClass} value={importRecordType} onChange={(event) => setImportRecordType(event.target.value as AccountingRecordType)}>
                  <option value="tax">Impostos e guias</option>
                  <option value="obligation">Obrigacoes</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Cliente opcional
                <select className={inputClass} value={importClientId} onChange={(event) => setImportClientId(event.target.value)}>
                  <option value="">Identificar pelo CNPJ do arquivo</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Competencia opcional
                <input className={inputClass} placeholder="2026-06-01 ou 06/2026" value={importCompetence} onChange={(event) => setImportCompetence(event.target.value)} />
              </label>
              <label className="block rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-slate-600">
                <span className="font-semibold text-indigo-700">Selecionar CSV ou JSON</span>
                <input accept=".csv,.json,.xlsx" className="mt-3 block" onChange={(event) => handleFileSelected(event.target.files?.[0])} type="file" />
                {fileName && <span className="mt-2 block text-xs text-slate-500">{fileName}</span>}
              </label>
              <div className="flex gap-3">
                <Button disabled={!fileContent || loading} onClick={handlePreviewImport}>
                  Gerar previa
                </Button>
                <Button disabled={!preview?.ok || loading} onClick={handleConfirmImport} variant="secondary">
                  Confirmar importacao
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Previa e validacao</h3>
            {preview ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs text-slate-500">Total</span><strong className="block text-2xl">{preview.totalRows}</strong></div>
                  <div className="rounded-2xl bg-emerald-50 p-4"><span className="text-xs text-emerald-700">Validas</span><strong className="block text-2xl">{preview.validRows}</strong></div>
                  <div className="rounded-2xl bg-rose-50 p-4"><span className="text-xs text-rose-700">Invalidas</span><strong className="block text-2xl">{preview.invalidRows}</strong></div>
                </div>
                {preview.errors.length > 0 && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
                    {preview.errors.slice(0, 8).map((item) => (
                      <p key={`${item.rowNumber}-${item.fieldName}-${item.reason}`}>Linha {item.rowNumber}: {item.reason} ({item.fieldName})</p>
                    ))}
                  </div>
                )}
                <div className="max-h-96 overflow-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="p-3">Linha</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Campos mapeados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr className="border-t border-slate-100" key={row.rowNumber}>
                          <td className="p-3">{row.rowNumber}</td>
                          <td className="p-3">{row.valid ? 'Valida' : 'Com erro'}</td>
                          <td className="p-3 text-xs text-slate-500">{JSON.stringify(row.mapped)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Envie um arquivo para ver a previa antes de salvar.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'records' && (
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Impostos e guias</h3>
            <div className="mt-5 space-y-3">
              {taxes.map((tax) => (
                <div className="rounded-2xl border border-slate-100 p-4" key={tax.id}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <strong className="block text-slate-950">{tax.taxType}</strong>
                      <span className="text-sm text-slate-500">{tax.description || tax.competence}</span>
                    </div>
                    <strong>{formatCurrency(tax.amount)}</strong>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-3 py-1 ${statusClass(tax.status)}`}>{tax.status}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Vencimento {tax.dueDate || 'Nao informado'}</span>
                  </div>
                </div>
              ))}
              {taxes.length === 0 && <p className="text-sm text-slate-500">Nenhum imposto importado ainda.</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Obrigacoes</h3>
            <div className="mt-5 space-y-3">
              {obligations.map((obligation) => (
                <div className="rounded-2xl border border-slate-100 p-4" key={obligation.id}>
                  <strong className="block text-slate-950">{obligation.obligationType}</strong>
                  <p className="text-sm text-slate-500">Competencia {obligation.competence} - Vence {obligation.dueDate || 'Nao informado'}</p>
                  <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(obligation.status)}`}>{obligation.status}</span>
                </div>
              ))}
              {obligations.length === 0 && <p className="text-sm text-slate-500">Nenhuma obrigacao importada ainda.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'diagnostics' && (
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Diagnostico</h3>
            <p className="mt-2 text-sm text-slate-500">Teste disponibilidade, registre sincronizacao manual e acompanhe erros.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={!selectedIntegrationId || loading} onClick={handleTestConnection}>Testar conexao</Button>
              <Button disabled={!selectedIntegrationId || loading} onClick={handleSync} variant="secondary">Sincronizar agora</Button>
            </div>
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              NetSpeed fica em modo seguro ate voce informar documentacao oficial. Importacoes manuais nao fazem chamadas externas.
            </div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Historico</h3>
            <div className="mt-5 space-y-3">
              {syncRuns.map((run) => (
                <div className="rounded-2xl border border-slate-100 p-4" key={run.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-slate-950">{run.syncType}</strong>
                      <p className="text-sm text-slate-500">{run.message || 'Sem mensagem'}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(run.startedAt)} - {run.correlationId}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{run.status}</span>
                  </div>
                </div>
              ))}
              {syncRuns.length === 0 && <p className="text-sm text-slate-500">Nenhum historico de sincronizacao.</p>}
            </div>
          </div>
        </section>
      )}
    </DashboardLayout>
  )
}
