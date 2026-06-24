import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PeriodFilter } from '../../components/accounting/PeriodFilter'
import { StatusBadge } from '../../components/accounting/StatusBadge'
import { ImportarDocumentoCliente } from '../../components/clientes/ImportarDocumentoCliente'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PaginationControls } from '../../components/ui/PaginationControls'
import { usePagination } from '../../hooks/usePagination'
import {
  createAccountingClient,
  createCertificate,
  createClientDocument,
  createClientPayment,
  deleteAccountingClient,
  deleteClientDocument,
  listAccountingClients,
  listCertificateServices,
  listCertificates,
  listClientDocuments,
  listClientPayments,
  markPaymentPaid,
  updateAccountingClient,
  updateCertificate,
} from '../../services/accountingRepository'
import { findAddressDetailsByCep } from '../../services/cepService'
import type { ImportedClientDocument, ImportedClientDocumentFile } from '../../services/documentImportService'
import { getFiscalCompanyProfile, listFiscalProducts, listFiscalRules } from '../../services/fiscalRepository'
import { resolveOrganizationId } from '../../services/platformService'
import type {
  AccountingClient,
  AccountingClientDocument,
  ClientCompanySize,
  CertificateService,
  CertificateServiceCode,
  CertificateType,
  ClientMonthlyPayment,
  ClientTaxRegime,
  DigitalCertificate,
} from '../../types/accounting'
import type { FiscalCompanyProfile, FiscalProduct, FiscalRule } from '../../types/fiscal'
import { formatCnpj, formatPhone, formatPostalCode, isValidEmail } from '../../utils/formatters'

type ManagementTab = 'cadastros' | 'pagamentos' | 'certificados'
type ClientForm = Omit<AccountingClient, 'id' | 'organizationId' | 'active'>
type ClientTextField = Exclude<keyof ClientForm, 'isMonthly' | 'monthlyFee'>
type SavingAction = 'client' | 'certificate' | 'clients-import' | 'payments-import' | null
type FiscalClientSummary = {
  label: string
  tone: 'emerald' | 'amber' | 'rose' | 'slate'
  issues: string[]
}

const blankClient: ClientForm = {
  companyName: '',
  cnpj: '',
  phone: '',
  email: '',
  cep: '',
  address: '',
  addressNumber: '',
  addressComplement: '',
  neighborhood: '',
  city: '',
  state: '',
  cityIbgeCode: '',
  stateRegistration: '',
  municipalRegistration: '',
  taxRegime: 'Nao informado',
  companySize: 'Nao informado',
  mainCnae: '',
  legalNature: '',
  photoData: '',
  isMonthly: true,
  monthlyFee: 0,
}

const taxRegimeOptions: ClientTaxRegime[] = [
  'Nao informado',
  'MEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Imune',
  'Isento',
  'Produtor Rural',
  'Outros',
]

const companySizeOptions: ClientCompanySize[] = [
  'Nao informado',
  'MEI',
  'ME',
  'EPP',
  'Medio porte',
  'Grande porte',
  'Demais',
]

const clientCsvTemplate =
  'razao_social;cnpj;telefone;email;cep;endereco;numero;complemento;bairro;cidade;estado;codigo_ibge_municipio;inscricao_estadual;inscricao_municipal;regime_tributario;porte;cnae_principal;natureza_juridica;mensalista;valor_mensal\n'

const serviceGroups: Array<{
  name: string
  services: Array<{ code: CertificateServiceCode; label: string; description: string }>
}> = [
  {
    name: 'SEFAZ / Documentos fiscais',
    services: [
      { code: 'nfe', label: 'NF-e', description: 'Base de notas fiscais eletronicas.' },
      { code: 'nfe_emissao', label: 'Emissao NF-e', description: 'Assinar XML e transmitir para autorizacao.' },
      { code: 'nfe_consulta', label: 'Consulta NF-e', description: 'Consultar notas, protocolos e chaves de acesso.' },
      { code: 'nfe_cancelamento', label: 'Cancelamento NF-e', description: 'Cancelar nota dentro das regras da UF.' },
      { code: 'nfe_cce', label: 'Carta de Correcao', description: 'Emitir CC-e quando permitido.' },
      { code: 'nfe_inutilizacao', label: 'Inutilizacao', description: 'Inutilizar numeracao de NF-e.' },
      { code: 'dfe_distribuicao', label: 'Distribuicao DF-e', description: 'Buscar XMLs/autorizacoes vinculadas ao CNPJ.' },
      { code: 'manifestacao_destinatario', label: 'Manifestacao do destinatario', description: 'Ciencia, confirmacao, desconhecimento e operacao nao realizada.' },
      { code: 'nfce', label: 'NFC-e', description: 'Cupom fiscal eletronico quando a UF permitir.' },
      { code: 'cte', label: 'CT-e', description: 'Conhecimento de transporte eletronico.' },
      { code: 'mdfe', label: 'MDF-e', description: 'Manifesto de documentos fiscais eletronicos.' },
      { code: 'nfse', label: 'NFS-e', description: 'Servico municipal/nacional conforme provedor.' },
    ],
  },
  {
    name: 'Receita Federal / e-CAC',
    services: [
      { code: 'ecac', label: 'e-CAC', description: 'Acesso geral com certificado/procuracao.' },
      { code: 'ecac_caixa_postal', label: 'Caixa postal', description: 'Mensagens, comunicacoes e intimacoes.' },
      { code: 'ecac_situacao_fiscal', label: 'Situacao fiscal', description: 'Pendencias e relatorios fiscais.' },
      { code: 'ecac_certidoes', label: 'Certidoes', description: 'CND/regularidade quando disponivel.' },
      { code: 'ecac_processos_digitais', label: 'Processos digitais', description: 'Acompanhamento de processos e requerimentos.' },
      { code: 'ecac_dctfweb', label: 'DCTFWeb', description: 'Declaracoes, guias e situacao de debitos.' },
      { code: 'ecac_perdcomp', label: 'PER/DCOMP', description: 'Ressarcimento, restituicao e compensacao.' },
    ],
  },
  {
    name: 'SPED / Obrigações federais',
    services: [
      { code: 'sped_reinf', label: 'EFD-Reinf', description: 'Eventos e consulta por certificado/autorizacao.' },
      { code: 'simples_nacional', label: 'Simples Nacional / DAS', description: 'Consultas e guias quando o portal/API permitir.' },
    ],
  },
]

interface ClientManagementProps {
  initialTab?: ManagementTab
}

const formatCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const fiscalSummaryToneClasses: Record<FiscalClientSummary['tone'], string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
}

function downloadCsv(fileName: string, content: string) {
  const file = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

function csvRows(content: string) {
  return content
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(';').map((value) => value.trim()))
    .filter((row) => row.some(Boolean))
}

function parseBoolean(value: string | undefined) {
  const normalizedValue = (value ?? '').trim().toLowerCase()
  return ['sim', 's', 'true', '1', 'mensalista'].includes(normalizedValue)
}

function parseCurrencyValue(value: string | undefined) {
  return Number((value ?? '0').replace(/\./g, '').replace(',', '.')) || 0
}

function normalizeTaxRegime(value: string | undefined): ClientTaxRegime {
  const found = taxRegimeOptions.find((option) => option.toLowerCase() === (value ?? '').trim().toLowerCase())
  return found ?? 'Nao informado'
}

