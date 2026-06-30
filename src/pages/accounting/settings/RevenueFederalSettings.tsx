import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthorizationsPanel } from '../../../components/revenue-federal/AuthorizationsPanel'
import { ConsumptionAuditPanel } from '../../../components/revenue-federal/ConsumptionAuditPanel'
import { ContractPlanCard } from '../../../components/revenue-federal/ContractPlanCard'
import { CredentialsPanel, type DirectCredentialForm } from '../../../components/revenue-federal/CredentialsPanel'
import { ManualImportPanel } from '../../../components/revenue-federal/ManualImportPanel'
import { ReceitaFederalTabs, type ReceitaFederalTabId } from '../../../components/revenue-federal/ReceitaFederalTabs'
import { RevenueServicesPanel } from '../../../components/revenue-federal/RevenueServicesPanel'
import { DashboardLayout } from '../../../components/layout/DashboardLayout'
import { listAccountingClients } from '../../../services/accountingRepository'
import { resolveOrganizationId } from '../../../services/platformService'
import {
  loadSerproSettings,
  renewSerproLocalAgentPairingKey,
  saveSerproDirectCredential,
  saveSerproOrganizationService,
  saveSerproSettings,
  testSerproSettings,
} from '../../../services/serproService'
import type { SerproContractPlan, SerproPlanCode, SerproSettings, SerproSettingsResponse } from '../../../types/serpro'

const blankSettings: SerproSettings = {
  allowManagedFallback: false,
  accessMode: 'cont_hub_managed',
  billingMode: 'cont_hub_managed',
  dailyRequestLimit: 0,
  directModeEnabled: false,
  environment: 'homologacao',
  managedModeEnabled: true,
  monthlyCreditLimit: 0,
  notes: '',
  notificationEmail: '',
  organizationId: '',
  planCode: 'cont_hub_full',
  status: 'draft',
}

const blankCredential: DirectCredentialForm = {
  certificateId: '',
  consumerKey: '',
  consumerSecret: '',
  consumerSecretReference: '',
  contractCnpj: '',
  environment: 'homologacao',
  status: 'draft',
}

const validTabs = new Set<ReceitaFederalTabId>(['plan', 'credentials', 'services', 'manual', 'authorizations', 'audit'])

function planMode(planCode: SerproPlanCode) {
  if (planCode === 'serpro_direct') return { accessMode: 'direct_serpro' as const, billingMode: 'direct_serpro' as const }
  if (planCode === 'cont_hub_local_agent') return { accessMode: 'local_agent' as const, billingMode: 'cont_hub_managed' as const }
  return { accessMode: 'cont_hub_managed' as const, billingMode: 'cont_hub_managed' as const }
}

