import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '../../../components/layout/DashboardLayout'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { listAccountingClients } from '../../../services/accountingRepository'
import { resolveOrganizationId } from '../../../services/platformService'
import {
  confirmManualRevenueImport,
  loadSerproSettings,
  previewManualRevenueImport,
  saveSerproDirectCredential,
  saveSerproOrganizationService,
  saveSerproSettings,
  testSerproSettings,
} from '../../../services/serproService'
import type { SerproSettings, SerproSettingsResponse } from '../../../types/serpro'

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
  status: 'draft',
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function RevenueFederalSettings() {
  const [organizationId, setOrganizationId] = useState('')
  const [settings, setSettings] = useState<SerproSettings>(blankSettings)
  const [data, setData] = useState<SerproSettingsResponse | null>(null)
  const [credential, setCredential] = useState({
    certificateId: '',
    consumerKey: '',
    consumerSecret: '',
    consumerSecretReference: '',
    contractCnpj: '',
    environment: 'homologacao',
    status: 'draft',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [clients, setClients] = useState<Array<{ companyName: string; cnpj: string; id: string }>>([])
  const [manualFiles, setManualFiles] = useState<File[]>([])
  const [previewItems, setPreviewItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [manualLoading, setManualLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const resolvedLabel = useMemo(() => {
    if (!data?.resolved) return 'Nao verificado'
    if (!data.resolved.credentialsReady) return data.resolved.blockReason || 'Pendente'
    return data.resolved.billingMode === 'cont_hub_managed'
      ? 'Modo gerenciado CONT HUB pronto'
      : 'Contrato direto do contador pronto'
  }, [data])

  async function load() {
    setError('')
    setLoading(true)
    try {
      const orgId = await resolveOrganizationId()
      if (!orgId) {
        throw new Error('Cadastre os dados da sua conta antes de configurar Receita Federal.')
      }
      setOrganizationId(orgId)
      const [response, clientRows] = await Promise.all([
        loadSerproSettings(orgId),
        listAccountingClients(orgId),
      ])
      setData(response)
      setSettings(response.settings)
      setClients(clientRows.map((client) => ({ cnpj: client.cnpj, companyName: client.companyName, id: client.id })))
      setCredential((current) => ({
        ...current,
        environment: response.settings.environment,
        status: response.directCredential.status || 'draft',
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar configuracoes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  async function handleSaveSettings() {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      const saved = await saveSerproSettings({ ...settings, organizationId })
      setSettings(saved.settings)
      setMessage('Configuracoes Receita Federal salvas.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCredential() {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      await saveSerproDirectCredential({ ...credential, organizationId })
      setCredential((current) => ({ ...current, consumerSecret: '' }))
      setMessage('Credencial direta Serpro salva. O segredo nao sera exibido novamente.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar credencial.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setMessage('')
    setError('')
    try {
      const result = await testSerproSettings({ ...settings, organizationId })
      setMessage(result.message)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Nao foi possivel testar.')
    }
  }

  async function handlePreviewManualImport() {
    setMessage('')
    setError('')
    setManualLoading(true)
    try {
      const result = await previewManualRevenueImport(organizationId, manualFiles)
      setPreviewItems(result.items)
      setMessage(result.message)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Nao foi possivel gerar a previa.')
    } finally {
      setManualLoading(false)
    }
  }

  async function handleConfirmManualImport() {
    setMessage('')
    setError('')
    setManualLoading(true)
    try {
      const result = await confirmManualRevenueImport(organizationId, manualFiles, previewItems)
      setMessage(`${result.message} Importados: ${result.importedCount}. Duplicados: ${result.duplicateCount}. Erros: ${result.errorCount}.`)
      setPreviewItems([])
      setManualFiles([])
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Nao foi possivel confirmar a importacao.')
    } finally {
      setManualLoading(false)
    }
  }

  function updatePreviewItem(index: number, patch: Record<string, unknown>) {
    setPreviewItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    )
  }

  async function toggleService(serviceId: string, enabled: boolean) {
    setMessage('')
    setError('')
    try {
      await saveSerproOrganizationService({
        enabled,
        exempt: false,
        monthlyLimit: 0,
        organizationId,
        serviceId,
      })
      await load()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Nao foi possivel atualizar servico.')
    }
  }

  return (
    <DashboardLayout title="Receita Federal">
      <div className="space-y-6">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-600">Serpro</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Configuracoes Receita Federal</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Configure a forma de contrato para consumir APIs oficiais da Receita Federal. Tudo e feito pela tela do
            sistema; o Supabase armazena apenas configuracoes, referencias e auditoria.
          </p>
        </section>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Status</p>
            <p className="mt-3 font-bold text-slate-950">{loading ? 'Carregando...' : resolvedLabel}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Carteira Serpro</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">{money(data?.wallet.balance ?? 0)}</p>
            <p className="text-xs text-slate-500">Reservado: {money(data?.wallet.reservedBalance ?? 0)}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Credencial direta</p>
            <p className="mt-3 font-bold text-slate-950">
              {data?.directCredential.consumerKeyConfigured && data.directCredential.consumerSecretConfigured ? 'Configurada' : 'Pendente'}
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Modo de contrato</h3>
              <div className="mt-5 grid gap-4">
                <label className="rounded-2xl border border-slate-200 p-4">
                  <input
                    checked={settings.accessMode === 'cont_hub_managed'}
                    className="mr-2"
                    name="accessMode"
                    type="radio"
                    onChange={() => setSettings({ ...settings, accessMode: 'cont_hub_managed', billingMode: 'cont_hub_managed', managedModeEnabled: true })}
                  />
                  <span className="font-semibold text-slate-900">Usar contrato CONT HUB</span>
                  <p className="mt-1 text-sm text-slate-500">A chamada consome creditos da carteira e usa o contrato global quando habilitado pelo admin.</p>
                </label>
                <label className="rounded-2xl border border-slate-200 p-4">
                  <input
                    checked={settings.accessMode === 'direct_serpro'}
                    className="mr-2"
                    name="accessMode"
                    type="radio"
                    onChange={() => setSettings({ ...settings, accessMode: 'direct_serpro', billingMode: 'direct_serpro', directModeEnabled: true })}
                  />
                  <span className="font-semibold text-slate-900">Meu contrato direto Serpro</span>
                  <p className="mt-1 text-sm text-slate-500">O escritorio informa suas credenciais e o Serpro cobra diretamente o escritorio.</p>
                </label>
                <label className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <input
                    checked={settings.accessMode === 'manual_free'}
                    className="mr-2"
                    name="accessMode"
                    type="radio"
                    onChange={() => setSettings({ ...settings, accessMode: 'manual_free' })}
                  />
                  <span className="font-semibold text-emerald-900">Importacao manual gratuita</span>
                  <p className="mt-1 text-sm text-emerald-700">
                    Voce pode acessar gratuitamente o e-CAC, baixar os documentos e importa-los para o Cont Hub.
                    Essa modalidade nao utiliza a API do Serpro e nao consome creditos.
                  </p>
                </label>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Ambiente
                  <select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={settings.environment} onChange={(event) => setSettings({ ...settings, environment: event.target.value as SerproSettings['environment'] })}>
                    <option value="homologacao">Homologacao</option>
                    <option value="producao">Producao</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Status
                  <select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={settings.status} onChange={(event) => setSettings({ ...settings, status: event.target.value as SerproSettings['status'] })}>
                    <option value="draft">Rascunho</option>
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </label>
                <Input label="E-mail de notificacao" value={settings.notificationEmail} onChange={(event) => setSettings({ ...settings, notificationEmail: event.target.value })} />
                <Input label="Limite diario de requisicoes" type="number" value={settings.dailyRequestLimit} onChange={(event) => setSettings({ ...settings, dailyRequestLimit: Number(event.target.value) })} />
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input checked={settings.allowManagedFallback} type="checkbox" onChange={(event) => setSettings({ ...settings, allowManagedFallback: event.target.checked })} />
                Permitir fallback para contrato CONT HUB se credencial direta falhar
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button isLoading={saving} onClick={handleSaveSettings}>Salvar configuracoes</Button>
                <Button variant="secondary" onClick={handleTest}>Testar configuracao</Button>
              </div>
            </div>

            {settings.accessMode === 'manual_free' && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h3 className="text-xl font-bold text-slate-950">Importacao manual gratuita</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Envie PDFs, XMLs, JSON, CSV ou ZIP baixados manualmente do e-CAC. Nada aqui chama a API Serpro.
                </p>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Regras: nao envie executaveis, nao use ZIP com pastas suspeitas, confira a previa antes de confirmar
                  e corrija cliente/tipo quando o sistema nao identificar com seguranca.
                </div>
                <input
                  accept=".pdf,.xml,.json,.csv,.zip,application/pdf,application/xml,text/xml,application/json,text/csv,application/zip"
                  className="mt-5 block w-full rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-5 text-sm"
                  multiple
                  type="file"
                  onChange={(event) => {
                    setManualFiles(Array.from(event.target.files ?? []))
                    setPreviewItems([])
                  }}
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={manualFiles.length === 0} isLoading={manualLoading} onClick={handlePreviewManualImport}>
                    Gerar previa
                  </Button>
                  <Button
                    disabled={previewItems.length === 0}
                    isLoading={manualLoading}
                    onClick={handleConfirmManualImport}
                    variant="secondary"
                  >
                    Confirmar importacao
                  </Button>
                </div>
                {previewItems.length > 0 && (
                  <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Arquivo</th>
                          <th className="px-3 py-2">Cliente</th>
                          <th className="px-3 py-2">CPF/CNPJ</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Competencia</th>
                          <th className="px-3 py-2">Valor</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ignorar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewItems.map((item, index) => (
                          <tr key={String(item.id ?? item.fileHash ?? index)}>
                            <td className="max-w-56 px-3 py-3 font-medium text-slate-900">{String(item.fileName ?? '')}</td>
                            <td className="px-3 py-3">
                              <select
                                className="h-10 min-w-52 rounded-xl border border-slate-200 px-3"
                                value={String(item.clientId ?? '')}
                                onChange={(event) => updatePreviewItem(index, { clientId: event.target.value })}
                              >
                                <option value="">Cliente nao encontrado</option>
                                {clients.map((client) => (
                                  <option key={client.id} value={client.id}>
                                    {client.companyName} - {client.cnpj}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">{String(item.taxId ?? '') || 'Nao identificado'}</td>
                            <td className="px-3 py-3">
                              <input
                                className="h-10 w-44 rounded-xl border border-slate-200 px-3"
                                value={String(item.documentType ?? '')}
                                onChange={(event) => updatePreviewItem(index, { documentType: event.target.value })}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                className="h-10 w-32 rounded-xl border border-slate-200 px-3"
                                value={String(item.competency ?? '')}
                                onChange={(event) => updatePreviewItem(index, { competency: event.target.value })}
                              />
                            </td>
                            <td className="px-3 py-3">{item.amount ? money(Number(item.amount)) : 'Nao informado'}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.error
                                  ? 'bg-rose-50 text-rose-700'
                                  : item.duplicate
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {String(item.actionRequired ?? item.matchStatus ?? 'Revisar')}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <input
                                checked={Boolean(item.ignored)}
                                type="checkbox"
                                onChange={(event) => updatePreviewItem(index, { ignored: event.target.checked })}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Contrato direto do contador</h3>
              <p className="mt-1 text-sm text-slate-500">Preencha somente se o escritorio tiver contrato proprio Serpro.</p>
              <div className="mt-5 grid gap-4">
                <Input label="CNPJ do contrato" value={credential.contractCnpj} onChange={(event) => setCredential({ ...credential, contractCnpj: event.target.value })} />
                <Input label="Consumer Key" value={credential.consumerKey} onChange={(event) => setCredential({ ...credential, consumerKey: event.target.value })} />
                <Input label="Consumer Secret" type="password" value={credential.consumerSecret} onChange={(event) => setCredential({ ...credential, consumerSecret: event.target.value })} />
                <Input label="Referencia do segredo" value={credential.consumerSecretReference} onChange={(event) => setCredential({ ...credential, consumerSecretReference: event.target.value })} />
              </div>
              <Button className="mt-5" isLoading={saving} onClick={handleSaveCredential}>Salvar credencial direta</Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Servicos Receita Federal</h3>
              <p className="mt-1 text-sm text-slate-500">Habilite apenas servicos contratados/autorizados para este escritorio.</p>
              <div className="mt-5 grid gap-3">
                {(data?.services ?? []).map((service) => {
                  const orgService = data?.organizationServices.find((item) => item.service_id === service.id || item.serviceId === service.id)
                  const enabled = Boolean(orgService?.enabled)
                  return (
                    <div className="rounded-2xl border border-slate-200 p-4" key={service.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{service.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{service.description}</p>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{service.officialProduct}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input checked={enabled} type="checkbox" onChange={(event) => void toggleService(service.id, event.target.checked)} />
                          {enabled ? 'Ativo' : 'Inativo'}
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Autorizacoes e procuracoes</h3>
              <p className="mt-1 text-sm text-slate-500">Registre por cliente quando o servico exigir autorizacao digital.</p>
              <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                {(data?.authorizations.length ?? 0) === 0
                  ? 'Nenhuma autorizacao cadastrada ainda.'
                  : `${data?.authorizations.length} autorizacao(oes) cadastrada(s).`}
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}