function normalizeCompanySize(value: string | undefined): ClientCompanySize {
  const found = companySizeOptions.find((option) => option.toLowerCase() === (value ?? '').trim().toLowerCase())
  return found ?? 'Nao informado'
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function certificateState(certificates: DigitalCertificate[]) {
  const activeCertificate = certificates.find((certificate) => certificate.status === 'Ativo')

  if (!activeCertificate) return 'Certificado ausente'

  const validUntil = new Date(activeCertificate.validUntil)
  if (Number.isNaN(validUntil.getTime())) return ''

  const today = new Date()
  const daysUntilExpiration = Math.ceil((validUntil.getTime() - today.getTime()) / 86_400_000)

  if (daysUntilExpiration < 0) return 'Certificado vencido'
  if (daysUntilExpiration <= 30) return 'Certificado proximo do vencimento'
  return ''
}

function buildFiscalClientSummary(
  profile: FiscalCompanyProfile | null,
  products: FiscalProduct[],
  rules: FiscalRule[],
  certificates: DigitalCertificate[],
): FiscalClientSummary {
  const issues = [
    certificateState(certificates),
    !profile && 'Perfil fiscal pendente',
    profile?.approvalStatus && profile.approvalStatus !== 'Aprovado' && 'Perfil fiscal pendente',
    products.filter((product) => product.active).length === 0 && 'Produtos sem tributacao',
    products.some((product) => product.active && product.itemType !== 'Servico' && product.ncm.replace(/\D/g, '').length !== 8) &&
      'Produtos sem tributacao',
    rules.filter((rule) => rule.active && rule.approvalStatus === 'Aprovada').length === 0 && 'Regras fiscais pendentes',
  ].filter(Boolean) as string[]

  if (issues.length === 0) {
    return { issues: [], label: 'Pronta para emissao', tone: 'emerald' }
  }

  if (issues.some((issue) => issue.includes('vencido') || issue.includes('ausente'))) {
    return { issues, label: 'Bloqueada', tone: 'rose' }
  }

  if (issues.some((issue) => issue.includes('proximo'))) {
    return { issues, label: 'Atencao fiscal', tone: 'amber' }
  }

  return { issues, label: 'Configuracao parcial', tone: 'amber' }
}

export function ClientManagement({ initialTab = 'cadastros' }: ClientManagementProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientFormRef = useRef<HTMLFormElement | null>(null)
  const [tab, setTab] = useState<ManagementTab>(initialTab)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [clientDocuments, setClientDocuments] = useState<AccountingClientDocument[]>([])
  const [payments, setPayments] = useState<ClientMonthlyPayment[]>([])
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [form, setForm] = useState<ClientForm>(blankClient)
  const [isClientFormOpen, setIsClientFormOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientStatusFilter, setClientStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [clientTaxRegimeFilter, setClientTaxRegimeFilter] = useState<ClientTaxRegime | 'todos'>('todos')
  const [clientCompanySizeFilter, setClientCompanySizeFilter] = useState<ClientCompanySize | 'todos'>('todos')
  const [clientMonthlyFilter, setClientMonthlyFilter] = useState<'todos' | 'mensalistas' | 'avulsos'>('todos')
  const [pendingImportedFile, setPendingImportedFile] = useState<ImportedClientDocumentFile | null>(null)
  const [documentsClientId, setDocumentsClientId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [fiscalClientSummaries, setFiscalClientSummaries] = useState<Record<string, FiscalClientSummary>>({})
  const [isSearchingCep, setIsSearchingCep] = useState(false)
  const [savingAction, setSavingAction] = useState<SavingAction>(null)
  const [isLoadingCertificateClient, setIsLoadingCertificateClient] = useState(false)
  const [markingPaymentId, setMarkingPaymentId] = useState<string | null>(null)
  const [certificateType, setCertificateType] = useState<CertificateType>('e-CNPJ')
  const [certificateStatus, setCertificateStatus] = useState<DigitalCertificate['status']>('Ativo')
  const [certificateEnvironment, setCertificateEnvironment] = useState<DigitalCertificate['environment']>('homologacao')
  const [holderName, setHolderName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [issuer, setIssuer] = useState('')
  const [stateUf, setStateUf] = useState('')
  const [municipalCode, setMunicipalCode] = useState('')
  const [secureReference, setSecureReference] = useState('')
  const [certificatePassword, setCertificatePassword] = useState('')
  const [certificateFileName, setCertificateFileName] = useState('')
  const [certificateFileSize, setCertificateFileSize] = useState(0)
  const [certificateFileData, setCertificateFileData] = useState('')
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null)
  const [showCertificatePassword, setShowCertificatePassword] = useState(false)
  const [visibleCertificatePasswordId, setVisibleCertificatePasswordId] = useState<string | null>(null)
  const [enabledServices, setEnabledServices] = useState<CertificateService['serviceCode'][]>([])
  const fiscalSummaryRequestRef = useRef(0)
  const years = [currentDate.getFullYear(), currentDate.getFullYear() - 1]
  const {
    page: clientsPage,
    pageSize: clientsPageSize,
    setPage: setClientsPage,
    setPageSize: setClientsPageSize,
  } = usePagination({ initialPageSize: 10 })
  const filteredClients = useMemo(() => {
    const search = clientSearch.trim().toLowerCase()

    return clients.filter((client) => {
      const matchesSearch =
        !search ||
        [
          client.companyName,
          client.cnpj,
          client.phone,
          client.email,
          client.city,
          client.state,
          client.neighborhood,
          client.taxRegime,
          client.companySize,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))

      const matchesStatus =
        clientStatusFilter === 'todos' ||
        (clientStatusFilter === 'ativos' && client.active) ||
        (clientStatusFilter === 'inativos' && !client.active)

      const matchesTaxRegime =
        clientTaxRegimeFilter === 'todos' || client.taxRegime === clientTaxRegimeFilter

      const matchesCompanySize =
        clientCompanySizeFilter === 'todos' || client.companySize === clientCompanySizeFilter

      const matchesMonthly =
        clientMonthlyFilter === 'todos' ||
        (clientMonthlyFilter === 'mensalistas' && client.isMonthly) ||
        (clientMonthlyFilter === 'avulsos' && !client.isMonthly)

      return matchesSearch && matchesStatus && matchesTaxRegime && matchesCompanySize && matchesMonthly
    })
  }, [clientCompanySizeFilter, clientMonthlyFilter, clientSearch, clientStatusFilter, clientTaxRegimeFilter, clients])

  const paginatedClients = useMemo(() => {
    const start = (clientsPage - 1) * clientsPageSize
    return filteredClients.slice(start, start + clientsPageSize)
  }, [clientsPage, clientsPageSize, filteredClients])
  const clientsTotalPages = Math.max(Math.ceil(filteredClients.length / clientsPageSize), 1)
  const preservedSearch = useMemo(() => {
    const text = searchParams.toString()
    return text ? `?${text}` : ''
  }, [searchParams])

  useEffect(() => {
    if (clientsPage <= clientsTotalPages) return
    const timeoutId = window.setTimeout(() => setClientsPage(clientsTotalPages), 0)
    return () => window.clearTimeout(timeoutId)
  }, [clientsPage, clientsTotalPages, setClientsPage])

  useEffect(() => {
    const requestedTab = searchParams.get('tab') as ManagementTab | null
    if (!requestedTab || !(['cadastros', 'pagamentos', 'certificados'] as ManagementTab[]).includes(requestedTab)) return
    if (requestedTab === tab) return

    const timeoutId = window.setTimeout(() => setTab(requestedTab), 0)
    return () => window.clearTimeout(timeoutId)
  }, [searchParams, tab])

  async function reloadClients(targetOrganizationId: string | null) {
    setClients(await listAccountingClients(targetOrganizationId))
  }

  useEffect(() => {
    let active = true

    resolveOrganizationId(searchParams.get('organization'))
      .then(async (id) => {
        if (!active) return
        setOrganizationId(id)
        await reloadClients(id)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar.')
      })

    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    listClientPayments(organizationId, month, year)
      .then(setPayments)
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar pagamentos.'),
      )
  }, [month, organizationId, year])

  useEffect(() => {
    let active = true

    async function loadSelectedCertificates() {
      if (!selectedClientId) {
        if (active) setCertificates([])
        return
      }

      try {
        const loadedCertificates = await listCertificates(selectedClientId)
        if (active) setCertificates(loadedCertificates)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar certificados.')
        }
      }
    }

    void loadSelectedCertificates()
    return () => {
      active = false
    }
  }, [selectedClientId])

  useEffect(() => {
    const requestId = ++fiscalSummaryRequestRef.current

    if (!organizationId || clients.length === 0) {
      const clearTimer = window.setTimeout(() => {
        if (requestId === fiscalSummaryRequestRef.current) setFiscalClientSummaries({})
      }, 0)

      return () => window.clearTimeout(clearTimer)
    }

    const clientsSnapshot = clients
    const scopedOrganizationId = organizationId

    async function loadFiscalSummaries() {
      const entries = await Promise.all(
        clientsSnapshot.map(async (client) => {
          try {
            const [profile, products, rules, clientCertificates] = await Promise.all([
              getFiscalCompanyProfile(scopedOrganizationId, client.id),
              listFiscalProducts(scopedOrganizationId, client.id),
              listFiscalRules(scopedOrganizationId, client.id),
              listCertificates(client.id),
            ])

            return [client.id, buildFiscalClientSummary(profile, products, rules, clientCertificates)] as const
          } catch {
            return [
              client.id,
              {
                issues: ['Resumo fiscal nao carregado'],
                label: 'Nao verificado',
                tone: 'slate',
              },
            ] as const
          }
        }),
      )

      if (requestId === fiscalSummaryRequestRef.current) {
        setFiscalClientSummaries(Object.fromEntries(entries))
      }
    }

    void loadFiscalSummaries()
  }, [clients, organizationId])

  function updateField(field: ClientTextField, value: string) {
    const nextValue =
      field === 'cep'
        ? formatPostalCode('BR', value)
        : field === 'phone'
          ? formatPhone('BR', value)
          : field === 'cnpj'
            ? formatCnpj(value)
          : value

    setForm((current) => ({ ...current, [field]: nextValue }))
    setError('')
  }

  function updateMonthlyField(field: 'isMonthly' | 'monthlyFee', value: boolean | number) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function openNewClientForm() {
    setTab('cadastros')
    setEditingId(null)
    setForm(blankClient)
    setPendingImportedFile(null)
    setIsClientFormOpen(true)
    setFeedback('')
    setError('')
    window.setTimeout(() => {
      clientFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function closeClientForm() {
    setIsClientFormOpen(false)
    setEditingId(null)
    setForm(blankClient)
    setPendingImportedFile(null)
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem valido.')
      event.target.value = ''
      return
    }

    if (file.size > 1_500_000) {
      setError('Use uma imagem com ate 1.5 MB para salvar direto na tabela.')
      event.target.value = ''
      return
    }

    try {
      updateField('photoData', await readFileAsDataUrl(file))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel carregar a imagem.')
    }
  }

  async function handleCertificateFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!/\.(pfx|p12)$/i.test(file.name)) {
      setError('Selecione um certificado A1 valido nos formatos .pfx ou .p12.')
      event.target.value = ''
      return
    }

    if (file.size > 2_000_000) {
      setError('Use um certificado com ate 2 MB para salvar direto na tabela.')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCertificateFileName(file.name)
      setCertificateFileSize(file.size)
      setCertificateFileData(dataUrl)
      setError('')
      if (!secureReference) {
        const selectedClient = clients.find((client) => client.id === selectedClientId)
        const clientKey = selectedClient?.cnpj.replace(/\D/g, '') || selectedClientId || 'cliente'
        setSecureReference(`vault://certificados/${clientKey}/${file.name}`)
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel carregar o certificado.')
    }

    event.target.value = ''
  }

  function clearCertificateFile() {
    setCertificateFileName('')
    setCertificateFileSize(0)
    setCertificateFileData('')
  }

  function applyImportedDocument(imported: ImportedClientDocument, file: ImportedClientDocumentFile) {
    setTab('cadastros')
    setIsClientFormOpen(true)
    setForm((current) => ({
      ...current,
      address: imported.endereco || current.address,
      addressComplement: imported.complemento || current.addressComplement,
      addressNumber: imported.numero || current.addressNumber,
      cep: imported.cep ? formatPostalCode('BR', imported.cep) : current.cep,
      city: imported.cidade || current.city,
      cnpj: imported.cnpj ? formatCnpj(imported.cnpj) : current.cnpj,
      companyName: imported.razaoSocial || imported.nomeFantasia || current.companyName,
      companySize: normalizeCompanySize(imported.porte),
      email: imported.email || current.email,
      legalNature: imported.naturezaJuridica || current.legalNature,
      mainCnae: imported.cnaePrincipal || current.mainCnae,
      neighborhood: imported.bairro || current.neighborhood,
      phone: imported.telefone ? formatPhone('BR', imported.telefone) : current.phone,
      state: imported.estado || current.state,
      taxRegime: normalizeTaxRegime(imported.regimeTributario),
    }))
    setPendingImportedFile(file)
    setFeedback('Dados importados para o formulario. Revise e clique em Salvar cliente.')
    setError('')
    window.setTimeout(() => {
      clientFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function handleCepLookup() {
    if (form.cep.replace(/\D/g, '').length !== 8) return

    setIsSearchingCep(true)
    try {
      const result = await findAddressDetailsByCep(form.cep)
      setForm((current) => ({
        ...current,
        cep: result.cep,
        address: result.address || current.address,
        addressComplement: result.complement || current.addressComplement,
        cityIbgeCode: result.ibge || current.cityIbgeCode,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
        state: result.state || current.state,
      }))
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Erro ao buscar CEP.')
    } finally {
      setIsSearchingCep(false)
    }
  }

  async function handleSaveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!organizationId) {
      setError('Nenhum escritorio vinculado ao usuario. Cadastre ou vincule um escritorio primeiro.')
      return
    }

    if (!form.companyName || !form.cnpj || !form.phone || !form.email || !form.address) {
      setError('Preencha os dados obrigatorios do cliente antes de salvar.')
      return
    }

    if (form.cnpj.replace(/\D/g, '').length !== 14) {
      setError('Informe um CNPJ valido com 14 numeros.')
      return
    }

    if (!isValidEmail(form.email)) {
      setError('Informe um e-mail valido para o cliente.')
      return
    }

    setSavingAction('client')
    setFeedback(editingId ? 'Atualizando cliente...' : 'Salvando cliente...')

    try {
      let savedClientId = editingId
      if (editingId) {
        await updateAccountingClient(editingId, form)
        setFeedback('Cliente atualizado com sucesso.')
      } else {
        savedClientId = await createAccountingClient(organizationId, form)
        setFeedback('Cliente cadastrado com sucesso.')
      }

      if (pendingImportedFile && savedClientId) {
        await createClientDocument(organizationId, savedClientId, {
          documentType: 'Comprovante CNPJ',
          extractedCnpj: form.cnpj,
          fileData: pendingImportedFile.dataUrl,
          fileName: pendingImportedFile.fileName,
          fileSize: pendingImportedFile.fileSize,
          mimeType: pendingImportedFile.mimeType,
        })
      }

      setForm(blankClient)
      setEditingId(null)
      setPendingImportedFile(null)
      setIsClientFormOpen(false)
      await reloadClients(organizationId)
      if (documentsClientId) {
        setClientDocuments(await listClientDocuments(documentsClientId))
      }
    } catch (saveError) {
      setFeedback('')
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar cliente.')
    } finally {
      setSavingAction(null)
    }
  }

  const editClient = useCallback((client: AccountingClient) => {
    setTab('cadastros')
    setIsClientFormOpen(true)
    setEditingId(client.id)
    setForm({
      companyName: client.companyName,
      cnpj: client.cnpj,
      phone: client.phone,
      email: client.email,
      cep: client.cep,
      address: client.address,
      addressNumber: client.addressNumber,
      addressComplement: client.addressComplement,
      neighborhood: client.neighborhood,
      city: client.city,
      state: client.state,
      cityIbgeCode: client.cityIbgeCode,
      stateRegistration: client.stateRegistration,
      municipalRegistration: client.municipalRegistration,
      taxRegime: client.taxRegime,
      companySize: client.companySize,
      mainCnae: client.mainCnae,
      legalNature: client.legalNature,
      photoData: client.photoData ?? '',
      isMonthly: client.isMonthly,
      monthlyFee: client.monthlyFee,
    })
    setFeedback(`Editando cliente: ${client.companyName}.`)
    setPendingImportedFile(null)
    setError('')
    window.setTimeout(() => {
      clientFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [setError, setFeedback])

  useEffect(() => {
    const editClientId = searchParams.get('editClient')
    if (!editClientId || editingId === editClientId) return

    const client = clients.find((item) => item.id === editClientId)
    if (!client) return

    const timeoutId = window.setTimeout(() => editClient(client), 0)
    return () => window.clearTimeout(timeoutId)
  }, [clients, editClient, editingId, searchParams])

  async function removeClient(clientId: string) {
    if (!window.confirm('Excluir este cliente e seus dados relacionados?')) return

    try {
      await deleteAccountingClient(clientId)
      if (selectedClientId === clientId) setSelectedClientId('')
      if (editingId === clientId) closeClientForm()
      await reloadClients(organizationId)
      setFeedback('Cliente excluido.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir cliente.')
    }
  }

  async function showClientDocuments(client: AccountingClient) {
    setDocumentsClientId(client.id)
    setClientDocuments(await listClientDocuments(client.id))
    setFeedback(`Documentos vinculados: ${client.companyName}.`)
    setError('')
  }

  function openClientWorkspace(clientId: string) {
    navigate(`/gestao-clientes/${clientId}${preservedSearch}`)
  }

  async function removeClientDocument(documentId: string) {
    if (!window.confirm('Excluir este documento vinculado ao cliente?')) return

    try {
      await deleteClientDocument(documentId)
      setClientDocuments(await listClientDocuments(documentsClientId))
      setFeedback('Documento excluido.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir documento.')
    }
  }

  function openClientDocument(document: AccountingClientDocument) {
    const newWindow = window.open()
    if (!newWindow) {
      setError('Permita pop-ups para abrir o documento.')
      return
    }

    if (document.mimeType === 'application/pdf') {
      newWindow.document.write(
        `<iframe src="${document.fileData}" style="border:0;height:100vh;width:100vw" title="${document.fileName}"></iframe>`,
      )
      newWindow.document.title = document.fileName
      return
    }

    newWindow.document.write(
      `<img src="${document.fileData}" alt="${document.fileName}" style="display:block;max-width:100%;margin:0 auto" />`,
    )
    newWindow.document.title = document.fileName
  }

  async function importClients(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !organizationId) return

    setSavingAction('clients-import')
    setFeedback('Importando clientes...')

    try {
      const rows = csvRows(await file.text())
      for (const row of rows) {
        const hasNewTemplate = row.length >= 18
        const hasTaxColumns = hasNewTemplate || row.length > 11
        const mensalistaIndex = hasNewTemplate ? 18 : hasTaxColumns ? 13 : 9
        const monthlyFeeIndex = hasNewTemplate ? 19 : hasTaxColumns ? 14 : 10
        let cep = row[4] ?? ''
        let address = row[5] ?? ''
        const addressNumber = hasNewTemplate ? row[6] ?? '' : ''
        let addressComplement = hasNewTemplate ? row[7] ?? '' : ''
        let neighborhood = hasNewTemplate ? row[8] ?? '' : row[6] ?? ''
        let city = hasNewTemplate ? row[9] ?? '' : row[7] ?? ''
        let state = hasNewTemplate ? row[10] ?? '' : row[8] ?? ''
        let cityIbgeCode = hasNewTemplate ? row[11] ?? '' : ''

        if (cep && (!address || !neighborhood || !city)) {
          try {
            const cepData = await findAddressDetailsByCep(cep)
            cep = cepData.cep
            address = address || cepData.address
            addressComplement = addressComplement || cepData.complement
            cityIbgeCode = cityIbgeCode || cepData.ibge
            neighborhood = neighborhood || cepData.neighborhood
            city = city || cepData.city
            state = state || cepData.state
          } catch {
            // Mantem os dados importados; a validacao visual permite corrigir depois.
          }
        }

        await createAccountingClient(organizationId, {
          companyName: row[0] ?? '',
          cnpj: row[1] ?? '',
          phone: row[2] ?? '',
          email: row[3] ?? '',
          cep,
          address,
          addressNumber,
          addressComplement,
          neighborhood,
          city,
          state,
          cityIbgeCode,
          stateRegistration: hasNewTemplate ? row[12] ?? '' : '',
          municipalRegistration: hasNewTemplate ? row[13] ?? '' : '',
          taxRegime: hasTaxColumns ? normalizeTaxRegime(row[hasNewTemplate ? 14 : 9]) : 'Nao informado',
          companySize: hasTaxColumns ? normalizeCompanySize(row[hasNewTemplate ? 15 : 10]) : 'Nao informado',
          mainCnae: hasTaxColumns ? row[hasNewTemplate ? 16 : 11] ?? '' : '',
          legalNature: hasTaxColumns ? row[hasNewTemplate ? 17 : 12] ?? '' : '',
          photoData: '',
          isMonthly: row[mensalistaIndex] ? parseBoolean(row[mensalistaIndex]) : true,
          monthlyFee: parseCurrencyValue(row[monthlyFeeIndex]),
        })
      }
      await reloadClients(organizationId)
      setFeedback(`${rows.length} cliente(s) importado(s).`)
    } catch (importError) {
      setFeedback('')
      setError(importError instanceof Error ? importError.message : 'Erro ao importar clientes.')
    } finally {
      setSavingAction(null)
      event.target.value = ''
    }
  }

  async function importPayments(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !organizationId) return

    setSavingAction('payments-import')
    setFeedback('Importando pagamentos...')

    try {
      const rows = csvRows(await file.text())
      for (const row of rows) {
        const linkedClient = clients.find((client) => client.companyName === row[0])
        if (!linkedClient) throw new Error(`Cliente nao encontrado: ${row[0]}`)
        const [paymentMonth, paymentYear] = (row[1] ?? '').split('/').map(Number)
        await createClientPayment(organizationId, {
          clientId: linkedClient.id,
          month: paymentMonth,
          year: paymentYear,
          amount: Number((row[2] ?? '0').replace(/\./g, '').replace(',', '.')),
          dueDate: row[3] ?? '',
          status: row[4] === 'Pago' || row[4] === 'Vencido' ? row[4] : 'Pendente',
        })
      }
      setPayments(await listClientPayments(organizationId, month, year))
      setFeedback(`${rows.length} pagamento(s) importado(s).`)
    } catch (importError) {
      setFeedback('')
      setError(importError instanceof Error ? importError.message : 'Erro ao importar pagamentos.')
    } finally {
      setSavingAction(null)
      event.target.value = ''
    }
  }

  async function setPaid(paymentId: string) {
    setMarkingPaymentId(paymentId)
    setFeedback('Atualizando pagamento...')
    try {
      await markPaymentPaid(paymentId)
      setPayments(await listClientPayments(organizationId, month, year))
      setFeedback('Pagamento atualizado como Pago.')
    } catch (paymentError) {
      setFeedback('')
      setError(paymentError instanceof Error ? paymentError.message : 'Erro ao atualizar.')
    } finally {
      setMarkingPaymentId(null)
    }
  }

  function applyCertificateToForm(certificate: DigitalCertificate) {
    setSelectedClientId(certificate.clientId)
    setEditingCertificateId(certificate.id)
    setCertificateType(certificate.certificateType)
    setCertificateStatus(certificate.status)
    setCertificateEnvironment(certificate.environment)
    setHolderName(certificate.holderName)
    setTaxId(certificate.taxId)
    setValidUntil(certificate.validUntil)
    setSerialNumber(certificate.serialNumber)
    setIssuer(certificate.issuer)
    setStateUf(certificate.stateUf)
    setMunicipalCode(certificate.municipalCode)
    setSecureReference(certificate.secureReference)
    setCertificatePassword(certificate.certificatePassword)
    setCertificateFileName(certificate.certificateFileName)
    setCertificateFileSize(certificate.certificateFileSize)
    setCertificateFileData(certificate.certificateFileData ?? '')
    setShowCertificatePassword(false)
    setVisibleCertificatePasswordId(null)
  }

  function applyNewCertificateDefaults(client: AccountingClient) {
    setEditingCertificateId(null)
    setCertificateType('e-CNPJ')
    setCertificateStatus('Ativo')
    setCertificateEnvironment('homologacao')
    setHolderName(client.companyName)
    setTaxId(client.cnpj)
    setValidUntil('')
    setSerialNumber('')
    setIssuer('')
    setStateUf(client.state)
    setMunicipalCode('')
    setSecureReference(`vault://certificados/${client.cnpj.replace(/\D/g, '') || client.id}`)
    setCertificatePassword('')
    setShowCertificatePassword(false)
    setVisibleCertificatePasswordId(null)
    clearCertificateFile()
    setEnabledServices([])
  }

  function resetCertificateForm() {
    setEditingCertificateId(null)
    setHolderName('')
    setTaxId('')
    setValidUntil('')
    setCertificateStatus('Ativo')
    setCertificateEnvironment('homologacao')
    setSerialNumber('')
    setIssuer('')
    setStateUf('')
    setMunicipalCode('')
    setSecureReference('')
    setCertificatePassword('')
    setShowCertificatePassword(false)
    setVisibleCertificatePasswordId(null)
    clearCertificateFile()
    setEnabledServices([])
  }

  async function handleSaveCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!organizationId || !selectedClientId || !holderName || !taxId) {
      setError('Selecione o cliente e preencha titular e documento do certificado.')
      return
    }

    if (certificateFileData && !certificatePassword) {
      setError('Informe a senha do certificado para salvar junto com o arquivo PFX/P12.')
      return
    }

    setSavingAction('certificate')
    setFeedback(editingCertificateId ? 'Atualizando certificado...' : 'Salvando certificado...')

    try {
      const certificatePayload = {
        organizationId,
        clientId: selectedClientId,
        certificateType,
        holderName,
        taxId,
        validFrom: '',
        validUntil,
        status: certificateStatus,
        serialNumber,
        issuer,
        environment: certificateEnvironment,
        stateUf,
        municipalCode,
        secureReference,
        certificatePassword,
        certificateFileName,
        certificateFileSize,
        certificateFileData: certificateFileData || undefined,
      }

      if (editingCertificateId) {
        await updateCertificate(editingCertificateId, certificatePayload, enabledServices)
        setFeedback('Certificado atualizado com sucesso.')
      } else {
        await createCertificate(certificatePayload, enabledServices)
        setFeedback('Certificado cadastrado. A ativacao depende das autorizacoes da SEFAZ.')
      }

      const refreshedCertificates = await listCertificates(selectedClientId)
      const activeCertificate = refreshedCertificates.find((certificate) => certificate.id === editingCertificateId) ?? refreshedCertificates[0]

      setCertificates(refreshedCertificates)

      if (activeCertificate) {
        applyCertificateToForm(activeCertificate)
        setEnabledServices(await listCertificateServices(activeCertificate.id))
      } else {
        resetCertificateForm()
      }
    } catch (certificateError) {
      setFeedback('')
      setError(certificateError instanceof Error ? certificateError.message : 'Erro ao salvar.')
    } finally {
      setSavingAction(null)
    }
  }

  async function selectCertificateClient(clientId: string) {
    setSelectedClientId(clientId)
    setError('')

    const selectedClient = clients.find((client) => client.id === clientId)
    if (!selectedClient) {
      setCertificates([])
      resetCertificateForm()
      return
    }

    setIsLoadingCertificateClient(true)
    setFeedback('Carregando certificado do cliente...')

    try {
      const loadedCertificates = await listCertificates(clientId)
      const currentCertificate = loadedCertificates[0]

      setCertificates(loadedCertificates)

      if (currentCertificate) {
        applyCertificateToForm(currentCertificate)
        setEnabledServices(await listCertificateServices(currentCertificate.id))
        setFeedback(`Certificado atual carregado para edicao: ${currentCertificate.holderName}.`)
        return
      }

      applyNewCertificateDefaults(selectedClient)
      setFeedback('Nenhum certificado encontrado. O formulario foi preparado para novo cadastro.')
    } catch (loadError) {
      setFeedback('')
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar certificado do cliente.')
    } finally {
      setIsLoadingCertificateClient(false)
    }
  }

  async function editCertificate(certificate: DigitalCertificate) {
    setTab('certificados')
    applyCertificateToForm(certificate)
    setFeedback(`Editando certificado: ${certificate.holderName}.`)
    setError('')

    try {
      setEnabledServices(await listCertificateServices(certificate.id))
    } catch {
      setEnabledServices([])
    }
  }

  function renderCertificateFileUpload() {
    return (
      <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-900">Arquivo do certificado A1 (.pfx ou .p12)</p>
            <p className="mt-1 text-xs text-slate-500">
              Anexe o arquivo para vincular ao cliente. A senha fica no campo especifico do certificado.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
            Selecionar certificado
            <input
              accept=".pfx,.p12,application/x-pkcs12"
              className="hidden"
              onChange={handleCertificateFileUpload}
              type="file"
            />
          </label>
        </div>
        {certificateFileName ? (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-3 text-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold text-slate-900">{certificateFileName}</p>
                <p className="text-xs text-slate-500">{(certificateFileSize / 1024).toFixed(1)} KB selecionado</p>
              </div>
              <button className="text-sm font-semibold text-rose-600" onClick={clearCertificateFile} type="button">
                Remover arquivo
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-white/70 p-3 text-xs text-amber-700">
            Para consulta/emissao real na SEFAZ, a integracao usara este arquivo junto com a senha cadastrada.
          </p>
        )}
      </div>
    )
  }

  function renderCertificatePasswordInput(id: string) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
          Senha do certificado
        </label>
        <div className="flex gap-2">
          <input
            className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id={id}
            onChange={(event) => setCertificatePassword(event.target.value)}
            placeholder="Senha do PFX/P12"
            type={showCertificatePassword ? 'text' : 'password'}
            value={certificatePassword}
          />
          <button
            className="rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700"
            onClick={() => setShowCertificatePassword((current) => !current)}
            type="button"
          >
            {showCertificatePassword ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>
    )
  }

  function renderCertificateGuide() {
    return (
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
        <p className="font-semibold">Como preencher o certificado</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <p><strong>Cliente:</strong> escolha o cliente dono do certificado.</p>
          <p><strong>Tipo:</strong> para empresa use e-CNPJ; para pessoa fisica use e-CPF.</p>
          <p><strong>Status:</strong> deixe Ativo para aparecer na tela SEFAZ/e-CAC.</p>
          <p><strong>UF SEFAZ:</strong> informe a UF principal da empresa, exemplo PB, SP, PE.</p>
          <p><strong>Validade:</strong> preencha a data de vencimento do certificado, se souber.</p>
          <p><strong>Arquivo:</strong> selecione o PFX/P12 e informe a senha do certificado.</p>
        </div>
      </div>
    )
  }

  function renderCertificateSaveShortcut(className = '') {
    return (
      <div className={`rounded-2xl border border-emerald-100 bg-emerald-50 p-4 ${className}`}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Pronto para salvar?</p>
            <p className="mt-1 text-xs text-emerald-800">
              Voce nao precisa marcar todos os servicos agora. Eles podem ser editados depois.
            </p>
          </div>
          <Button isLoading={savingAction === 'certificate'} type="submit">
            {savingAction === 'certificate'
              ? editingCertificateId
                ? 'Atualizando...'
                : 'Salvando...'
              : editingCertificateId
                ? 'Atualizar agora'
                : 'Salvar agora'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout title="Gestao de Clientes">
      <div className="mb-7">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestao de Clientes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Cadastre clientes, pagamentos e certificados digitais vinculados ao escritorio.
        </p>
      </div>
      {feedback && <div className="mb-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}

      <div className="mb-7 flex border-b border-slate-200">
        {(['cadastros', 'pagamentos', 'certificados'] as ManagementTab[]).map((item) => (
          <button
            className={`border-b-2 px-5 py-4 text-sm font-semibold ${
              tab === item ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'
            }`}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item === 'cadastros' ? 'Cadastros' : item === 'pagamentos' ? 'Pagamentos' : 'Certificados'}
          </button>
        ))}
      </div>

      {tab === 'cadastros' && (
        <>
        <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Carteira de clientes</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Clientes cadastrados</h3>
              <p className="mt-2 text-sm text-slate-500">
                Use a lista como ponto de partida. Cadastro, edicao, importacao e documentos continuam disponiveis nas acoes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={openNewClientForm} type="button">
                Novo cliente
              </Button>
              <Button
                onClick={() => downloadCsv('modelo-cadastro-clientes.csv', clientCsvTemplate)}
                type="button"
                variant="secondary"
              >
                Baixar CSV
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
            <Input
              id="client-search"
              label="Buscar cliente"
              onChange={(event) => {
                setClientSearch(event.target.value)
                setClientsPage(1)
              }}
              placeholder="Razao social, CNPJ, cidade, telefone..."
              value={clientSearch}
            />
            <Select
              id="client-status-filter"
              label="Status"
              onChange={(value) => {
                setClientStatusFilter(value as typeof clientStatusFilter)
                setClientsPage(1)
              }}
              value={clientStatusFilter}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </Select>
            <Select
              id="client-tax-filter"
              label="Regime"
              onChange={(value) => {
                setClientTaxRegimeFilter(value as ClientTaxRegime | 'todos')
                setClientsPage(1)
              }}
              value={clientTaxRegimeFilter}
            >
              <option value="todos">Todos</option>
              {taxRegimeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select
              id="client-size-filter"
              label="Porte"
              onChange={(value) => {
                setClientCompanySizeFilter(value as ClientCompanySize | 'todos')
                setClientsPage(1)
              }}
              value={clientCompanySizeFilter}
            >
              <option value="todos">Todos</option>
              {companySizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select
              id="client-monthly-filter"
              label="Mensalidade"
              onChange={(value) => {
                setClientMonthlyFilter(value as typeof clientMonthlyFilter)
                setClientsPage(1)
              }}
              value={clientMonthlyFilter}
            >
              <option value="todos">Todos</option>
              <option value="mensalistas">Mensalistas</option>
              <option value="avulsos">Nao mensalistas</option>
            </Select>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{clients.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resultado</p>
              <p className="mt-2 text-2xl font-bold text-indigo-700">{filteredClients.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ativos</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{clients.filter((client) => client.active).length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mensalistas</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{clients.filter((client) => client.isMonthly).length}</p>
            </div>
          </div>
        </section>

        <div className={isClientFormOpen ? 'grid gap-6 xl:grid-cols-[1fr_1.1fr]' : 'space-y-6'}>
          {isClientFormOpen && (
          <form className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={handleSaveClient} ref={clientFormRef}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingId ? 'Editar cliente' : 'Novo cliente'}
                </h3>
                {editingId && (
                  <p className="mt-1 text-sm font-medium text-indigo-600">
                    Cliente selecionado: {form.companyName}
                  </p>
                )}
              </div>
              <Button onClick={closeClientForm} type="button" variant="secondary">
                Fechar
              </Button>
            </div>
            <div className="space-y-4">
              <Input id="company" label="Razao social" onChange={(event) => updateField('companyName', event.target.value)} required value={form.companyName} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input id="cnpj" label="CNPJ" onChange={(event) => updateField('cnpj', event.target.value)} placeholder="00.000.000/0000-00" required value={form.cnpj} />
                <Input id="phone" label="Telefone" onChange={(event) => updateField('phone', event.target.value)} placeholder="(00) 00000-0000" required value={form.phone} />
              </div>
              <Input id="email" label="E-mail" onChange={(event) => updateField('email', event.target.value)} required type="email" value={form.email} />
              <Input
                id="cep"
                label="CEP"
                onBlur={() => void handleCepLookup()}
                onChange={(event) => updateField('cep', event.target.value)}
                placeholder="00000-000"
                value={form.cep}
              />
              {isSearchingCep && <p className="text-xs font-semibold text-indigo-600">Buscando endereco pelo ViaCEP...</p>}
              <Input id="address" label="Endereco" onChange={(event) => updateField('address', event.target.value)} required value={form.address} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input id="address-number" label="Numero" onChange={(event) => updateField('addressNumber', event.target.value)} value={form.addressNumber} />
                <Input id="address-complement" label="Complemento" onChange={(event) => updateField('addressComplement', event.target.value)} value={form.addressComplement} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input id="neighborhood" label="Bairro" onChange={(event) => updateField('neighborhood', event.target.value)} value={form.neighborhood} />
                <Input id="city" label="Cidade" onChange={(event) => updateField('city', event.target.value)} value={form.city} />
                <Input id="state" label="Estado" onChange={(event) => updateField('state', event.target.value.toUpperCase())} value={form.state} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input id="city-ibge-code" label="Codigo IBGE municipio" onChange={(event) => updateField('cityIbgeCode', event.target.value)} value={form.cityIbgeCode} />
                <Input id="state-registration" label="Inscricao estadual" onChange={(event) => updateField('stateRegistration', event.target.value)} value={form.stateRegistration} />
                <Input id="municipal-registration" label="Inscricao municipal" onChange={(event) => updateField('municipalRegistration', event.target.value)} value={form.municipalRegistration} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select id="tax-regime" label="Regime tributario" onChange={(value) => updateField('taxRegime', value)} value={form.taxRegime}>
                  {taxRegimeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
                <Select id="company-size" label="Porte / enquadramento" onChange={(value) => updateField('companySize', value)} value={form.companySize}>
                  {companySizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="main-cnae"
                  label="CNAE principal"
                  onChange={(event) => updateField('mainCnae', event.target.value)}
                  placeholder="0000-0/00"
                  value={form.mainCnae}
                />
                <Input
                  id="legal-nature"
                  label="Natureza juridica"
                  onChange={(event) => updateField('legalNature', event.target.value)}
                  placeholder="Ex: Sociedade Empresaria Limitada"
                  value={form.legalNature}
                />
              </div>
              <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="client-logo">
                    Foto ou logotipo
                  </label>
                  <input
                    accept="image/*"
                    className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                    id="client-logo"
                    onChange={(event) => void handleLogoUpload(event)}
                    type="file"
                  />
                  <p className="mt-2 text-xs text-slate-500">A imagem sera gravada na tabela do cliente.</p>
                </div>
                {form.photoData && (
                  <div className="flex items-center gap-3">
                    <img alt="Previa do cliente" className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" src={form.photoData} />
                    <button className="text-sm font-semibold text-rose-600" onClick={() => updateField('photoData', '')} type="button">
                      Remover
                    </button>
                  </div>
                )}
              </div>
              <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_180px]">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    checked={form.isMonthly}
                    onChange={(event) => updateMonthlyField('isMonthly', event.target.checked)}
                    type="checkbox"
                  />
                  Cliente mensalista
                </label>
                <Input
                  disabled={!form.isMonthly}
                  id="monthly-fee"
                  label="Valor mensal"
                  min="0"
                  onChange={(event) => updateMonthlyField('monthlyFee', Number(event.target.value || 0))}
                  type="number"
                  value={form.monthlyFee}
                />
              </div>
              {pendingImportedFile && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">Documento pronto para vincular ao cliente</p>
                  <p className="mt-1">
                    {pendingImportedFile.fileName} - {(pendingImportedFile.fileSize / 1024).toFixed(1)} KB
                  </p>
                  <p className="mt-1 text-xs">
                    Ele sera salvo junto ao registro quando voce clicar em {editingId ? 'Atualizar cliente' : 'Salvar cliente'}.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <Button className="flex-1" isLoading={savingAction === 'client'} type="submit">
                {savingAction === 'client'
                  ? editingId
                    ? 'Atualizando cliente...'
                    : 'Salvando cliente...'
                  : editingId
                    ? 'Atualizar cliente'
                    : 'Salvar cliente'}
              </Button>
              {editingId && (
                <Button disabled={savingAction === 'client'} onClick={() => { setEditingId(null); setForm(blankClient) }} variant="secondary">
                  Cancelar
                </Button>
              )}
            </div>
          </form>
          )}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Lista de clientes</h3>
                <p className="text-sm text-slate-500">
                  {filteredClients.length} resultado(s) de {clients.length} registro(s)
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ImportarDocumentoCliente onConfirm={applyImportedDocument} />
                <label className={`inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 ${savingAction === 'clients-import' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                  {savingAction === 'clients-import' ? 'Importando...' : 'Importar CSV'}
                  <input accept=".csv" className="hidden" disabled={savingAction === 'clients-import'} onChange={importClients} type="file" />
                </label>
              </div>
            </div>
            {clients.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum cliente cadastrado.</p>}
            {clients.length > 0 && filteredClients.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">
                Nenhum cliente encontrado com os filtros atuais.
              </p>
            )}
            <div className="space-y-3">
              {paginatedClients.map((client) => (
                <div className={`rounded-xl border p-4 transition ${editingId === client.id ? 'border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-100' : 'border-slate-100 bg-white'}`} key={client.id}>
                  <div className="flex gap-3">
                    {client.photoData && (
                      <img alt={client.companyName} className="h-12 w-12 rounded-xl border border-slate-200 object-cover" src={client.photoData} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="font-semibold text-slate-900 transition hover:text-indigo-700"
                          onClick={() => openClientWorkspace(client.id)}
                          type="button"
                        >
                          {client.companyName}
                        </button>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${client.isMonthly ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {client.isMonthly ? `Mensalista ${formatCurrency.format(client.monthlyFee)}` : 'Nao mensalista'}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                          {client.taxRegime}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {client.companySize}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{client.cnpj} - {client.phone}</p>
                      <p className="mt-1 text-sm text-slate-500">{client.address}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {[client.neighborhood, client.city, client.state].filter(Boolean).join(' - ')}
                      </p>
                      {(client.mainCnae || client.legalNature) && (
                        <p className="mt-1 text-sm text-slate-500">
                          {[client.mainCnae && `CNAE ${client.mainCnae}`, client.legalNature].filter(Boolean).join(' - ')}
                        </p>
                      )}
                      <FiscalClientSummaryCard summary={fiscalClientSummaries[client.id]} />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm font-semibold">
                    <button className="text-indigo-600" onClick={() => openClientWorkspace(client.id)} type="button">
                      Abrir
                    </button>
                    <button className="text-indigo-600" onClick={() => editClient(client)} type="button">
                      {editingId === client.id ? 'Editando' : 'Editar'}
                    </button>
                    <button className="text-slate-600" onClick={() => void showClientDocuments(client)} type="button">
                      Documentos
                    </button>
                    <button className="text-rose-600" onClick={() => void removeClient(client.id)} type="button">Excluir</button>
                  </div>
                </div>
              ))}
            </div>
            <PaginationControls
              label="cliente(s)"
              onPageChange={setClientsPage}
              onPageSizeChange={setClientsPageSize}
              page={clientsPage}
              pageSize={clientsPageSize}
              total={filteredClients.length}
              totalPages={clientsTotalPages}
            />
            {documentsClientId && (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-900">Documentos do cliente</h4>
                    <p className="mt-1 text-sm text-slate-500">{clientDocuments.length} documento(s) vinculado(s)</p>
                  </div>
                  <button
                    className="text-sm font-semibold text-slate-500"
                    onClick={() => {
                      setDocumentsClientId(null)
                      setClientDocuments([])
                    }}
                    type="button"
                  >
                    Fechar
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {clientDocuments.map((document) => (
                    <div className="rounded-xl bg-white p-4 shadow-sm" key={document.id}>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-semibold text-slate-900">{document.fileName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {document.documentType} - {document.extractedCnpj || 'CNPJ nao informado'} - {(document.fileSize / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <div className="flex gap-3 text-sm font-semibold">
                          <button className="text-indigo-600" onClick={() => openClientDocument(document)} type="button">
                            Abrir
                          </button>
                          <button className="text-rose-600" onClick={() => void removeClientDocument(document.id)} type="button">
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {clientDocuments.length === 0 && (
                    <p className="rounded-xl bg-white p-5 text-center text-sm text-slate-500">
                      Nenhum documento vinculado a este cliente.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
        <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Certificados digitais</h3>
              <p className="mt-2 text-sm text-slate-500">
                O cadastro completo de PFX/P12, senha e servicos habilitados fica na aba Certificados.
              </p>
            </div>
            <Button onClick={() => setTab('certificados')} type="button" variant="secondary">
              Abrir certificados
            </Button>
          </div>
        </section>
        </>
      )}

      {tab === 'pagamentos' && (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><h3 className="text-lg font-semibold text-slate-900">Mensalidades</h3><p className="text-sm text-slate-500">Registros reais importados ou atualizados manualmente.</p></div>
            <PeriodFilter month={month} onMonthChange={setMonth} onYearChange={setYear} year={year} years={years} />
          </div>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => downloadCsv('modelo-pagamentos.csv', 'cliente;competencia;valor;vencimento;status\n')} variant="secondary">Baixar modelo</Button>
            <label className={`rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white ${savingAction === 'payments-import' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              {savingAction === 'payments-import' ? 'Importando...' : 'Importar CSV'}
              <input accept=".csv" className="hidden" disabled={savingAction === 'payments-import'} onChange={importPayments} type="file" />
            </label>
          </div>
          <div className="mt-7 rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Clientes mensalistas</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {clients.map((client) => (
                <div className="rounded-xl bg-white p-4 shadow-sm" key={client.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{client.companyName}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${client.isMonthly ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {client.isMonthly ? 'Mensalista' : 'Avulso'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Valor mensal: {client.isMonthly ? formatCurrency.format(client.monthlyFee) : 'Nao se aplica'}
                  </p>
                </div>
              ))}
            </div>
            {clients.length === 0 && <p className="mt-4 text-sm text-slate-500">Nenhum cliente cadastrado para classificar mensalidade.</p>}
          </div>
          <div className="mt-7 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="pb-4">Cliente</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Acao</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr className="border-t border-slate-100" key={payment.id}>
                    <td className="py-4 font-medium">{payment.clientName}</td><td>{payment.dueDate}</td><td>{formatCurrency.format(payment.amount)}</td>
                    <td><StatusBadge status={payment.status} /></td>
                    <td>
                      {payment.status !== 'Pago' && (
                        <Button
                          className="h-9 px-3"
                          isLoading={markingPaymentId === payment.id}
                          onClick={() => void setPaid(payment.id)}
                          type="button"
                          variant="secondary"
                        >
                          {markingPaymentId === payment.id ? 'Atualizando...' : 'Marcar Pago'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum pagamento cadastrado.</p>}
          </div>
        </section>
      )}

      {tab === 'certificados' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <form className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={handleSaveCertificate}>
            <h3 className="mb-5 text-lg font-semibold text-slate-900">Cadastrar certificado digital</h3>
            <p className="mb-5 text-sm text-amber-700">Cadastre o certificado do cliente. Para uso fiscal, deixe o status como Ativo.</p>
            <div className="mb-5">{renderCertificateGuide()}</div>
            <div className="space-y-4">
              <Select id="cert-client" label="Cliente" onChange={(value) => void selectCertificateClient(value)} value={selectedClientId}>
                <option value="">Selecione...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
              </Select>
              {isLoadingCertificateClient && (
                <p className="rounded-xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">
                  Carregando certificado atual do cliente...
                </p>
              )}
              <Select id="cert-type" label="Tipo" onChange={(value) => setCertificateType(value as CertificateType)} value={certificateType}>
                {(['A1', 'A3', 'e-CNPJ', 'e-CPF'] as CertificateType[]).map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
              <Select id="cert-status" label="Status" onChange={(value) => setCertificateStatus(value as DigitalCertificate['status'])} value={certificateStatus}>
                {(['Pendente', 'Ativo', 'Expirado', 'Revogado'] as DigitalCertificate['status'][]).map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
              <Select id="cert-env" label="Ambiente SEFAZ" onChange={(value) => setCertificateEnvironment(value as DigitalCertificate['environment'])} value={certificateEnvironment}>
                <option value="homologacao">Homologacao</option>
                <option value="producao">Producao</option>
              </Select>
              <Input id="holder" label="Titular" onChange={(event) => setHolderName(event.target.value)} required value={holderName} />
              <Input id="tax-id" label="CPF/CNPJ do titular" onChange={(event) => setTaxId(event.target.value)} required value={taxId} />
              <Input id="valid-until" label="Validade" onChange={(event) => setValidUntil(event.target.value)} type="date" value={validUntil} />
              <Input id="serial-number" label="Numero de serie" onChange={(event) => setSerialNumber(event.target.value)} value={serialNumber} />
              <Input id="issuer" label="Autoridade emissora" onChange={(event) => setIssuer(event.target.value)} value={issuer} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input id="state-uf" label="UF de emissao/consulta" onChange={(event) => setStateUf(event.target.value.toUpperCase())} placeholder="SP" value={stateUf} />
                <Input id="municipal-code" label="Codigo municipal (NFS-e)" onChange={(event) => setMunicipalCode(event.target.value)} value={municipalCode} />
              </div>
              <Input id="secure-reference" label="Referencia segura do certificado" onChange={(event) => setSecureReference(event.target.value)} placeholder="Ex: vault://cliente/certificado-a1" value={secureReference} />
              {renderCertificatePasswordInput('certificate-password')}
              {renderCertificateFileUpload()}
              {renderCertificateSaveShortcut()}
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">Servicos desejados</legend>
                <div className="space-y-4">
                  {serviceGroups.map((group) => (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={group.name}>
                      <p className="mb-3 text-sm font-semibold text-slate-900">{group.name}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.services.map((service) => (
                          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" key={service.code}>
                            <input
                              checked={enabledServices.includes(service.code)}
                              className="mt-1"
                              onChange={(event) => setEnabledServices((current) => event.target.checked ? [...current, service.code] : current.filter((code) => code !== service.code))}
                              type="checkbox"
                            />
                            <span>
                              <span className="block font-semibold text-slate-800">{service.label}</span>
                              <span className="mt-1 block text-xs text-slate-500">{service.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" isLoading={savingAction === 'certificate'} type="submit">
                {savingAction === 'certificate'
                  ? editingCertificateId
                    ? 'Atualizando certificado...'
                    : 'Salvando certificado...'
                  : editingCertificateId
                    ? 'Atualizar certificado'
                    : 'Salvar certificado'}
              </Button>
              {editingCertificateId && (
                <Button className="flex-1" disabled={savingAction === 'certificate'} onClick={resetCertificateForm} type="button" variant="secondary">
                  Cancelar edicao
                </Button>
              )}
            </div>
          </form>
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Certificados do cliente</h3>
            {!selectedClientId && <p className="py-10 text-sm text-slate-500">Selecione um cliente para visualizar certificados.</p>}
            {selectedClientId && certificates.length === 0 && <p className="py-10 text-sm text-slate-500">Nenhum certificado cadastrado.</p>}
            <div className="mt-5 space-y-3">
              {certificates.map((certificate) => (
                <div className="rounded-xl border border-slate-100 p-4" key={certificate.id}>
                  <div className="flex justify-between"><p className="font-semibold">{certificate.certificateType} - {certificate.holderName}</p><span className="text-sm text-amber-600">{certificate.status}</span></div>
                  <p className="mt-2 text-sm text-slate-500">Validade: {certificate.validUntil || 'Nao informada'}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Arquivo: {certificate.certificateFileName ? `${certificate.certificateFileName} (${(certificate.certificateFileSize / 1024).toFixed(1)} KB)` : 'Sem PFX/P12 anexado'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Senha:{' '}
                    {certificate.certificatePassword
                      ? visibleCertificatePasswordId === certificate.id
                        ? certificate.certificatePassword
                        : 'Cadastrada'
                      : 'Nao cadastrada'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
                    <button className="text-indigo-600" onClick={() => void editCertificate(certificate)} type="button">
                      {editingCertificateId === certificate.id ? 'Editando' : 'Editar'}
                    </button>
                    {certificate.certificatePassword && (
                      <button
                        className="text-slate-600"
                        onClick={() =>
                          setVisibleCertificatePasswordId((current) =>
                            current === certificate.id ? null : certificate.id,
                          )
                        }
                        type="button"
                      >
                        {visibleCertificatePasswordId === certificate.id ? 'Ocultar senha' : 'Mostrar senha'}
                      </button>
                    )}
                    {certificate.certificateFileData && (
                      <a
                        className="text-indigo-600"
                        download={certificate.certificateFileName || 'certificado.pfx'}
                        href={certificate.certificateFileData}
                      >
                        Baixar arquivo
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  )
}

function FiscalClientSummaryCard({ summary }: { summary?: FiscalClientSummary }) {
  if (!summary) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        Resumo fiscal carregando...
      </div>
    )
  }

  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${fiscalSummaryToneClasses[summary.tone]}`}>
      <p className="font-bold">{summary.label}</p>
      {summary.issues.length > 0 && (
        <p className="mt-1 leading-5">
          {summary.issues.slice(0, 4).join(' | ')}
          {summary.issues.length > 4 ? ` | +${summary.issues.length - 4} pendencia(s)` : ''}
        </p>
      )}
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