export function RevenueFederalSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as ReceitaFederalTabId | null
  const activeTab = requestedTab && validTabs.has(requestedTab) ? requestedTab : 'plan'
  const [organizationId, setOrganizationId] = useState('')
  const [settings, setSettings] = useState<SerproSettings>(blankSettings)
  const [data, setData] = useState<SerproSettingsResponse | null>(null)
  const [credential, setCredential] = useState<DirectCredentialForm>(blankCredential)
  const [clients, setClients] = useState<Array<{ companyName: string; cnpj: string; id: string }>>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [choosingPlan, setChoosingPlan] = useState<SerproPlanCode | ''>('')
  const [savingServiceId, setSavingServiceId] = useState('')
  const [pairing, setPairing] = useState(false)
  const [pairingKey, setPairingKey] = useState('')

  const currentPlan = useMemo(
    () => data?.plans.find((plan) => plan.code === settings.planCode) ?? null,
    [data?.plans, settings.planCode],
  )

  async function load(showLoading = true) {
    setError('')
    if (showLoading) setLoading(true)
    try {
      const orgId = await resolveOrganizationId()
      if (!orgId) throw new Error('Cadastre os dados da sua conta antes de configurar Receita Federal.')
      setOrganizationId(orgId)
      const [response, clientRows] = await Promise.all([loadSerproSettings(orgId), listAccountingClients(orgId)])
      setData(response)
      setSettings(response.settings)
      setClients(clientRows.map((client) => ({ cnpj: client.cnpj, companyName: client.companyName, id: client.id })))
      setCredential((current) => ({
        ...current,
        contractCnpj: response.directCredential.contractCnpj ?? '',
        consumerSecretReference: response.directCredential.consumerSecretReference,
        environment: response.settings.environment,
        status: response.directCredential.status || 'draft',
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar configuracoes.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  function changeTab(tab: ReceitaFederalTabId) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  async function persistSettings(nextSettings = settings, successMessage = 'Configuracoes Receita Federal salvas.') {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      const saved = await saveSerproSettings({ ...nextSettings, organizationId })
      setSettings(saved.settings)
      setMessage(successMessage)
      await load(false)
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function choosePlan(plan: SerproContractPlan) {
    const modes = planMode(plan.code)
    const next: SerproSettings = {
      ...settings,
      ...modes,
      allowManagedFallback: plan.allowsFallback && settings.allowManagedFallback,
      dailyRequestLimit: settings.dailyRequestLimit || plan.defaultDailyLimit,
      directModeEnabled: plan.code === 'serpro_direct',
      managedModeEnabled: plan.code === 'cont_hub_full',
      planCode: plan.code,
    }
    setChoosingPlan(plan.code)
    setPairingKey('')
    try {
      const saved = await persistSettings(next, `${plan.commercialName} selecionado.`)
      if (saved) changeTab('credentials')
    } finally {
      setChoosingPlan('')
    }
  }

  async function saveCredential() {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      await saveSerproDirectCredential({ ...credential, organizationId })
      setCredential((current) => ({ ...current, consumerSecret: '' }))
      setMessage('Credencial direta SERPRO salva. O segredo nao sera exibido novamente.')
      await load(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar credencial.')
    } finally {
      setSaving(false)
    }
  }

  async function testSettings() {
    setMessage('')
    setError('')
    try {
      const result = await testSerproSettings({ ...settings, organizationId })
      setMessage(result.message)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Nao foi possivel testar.')
    }
  }

  async function toggleService(serviceId: string, enabled: boolean) {
    setMessage('')
    setError('')
    setSavingServiceId(serviceId)
    try {
      await saveSerproOrganizationService({ enabled, exempt: false, monthlyLimit: 0, organizationId, serviceId })
      setMessage(enabled ? 'Servico habilitado.' : 'Servico desabilitado.')
      await load(false)
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Nao foi possivel atualizar servico.')
    } finally {
      setSavingServiceId('')
    }
  }

  async function renewPairingKey() {
    setMessage('')
    setError('')
    setPairing(true)
    try {
      const result = await renewSerproLocalAgentPairingKey(organizationId)
      setPairingKey(result.pairingKey)
      setMessage(result.message)
      await load(false)
    } catch (pairingError) {
      setError(pairingError instanceof Error ? pairingError.message : 'Nao foi possivel gerar a chave.')
    } finally {
      setPairing(false)
    }
  }

  return (
    <DashboardLayout title="Receita Federal">
      <div className="space-y-6">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-600">Receita Federal</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Configuracoes Receita Federal</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Escolha como deseja usar os servicos e veja apenas as configuracoes pertinentes ao seu contrato.</p>
        </section>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        <ReceitaFederalTabs activeTab={activeTab} onChange={changeTab} />

        {loading && <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">Carregando configuracoes Receita Federal...</div>}

        {!loading && data && activeTab === 'plan' && (
          <section>
            <div className="mb-5"><h3 className="text-2xl font-bold text-slate-950">Escolha como deseja usar os servicos Receita Federal</h3><p className="mt-1 text-sm text-slate-500">Os valores e servicos sao configurados pelo Admin CONT HUB.</p></div>
            <div className="grid gap-6 xl:grid-cols-3">{data.plans.map((plan) => <ContractPlanCard active={settings.planCode === plan.code} isLoading={choosingPlan === plan.code} key={plan.code} plan={plan} serviceNames={plan.allowedServiceIds.map((id) => data.services.find((service) => service.id === id)?.name).filter((name): name is string => Boolean(name))} onChoose={choosePlan} />)}</div>
          </section>
        )}

        {!loading && data && activeTab === 'credentials' && (
          <CredentialsPanel credential={credential} data={data} isPairing={pairing} isSaving={saving} pairingKey={pairingKey} plan={currentPlan} settings={settings} onCredentialChange={setCredential} onRenewPairingKey={renewPairingKey} onSaveCredential={saveCredential} onSaveSettings={() => void persistSettings()} onSettingsChange={setSettings} onTest={testSettings} />
        )}

        {!loading && data && activeTab === 'services' && <RevenueServicesPanel accessMode={settings.accessMode} organizationServices={data.organizationServices} plan={currentPlan} savingServiceId={savingServiceId} services={data.services} onToggle={toggleService} />}

        {!loading && data && activeTab === 'manual' && <ManualImportPanel clients={clients} history={data.manualImports} organizationId={organizationId} onError={setError} onMessage={setMessage} />}

        {!loading && data && activeTab === 'authorizations' && <AuthorizationsPanel authorizations={data.authorizations} organizationId={organizationId} />}

        {!loading && data && activeTab === 'audit' && <ConsumptionAuditPanel auditLogs={data.auditLogs} manualImports={data.manualImports} requests={data.requests} usage={data.usage} />}
      </div>
    </DashboardLayout>
  )
}
