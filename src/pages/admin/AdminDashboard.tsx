import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { listAdminClients } from '../../services/adminClientService'
import { startSupportSession } from '../../services/platformService'
import type { AdminClient } from '../../types/adminClients'

export function AdminDashboard() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<AdminClient[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const activeClients = useMemo(() => clients.filter((client) => client.active).length, [clients])
  const acquiredApps = useMemo(
    () => clients.reduce((total, client) => total + client.apps.filter((app) => app.status === 'ativo').length, 0),
    [clients],
  )
  const exemptClients = useMemo(() => clients.filter((client) => client.subscriptionExempt).length, [clients])

  useEffect(() => {
    listAdminClients()
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setIsLoading(false))
  }, [])

  async function openAssistedView() {
    if (!selectedId || !reason.trim()) {
      setNotice('Selecione um cliente e informe o motivo do atendimento.')
      return
    }

    const client = clients.find((item) => item.id === selectedId)
    try {
      await startSupportSession(selectedId, reason.trim())
      const params = new URLSearchParams({
        organization: selectedId,
        supportName: client?.name ?? 'Cliente',
      })
      navigate(`/dashboard?${params.toString()}`)
    } catch {
      setNotice('Nao foi possivel registrar o atendimento agora. Verifique se a migracao Supabase foi aplicada.')
    }
  }

  return (
    <AdminLayout title="Visao geral">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">Admin</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Gestao da plataforma</h2>
        <p className="mt-2 text-sm text-slate-500">
          Este painel e seu ambiente gerencial. O menu do contador/cliente fica separado.
        </p>
      </div>

      {notice && <div className="mb-6"><Alert type="info">{notice}</Alert></div>}

      <section className="mb-7 grid gap-4 md:grid-cols-4">
        <Metric label="Clientes cadastrados" value={String(clients.length)} />
        <Metric label="Clientes ativos" value={String(activeClients)} />
        <Metric label="Apps adquiridos" value={String(acquiredApps)} />
        <Metric label="Clientes isentos" value={String(exemptClients)} />
      </section>

      <section className="mb-7 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Atendimento assistido</h3>
        <p className="mb-5 text-sm text-slate-500">
          Use esta area apenas quando precisar enxergar o ambiente de um cliente para suporte.
        </p>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="support-client">
              Cliente contador
            </label>
            <select
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
              id="support-client"
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              <option value="">Selecione...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <Input id="support-reason" label="Motivo do acesso" onChange={(event) => setReason(event.target.value)} value={reason} />
          <Button onClick={() => void openAssistedView()}>Ver como cliente</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-lg font-semibold text-slate-900">Clientes contadores</h3>
        {isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
        {!isLoading && clients.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            Nenhum cliente cadastrado ainda.
          </p>
        )}
        <div className="space-y-3">
          {clients.map((client) => (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4" key={client.id}>
              <div>
                <p className="font-semibold text-slate-900">{client.name}</p>
                <p className="mt-1 text-sm text-slate-500">{client.cnpj || 'CNPJ nao informado'}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${client.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {client.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-4 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
