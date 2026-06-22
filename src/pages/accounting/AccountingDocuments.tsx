import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Button } from '../../components/ui/Button'
import { PaginationControls } from '../../components/ui/PaginationControls'
import { usePagination } from '../../hooks/usePagination'
import { listAccountingClients } from '../../services/accountingRepository'
import {
  archiveAccountingDocument,
  createAccountingDocumentSignedUrl,
  inviteClientPortalUser,
  listAccountingDocuments,
  listClientPortalUsers,
  removeClientPortalUserLink,
  replaceAccountingDocument,
  sendClientPortalPasswordReset,
  setClientPortalUserStatus,
  updateAccountingDocumentApproval,
  updateClientPortalUserAccess,
  uploadAccountingDocument,
} from '../../services/accountingDocumentsService'
import { resolveOrganizationId } from '../../services/platformService'
import type { AccountingClient } from '../../types/accounting'
import type {
  AccountingDocument,
  AccountingDocumentApprovalStatus,
  AccountingDocumentInput,
  ClientPortalRole,
  ClientPortalUser,
} from '../../types/accountingDocuments'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'

const categories = [
  'Documento contabil',
  'Guia de imposto',
  'Recibo',
  'Contrato social',
  'Certidao',
  'Folha de pagamento',
  'DRE',
  'Balanco patrimonial',
  'Nota fiscal',
  'Outro',
]

const approvalStatuses: Array<{ label: string; value: AccountingDocumentApprovalStatus }> = [
  { label: 'Pendente', value: 'pending' },
  { label: 'Aprovado', value: 'approved' },
  { label: 'Rejeitado', value: 'rejected' },
  { label: 'Entregue', value: 'delivered' },
]

const portalRoleOptions: Array<{ label: string; value: ClientPortalRole; description: string }> = [
  { label: 'Visualizador', value: 'viewer', description: 'Pode acessar documentos e informacoes liberadas.' },
  { label: 'Colaborador', value: 'collaborator', description: 'Pode acompanhar e apoiar demandas do cliente.' },
  { label: 'Gerente do portal', value: 'manager', description: 'Pode operar rotinas do portal do cliente.' },
  { label: 'Responsavel', value: 'owner', description: 'Perfil legado de responsavel principal.' },
]

const blankDocumentForm: AccountingDocumentInput = {
  approvalStatus: 'pending',
  category: 'Documento contabil',
  clientId: '',
  competence: '',
  description: '',
  documentType: 'Documento contabil',
  dueDate: '',
  responsibleUserId: '',
}

type PortalFormState = {
  email: string
  fullName: string
  role: ClientPortalRole
}

type PortalConfirmAction = 'disable' | 'reactivate' | 'remove'

type PortalConfirmState = {
  action: PortalConfirmAction
  reason: string
  user: ClientPortalUser
}

