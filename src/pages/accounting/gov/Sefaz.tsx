import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AccountingTabs } from '../../../components/accounting/AccountingTabs'
import { DashboardLayout } from '../../../components/layout/DashboardLayout'
import { NfeAccessKeySearch } from '../../../components/sefaz/NfeAccessKeySearch'
import { NfeChecklist } from '../../../components/sefaz/NfeChecklist'
import { NfeDfeSearchPanel } from '../../../components/sefaz/NfeDfeSearchPanel'
import { NfeEmissionForm } from '../../../components/sefaz/NfeEmissionForm'
import { NfeNsuStatusCard } from '../../../components/sefaz/NfeNsuStatusCard'
import { NfeStatusCard } from '../../../components/sefaz/NfeStatusCard'
import { NfeValidationAlerts } from '../../../components/sefaz/NfeValidationAlerts'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import {
  listAccountingClients,
  listCertificateServices,
  listCertificates,
  replaceCertificateServices,
} from '../../../services/accountingRepository'
import { resolveOrganizationId } from '../../../services/platformService'
import {
  consultDfeFromSefaz,
  getDfeDocumentXml,
  consultNfeByAccessKey,
  getLatestSefazSyncState,
  listNfeDocuments,
  manifestNfeDocument,
  type ManifestationEventType,
  type SefazQueryType,
  type SefazSyncState,
} from '../../../services/sefazDocumentService'
import { validateSefazReadiness } from '../../../services/nfeValidationService'
import type {
  AccountingClient,
  CertificateServiceCode,
  DigitalCertificate,
  FiscalDocumentDirection,
  NfeDocument,
} from '../../../types/accounting'

type SefazTab = 'consultas' | 'emissao' | 'status'
type SefazAvailability = 'online' | 'instavel' | 'offline'

const tabs: Array<{ id: SefazTab; label: string }> = [
  { id: 'consultas', label: 'Acesso as notas' },
  { id: 'emissao', label: 'Gerar nota fiscal' },
  { id: 'status', label: 'Status da integracao' },
]

const documentTabs: Array<{ id: FiscalDocumentDirection; label: string; description: string }> = [
  { id: 'recebida', label: 'Recebidas', description: 'Notas em que o cliente aparece como destinatario.' },
  { id: 'emitida', label: 'Emitidas', description: 'Notas emitidas pelo CNPJ do cliente.' },
  { id: 'transporte', label: 'Transporte', description: 'Documentos vinculados a transporte/CT-e.' },
  { id: 'citada', label: 'Citadas', description: 'Notas em que o CNPJ aparece como interessado.' },
]

const sefazServiceCodes: CertificateServiceCode[] = [
  'nfe',
  'nfe_consulta',
  'dfe_distribuicao',
  'manifestacao_destinatario',
  'nfe_cancelamento',
  'nfe_cce',
  'nfe_inutilizacao',
  'cte',
  'mdfe',
]

