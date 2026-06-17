import { useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  loadAdminSerproCatalog,
  loadAdminSerproContract,
  loadAdminSerproOrganizations,
  loadAdminSerproPricing,
  saveAdminSerproContract,
} from '../../services/serproService'
import type { SerproPricing, SerproService } from '../../types/serpro'

type ContractState = {
  allowManagedMode: boolean
  consumerKey: string
  consumerSecret: string
  consumerSecretReference: string
  contractCnpj: string
  environment: string
  name: string
  notes: string
  status: string
}

const blankContract: ContractState = {
  allowManagedMode: false,
  consumerKey: '',
  consumerSecret: '',
  consumerSecretReference: '',
  contractCnpj: '',
  environment: 'homologacao',
  name: 'Contrato Serpro CONT HUB',
  notes: '',
  status: 'draft',
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function AdminSerpro() {
  const [contract, setContract] = useState<ContractState>(blankContract)
  const [credentialStatus, setCredentialStatus] = useState<Record<string, unknown> | null>(null)
  const [services, setServices] = useState<SerproService[]>([])
  const [pricing, setPricing] = useState<SerproPricing[]>([])
  const [organizations, setOrganizations] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const totals = useMemo(() => ({
    activeServices: services.filter((service) => service.status === 'active').length,
    managedReady: Boolean(credentialStatus?.consumerKeyConfigured && credentialStatus?.consumerSecretConfigured),
    organizations: organizations.length,
    priceRows: pricing.length,
  }), [credentialStatus, organizations.length, pricing.length, services])

  async function load() {
    setError('')
    setLoading(true)
    try {
      const [contractResult, catalogResult, pricingResult, organizationResult] = await Promise.all([
        loadAdminSerproContract(),
        loadAdminSerproCatalog(),
        loadAdminSerproPricing(),
        loadAdminSerproOrganizations(),
      ])

      const contractRow = (contractResult as Record<string, unknown>).contract as Record<string, unknown> | undefined
      setContract({
        ...blankContract,
        allowManagedMode: Boolean(contractRow?.allow_managed_mode ?? contractRow?.allowManagedMode),
        contractCnpj: String(contractRow?.contract_cnpj ?? contractRow?.contractCnpj ?? ''),
        environment: String(contractRow?.environment ?? 'homologacao'),
        name: String(contractRow?.name ?? blankContract.name),
        notes: String(contractRow?.notes ?? ''),
        status: String(contractRow?.status ?? 'draft'),
      })
      setCredentialStatus((contractResult as Record<string, unknown>).credential as Record<string, unknown>)
      setServices(((catalogResult as Record<string, unknown>).services ?? []) as SerproService[])
      setPricing(((pricingResult as Record<string, unknown>).pricing ?? []) as SerproPricing[])
      setOrganizations(((organizationResult as Record<string, unknown>).organizations ?? []) as Array<Record<string, unknown>>)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar Serpro.')
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

  async function handleSave() {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      await saveAdminSerproContract(contract)
      setMessage('Contrato Serpro salvo. Segredos nao sao exibidos novamente por seguranca.')
      setContract((current) => ({ ...current, consumerSecret: '' }))
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout title="Integracao Serpro">
      <div className="space-y-6">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-600">Receita Federal</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Serpro dual-mode</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Controle o contrato global do CONT HUB, habilite escritorios no modo gerenciado e acompanhe custos,
            precos, margem e consumo sem misturar com credenciais diretas do contador.
          </p>
        </section>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Servicos ativos</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{totals.activeServices}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Credencial global</p>
            <p className="mt-3 text-lg font-bold text-slate-950">{totals.managedReady ? 'Configurada' : 'Pendente'}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Escritorios</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{totals.organizations}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Precos</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{totals.priceRows}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-bold text-slate-950">Contrato global CONT HUB</h3>
            <p className="mt-1 text-sm text-slate-500">Use somente credenciais oficiais Serpro. A senha nao e exibida apos salvar.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input label="Nome do contrato" value={contract.name} onChange={(event) => setContract({ ...contract, name: event.target.value })} />
              <Input label="CNPJ do contrato" value={contract.contractCnpj} onChange={(event) => setContract({ ...contract, contractCnpj: event.target.value })} />
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Ambiente
                <select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={contract.environment} onChange={(event) => setContract({ ...contract, environment: event.target.value })}>
                  <option value="homologacao">Homologacao</option>
                  <option value="producao">Producao</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Status
                <select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={contract.status} onChange={(event) => setContract({ ...contract, status: event.target.value })}>
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                  <option value="blocked">Bloqueado</option>
                </select>
              </label>
              <Input label="Consumer Key" value={contract.consumerKey} onChange={(event) => setContract({ ...contract, consumerKey: event.target.value })} />
              <Input label="Consumer Secret" type="password" value={contract.consumerSecret} onChange={(event) => setContract({ ...contract, consumerSecret: event.target.value })} />
              <Input label="Referencia do segredo" value={contract.consumerSecretReference} onChange={(event) => setContract({ ...contract, consumerSecretReference: event.target.value })} />
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input checked={contract.allowManagedMode} type="checkbox" onChange={(event) => setContract({ ...contract, allowManagedMode: event.target.checked })} />
                Permitir modo gerenciado
              </label>
            </div>
            <textarea className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm" placeholder="Observacoes contratuais" value={contract.notes} onChange={(event) => setContract({ ...contract, notes: event.target.value })} />
            <Button className="mt-5" disabled={loading} isLoading={saving} onClick={handleSave}>Salvar contrato</Button>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Catalogo inicial</h3>
              <div className="mt-4 space-y-3">
                {services.map((service) => (
                  <div className="rounded-2xl border border-slate-200 p-4" key={service.id}>
                    <p className="font-semibold text-slate-900">{service.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{service.description}</p>
                    <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{service.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-xl font-bold text-slate-950">Precos e margem</h3>
              <div className="mt-4 space-y-3">
                {pricing.map((item) => (
                  <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 p-4 text-sm" key={`${item.serviceId}-${item.environment}`}>
                    <span className="font-semibold text-slate-900">{item.serviceId}</span>
                    <span>Custo {money(item.providerCost)}</span>
                    <span>Venda {money(item.salePrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}