function formatDate(value: string) {
  if (!value) return 'Nao informado'
  const [dateOnly] = value.split('T')
  const parts = dateOnly.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function formatFileSize(value: number) {
  if (!value) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(Math.round(value / 1024), 1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function statusBadge(status: string) {
  if (['approved', 'delivered', 'downloaded'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['rejected', 'archived'].includes(status)) return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-700'
}

function portalStatusBadge(status: string) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700'
  if (status === 'disabled' || status === 'removed') return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-700'
}

function labelApprovalStatus(status: string) {
  return approvalStatuses.find((item) => item.value === status)?.label ?? status
}

function labelPortalRole(role: ClientPortalRole) {
  return portalRoleOptions.find((item) => item.value === role)?.label ?? role
}

function labelPortalStatus(user: ClientPortalUser) {
  if (user.status === 'removed') return 'Vinculo removido'
  if (user.status === 'disabled') return 'Desativado'
  if (user.status === 'invited') return 'Sem usuario Auth vinculado'
  if (!user.authUserId) return 'Sem usuario Auth vinculado'
  return 'Ativo'
}

export function AccountingDocuments() {
  const [searchParams] = useSearchParams()
  const requestedOrganizationId = searchParams.get('organization')
  const [organizationId, setOrganizationId] = useState('')
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [documents, setDocuments] = useState<AccountingDocument[]>([])
  const [documentForm, setDocumentForm] = useState<AccountingDocumentInput>(blankDocumentForm)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filterClientId, setFilterClientId] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [portalClientId, setPortalClientId] = useState('')
  const [portalUsers, setPortalUsers] = useState<ClientPortalUser[]>([])
  const [portalForm, setPortalForm] = useState<PortalFormState>({ email: '', fullName: '', role: 'viewer' })
  const [editingPortalUser, setEditingPortalUser] = useState<ClientPortalUser | null>(null)
  const [editPortalForm, setEditPortalForm] = useState<{ clientId: string; fullName: string; role: ClientPortalRole }>({
    clientId: '',
    fullName: '',
    role: 'viewer',
  })
  const [portalConfirm, setPortalConfirm] = useState<PortalConfirmState | null>(null)
  const [resettingPortalUserId, setResettingPortalUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const { page, pageSize, resetPage, setPage, setPageSize } = usePagination({ initialPageSize: 10 })
  const totalPages = Math.max(Math.ceil(total / pageSize), 1)

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === documentForm.clientId) ?? null,
    [clients, documentForm.clientId],
  )

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resolvedOrganizationId = await resolveOrganizationId(requestedOrganizationId)
      if (!resolvedOrganizationId) {
        setError('Nenhuma organizacao encontrada para documentos contabeis.')
        return
      }

      setOrganizationId(resolvedOrganizationId)
      const loadedClients = await listAccountingClients(resolvedOrganizationId)
      setClients(loadedClients)
      setDocumentForm((current) => ({ ...current, clientId: current.clientId || loadedClients[0]?.id || '' }))
      setPortalClientId((current) => current || loadedClients[0]?.id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar a base.')
    } finally {
      setLoading(false)
    }
  }, [requestedOrganizationId])

  const loadDocuments = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError('')
    try {
      const result = await listAccountingDocuments(organizationId, {
        category: filterCategory,
        clientId: filterClientId,
        page,
        pageSize,
        search,
        status: filterStatus,
      })
      setDocuments(result.documents)
      setTotal(result.total)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar documentos.')
    } finally {
      setLoading(false)
    }
  }, [filterCategory, filterClientId, filterStatus, organizationId, page, pageSize, search])

  const loadPortalUsers = useCallback(async () => {
    if (!organizationId || !portalClientId) return
    try {
      const loadedPortalUsers = await listClientPortalUsers(organizationId, portalClientId)
      setPortalUsers(loadedPortalUsers)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar usuarios do portal.')
    }
  }, [organizationId, portalClientId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBase()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadBase])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocuments()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadDocuments])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPortalUsers()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadPortalUsers])

  function updateDocumentForm(field: keyof AccountingDocumentInput, value: string) {
    setDocumentForm((current) => ({
      ...current,
      [field]: value,
      documentType: field === 'category' ? value : current.documentType,
    }))
  }

  async function handleUpload() {
    if (!organizationId || !selectedFile) {
      setError('Selecione um cliente e um arquivo para enviar.')
      return
    }

    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await uploadAccountingDocument(organizationId, documentForm, selectedFile)
      setFeedback('Documento contabil salvo com seguranca.')
      setSelectedFile(null)
      setDocumentForm((current) => ({
        ...blankDocumentForm,
        clientId: current.clientId,
      }))
      resetPage()
      await loadDocuments()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel salvar o documento.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload(document: AccountingDocument) {
    setError('')
    try {
      const signedUrl = await createAccountingDocumentSignedUrl(document)
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer')
      }
      await loadDocuments()
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Nao foi possivel baixar o documento.')
    }
  }

  async function handleReplace(document: AccountingDocument, file: File | null) {
    if (!file) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await replaceAccountingDocument(document, file)
      setFeedback('Documento substituido e historico preservado.')
      await loadDocuments()
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : 'Nao foi possivel substituir o documento.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(documentId: string) {
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await archiveAccountingDocument(documentId)
      setFeedback('Documento arquivado com exclusao logica.')
      await loadDocuments()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Nao foi possivel arquivar o documento.')
    } finally {
      setSaving(false)
    }
  }

  async function handleApprovalStatus(documentId: string, status: AccountingDocumentApprovalStatus) {
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await updateAccountingDocumentApproval(documentId, status)
      setFeedback('Status do documento atualizado.')
      await loadDocuments()
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Nao foi possivel atualizar o status.')
    } finally {
      setSaving(false)
    }
  }

  async function handleInvitePortalUser() {
    if (!organizationId || !portalClientId || !portalForm.email) {
      setError('Informe cliente e e-mail para liberar o portal.')
      return
    }

    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await inviteClientPortalUser(organizationId, {
        clientId: portalClientId,
        email: portalForm.email,
        fullName: portalForm.fullName,
        role: portalForm.role,
      })
      setFeedback('Acesso do portal salvo. Se o e-mail ja tiver login, o acesso fica ativo.')
      setPortalForm({ email: '', fullName: '', role: 'viewer' })
      await loadPortalUsers()
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Nao foi possivel liberar o portal.')
    } finally {
      setSaving(false)
    }
  }

  function openPortalEdit(user: ClientPortalUser) {
    setEditingPortalUser(user)
    setEditPortalForm({
      clientId: user.clientId,
      fullName: user.fullName,
      role: user.role,
    })
    setFeedback('')
    setError('')
  }

  async function handleUpdatePortalAccess() {
    if (!editingPortalUser) return
    if (!editPortalForm.clientId) {
      setError('Selecione o cliente vinculado ao acesso.')
      return
    }

    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await updateClientPortalUserAccess({
        clientId: editPortalForm.clientId,
        fullName: editPortalForm.fullName,
        portalAccessId: editingPortalUser.id,
        role: editPortalForm.role,
      })
      setFeedback('Acesso do portal atualizado com auditoria.')
      setEditingPortalUser(null)
      await loadPortalUsers()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Nao foi possivel editar o acesso.')
    } finally {
      setSaving(false)
    }
  }

  function openPortalConfirm(user: ClientPortalUser, action: PortalConfirmAction) {
    setPortalConfirm({ action, reason: '', user })
    setFeedback('')
    setError('')
  }

  async function handleConfirmPortalAction() {
    if (!portalConfirm) return

    setSaving(true)
    setFeedback('')
    setError('')
    try {
      if (portalConfirm.action === 'disable') {
        await setClientPortalUserStatus(portalConfirm.user.id, 'disabled', portalConfirm.reason)
        setFeedback('Acesso desativado. O usuario Auth foi preservado.')
      }

      if (portalConfirm.action === 'reactivate') {
        await setClientPortalUserStatus(portalConfirm.user.id, 'active', portalConfirm.reason)
        setFeedback('Acesso reativado conforme vinculo existente.')
      }

      if (portalConfirm.action === 'remove') {
        await removeClientPortalUserLink(portalConfirm.user.id, portalConfirm.reason)
        setFeedback('Vinculo removido logicamente. O usuario Auth nao foi apagado.')
      }

      setPortalConfirm(null)
      await loadPortalUsers()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Nao foi possivel concluir a acao.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset(portalUser: ClientPortalUser) {
    setResettingPortalUserId(portalUser.id)
    setFeedback('')
    setError('')
    try {
      await sendClientPortalPasswordReset(portalUser)
      setFeedback('Redefinicao de senha enviada para o e-mail do portal.')
      await loadPortalUsers()
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Nao foi possivel enviar redefinicao.')
    } finally {
      setResettingPortalUserId('')
    }
  }

  return (
    <DashboardLayout title="Documentos Contabeis">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-indigo-600">Arquivos e portal</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Documentos Contabeis</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Envie documentos por cliente, controle aprovacao, entrega, versao, downloads e acesso externo pelo Portal do Cliente.
          </p>
        </div>

        {feedback && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{feedback}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-950">Novo documento</h3>
                <p className="mt-1 text-sm text-slate-500">Arquivos ficam em Storage privado e o registro fica vinculado ao cliente.</p>
              </div>
              {selectedClient && (
                <span className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {selectedClient.companyName}
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Cliente
                <select className={inputClass} value={documentForm.clientId} onChange={(event) => updateDocumentForm('clientId', event.target.value)}>
                  <option value="">Selecione...</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Categoria
                <select className={inputClass} value={documentForm.category} onChange={(event) => updateDocumentForm('category', event.target.value)}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Competencia
                <input className={inputClass} type="month" value={documentForm.competence} onChange={(event) => updateDocumentForm('competence', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Vencimento
                <input className={inputClass} type="date" value={documentForm.dueDate} onChange={(event) => updateDocumentForm('dueDate', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Status de aprovacao
                <select className={inputClass} value={documentForm.approvalStatus} onChange={(event) => updateDocumentForm('approvalStatus', event.target.value)}>
                  {approvalStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Responsavel
                <input className={inputClass} placeholder="Opcional: usuario responsavel" value={documentForm.responsibleUserId} onChange={(event) => updateDocumentForm('responsibleUserId', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
                Descricao
                <textarea className={`${inputClass} min-h-24`} value={documentForm.description} onChange={(event) => updateDocumentForm('description', event.target.value)} />
              </label>
              <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 md:col-span-2">
                <label className="inline-flex cursor-pointer items-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
                  Selecionar arquivo
                  <input
                    accept=".pdf,.png,.jpg,.jpeg,.xml,.csv,.txt,.json,.xls,.xlsx,.doc,.docx"
                    className="hidden"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                <span className="ml-4 text-sm text-slate-600">
                  {selectedFile ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})` : 'Nenhum arquivo selecionado'}
                </span>
                <p className="mt-3 text-xs text-slate-500">Bloqueia executaveis, scripts, macros, caminho embutido e arquivos acima de 25 MB.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button disabled={!selectedFile || !documentForm.clientId || saving} isLoading={saving} onClick={handleUpload}>
                Salvar documento
              </Button>
              <Button onClick={() => void loadDocuments()} variant="secondary">
                Atualizar lista
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-950">Portal do Cliente</h3>
            <p className="mt-1 text-sm text-slate-500">Libere acesso por cliente. O usuario externo so enxerga o proprio client_id.</p>

            <div className="mt-5 space-y-4">
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Cliente
                <select className={inputClass} value={portalClientId} onChange={(event) => setPortalClientId(event.target.value)}>
                  <option value="">Selecione...</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Nome
                <input className={inputClass} value={portalForm.fullName} onChange={(event) => setPortalForm((current) => ({ ...current, fullName: event.target.value }))} />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                E-mail
                <input className={inputClass} type="email" value={portalForm.email} onChange={(event) => setPortalForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Permissao
                <select className={inputClass} value={portalForm.role} onChange={(event) => setPortalForm((current) => ({ ...current, role: event.target.value as ClientPortalRole }))}>
                  {portalRoleOptions.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>
              <Button disabled={saving} isLoading={saving} onClick={handleInvitePortalUser}>
                Liberar acesso
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Acessos cadastrados</p>
              {portalUsers.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum usuario liberado para este cliente.</p>}
              {portalUsers.map((portalUser) => (
                <div className="rounded-2xl border border-slate-100 p-4" key={portalUser.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{portalUser.fullName || portalUser.email}</p>
                      <p className="text-xs text-slate-500">{portalUser.email}</p>
                      <p className="mt-1 text-xs text-slate-500">{portalUser.clientName} - {labelPortalRole(portalUser.role)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${portalStatusBadge(portalUser.status)}`}>
                      {labelPortalStatus(portalUser)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    <span>Criado em: {formatDate(portalUser.createdAt)}</span>
                    <span>Ultimo acesso: {formatDate(portalUser.lastAccessAt)}</span>
                    {portalUser.recoveryRequestedAt && <span>Ultima redefinicao: {formatDate(portalUser.recoveryRequestedAt)}</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="h-9 px-3 text-xs" disabled={saving || portalUser.status === 'removed'} onClick={() => openPortalEdit(portalUser)} variant="secondary">
                      Editar
                    </Button>
                    {portalUser.status === 'disabled' ? (
                      <Button className="h-9 px-3 text-xs" disabled={saving} onClick={() => openPortalConfirm(portalUser, 'reactivate')} variant="secondary">
                        Reativar
                      </Button>
                    ) : (
                      <Button className="h-9 px-3 text-xs" disabled={saving || portalUser.status === 'removed'} onClick={() => openPortalConfirm(portalUser, 'disable')} variant="secondary">
                        Desativar
                      </Button>
                    )}
                    <Button
                      className="h-9 px-3 text-xs"
                      disabled={resettingPortalUserId === portalUser.id || !portalUser.authUserId || portalUser.status === 'disabled' || portalUser.status === 'removed'}
                      isLoading={resettingPortalUserId === portalUser.id}
                      onClick={() => void handlePasswordReset(portalUser)}
                      title={!portalUser.authUserId ? 'Sem usuario Auth vinculado para redefinir senha.' : undefined}
                      variant="secondary"
                    >
                      Enviar redefinicao
                    </Button>
                    <Button className="h-9 px-3 text-xs text-rose-600 hover:text-rose-700" disabled={saving || portalUser.status === 'removed'} onClick={() => openPortalConfirm(portalUser, 'remove')} variant="ghost">
                      Remover vinculo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h3 className="text-xl font-bold text-slate-950">Documentos cadastrados</h3>
              <p className="mt-1 text-sm text-slate-500">Busca, filtros, paginacao e historico por auditoria no banco.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4 lg:min-w-[760px]">
              <input
                className={inputClass}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPage()
                }}
                placeholder="Buscar por arquivo"
                value={search}
              />
              <select className={inputClass} value={filterClientId} onChange={(event) => { setFilterClientId(event.target.value); resetPage() }}>
                <option value="">Todos os clientes</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
              </select>
              <select className={inputClass} value={filterCategory} onChange={(event) => { setFilterCategory(event.target.value); resetPage() }}>
                <option value="">Todas as categorias</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select className={inputClass} value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); resetPage() }}>
                <option value="">Todos os status</option>
                {approvalStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </div>
          </div>

          {loading && <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Carregando documentos...</p>}
          {!loading && documents.length === 0 && <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Nenhum documento encontrado.</p>}

          <div className="mt-6 space-y-3">
            {documents.map((document) => (
              <article className="rounded-2xl border border-slate-100 p-5" key={document.id}>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-950">{document.originalFileName}</h4>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">v{document.versionNumber}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(document.approvalStatus)}`}>
                        {labelApprovalStatus(document.approvalStatus)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{document.clientName} - {document.category}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Competencia: {formatDate(document.competence)} | Vencimento: {formatDate(document.dueDate)} | Tamanho: {formatFileSize(document.fileSize)}
                    </p>
                    {document.description && <p className="mt-2 text-sm text-slate-500">{document.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {approvalStatuses.map((status) => (
                      <button
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700"
                        disabled={saving}
                        key={status.value}
                        onClick={() => void handleApprovalStatus(document.id, status.value)}
                        type="button"
                      >
                        {status.label}
                      </button>
                    ))}
                    <Button className="h-9 px-3 text-xs" onClick={() => void handleDownload(document)} variant="secondary">
                      Baixar
                    </Button>
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">
                      Substituir
                      <input
                        accept=".pdf,.png,.jpg,.jpeg,.xml,.csv,.txt,.json,.xls,.xlsx,.doc,.docx"
                        className="hidden"
                        onChange={(event) => void handleReplace(document, event.target.files?.[0] ?? null)}
                        type="file"
                      />
                    </label>
                    <Button className="h-9 px-3 text-xs" disabled={saving} onClick={() => void handleArchive(document.id)} variant="ghost">
                      Arquivar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <PaginationControls
            disabled={loading}
            label="documento(s)"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
          />
        </section>

        {editingPortalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Portal do Cliente</p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">Editar acesso</h3>
                  <p className="mt-1 text-sm text-slate-500">Altere cliente vinculado, nome e permissao. O e-mail fica bloqueado por seguranca.</p>
                </div>
                <Button disabled={saving} onClick={() => setEditingPortalUser(null)} variant="secondary">
                  Fechar
                </Button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  E-mail
                  <input className={`${inputClass} bg-slate-50 text-slate-500`} disabled value={editingPortalUser.email} />
                </label>
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700 md:col-span-2">
                  Troca de e-mail exige endpoint administrativo seguro. Nesta etapa o sistema edita o vinculo sem alterar usuario Auth.
                </p>
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                  Cliente
                  <select className={inputClass} value={editPortalForm.clientId} onChange={(event) => setEditPortalForm((current) => ({ ...current, clientId: event.target.value }))}>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                  Nome
                  <input className={inputClass} value={editPortalForm.fullName} onChange={(event) => setEditPortalForm((current) => ({ ...current, fullName: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Permissao
                  <select className={inputClass} value={editPortalForm.role} onChange={(event) => setEditPortalForm((current) => ({ ...current, role: event.target.value as ClientPortalRole }))}>
                    {portalRoleOptions.map((role) => (
                      <option key={role.value} value={role.value}>{role.label} - {role.description}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button disabled={saving} onClick={() => setEditingPortalUser(null)} variant="secondary">
                  Cancelar
                </Button>
                <Button disabled={saving} isLoading={saving} onClick={() => void handleUpdatePortalAccess()}>
                  Salvar acesso
                </Button>
              </div>
            </div>
          </div>
        )}

        {portalConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Confirmacao</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-950">
                  {portalConfirm.action === 'disable' && 'Desativar acesso'}
                  {portalConfirm.action === 'reactivate' && 'Reativar acesso'}
                  {portalConfirm.action === 'remove' && 'Remover vinculo'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {portalConfirm.user.fullName || portalConfirm.user.email} - {portalConfirm.user.email}
                </p>
                {portalConfirm.action === 'remove' && (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    O vinculo sera removido logicamente. O usuario no Supabase Auth nao sera apagado.
                  </p>
                )}
              </div>
              <label className="mt-5 block space-y-2 text-sm font-semibold text-slate-700">
                Motivo ou observacao
                <textarea
                  className={`${inputClass} min-h-28`}
                  onChange={(event) => setPortalConfirm((current) => current ? { ...current, reason: event.target.value } : current)}
                  placeholder="Opcional, mas recomendado para auditoria."
                  value={portalConfirm.reason}
                />
              </label>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button disabled={saving} onClick={() => setPortalConfirm(null)} variant="secondary">
                  Cancelar
                </Button>
                <Button disabled={saving} isLoading={saving} onClick={() => void handleConfirmPortalAction()}>
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
