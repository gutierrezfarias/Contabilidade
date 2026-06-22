import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PaginationControls } from '../../components/ui/PaginationControls'
import { usePagination } from '../../hooks/usePagination'
import { listAdminClients, saveAdminClient } from '../../services/adminClientService'
import { authService } from '../../services/authService'
import { lookupCompanyAddress } from '../../services/postalCodeService'
import type {
  AdminClient,
  AdminClientApp,
  AdminClientAppStatus,
  AdminClientFilters,
} from '../../types/adminClients'
import { formatCnpj, formatPhone, formatPostalCode, isValidEmail } from '../../utils/formatters'

const emptyFilters: AdminClientFilters = {
  app: 'todos',
  billing: 'todos',
  status: 'todos',
  text: '',
}

export function AdminClients() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [filters, setFilters] = useState<AdminClientFilters>(emptyFilters)
  const [editingClient, setEditingClient] = useState<AdminClient | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false)
  const {
    page: clientsPage,
    pageSize: clientsPageSize,
    resetPage: resetClientsPage,
    setPage: setClientsPage,
    setPageSize: setClientsPageSize,
  } = usePagination({ initialPageSize: 10 })

  useEffect(() => {
    let active = true
    listAdminClients()
      .then((loadedClients) => {
        if (active) setClients(loadedClients)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar clientes.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredClients = useMemo(() => {
    const search = filters.text.trim().toLowerCase()

    return clients.filter((client) => {
      const matchesText =
        !search ||
        client.name.toLowerCase().includes(search) ||
        client.cnpj.toLowerCase().includes(search) ||
        client.email.toLowerCase().includes(search) ||
        client.phone.toLowerCase().includes(search)

      const matchesStatus =
        filters.status === 'todos' ||
        (filters.status === 'ativos' && client.active) ||
        (filters.status === 'inativos' && !client.active)

      const matchesApp =
        filters.app === 'todos' ||
        client.apps.some((app) => app.applicationId === filters.app && app.status === 'ativo')

      const matchesBilling =
        filters.billing === 'todos' ||
        (filters.billing === 'com-desconto' &&
          (client.discountPercent > 0 || client.apps.some((app) => app.discountPercent > 0))) ||
        (filters.billing === 'isento' &&
          (client.subscriptionExempt || client.apps.some((app) => app.subscriptionExempt)))

      return matchesText && matchesStatus && matchesApp && matchesBilling
    })
  }, [clients, filters])

  useEffect(() => {
    const timeoutId = window.setTimeout(resetClientsPage, 0)
    return () => window.clearTimeout(timeoutId)
  }, [filters, resetClientsPage])

  const paginatedClients = useMemo(() => {
    const start = (clientsPage - 1) * clientsPageSize
    return filteredClients.slice(start, start + clientsPageSize)
  }, [clientsPage, clientsPageSize, filteredClients])

  const clientsTotalPages = Math.max(Math.ceil(filteredClients.length / clientsPageSize), 1)

  useEffect(() => {
    if (clientsPage <= clientsTotalPages) return
    const timeoutId = window.setTimeout(() => setClientsPage(clientsTotalPages), 0)
    return () => window.clearTimeout(timeoutId)
  }, [clientsPage, clientsTotalPages, setClientsPage])

  const dashboard = useMemo(() => {
    const active = clients.filter((client) => client.active).length
    const inactive = clients.length - active
    const exempt = clients.filter((client) => client.subscriptionExempt).length
    const withDiscount = clients.filter(
      (client) => client.discountPercent > 0 || client.apps.some((app) => app.discountPercent > 0),
    ).length
    const acquiredApps = clients.reduce(
      (total, client) => total + client.apps.filter((app) => app.status === 'ativo').length,
      0,
    )

    return { acquiredApps, active, exempt, inactive, total: clients.length, withDiscount }
  }, [clients])

  const applicationOptions = useMemo(() => {
    const options = new Map<string, string>()
    clients.forEach((client) => {
      client.apps.forEach((app) => options.set(app.applicationId, app.applicationName))
    })
    return Array.from(options.entries()).map(([id, name]) => ({ id, name }))
  }, [clients])

  async function reloadClients() {
    setClients(await listAdminClients())
  }

  async function handleSaveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingClient) return

    if (editingClient.email && !isValidEmail(editingClient.email)) {
      setError('Informe um e-mail valido antes de salvar.')
      return
    }

    try {
      await saveAdminClient(editingClient)
      await reloadClients()
      setFeedback('Cliente atualizado com sucesso.')
      setEditingClient(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar cliente.')
    }
  }

  function updateEditingClient(field: keyof AdminClient, value: string | number | boolean) {
    const nextValue =
      field === 'cep' && typeof value === 'string'
        ? formatPostalCode('BR', value)
        : field === 'cnpj' && typeof value === 'string'
        ? formatCnpj(value)
        : field === 'phone' && typeof value === 'string'
        ? formatPhone('BR', value)
        : value
    setEditingClient((client) => (client ? { ...client, [field]: nextValue } : client))
    setError('')
  }

  async function handleClientCepLookup() {
    if (!editingClient?.cep) return

    try {
      const result = await lookupCompanyAddress('BR', editingClient.cep)
      setEditingClient((client) =>
        client
          ? {
              ...client,
              cep: result.fields.cep ?? client.cep,
              address: result.fields.endereco ?? client.address,
              addressComplement: result.fields.complemento ?? client.addressComplement,
              neighborhood: result.fields.bairro ?? client.neighborhood,
              city: result.fields.cidade ?? client.city,
              state: result.fields.estado ?? client.state,
            }
          : client,
      )
      setFeedback(result.message)
      setError('')
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Nao foi possivel consultar o CEP.')
    }
  }

  async function handleSendPasswordReset() {
    if (!editingClient?.email) {
      setError('Informe o e-mail do cliente antes de enviar a redefinicao de senha.')
      setFeedback('')
      return
    }

    if (!isValidEmail(editingClient.email)) {
      setError('Informe um e-mail valido para enviar a redefinicao de senha.')
      setFeedback('')
      return
    }

    setIsSendingPasswordReset(true)
    try {
      const result = await authService.forgotPassword(editingClient.email)
      setFeedback(result.message)
      setError('')
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Nao foi possivel enviar a redefinicao de senha.')
      setFeedback('')
    } finally {
      setIsSendingPasswordReset(false)
    }
  }

  function updateEditingApp(applicationId: string, patch: Partial<AdminClientApp>) {
    setEditingClient((client) =>
      client
        ? {
            ...client,
            apps: client.apps.map((app) =>
              app.applicationId === applicationId ? { ...app, ...patch } : app,
            ),
          }
        : client,
    )
  }

  return (
    <AdminLayout title="Clientes">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">Admin</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Clientes da plataforma
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Gerencie escritórios cadastrados, status, aplicativos adquiridos, descontos e isenções.
        </p>
      </div>

      {feedback && <div className="mb-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}

      <section className="mb-7 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total" value={dashboard.total} />
        <Metric label="Ativos" value={dashboard.active} tone="success" />
        <Metric label="Inativos" value={dashboard.inactive} />
        <Metric label="Apps ativos" value={dashboard.acquiredApps} />
        <Metric label="Com desconto" value={dashboard.withDiscount} tone="warning" />
        <Metric label="Isentos" value={dashboard.exempt} tone="warning" />
      </section>

      <section className="mb-7 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <Input
            id="client-search"
            label="Buscar cliente"
            onChange={(event) => setFilters((current) => ({ ...current, text: event.target.value }))}
            placeholder="Nome, CNPJ, email ou telefone"
            value={filters.text}
          />
          <Select
            label="Status"
            onChange={(value) => setFilters((current) => ({ ...current, status: value as AdminClientFilters['status'] }))}
            value={filters.status}
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </Select>
          <Select
            label="Aplicativo"
            onChange={(value) => setFilters((current) => ({ ...current, app: value }))}
            value={filters.app}
          >
            <option value="todos">Todos</option>
            {applicationOptions.map((application) => (
              <option key={application.id} value={application.id}>{application.name}</option>
            ))}
          </Select>
          <Select
            label="Pagamento"
            onChange={(value) => setFilters((current) => ({ ...current, billing: value as AdminClientFilters['billing'] }))}
            value={filters.billing}
          >
            <option value="todos">Todos</option>
            <option value="com-desconto">Com desconto</option>
            <option value="isento">Isento</option>
          </Select>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Lista de clientes</h3>
          <p className="text-sm text-slate-500">{filteredClients.length} resultado(s)</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-4">Cliente</th>
                <th className="pb-4">Contato</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Apps ativos</th>
                <th className="pb-4">Pagamento</th>
                <th className="pb-4">Ação</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClients.map((client) => {
                const activeApps = client.apps.filter((app) => app.status === 'ativo')
                return (
                  <tr className="border-t border-slate-100" key={client.id}>
                    <td className="py-4">
                      <p className="font-semibold text-slate-900">{client.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{client.cnpj || 'CNPJ não informado'}</p>
                    </td>
                    <td className="py-4 text-slate-500">
                      <p>{client.email || 'E-mail não informado'}</p>
                      <p className="mt-1 text-xs">{client.phone || 'Telefone não informado'}</p>
                    </td>
                    <td className="py-4">
                      <Badge tone={client.active ? 'success' : 'neutral'}>
                        {client.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="py-4 text-slate-500">
                      {activeApps.length ? activeApps.map((app) => app.applicationName).join(', ') : 'Nenhum'}
                    </td>
                    <td className="py-4">
                      {client.subscriptionExempt ? (
                        <Badge tone="warning">Isento</Badge>
                      ) : client.discountPercent > 0 ? (
                        <Badge tone="warning">{client.discountPercent}% desc.</Badge>
                      ) : (
                        <span className="text-slate-500">Normal</span>
                      )}
                    </td>
                    <td className="py-4">
                      <Button onClick={() => setEditingClient(client)} variant="secondary">
                        Editar
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {isLoading && <p className="py-10 text-center text-sm text-slate-500">Carregando clientes...</p>}
          {!isLoading && filteredClients.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">Nenhum cliente encontrado.</p>
          )}
        </div>
        <PaginationControls
          disabled={isLoading}
          label="cliente(s)"
          onPageChange={setClientsPage}
          onPageSizeChange={setClientsPageSize}
          page={clientsPage}
          pageSize={clientsPageSize}
          total={filteredClients.length}
          totalPages={clientsTotalPages}
        />
      </section>

      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            onSubmit={handleSaveClient}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{editingClient.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Informações cadastrais e comerciais.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  isLoading={isSendingPasswordReset}
                  onClick={() => void handleSendPasswordReset()}
                  type="button"
                >
                  Redefinir senha
                </Button>
                <Button onClick={() => setEditingClient(null)} variant="secondary">
                  Fechar
                </Button>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input id="edit-name" label="Nome do cliente / escritório" onChange={(event) => updateEditingClient('name', event.target.value)} value={editingClient.name} />
              <Input id="edit-cnpj" label="CNPJ" onChange={(event) => updateEditingClient('cnpj', event.target.value)} value={editingClient.cnpj} />
              <Input id="edit-contact" label="Responsável" onChange={(event) => updateEditingClient('contactName', event.target.value)} value={editingClient.contactName} />
              <Input id="edit-email" label="E-mail" onChange={(event) => updateEditingClient('email', event.target.value)} type="email" value={editingClient.email} />
              <Input id="edit-phone" label="Telefone" onChange={(event) => updateEditingClient('phone', event.target.value)} value={editingClient.phone} />
              <Input
                id="edit-cep"
                label="CEP"
                onBlur={() => void handleClientCepLookup()}
                onChange={(event) => updateEditingClient('cep', event.target.value)}
                placeholder="00000-000"
                value={editingClient.cep}
              />
              <Input id="edit-address" label="Endereço" onChange={(event) => updateEditingClient('address', event.target.value)} value={editingClient.address} />
              <Input id="edit-neighborhood" label="Bairro" onChange={(event) => updateEditingClient('neighborhood', event.target.value)} value={editingClient.neighborhood} />
              <Input id="edit-city" label="Cidade" onChange={(event) => updateEditingClient('city', event.target.value)} value={editingClient.city} />
              <Input id="edit-state" label="Estado" onChange={(event) => updateEditingClient('state', event.target.value)} value={editingClient.state} />
              <Input id="edit-complement" label="Complemento" onChange={(event) => updateEditingClient('addressComplement', event.target.value)} value={editingClient.addressComplement} />
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-3">
              <Input id="edit-discount" label="Desconto geral (%)" onChange={(event) => updateEditingClient('discountPercent', Number(event.target.value))} type="number" value={editingClient.discountPercent} />
              <CheckBox checked={editingClient.active} label="Cliente ativo" onChange={(checked) => updateEditingClient('active', checked)} />
              <CheckBox checked={editingClient.subscriptionExempt} label="Isento de assinatura" onChange={(checked) => updateEditingClient('subscriptionExempt', checked)} />
            </div>

            <label className="mt-5 block space-y-2 text-sm font-medium text-slate-700">
              <span>Observações</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-500"
                onChange={(event) => updateEditingClient('notes', event.target.value)}
                value={editingClient.notes}
              />
            </label>

            <section className="mt-7 rounded-2xl border border-slate-100 p-5">
              <h4 className="mb-4 text-lg font-semibold text-slate-900">Aplicativos adquiridos</h4>
              <div className="space-y-4">
                {editingClient.apps.map((app) => (
                  <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr]" key={app.applicationId}>
                    <div>
                      <p className="font-semibold text-slate-900">{app.applicationName}</p>
                      <p className="mt-1 text-xs text-slate-500">{app.applicationId}</p>
                    </div>
                    <Select label="Status" onChange={(value) => updateEditingApp(app.applicationId, { status: value as AdminClientAppStatus })} value={app.status}>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="teste">Teste</option>
                      <option value="cancelado">Cancelado</option>
                    </Select>
                    <Input id={`${app.applicationId}-price`} label="Valor mensal" onChange={(event) => updateEditingApp(app.applicationId, { monthlyPrice: Number(event.target.value) })} type="number" value={app.monthlyPrice} />
                    <Input id={`${app.applicationId}-discount`} label="Desconto %" onChange={(event) => updateEditingApp(app.applicationId, { discountPercent: Number(event.target.value) })} type="number" value={app.discountPercent} />
                    <CheckBox checked={app.subscriptionExempt} label="Isento" onChange={(checked) => updateEditingApp(app.applicationId, { subscriptionExempt: checked })} />
                    <Input id={`${app.applicationId}-exempt-until`} label="Isento ate" onChange={(event) => updateEditingApp(app.applicationId, { exemptionUntil: event.target.value })} type="date" value={app.exemptionUntil} />
                  </div>
                ))}
                {editingClient.apps.length === 0 && (
                  <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                    Nenhum aplicativo adquirido encontrado no banco de dados para este cliente.
                  </p>
                )}
              </div>
            </section>

            <div className="mt-7 flex justify-end gap-3">
              <Button onClick={() => setEditingClient(null)} variant="secondary">Cancelar</Button>
              <Button type="submit">Salvar alterações</Button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  )
}

function Metric({ label, tone = 'neutral', value }: { label: string; tone?: 'neutral' | 'success' | 'warning'; value: number }) {
  const colors = {
    neutral: 'text-slate-950',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
  }
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-4 text-3xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'success' | 'warning' | 'neutral' }) {
  const colors = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  }
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>
}

function Select({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  )
}

function CheckBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  )
}