const statusDescriptions = {
  online: {
    dot: 'bg-emerald-500',
    label: 'SEFAZ Online',
    text: 'Ultimo retorno real registrado',
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  instavel: {
    dot: 'bg-amber-400',
    label: 'SEFAZ nao verificada',
    text: 'Pronto localmente, aguardando retorno real',
    wrapper: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  offline: {
    dot: 'bg-rose-500',
    label: 'SEFAZ offline',
    text: 'Selecione cliente e certificado',
    wrapper: 'border-rose-200 bg-rose-50 text-rose-800',
  },
}

const formatCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(value: string) {
  if (!value) return '-'
  const [year, month, day] = value.slice(0, 10).split('-')
  return day && month && year ? `${day}/${month}/${year}` : value
}

function shortKey(value: string) {
  if (!value) return 'Sem chave'
  return value.length > 44 ? `${value.slice(0, 22)}...${value.slice(-8)}` : value
}

function formatEnvironment(value: string | undefined) {
  return value === 'producao' ? 'Producao' : 'Homologacao'
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function inferDirectionFromAccessKey(accessKey: string, client?: AccountingClient | null): FiscalDocumentDirection {
  const emitterCnpj = accessKey.slice(6, 20)
  return emitterCnpj && emitterCnpj === onlyDigits(client?.cnpj ?? '') ? 'emitida' : 'citada'
}

function downloadTextFile(fileName: string, content: string) {
  const file = new Blob([content], { type: 'application/xml;charset=utf-8' })
  const url = window.URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

export function Sefaz() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<SefazTab>('consultas')
  const [documentDirection, setDocumentDirection] = useState<FiscalDocumentDirection>('recebida')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([])
  const [enabledServices, setEnabledServices] = useState<CertificateServiceCode[]>([])
  const [documents, setDocuments] = useState<NfeDocument[]>([])
  const [syncState, setSyncState] = useState<SefazSyncState | null>(null)
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [clientId, setClientId] = useState('')
  const [certificateId, setCertificateId] = useState('')
  const [dateRange, setDateRange] = useState('90')
  const [searchField, setSearchField] = useState('accessKey')
  const [search, setSearch] = useState('')
  const [accessKeyLookup, setAccessKeyLookup] = useState('')
  const [lastConsultation, setLastConsultation] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isConsultingAccessKey, setIsConsultingAccessKey] = useState(false)
  const [isManifesting, setIsManifesting] = useState(false)
  const [isManifestationOpen, setIsManifestationOpen] = useState(false)
  const [manifestationType, setManifestationType] = useState<ManifestationEventType>('210210')
  const [manifestationJustification, setManifestationJustification] = useState('')
  const [isActivatingServices, setIsActivatingServices] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [syncStateError, setSyncStateError] = useState('')
  const selectedCertificate = certificates.find((certificate) => certificate.id === certificateId) ?? null
  const selectedClient = clients.find((client) => client.id === clientId) ?? null
  const selectedUf = selectedCertificate?.stateUf || selectedClient?.state || ''
  const certificateReady = Boolean(
    selectedCertificate?.certificateFileData &&
      selectedCertificate?.certificatePassword &&
      selectedCertificate?.status === 'Ativo',
  )
  const realSefazStatusCode = syncState?.lastStatusCode ?? ''
  const sefazAvailability: SefazAvailability = !selectedCertificate || !certificateReady
    ? 'offline'
    : syncState?.lastErrorMessage
      ? 'offline'
      : realSefazStatusCode
        ? 'online'
        : 'instavel'
  const totalAmount = useMemo(
    () => documents.reduce((total, document) => total + document.amount, 0),
    [documents],
  )
  const dfeReadiness = useMemo(
    () =>
      validateSefazReadiness({
        ambiente: selectedCertificate?.environment,
        backendConfigured: true,
        certificado: selectedCertificate,
        empresa: selectedClient,
        enabledServices,
        senhaCertificado: selectedCertificate?.certificatePassword,
        tipoOperacao: 'distribuicao_dfe',
        uf: selectedUf,
      }),
    [enabledServices, selectedCertificate, selectedClient, selectedUf],
  )
  const accessKeyReadiness = useMemo(
    () =>
      validateSefazReadiness({
        ambiente: selectedCertificate?.environment,
        backendConfigured: true,
        certificado: selectedCertificate,
        chaveAcesso: accessKeyLookup,
        empresa: selectedClient,
        enabledServices,
        senhaCertificado: selectedCertificate?.certificatePassword,
        tipoOperacao: 'consulta_chave',
        uf: selectedUf,
      }),
    [accessKeyLookup, enabledServices, selectedCertificate, selectedClient, selectedUf],
  )
  const emissionReadiness = useMemo(
    () =>
      validateSefazReadiness({
        ambiente: selectedCertificate?.environment,
        backendConfigured: true,
        certificado: selectedCertificate,
        empresa: selectedClient,
        enabledServices,
        senhaCertificado: selectedCertificate?.certificatePassword,
        tipoOperacao: 'emissao_nfe',
        uf: selectedUf,
      }),
    [enabledServices, selectedCertificate, selectedClient, selectedUf],
  )
  const manifestationReadiness = useMemo(
    () =>
      validateSefazReadiness({
        ambiente: selectedCertificate?.environment,
        backendConfigured: true,
        certificado: selectedCertificate,
        empresa: selectedClient,
        enabledServices,
        senhaCertificado: selectedCertificate?.certificatePassword,
        tipoOperacao: 'manifestacao',
        uf: selectedUf,
      }),
    [enabledServices, selectedCertificate, selectedClient, selectedUf],
  )

  useEffect(() => {
    resolveOrganizationId(searchParams.get('organization'))
      .then(async (loadedOrganizationId) => {
        setOrganizationId(loadedOrganizationId)
        const loadedClients = await listAccountingClients(loadedOrganizationId)
        setClients(loadedClients)
        setClientId((current) => current || loadedClients[0]?.id || '')
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar clientes.'),
      )
  }, [searchParams])

  useEffect(() => {
    let active = true

    async function loadClientCertificates() {
      if (!clientId) {
        if (active) {
          setCertificates([])
          setCertificateId('')
        }
        return
      }

      try {
        const loadedCertificates = await listCertificates(clientId)
        const activeCertificates = loadedCertificates.filter((certificate) => certificate.status === 'Ativo')
        if (active) {
          setCertificates(activeCertificates)
          setCertificateId((current) =>
            activeCertificates.some((certificate) => certificate.id === current)
              ? current
              : activeCertificates[0]?.id ?? '',
          )
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar certificados.')
      }
    }

    void loadClientCertificates()
    return () => {
      active = false
    }
  }, [clientId])

  useEffect(() => {
    let active = true

    async function loadServices() {
      if (!certificateId) {
        if (active) setEnabledServices([])
        return
      }

      try {
        const services = await listCertificateServices(certificateId)
        if (active) setEnabledServices(services)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar servicos.')
      }
    }

    void loadServices()
    return () => {
      active = false
    }
  }, [certificateId])

  const loadDocuments = useCallback(async () => {
    if (!organizationId) return

    try {
      const loadedDocuments = await listNfeDocuments(organizationId, clientId, {
        dateRange,
        direction: documentDirection,
        search,
        searchField,
      })
      setDocuments(loadedDocuments)
      setSelectedRows([])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar NF-e/DF-e.')
    }
  }, [clientId, dateRange, documentDirection, organizationId, search, searchField])

  const loadSyncState = useCallback(async () => {
    if (!organizationId || !clientId || !certificateId) {
      setSyncState(null)
      setSyncStateError('')
      return
    }

    try {
      const loadedSyncState = await getLatestSefazSyncState({
        certificateId,
        clientId,
        organizationId,
      })
      setSyncState(loadedSyncState)
      setSyncStateError('')
    } catch (loadError) {
      setSyncState(null)
      setSyncStateError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar status SEFAZ.')
    }
  }, [certificateId, clientId, organizationId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadDocuments(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadDocuments])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSyncState(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadSyncState])

  function changeDocumentDirection(value: FiscalDocumentDirection) {
    setDocumentDirection(value)
    setFeedback(documentTabs.find((item) => item.id === value)?.description ?? '')
    setError('')
  }

  async function refreshDocuments(queryType: SefazQueryType) {
    if (isRefreshing) return

    if (!dfeReadiness.isReady) {
      setError(dfeReadiness.errors[0]?.message ?? 'Revise as pendencias antes de consultar a SEFAZ.')
      setFeedback('')
      return
    }

    if (documentDirection === 'emitida') {
      setError(
        'A consulta DF-e da SEFAZ nao lista o historico de notas emitidas pela propria empresa. Para Emitidas, importe XMLs emitidos, consulte por chave de acesso ou use a emissao fiscal do sistema. Para buscar documentos via DF-e, use Recebidas, Transporte ou Citadas.',
      )
      setFeedback('')
      return
    }
    if (!organizationId || !clientId || !certificateId) {
      setError('Selecione cliente e certificado ativo antes de consultar a SEFAZ.')
      setFeedback('')
      return
    }

    setIsRefreshing(true)
    setError('')
    setFeedback(queryType === 'complete' ? 'Executando consulta completa DF-e...' : 'Executando consulta resumo DF-e...')

    try {
      const result = await consultDfeFromSefaz({
        certificateId,
        clientId,
        direction: documentDirection,
        environment: selectedCertificate?.environment ?? 'homologacao',
        organizationId,
        queryType,
      })
      setLastConsultation(new Date().toLocaleString('pt-BR'))
      const sefazReturn = [
        result.statusCode ? `cStat: ${result.statusCode}` : '',
        result.statusMessage ? `xMotivo: ${result.statusMessage}` : '',
        result.lastNsu ? `ultNSU: ${result.lastNsu}` : '',
        result.maxNsu ? `maxNSU: ${result.maxNsu}` : '',
        `recebidos: ${result.receivedCount}`,
        `inseridos: ${result.insertedCount}`,
        `atualizados: ${result.updatedCount}`,
        result.ignoredCount ? `ignorados: ${result.ignoredCount}` : '',
      ].filter(Boolean).join(' | ')
      setFeedback(
        `${result.message}${sefazReturn ? ` ${sefazReturn}.` : ''}`,
      )
      await loadDocuments()
      await loadSyncState()
    } catch (consultError) {
      setFeedback('')
      setError(consultError instanceof Error ? consultError.message : 'Nao foi possivel consultar a SEFAZ.')
      await loadDocuments()
      await loadSyncState()
    } finally {
      setIsRefreshing(false)
    }
  }

  async function consultAccessKey() {
    const cleanAccessKey = onlyDigits(accessKeyLookup)

    if (!accessKeyReadiness.isReady) {
      setError(accessKeyReadiness.errors[0]?.message ?? 'Revise as pendencias antes de consultar por chave.')
      setFeedback('')
      return
    }

    if (!organizationId || !clientId || !certificateId) return

    setIsConsultingAccessKey(true)
    setError('')
    setFeedback('Consultando NF-e por chave de acesso na SEFAZ...')

    try {
      const result = await consultNfeByAccessKey({
        accessKey: cleanAccessKey,
        certificateId,
        clientId,
        organizationId,
      })
      const nextDirection = inferDirectionFromAccessKey(result.accessKey, selectedClient)
      setLastConsultation(new Date().toLocaleString('pt-BR'))
      setSearch('')
      setDateRange('all')
      setDocumentDirection(nextDirection)
      setFeedback(result.message)
      const refreshedDocuments = await listNfeDocuments(organizationId, clientId, {
        dateRange: 'all',
        direction: nextDirection,
        search: '',
        searchField,
      })
      setDocuments(refreshedDocuments)
      setSelectedRows([])
      await loadSyncState()
    } catch (consultError) {
      setFeedback('')
      setError(consultError instanceof Error ? consultError.message : 'Nao foi possivel consultar por chave.')
      await loadDocuments()
      await loadSyncState()
    } finally {
      setIsConsultingAccessKey(false)
    }
  }

  async function activateServices() {
    if (!certificateId) {
      setError('Selecione um certificado antes de habilitar os servicos.')
      return
    }

    setIsActivatingServices(true)
    setFeedback('Habilitando servicos fiscais no certificado...')
    setError('')

    try {
      await replaceCertificateServices(certificateId, sefazServiceCodes)
      setEnabledServices(sefazServiceCodes)
      setFeedback('Servicos SEFAZ habilitados para este certificado.')
    } catch (activateError) {
      setFeedback('')
      setError(activateError instanceof Error ? activateError.message : 'Nao foi possivel habilitar servicos.')
    } finally {
      setIsActivatingServices(false)
    }
  }

  function toggleRow(documentId: string) {
    setSelectedRows((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    )
  }

  function toggleAllRows() {
    setSelectedRows((current) =>
      current.length === documents.length ? [] : documents.map((document) => document.id),
    )
  }

  async function downloadXml(document: NfeDocument) {
    if (document.xmlUrl?.startsWith('/api/dfe/')) {
      try {
        const xml = await getDfeDocumentXml({
          clientId: document.clientId,
          documentId: document.id,
          organizationId: document.organizationId,
        })
        downloadTextFile(`${document.accessKey || document.nsu || 'dfe'}.xml`, xml)
        return
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : 'Nao foi possivel baixar o XML.')
        setFeedback('')
        return
      }
    }

    if (document.xmlUrl) {
      window.open(document.xmlUrl, '_blank', 'noopener,noreferrer')
      return
    }

    if (!document.rawXml) {
      setError('XML ainda nao esta disponivel para esta nota.')
      setFeedback('')
      return
    }

    downloadTextFile(`${document.accessKey || document.number || 'nfe'}.xml`, document.rawXml)
  }

  function openDanfe(document: NfeDocument) {
    if (document.danfeUrl) {
      window.open(document.danfeUrl, '_blank', 'noopener,noreferrer')
      return
    }

    if (!document.rawXml) {
      setError('DANFE indisponivel: esta nota ainda nao possui XML completo salvo.')
      setFeedback('')
      return
    }

    const parser = new DOMParser()
    const xml = parser.parseFromString(document.rawXml, 'text/xml')
    const value = (tagName: string) => xml.getElementsByTagName(tagName)[0]?.textContent?.trim() || '-'
    const items = Array.from(xml.getElementsByTagName('det')).map((item, index) => ({
      code: item.getElementsByTagName('cProd')[0]?.textContent?.trim() || String(index + 1),
      name: item.getElementsByTagName('xProd')[0]?.textContent?.trim() || 'Item',
      quantity: item.getElementsByTagName('qCom')[0]?.textContent?.trim() || '-',
      total: item.getElementsByTagName('vProd')[0]?.textContent?.trim() || '-',
      unit: item.getElementsByTagName('vUnCom')[0]?.textContent?.trim() || '-',
    }))
    const danfeWindow = window.open('', '_blank')

    if (!danfeWindow) {
      setError('Permita pop-ups para abrir o DANFE.')
      return
    }

    danfeWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <title>DANFE ${document.number || document.accessKey}</title>
          <style>
            body { color: #111827; font-family: Arial, sans-serif; margin: 24px; }
            .box { border: 1px solid #111827; padding: 10px; }
            .grid { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); }
            h1, h2, p { margin: 0; }
            h1 { font-size: 20px; text-align: center; }
            h2 { font-size: 14px; margin-bottom: 6px; }
            table { border-collapse: collapse; margin-top: 12px; width: 100%; }
            th, td { border: 1px solid #111827; font-size: 11px; padding: 6px; text-align: left; }
            .muted { color: #4b5563; font-size: 11px; margin-top: 6px; }
            .top { align-items: stretch; display: grid; gap: 8px; grid-template-columns: 1fr 2fr 1fr; margin-bottom: 8px; }
            @media print { button { display: none; } body { margin: 8px; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()" style="margin-bottom:16px;padding:10px 16px">Imprimir / salvar PDF</button>
          <div class="top">
            <div class="box"><h2>Emitente</h2><p>${value('xNome')}</p><p class="muted">${value('CNPJ')}</p></div>
            <div class="box"><h1>DANFE</h1><p class="muted" style="text-align:center">Documento Auxiliar da Nota Fiscal Eletronica</p></div>
            <div class="box"><h2>NF-e</h2><p>No ${value('nNF')}</p><p>Serie ${value('serie')}</p></div>
          </div>
          <div class="box"><h2>Chave de acesso</h2><p>${document.accessKey}</p></div>
          <div class="grid" style="margin-top:8px">
            <div class="box"><h2>Emissao</h2><p>${formatDate(document.issueDate)}</p></div>
            <div class="box"><h2>Valor total</h2><p>${formatCurrency.format(document.amount)}</p></div>
            <div class="box"><h2>Protocolo</h2><p>${document.protocolNumber || '-'}</p></div>
            <div class="box"><h2>Status</h2><p>${document.status}</p></div>
          </div>
          <div class="box" style="margin-top:8px"><h2>Destinatario</h2><p>${document.destinationName || value('xNome')}</p><p class="muted">${document.destinationDocument || '-'}</p></div>
          <table>
            <thead><tr><th>Codigo</th><th>Produto/Servico</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th></tr></thead>
            <tbody>
              ${items.map((item) => `<tr><td>${item.code}</td><td>${item.name}</td><td>${item.quantity}</td><td>${item.unit}</td><td>${item.total}</td></tr>`).join('')}
            </tbody>
          </table>
          <p class="muted">DANFE gerado pelo CONT HUB a partir do XML salvo. Confira os dados fiscais antes de usar oficialmente.</p>
        </body>
      </html>
    `)
    danfeWindow.document.close()
  }

  function downloadSelectedXmls() {
    const selectedDocuments = documents.filter((document) => selectedRows.includes(document.id))
    const xmlDocuments = selectedDocuments.filter((document) => document.rawXml || document.xmlUrl)

    if (xmlDocuments.length === 0) {
      setError('Selecione notas com XML disponivel para baixar.')
      setFeedback('')
      return
    }

    xmlDocuments.forEach(downloadXml)
    setFeedback(`${xmlDocuments.length} XML(s) enviado(s) para download.`)
    setError('')
  }

  function prepareManifestation() {
    if (!manifestationReadiness.isReady) {
      setError(manifestationReadiness.errors[0]?.message ?? 'Revise as pendencias antes de manifestar.')
      setFeedback('')
      return
    }

    if (selectedRows.length === 0) {
      setError('Selecione uma ou mais notas para manifestar.')
      setFeedback('')
      return
    }

    setError('')
    setIsManifestationOpen(true)
  }

  async function submitManifestation() {
    if (!organizationId || !clientId || !certificateId) {
      setError('Selecione cliente e certificado antes de manifestar.')
      setFeedback('')
      return
    }

    setIsManifesting(true)
    setFeedback('Enviando manifestacao para a SEFAZ...')
    setError('')

    try {
      for (const documentId of selectedRows) {
        await manifestNfeDocument({
          certificateId,
          clientId,
          documentId,
          eventType: manifestationType,
          justification: manifestationJustification,
          organizationId,
        })
      }

      await loadDocuments()
      setFeedback(`${selectedRows.length} manifestacao(oes) enviada(s) para a SEFAZ.`)
      setIsManifestationOpen(false)
      setSelectedRows([])
      setManifestationJustification('')
    } catch (manifestError) {
      setFeedback('')
      setError(manifestError instanceof Error ? manifestError.message : 'Nao foi possivel manifestar a NF-e.')
    } finally {
      setIsManifesting(false)
    }
  }

  return (
    <DashboardLayout title="SEFAZ">
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Documentos fiscais</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Listagem NF-es</h2>
          <p className="mt-2 text-sm text-slate-500">
            Central para consultar, filtrar, baixar XML/DANFE e preparar manifestacao por certificado digital.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <SefazStatusLight status={sefazAvailability} />
          <p className="text-xs text-slate-500">
            Ultima consulta: {lastConsultation || 'nenhuma consulta nesta sessao'}
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <Select id="sefaz-client" label="Empresa / cliente" onChange={setClientId} value={clientId}>
          <option value="">Selecione...</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              [{client.state || '--'}] {client.cnpj || 'CNPJ nao informado'} {client.companyName}
            </option>
          ))}
        </Select>
        <Select id="sefaz-cert" label="Certificado digital ativo" onChange={setCertificateId} value={certificateId}>
          <option value="">Selecione apos cadastrar o certificado...</option>
          {certificates.map((certificate) => (
            <option key={certificate.id} value={certificate.id}>
              {certificate.certificateType} - {certificate.holderName}
            </option>
          ))}
        </Select>
        <Button
          disabled={!selectedCertificate}
          isLoading={isActivatingServices}
          onClick={() => void activateServices()}
          type="button"
          variant="secondary"
        >
          Habilitar servicos
        </Button>
      </div>

      {selectedClient && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <strong className="text-slate-900">{selectedClient.companyName}</strong>
          <span className="ml-2">{selectedClient.cnpj || 'CNPJ nao informado'}</span>
          <span className="ml-2">{selectedClient.city || '-'} / {selectedClient.state || '-'}</span>
        </div>
      )}

      {selectedCertificate && (
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <NfeStatusCard
            label="Ambiente"
            ok={selectedCertificate.environment === 'producao'}
            value={formatEnvironment(selectedCertificate.environment)}
          />
          <NfeStatusCard label="UF SEFAZ" ok={Boolean(selectedCertificate.stateUf)} value={selectedCertificate.stateUf || 'Nao informada'} />
          <NfeStatusCard label="Arquivo PFX/P12" ok={Boolean(selectedCertificate.certificateFileData)} value={selectedCertificate.certificateFileName || 'Nao anexado'} />
          <NfeStatusCard label="Senha" ok={Boolean(selectedCertificate.certificatePassword)} value={selectedCertificate.certificatePassword ? 'Cadastrada' : 'Nao cadastrada'} />
        </div>
      )}

      {selectedCertificate && selectedCertificate.environment !== 'producao' && (
        <div className="mb-5">
          <Alert type="error">
            Este certificado esta em Homologacao. Para consultar notas reais emitidas ou recebidas, altere o certificado para Producao em Gestao de Clientes &gt; Certificados.
          </Alert>
        </div>
      )}

      <AccountingTabs activeTab={tab} onChange={setTab} tabs={tabs} />
      {error && <div className="mt-5"><Alert type="error">{error}</Alert></div>}
      {feedback && <div className="mt-5"><Alert type="info">{feedback}</Alert></div>}

      {tab === 'consultas' && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <NfeValidationAlerts result={dfeReadiness} title="Pendencias para consulta DF-e/NSU" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {documentTabs.map((item) => (
              <button
                className={`rounded-xl border px-4 py-4 text-center text-sm font-semibold transition ${
                  documentDirection === item.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                    : 'border-slate-200 text-slate-500 hover:border-indigo-200'
                }`}
                key={item.id}
                onClick={() => changeDocumentDirection(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <NfeDfeSearchPanel isLoading={isRefreshing} onConsult={(queryType) => void refreshDocuments(queryType)} />
            <ToolbarButton label="Colunas" onClick={() => setFeedback('Colunas padrao: DANFE, emissao, chave, empresa, valor e manifestacao.')} />
            <ToolbarButton label="Filtrar" onClick={() => void loadDocuments()} />
            <ToolbarButton label="Relatorios" onClick={() => setFeedback('Relatorios fiscais serao gerados com base nos documentos selecionados.')} />
            <ToolbarButton label="Etiquetas" onClick={() => setFeedback('Etiquetas fiscais preparadas para classificacao futura.')} />
            <ToolbarButton label="Envio e Download" onClick={downloadSelectedXmls} />
            <ToolbarButton label="Manifestar" onClick={prepareManifestation} />
            <ToolbarButton label="Validar dados" onClick={() => setTab('status')} />
            <ToolbarButton label="Atualizar NSU" onClick={() => void refreshDocuments('summary')} />
            <ToolbarButton label="Ver SQL necessario" onClick={() => setFeedback('Arquivo gerado em supabase/sql/required-nfe-schema.sql. Rode no Supabase se aparecer alerta de campo/tabela faltando.')} />
            <ToolbarButton label="Ver logs SEFAZ" onClick={() => setTab('status')} />
          </div>

          <div className="mt-5">
            <NfeAccessKeySearch
              accessKey={accessKeyLookup}
              isLoading={isConsultingAccessKey}
              onChange={setAccessKeyLookup}
              onConsult={() => void consultAccessKey()}
            />
            {accessKeyLookup && (
              <div className="mt-3">
                <NfeValidationAlerts result={accessKeyReadiness} title="Pendencias para consulta por chave" />
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[190px_1fr_220px]">
            <Select id="search-field" label="Buscar por" onChange={setSearchField} value={searchField}>
              <option value="accessKey">Chave de acesso</option>
              <option value="number">Numero da NF-e</option>
              <option value="company">Empresa</option>
              <option value="document">CNPJ/CPF</option>
            </Select>
            <Input
              id="nfe-search"
              label="Pesquisa"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadDocuments()
              }}
              placeholder="Busque por numero, chave, empresa ou documento"
              value={search}
            />
            <Select id="date-range" label="Data de emissao" onChange={setDateRange} value={dateRange}>
              <option value="30">Ultimos 30 dias</option>
              <option value="90">Ultimos 90 dias</option>
              <option value="180">Ultimos 180 dias</option>
              <option value="365">Ultimos 12 meses</option>
              <option value="all">Todo periodo</option>
            </Select>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Valor total da(s) <strong>{documents.length}</strong> nota(s) do filtro aplicado:{' '}
            <strong className="text-slate-900">{formatCurrency.format(totalAmount)}</strong>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700"
              onClick={toggleAllRows}
              type="button"
            >
              Selecionar todas {selectedRows.length}/{documents.length}
            </button>
            <p className="text-xs text-slate-500">
              A consulta direta usa DF-e/NSU para documentos de interesse. Emitidas aparecem quando forem importadas, emitidas pelo sistema ou consultadas por chave.
            </p>
          </div>

          <NfeGrid
            documents={documents}
            onOpenDanfe={openDanfe}
            onDownloadXml={downloadXml}
            onToggleRow={toggleRow}
            selectedRows={selectedRows}
          />
        </section>
      )}

      {isManifestationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">SEFAZ</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Manifestar NF-e</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Selecione o evento que sera assinado com o certificado ativo e transmitido para a SEFAZ.
                </p>
              </div>
              <button
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                onClick={() => setIsManifestationOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <Select
                id="manifestation-type"
                label="Tipo de manifestacao"
                onChange={(value) => setManifestationType(value as ManifestationEventType)}
                value={manifestationType}
              >
                <option value="210210">Ciencia da Operacao</option>
                <option value="210200">Confirmacao da Operacao</option>
                <option value="210220">Desconhecimento da Operacao</option>
                <option value="210240">Operacao nao Realizada</option>
              </Select>
              <label className="block space-y-2 text-sm font-medium text-slate-700">
                <span>Justificativa</span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-500"
                  disabled={manifestationType !== '210240'}
                  onChange={(event) => setManifestationJustification(event.target.value)}
                  placeholder="Obrigatoria apenas para Operacao nao Realizada"
                  value={manifestationJustification}
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                {selectedRows.length} nota(s) selecionada(s). O evento sera enviado uma a uma.
              </div>
              <Button isLoading={isManifesting} onClick={() => void submitManifestation()} type="button">
                {isManifesting ? 'Enviando manifestacao...' : 'Enviar manifestacao'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'emissao' && (
        <NfeEmissionForm
          certificate={selectedCertificate}
          client={selectedClient}
          key={`${selectedClient?.id ?? 'sem-cliente'}-${selectedCertificate?.id ?? 'sem-certificado'}`}
          onDocumentsChanged={async () => {
            await loadDocuments()
            await loadSyncState()
          }}
          onError={setError}
          onFeedback={setFeedback}
          organizationId={organizationId}
          readiness={emissionReadiness}
        />
      )}

      {tab === 'status' && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Status e requisitos tecnicos</h3>
              <p className="mt-2 text-sm text-slate-500">
                Caminho direto iniciado com Distribuicao DF-e, consulta por chave e manifestacao via endpoints internos.
              </p>
            </div>
            <SefazStatusLight status={sefazAvailability} />
          </div>

          {syncStateError && <div className="mt-5"><Alert type="warning">{syncStateError}</Alert></div>}

          <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <NfeStatusCard label="Empresa" ok={Boolean(selectedClient)} value={selectedClient?.companyName || 'Nao selecionada'} />
            <NfeStatusCard label="CNPJ" ok={Boolean(selectedClient?.cnpj)} value={selectedClient?.cnpj || 'Nao informado'} />
            <NfeStatusCard label="UF SEFAZ" ok={Boolean(selectedUf)} value={selectedUf || 'Nao informada'} />
            <NfeStatusCard label="Ambiente" ok={selectedCertificate?.environment === 'producao'} value={formatEnvironment(selectedCertificate?.environment)} />
            <NfeStatusCard label="Certificado" ok={Boolean(selectedCertificate)} value={selectedCertificate?.holderName || 'Nao selecionado'} />
            <NfeStatusCard label="Validade" ok={Boolean(selectedCertificate?.validUntil)} value={formatDate(selectedCertificate?.validUntil ?? '')} />
            <NfeStatusCard label="Arquivo PFX/P12" ok={Boolean(selectedCertificate?.certificateFileData)} value={selectedCertificate?.certificateFileName || 'Nao anexado'} />
            <NfeStatusCard label="Senha cadastrada" ok={Boolean(selectedCertificate?.certificatePassword)} value={selectedCertificate?.certificatePassword ? 'Sim' : 'Nao'} />
            <NfeStatusCard label="Status SEFAZ" ok={sefazAvailability === 'online'} value={statusDescriptions[sefazAvailability].label} />
            <NfeStatusCard label="Ultima consulta" ok={Boolean(syncState?.lastSuccessAt || lastConsultation)} value={syncState?.lastSuccessAt || lastConsultation || 'Nao informada'} />
            <NfeStatusCard label="Ultimo cStat" ok={Boolean(syncState?.lastStatusCode)} value={syncState?.lastStatusCode || 'Nao informado'} />
            <NfeStatusCard label="Ultimo xMotivo" ok={Boolean(syncState?.lastStatusMessage)} value={syncState?.lastStatusMessage || 'Nao informado'} />
            <NfeStatusCard label="Ultimo NSU" ok={Boolean(syncState?.lastNsu)} value={syncState?.lastNsu || '000000000000000'} />
            <NfeStatusCard label="Max NSU" ok={Boolean(syncState?.maxNsu)} value={syncState?.maxNsu || '000000000000000'} />
            <NfeStatusCard label="Webservice" ok value="NFeDistribuicaoDFe / NFeConsultaProtocolo4" />
            <NfeStatusCard label="Modo atual" ok value="Real via API interna" />
            <NfeStatusCard label="Notas encontradas" ok value={`${documents.length}`} />
            <NfeStatusCard label="Ultimo erro tecnico" ok={!syncState?.lastErrorMessage} value={syncState?.lastErrorMessage || 'Nenhum'} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <NfeNsuStatusCard state={syncState} />
            <NfeChecklist result={dfeReadiness} />
          </div>

          <div className="mt-6">
            <NfeValidationAlerts result={dfeReadiness} title="Pendencias para consulta" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Requirement title="Consulta DF-e / XML" status="Implementado" description="Usa NFeDistribuicaoDFe, certificado A1, ultimo NSU e grava XML/resumo retornado." />
            <Requirement title="Manifestacao do destinatario" status="Implementado" description="Usa RecepcaoEvento, XML de evento, assinatura digital e atualiza o status da nota." />
            <Requirement title="Emissao NF-e" status="Proximo passo" description="A tela salva rascunho. A autorizacao real ainda precisa montar XML 4.00, assinar, validar XSD, transmitir e consultar recibo." />
            <Requirement title="DANFE" status="Implementado" description="Gera uma visualizacao imprimivel a partir do XML autorizado salvo no banco." />
          </div>
        </section>
      )}
    </DashboardLayout>
  )
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function Requirement({ description, status, title }: { description: string; status: string; title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-slate-900">{title}</p>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{status}</span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function SefazStatusLight({ status }: { status: SefazAvailability }) {
  const config = statusDescriptions[status]

  return (
    <div className={`inline-flex min-w-56 items-center gap-3 rounded-xl border px-4 py-3 text-sm ${config.wrapper}`}>
      <span className={`h-3 w-3 rounded-full ${config.dot}`} />
      <span>
        <span className="block font-semibold">{config.label}</span>
        <span className="text-xs opacity-80">{config.text}</span>
      </span>
    </div>
  )
}

function Select({ children, id, label, onChange, value }: { children: React.ReactNode; id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
      <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" id={id} onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>
    </div>
  )
}

function NfeGrid({
  documents,
  onDownloadXml,
  onOpenDanfe,
  onToggleRow,
  selectedRows,
}: {
  documents: NfeDocument[]
  onDownloadXml: (document: NfeDocument) => void
  onOpenDanfe: (document: NfeDocument) => void
  onToggleRow: (documentId: string) => void
  selectedRows: string[]
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-4">Sel.</th>
            <th className="pb-4">Ver DANFE</th>
            <th className="pb-4">Emissao</th>
            <th className="pb-4">Chave de acesso</th>
            <th className="pb-4">Empresa</th>
            <th className="pb-4">Valor</th>
            <th className="pb-4">Prazo manifestacao</th>
            <th className="pb-4">Baixar</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr className="border-t border-slate-100 hover:bg-slate-50" key={document.id}>
              <td className="py-4">
                <input
                  checked={selectedRows.includes(document.id)}
                  onChange={() => onToggleRow(document.id)}
                  type="checkbox"
                />
              </td>
              <td className="py-4">
                {document.danfeUrl ? (
                  <a className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white" href={document.danfeUrl} rel="noreferrer" target="_blank">
                    Ver DANFE
                  </a>
                ) : document.rawXml ? (
                  <button
                    className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() => onOpenDanfe(document)}
                    type="button"
                  >
                    Ver DANFE
                  </button>
                ) : (
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                    Indisponivel
                  </span>
                )}
              </td>
              <td className="py-4 text-slate-600">{formatDate(document.issueDate)}</td>
              <td className="py-4 font-mono text-xs text-slate-500" title={document.accessKey}>
                {shortKey(document.accessKey)}
              </td>
              <td className="py-4 text-slate-700">
                <span className="block font-semibold">{document.emitterName || document.recipientName || '-'}</span>
                <span className="text-xs text-slate-400">{document.emitterDocument || document.recipientDocument || '-'}</span>
              </td>
              <td className="py-4 font-semibold text-slate-700">{formatCurrency.format(document.amount)}</td>
              <td className="py-4">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  document.manifestationStatus === 'Pendente'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {document.manifestationDeadline
                    ? `${formatDate(document.manifestationDeadline)} - ${document.manifestationStatus}`
                    : document.manifestationStatus || 'Pendente'}
                </span>
              </td>
              <td className="py-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                    onClick={() => onDownloadXml(document)}
                    type="button"
                  >
                    XML
                  </button>
                  {document.danfeUrl && (
                    <a
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                      href={document.danfeUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {documents.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          Nenhuma NF-e/DF-e encontrada para este filtro.
        </p>
      )}
    </div>
  )
}
