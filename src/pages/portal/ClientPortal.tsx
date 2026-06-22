import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import {
  claimClientPortalAccess,
  createAccountingDocumentSignedUrlById,
  createAccountingDocumentSignedUrl,
  listPortalDocuments,
  listPortalNfeDocuments,
  listPortalObligations,
  listPortalTaxes,
  logClientPortalAccess,
} from '../../services/accountingDocumentsService'
import type {
  AccountingDocument,
  ClientPortalUser,
  PortalNfeDocument,
  PortalObligation,
  PortalTaxRecord,
} from '../../types/accountingDocuments'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value)
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

function statusClass(status: string) {
  if (['approved', 'delivered', 'paid', 'delivered', 'Autorizada'].includes(status)) {
    return 'bg-emerald-50 text-emerald-700'
  }
  if (['rejected', 'overdue', 'late', 'Rejeitada', 'Cancelada'].includes(status)) {
    return 'bg-rose-50 text-rose-700'
  }
  return 'bg-amber-50 text-amber-700'
}

function PortalCard({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function ClientPortal() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<ClientPortalUser[]>([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [documents, setDocuments] = useState<AccountingDocument[]>([])
  const [taxes, setTaxes] = useState<PortalTaxRecord[]>([])
  const [obligations, setObligations] = useState<PortalObligation[]>([])
  const [nfes, setNfes] = useState<PortalNfeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null,
    [activeProfileId, profiles],
  )

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const loadPortal = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const claimedProfiles = await claimClientPortalAccess()
      setProfiles(claimedProfiles)
      const profile = claimedProfiles.find((item) => item.id === activeProfileId) ?? claimedProfiles[0]
      if (!profile) {
        setDocuments([])
        setTaxes([])
        setObligations([])
        setNfes([])
        return
      }

      setActiveProfileId(profile.id)
      const [loadedDocuments, loadedTaxes, loadedObligations, loadedNfes] = await Promise.all([
        listPortalDocuments(profile),
        listPortalTaxes(profile),
        listPortalObligations(profile),
        listPortalNfeDocuments(profile),
      ])

      setDocuments(loadedDocuments)
      setTaxes(loadedTaxes)
      setObligations(loadedObligations)
      setNfes(loadedNfes)
      await logClientPortalAccess(profile, 'portal_opened')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar o portal.')
    } finally {
      setLoading(false)
    }
  }, [activeProfileId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPortal()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadPortal])

  async function handleDownload(document: AccountingDocument) {
    if (!activeProfile) return
    setFeedback('')
    setError('')
    try {
      const signedUrl = await createAccountingDocumentSignedUrl(document)
      if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer')
      await logClientPortalAccess(activeProfile, 'document_downloaded', 'accounting_documents', document.id)
      setFeedback('Download liberado com registro de acesso.')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Nao foi possivel baixar o documento.')
    }
  }

  async function handleLinkedDocumentDownload(documentId: string, resourceType: string) {
    if (!activeProfile || !documentId) return
    setFeedback('')
    setError('')
    try {
      const signedUrl = await createAccountingDocumentSignedUrlById(documentId)
      if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer')
      await logClientPortalAccess(activeProfile, 'linked_document_downloaded', resourceType, documentId)
      setFeedback('Download liberado com registro de acesso.')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Nao foi possivel baixar o documento vinculado.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">A</div>
          <div>
            <p className="font-bold text-slate-950">Portal do Cliente</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void loadPortal()} variant="secondary">Atualizar</Button>
          <Button onClick={handleLogout} variant="secondary">Sair</Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-indigo-600">Acesso seguro</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Documentos e pendencias do cliente</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Este portal mostra apenas registros vinculados ao seu cliente. Se precisar trocar de contador futuramente,
            estes dados podem ser usados como base para exportacao historica.
          </p>
        </div>

        {feedback && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{feedback}</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        {profiles.length > 1 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Empresa vinculada
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                value={activeProfile?.id ?? ''}
                onChange={(event) => setActiveProfileId(event.target.value)}
              >
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.email} - {profile.role}</option>)}
              </select>
            </label>
          </div>
        )}

        {loading && <p className="rounded-3xl bg-white p-8 text-sm text-slate-500 shadow-sm">Carregando portal...</p>}

        {!loading && !activeProfile && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-800">
            <h2 className="text-xl font-bold">Acesso nao liberado</h2>
            <p className="mt-2 text-sm leading-6">
              Seu e-mail ainda nao possui vinculo ativo com um cliente. Peça ao escritorio para liberar seu acesso no modulo Documentos Contabeis.
            </p>
          </div>
        )}

        {!loading && activeProfile && (
          <div className="grid gap-6 xl:grid-cols-2">
            <PortalCard title="Documentos">
              {documents.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum documento disponivel.</p>}
              <div className="space-y-3">
                {documents.map((document) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={document.id}>
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <p className="font-semibold text-slate-950">{document.originalFileName}</p>
                        <p className="mt-1 text-xs text-slate-500">{document.category} | Competencia {formatDate(document.competence)}</p>
                        <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(document.approvalStatus)}`}>
                          {document.approvalStatus}
                        </span>
                      </div>
                      <Button className="h-10 px-4 text-xs" onClick={() => void handleDownload(document)} variant="secondary">
                        Baixar
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </PortalCard>

            <PortalCard title="Impostos e guias">
              {taxes.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum imposto cadastrado.</p>}
              <div className="space-y-3">
                {taxes.map((tax) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={tax.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-950">{tax.taxType}</p>
                        <p className="mt-1 text-xs text-slate-500">{tax.description || 'Sem descricao'} | Vence {formatDate(tax.dueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-950">{formatCurrency(tax.amount)}</p>
                        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tax.status)}`}>{tax.status}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className="h-9 px-3 text-xs"
                        disabled={!tax.guideDocumentId}
                        onClick={() => void handleLinkedDocumentDownload(tax.guideDocumentId, 'accounting_tax_records')}
                        variant="secondary"
                      >
                        Baixar guia
                      </Button>
                      <Button
                        className="h-9 px-3 text-xs"
                        disabled={!tax.receiptDocumentId}
                        onClick={() => void handleLinkedDocumentDownload(tax.receiptDocumentId, 'accounting_tax_records')}
                        variant="secondary"
                      >
                        Baixar comprovante
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </PortalCard>

            <PortalCard title="Obrigacoes">
              {obligations.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma obrigacao cadastrada.</p>}
              <div className="space-y-3">
                {obligations.map((obligation) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={obligation.id}>
                    <p className="font-semibold text-slate-950">{obligation.obligationType}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Competencia {formatDate(obligation.competence)} | Vence {formatDate(obligation.dueDate)} | Protocolo {obligation.protocol || 'Nao informado'}
                    </p>
                    <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(obligation.status)}`}>{obligation.status}</span>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className="h-9 px-3 text-xs"
                        disabled={!obligation.guideDocumentId}
                        onClick={() => void handleLinkedDocumentDownload(obligation.guideDocumentId, 'accounting_obligations')}
                        variant="secondary"
                      >
                        Baixar guia/documento
                      </Button>
                      <Button
                        className="h-9 px-3 text-xs"
                        disabled={!obligation.receiptDocumentId}
                        onClick={() => void handleLinkedDocumentDownload(obligation.receiptDocumentId, 'accounting_obligations')}
                        variant="secondary"
                      >
                        Baixar recibo
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </PortalCard>

            <PortalCard title="NF-es">
              {nfes.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma NF-e disponivel.</p>}
              <div className="space-y-3">
                {nfes.map((nfe) => (
                  <article className="rounded-2xl border border-slate-100 p-4" key={nfe.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-950">NF-e {nfe.number || 'sem numero'} / serie {nfe.series || '-'}</p>
                        <p className="mt-1 text-xs text-slate-500">{nfe.accessKey || 'Chave nao informada'}</p>
                        <p className="mt-1 text-xs text-slate-500">Emissao {formatDate(nfe.issueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-950">{formatCurrency(nfe.amount)}</p>
                        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(nfe.status)}`}>{nfe.status}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </PortalCard>
          </div>
        )}
      </main>
    </div>
  )
}
