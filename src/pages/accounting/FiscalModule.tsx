import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiscalProductsPanel } from '../../components/fiscal/FiscalProductsPanel'
import { FiscalReadinessTimeline } from '../../components/fiscal/FiscalReadinessTimeline'
import { FiscalRulesPanel } from '../../components/fiscal/FiscalRulesPanel'
import { FiscalSimulatorPanel } from '../../components/fiscal/FiscalSimulatorPanel'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import {
  applyFiscalEnrichmentSuggestions,
  consultFiscalClientEnrichment,
  fieldSourceLabel,
  type FiscalEnrichmentField,
  type FiscalEnrichmentSuggestion,
} from '../../services/fiscalClientEnrichmentService'
import {
  getNcmSyncStatus,
  importNcmCatalogFile,
  searchNcmCatalog,
  syncNcmCatalog,
} from '../../services/fiscalBackendService'
import {
  approveFiscalCompanyProfile,
  getFiscalCompanyProfile,
  listFiscalProducts,
  listFiscalRules,
  rejectFiscalCompanyProfile,
  recordFiscalFieldSources,
  upsertFiscalCompanyProfile,
} from '../../services/fiscalRepository'
import { calculateFiscalReadiness } from '../../services/fiscalReadinessService'
import { listAccountingClients } from '../../services/accountingRepository'
import { resolveOrganizationId } from '../../services/platformService'
import type { AccountingClient } from '../../types/accounting'
import type {
  FiscalCompanyProfile,
  FiscalCompanyProfileInput,
  FiscalProduct,
  FiscalRule,
  NcmCatalogItem,
  NcmSyncStatus,
} from '../../types/fiscal'
import { validateFiscalProfile } from '../../utils/fiscalValidators'

const moduleCards = [
  {
    title: 'Perfil fiscal da empresa',
    description: 'Regime tributario, CNAE, IE, inscricao municipal, UF e padroes de emissao.',
    status: 'Base criada no Supabase',
  },
  {
    title: 'Produtos e servicos',
    description: 'Catalogo com NCM, CFOP, unidade, origem, tributacao e regras por cliente.',
    status: 'CRUD ativo',
  },
  {
    title: 'Regras fiscais',
    description: 'Motor para sugerir CFOP, CST/CSOSN, aliquotas e validacoes antes da NF-e.',
    status: 'CRUD ativo',
  },
  {
    title: 'Simulador fiscal',
    description: 'Pre-visualizacao dos impostos antes de gerar XML e transmitir a nota.',
    status: 'Integrado ao backend',
  },
]

type FiscalTab = 'perfil' | 'ncm' | 'produtos' | 'regras' | 'simulador'

const fiscalTabs: Array<{ id: FiscalTab; title: string; description: string }> = [
  { id: 'perfil', title: 'Perfil fiscal', description: 'Dados fiscais da empresa/cliente emissor.' },
  { id: 'ncm', title: 'Tabela NCM', description: 'Sincronizacao e busca oficial.' },
  { id: 'produtos', title: 'Produtos', description: 'Catalogo fiscal por cliente.' },
  { id: 'regras', title: 'Regras fiscais', description: 'CFOP, CST, CSOSN e aliquotas.' },
  { id: 'simulador', title: 'Simulador', description: 'Previa tributaria antes da NF-e.' },
]

const blankProfile: FiscalCompanyProfileInput = {
  cnpj: '',
  stateRegistration: '',
  municipalRegistration: '',
  stateUf: '',
  city: '',
  cityIbgeCode: '',
  mainCnae: '',
  secondaryCnaes: [],
  taxRegime: 'Nao informado',
  crt: '',
  icmsTaxpayerIndicator: 'Nao informado',
  defaultFinalConsumer: true,
  defaultNfeSeries: '1',
  defaultEnvironment: 'homologacao',
  pisCofinsRegime: 'Nao informado',
  fiscalNotes: '',
  approvalStatus: 'Incompleto',
  active: true,
}

const taxRegimeOptions = [
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

const crtOptions = [
  { value: '', label: 'Nao informado' },
  { value: '1', label: '1 - Simples Nacional' },
  { value: '2', label: '2 - Simples Nacional com excesso de sublimite' },
  { value: '3', label: '3 - Regime Normal' },
]

const taxpayerOptions = [
  'Nao informado',
  'Contribuinte ICMS',
  'Contribuinte isento',
  'Nao contribuinte',
]

const pisCofinsOptions = [
  'Nao informado',
  'Cumulativo',
  'Nao cumulativo',
  'Monofasico',
  'Substituicao tributaria',
  'Aliquota zero',
]

function formatDateTime(value?: string) {
  if (!value) return 'Nunca executado'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatNcmCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

function statusTone(status?: string) {
  const normalized = status?.toLowerCase() ?? ''

  if (normalized.includes('success') || normalized.includes('concluido') || normalized.includes('completed')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (normalized.includes('running') || normalized.includes('process')) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (normalized.includes('error') || normalized.includes('fail')) {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }

  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function profileFromClient(client?: AccountingClient | null): FiscalCompanyProfileInput {
  if (!client) return blankProfile

  return {
    ...blankProfile,
    cnpj: client.cnpj,
    stateRegistration: client.stateRegistration,
    municipalRegistration: client.municipalRegistration,
    stateUf: client.state,
    city: client.city,
    cityIbgeCode: client.cityIbgeCode,
    mainCnae: client.mainCnae,
    taxRegime: client.taxRegime,
    crt: client.taxRegime === 'Simples Nacional' || client.taxRegime === 'MEI' ? '1' : '',
  }
}

function profileInputFromProfile(profile: FiscalCompanyProfile): FiscalCompanyProfileInput {
  return {
    cnpj: profile.cnpj,
    stateRegistration: profile.stateRegistration,
    municipalRegistration: profile.municipalRegistration,
    stateUf: profile.stateUf,
    city: profile.city,
    cityIbgeCode: profile.cityIbgeCode,
    mainCnae: profile.mainCnae,
    secondaryCnaes: profile.secondaryCnaes,
    taxRegime: profile.taxRegime,
    crt: profile.crt,
    icmsTaxpayerIndicator: profile.icmsTaxpayerIndicator,
    defaultFinalConsumer: profile.defaultFinalConsumer,
    defaultNfeSeries: profile.defaultNfeSeries,
    defaultEnvironment: profile.defaultEnvironment,
    pisCofinsRegime: profile.pisCofinsRegime,
    fiscalNotes: profile.fiscalNotes,
    approvalStatus: profile.approvalStatus,
    active: profile.active,
    confirmedAt: profile.confirmedAt,
    confirmedBy: profile.confirmedBy,
    dataOrigin: profile.dataOrigin,
    ibgeResolvedAt: profile.ibgeResolvedAt,
    ibgeSource: profile.ibgeSource,
    lastVerifiedAt: profile.lastVerifiedAt,
  }
}

function parseSecondaryCnaes(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatSecondaryCnaes(values: string[]) {
  return values.join('\n')
}

export function FiscalModule() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedOrganizationId = searchParams.get('organization')
  const requestedClientId = searchParams.get('clientId') ?? ''
  const [activeTab, setActiveTab] = useState<FiscalTab>('perfil')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [clientId, setClientId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [profile, setProfile] = useState<FiscalCompanyProfileInput>(blankProfile)
  const [secondaryCnaesText, setSecondaryCnaesText] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<NcmCatalogItem[]>([])
  const [syncStatus, setSyncStatus] = useState<NcmSyncStatus | null>(null)
  const [timelineProducts, setTimelineProducts] = useState<FiscalProduct[]>([])
  const [timelineRules, setTimelineRules] = useState<FiscalRule[]>([])
  const [enrichmentSuggestions, setEnrichmentSuggestions] = useState<FiscalEnrichmentSuggestion[]>([])
  const [selectedEnrichmentFields, setSelectedEnrichmentFields] = useState<Set<FiscalEnrichmentField>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEnrichingProfile, setIsEnrichingProfile] = useState(false)
  const [isApplyingEnrichment, setIsApplyingEnrichment] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isImportingNcm, setIsImportingNcm] = useState(false)
  const [selectedNcmFile, setSelectedNcmFile] = useState<File | null>(null)
  const profileRequestRef = useRef(0)
  const readinessRequestRef = useRef(0)

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clientId, clients],
  )
  const totalActive = useMemo(
    () => items.filter((item) => item.isActive).length,
    [items],
  )
  const readiness = useMemo(
    () =>
      calculateFiscalReadiness({
        client: selectedClient,
        ncmSyncStatus: syncStatus,
        products: timelineProducts,
        profile,
        rules: timelineRules,
      }),
    [profile, selectedClient, syncStatus, timelineProducts, timelineRules],
  )
  const hasSelectedCompany = Boolean(organizationId && clientId && selectedClient)
  const selectedCompanyLabel = selectedClient
    ? `${selectedClient.companyName} - ${selectedClient.cnpj || 'CNPJ nao informado'}`
    : ''

  const loadSyncStatus = useCallback(async () => {
    setIsLoadingStatus(true)
    setError('')

    try {
      setSyncStatus(await getNcmSyncStatus())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar o status fiscal.')
    } finally {
      setIsLoadingStatus(false)
    }
  }, [])

  const loadReadinessData = useCallback(async () => {
    if (!organizationId || !clientId) {
      readinessRequestRef.current += 1
      setTimelineProducts([])
      setTimelineRules([])
      return
    }

    const requestId = ++readinessRequestRef.current
    const scopedOrganizationId = organizationId
    const scopedClientId = clientId

    try {
      const [products, rules] = await Promise.all([
        listFiscalProducts(scopedOrganizationId, scopedClientId),
        listFiscalRules(scopedOrganizationId, scopedClientId),
      ])
      if (requestId !== readinessRequestRef.current) return
      setTimelineProducts(products)
      setTimelineRules(rules)
    } catch (loadError) {
      if (requestId !== readinessRequestRef.current) return
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel atualizar a jornada fiscal.')
    }
  }, [clientId, organizationId])

  const handleSearch = useCallback(async () => {
    const cleanedQuery = query.trim()

    if (cleanedQuery.length < 2) {
      setError('Informe pelo menos 2 caracteres ou digitos para buscar NCM.')
      return
    }

    setIsSearching(true)
    setFeedback('')
    setError('')

    try {
      const result = await searchNcmCatalog(cleanedQuery, 30)
      setItems(result)
      setFeedback(
        result.length
          ? `${result.length} NCM encontrado(s).`
          : syncStatus?.totalCodes
            ? 'Nenhum NCM encontrado para a busca.'
            : 'Tabela NCM ainda nao sincronizada.',
      )
    } catch (searchError) {
      setItems([])
      setError(searchError instanceof Error ? searchError.message : 'Nao foi possivel buscar NCM.')
    } finally {
      setIsSearching(false)
    }
  }, [query, syncStatus])

  async function handleSync() {
    setIsSyncing(true)
    setFeedback('')
    setError('')

    try {
      const result = await syncNcmCatalog()
      setFeedback(result.message || 'Sincronizacao NCM iniciada/concluida.')
      await loadSyncStatus()
      await loadReadinessData()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Nao foi possivel sincronizar a tabela NCM.')
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleImportNcmFile() {
    setFeedback('')
    setError('')

    if (!selectedNcmFile) {
      setError('Selecione um arquivo XLSX valido para importar a Tabela NCM.')
      return
    }

    setIsImportingNcm(true)
    setFeedback('Importando Tabela NCM por arquivo XLSX...')

    try {
      const result = await importNcmCatalogFile(selectedNcmFile)
      setFeedback(result.message || 'Tabela NCM importada com sucesso.')
      setSelectedNcmFile(null)
      await loadSyncStatus()
      await loadReadinessData()
    } catch (importError) {
      setFeedback('')
      setError(
        importError instanceof Error
          ? importError.message
          : 'Nao foi possivel importar a Tabela NCM. Selecione um arquivo XLSX valido.',
      )
    } finally {
      setIsImportingNcm(false)
    }
  }

  function updateProfile<Field extends keyof FiscalCompanyProfileInput>(
    field: Field,
    value: FiscalCompanyProfileInput[Field],
  ) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  function resetCompanyScopedState() {
    profileRequestRef.current += 1
    readinessRequestRef.current += 1
    setProfile(blankProfile)
    setProfileId('')
    setSecondaryCnaesText('')
    setTimelineProducts([])
    setTimelineRules([])
    setEnrichmentSuggestions([])
    setSelectedEnrichmentFields(new Set())
    setFeedback('')
    setError('')
    setIsLoadingProfile(false)
  }

  function handleCompanyChange(nextClientId: string) {
    resetCompanyScopedState()
    setClientId(nextClientId)
    const nextParams = new URLSearchParams(searchParams)
    if (organizationId) nextParams.set('organization', organizationId)
    if (nextClientId) nextParams.set('clientId', nextClientId)
    else nextParams.delete('clientId')
    setSearchParams(nextParams)
  }

  function confirmSelectedCompany(action: string) {
    if (!organizationId || !clientId || !selectedClient) {
      setError('Selecione uma empresa emissora antes de executar esta acao fiscal.')
      return false
    }

    return window.confirm(`Confirmar ${action} para ${selectedCompanyLabel}?`)
  }

  async function handleSaveProfile() {
    setFeedback('')
    setError('')

    if (!confirmSelectedCompany('salvar o perfil fiscal')) {
      return
    }
    const scopedOrganizationId = organizationId
    const scopedClientId = clientId
    if (!scopedOrganizationId || !scopedClientId) return

    const validationErrors = validateFiscalProfile(profile)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '))
      return
    }

    setIsSavingProfile(true)
    setFeedback('Salvando perfil fiscal...')

    try {
      const savedProfile = await upsertFiscalCompanyProfile(scopedOrganizationId, scopedClientId, {
        ...profile,
        secondaryCnaes: parseSecondaryCnaes(secondaryCnaesText),
      })
      setProfileId(savedProfile.id)
      setProfile(profileInputFromProfile(savedProfile))
      setSecondaryCnaesText(formatSecondaryCnaes(savedProfile.secondaryCnaes))
      await loadReadinessData()
      setFeedback('Perfil fiscal salvo com sucesso.')
    } catch (saveError) {
      setFeedback('')
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o perfil fiscal.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handleApproveProfile() {
    if (!profileId) return
    if (!confirmSelectedCompany('aprovar o perfil fiscal')) return

    setFeedback('Aprovando perfil fiscal...')
    setError('')

    try {
      const approved = await approveFiscalCompanyProfile(profileId, 'Aprovacao formal pelo modulo fiscal.')
      setProfile(profileInputFromProfile(approved))
      setSecondaryCnaesText(formatSecondaryCnaes(approved.secondaryCnaes))
      await loadReadinessData()
      setFeedback('Perfil fiscal aprovado.')
    } catch (approveError) {
      setFeedback('')
      setError(approveError instanceof Error ? approveError.message : 'Nao foi possivel aprovar o perfil fiscal.')
    }
  }

  async function handleRejectProfile() {
    if (!profileId) return
    if (!confirmSelectedCompany('rejeitar o perfil fiscal')) return

    const reason = window.prompt('Informe o motivo da rejeicao do perfil fiscal:')
    if (!reason) return

    setFeedback('Rejeitando perfil fiscal...')
    setError('')

    try {
      const rejected = await rejectFiscalCompanyProfile(profileId, reason)
      setProfile(profileInputFromProfile(rejected))
      setSecondaryCnaesText(formatSecondaryCnaes(rejected.secondaryCnaes))
      await loadReadinessData()
      setFeedback('Perfil fiscal rejeitado.')
    } catch (rejectError) {
      setFeedback('')
      setError(rejectError instanceof Error ? rejectError.message : 'Nao foi possivel rejeitar o perfil fiscal.')
    }
  }

  async function handlePreviewEnrichment() {
    if (!selectedClient) {
      setError('Selecione um cliente para atualizar dados cadastrais.')
      return
    }

    setFeedback('')
    setError('')
    setIsEnrichingProfile(true)

    try {
      const currentProfile = {
        ...profile,
        secondaryCnaes: parseSecondaryCnaes(secondaryCnaesText),
      }
      const result = await consultFiscalClientEnrichment(selectedClient, currentProfile)
      setEnrichmentSuggestions(result.suggestions)
      setSelectedEnrichmentFields(new Set(result.suggestions.filter((item) => item.selected).map((item) => item.field)))

      if (!result.suggestions.length) {
        setFeedback('Nenhuma divergencia ou sugestao cadastral encontrada para este perfil.')
      }
    } catch (enrichError) {
      setError(enrichError instanceof Error ? enrichError.message : 'Nao foi possivel atualizar dados cadastrais.')
    } finally {
      setIsEnrichingProfile(false)
    }
  }

  async function handleApplyEnrichment() {
    if (!confirmSelectedCompany('aplicar sugestoes cadastrais ao perfil fiscal')) {
      return
    }
    const scopedOrganizationId = organizationId
    const scopedClientId = clientId
    if (!scopedOrganizationId || !scopedClientId) return

    const selectedSuggestions = enrichmentSuggestions.filter(
      (suggestion) => selectedEnrichmentFields.has(suggestion.field) && !suggestion.blocked,
    )

    if (!selectedSuggestions.length) {
      setError('Selecione pelo menos uma sugestao liberada para aplicar.')
      return
    }

    setError('')
    setFeedback('Aplicando sugestoes cadastrais...')
    setIsApplyingEnrichment(true)

    try {
      const nextProfile = applyFiscalEnrichmentSuggestions(
        {
          ...profile,
          secondaryCnaes: parseSecondaryCnaes(secondaryCnaesText),
        },
        enrichmentSuggestions,
        selectedEnrichmentFields,
      )
      const now = new Date().toISOString()
      const hasIbge = selectedSuggestions.some((suggestion) => suggestion.field === 'cityIbgeCode')
      const savedProfile = await upsertFiscalCompanyProfile(scopedOrganizationId, scopedClientId, {
        ...nextProfile,
        dataOrigin: 'client_enrichment',
        ibgeResolvedAt: hasIbge ? now : nextProfile.ibgeResolvedAt,
        ibgeSource: hasIbge ? 'ibge' : nextProfile.ibgeSource,
        lastVerifiedAt: now,
      })

      setProfileId(savedProfile.id)
      setProfile(profileInputFromProfile(savedProfile))
      setSecondaryCnaesText(formatSecondaryCnaes(savedProfile.secondaryCnaes))

      try {
        await recordFiscalFieldSources(
          scopedOrganizationId,
          scopedClientId,
          savedProfile.id,
          selectedSuggestions.map((suggestion) => ({
            confirmationStatus: 'confirmed',
            fieldName: suggestion.field,
            newValue: suggestion.suggestedValue,
            oldValue: suggestion.currentValue,
            source: suggestion.source,
          })),
        )
      } catch {
        // A origem dos campos melhora a auditoria, mas nao deve desfazer o perfil ja salvo.
      }

      setEnrichmentSuggestions([])
      setSelectedEnrichmentFields(new Set())
      await loadReadinessData()
      setFeedback('Dados cadastrais aplicados ao perfil fiscal.')
    } catch (applyError) {
      setFeedback('')
      setError(applyError instanceof Error ? applyError.message : 'Nao foi possivel aplicar as sugestoes.')
    } finally {
      setIsApplyingEnrichment(false)
    }
  }

  function toggleEnrichmentField(field: FiscalEnrichmentField, checked: boolean) {
    setSelectedEnrichmentFields((current) => {
      const next = new Set(current)
      if (checked) next.add(field)
      else next.delete(field)
      return next
    })
  }

  useEffect(() => {
    let active = true

    const timer = window.setTimeout(() => {
      setIsLoadingClients(true)
      setError('')

      resolveOrganizationId(requestedOrganizationId)
        .then(async (id) => {
          if (!active) return
          setOrganizationId(id)
          const loadedClients = await listAccountingClients(id)
          if (!active) return
          setClients(loadedClients)
          const selectedFromUrl = requestedClientId
            ? loadedClients.find((client) => client.id === requestedClientId)?.id ?? ''
            : ''
          setClientId(selectedFromUrl)
        })
        .catch((loadError) => {
          if (active) {
            setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar clientes.')
          }
        })
        .finally(() => {
          if (active) setIsLoadingClients(false)
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [requestedClientId, requestedOrganizationId])

  useEffect(() => {
    let active = true

    const requestId = ++profileRequestRef.current

    if (!organizationId || !clientId) {
      const timer = window.setTimeout(() => {
        if (requestId !== profileRequestRef.current) return
        setProfile(blankProfile)
        setProfileId('')
        setSecondaryCnaesText('')
        setEnrichmentSuggestions([])
        setSelectedEnrichmentFields(new Set())
      }, 0)
      return () => {
        active = false
        window.clearTimeout(timer)
      }
    }

    const timer = window.setTimeout(() => {
      setIsLoadingProfile(true)
      setError('')

      const fallbackProfile = profileFromClient(selectedClient)
      setProfile(fallbackProfile)
      setProfileId('')
      setSecondaryCnaesText('')

      getFiscalCompanyProfile(organizationId, clientId)
        .then((loadedProfile) => {
          if (!active || requestId !== profileRequestRef.current) return
          const nextProfile = loadedProfile ? profileInputFromProfile(loadedProfile) : fallbackProfile
          setProfileId(loadedProfile?.id ?? '')
          setProfile(nextProfile)
          setSecondaryCnaesText(formatSecondaryCnaes(nextProfile.secondaryCnaes))
        })
        .catch((loadError) => {
          if (active && requestId === profileRequestRef.current) {
            setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar o perfil fiscal.')
          }
        })
        .finally(() => {
          if (active && requestId === profileRequestRef.current) setIsLoadingProfile(false)
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [clientId, organizationId, selectedClient])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSyncStatus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadSyncStatus])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReadinessData()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadReadinessData])

  useEffect(() => {
    const cleanedQuery = query.trim()
    if (activeTab !== 'ncm' || cleanedQuery.length < 3) {
      return
    }

    const timer = window.setTimeout(() => {
      void handleSearch()
    }, 450)

    return () => window.clearTimeout(timer)
  }, [activeTab, handleSearch, query])

  return (
    <DashboardLayout title="Fiscal">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">Motor fiscal</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Configuracao fiscal</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
          Central para preparar NCM, produtos, regras fiscais e simulacoes antes da emissao real de NF-e.
        </p>
      </div>

      {feedback && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {feedback}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="mb-6 rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">Empresa emissora</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {selectedClient ? selectedClient.companyName : 'Selecione a empresa para configurar'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Todos os perfis, produtos, regras, simulacoes e pendencias abaixo pertencem somente a empresa selecionada.
            </p>
          </div>

          <div className="w-full xl:max-w-xl">
            <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-company-selector">
              Selecionar empresa cliente <span className="text-rose-500">*</span>
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <select
                className="h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                disabled={isLoadingClients}
                id="fiscal-company-selector"
                onChange={(event) => handleCompanyChange(event.target.value)}
                value={clientId}
              >
                <option value="">{isLoadingClients ? 'Carregando empresas...' : 'Selecione uma empresa...'}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName} - {client.cnpj || 'CNPJ nao informado'}
                  </option>
                ))}
              </select>
              <button
                className="h-12 rounded-xl border border-indigo-200 px-5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-indigo-300"
                disabled={isLoadingClients}
                onClick={() => document.getElementById('fiscal-company-selector')?.focus()}
                type="button"
              >
                Trocar empresa
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-6">
          <CompanyFact label="Razao social" value={selectedClient?.companyName} />
          <CompanyFact label="Nome fantasia" value="" />
          <CompanyFact label="CNPJ" value={selectedClient?.cnpj} />
          <CompanyFact label="UF" value={selectedClient?.state} />
          <CompanyFact label="Cidade" value={selectedClient?.city} />
          <CompanyFact
            label="Ambiente fiscal"
            value={selectedClient ? (profile.defaultEnvironment === 'producao' ? 'Producao' : 'Homologacao') : ''}
          />
        </div>

        {!hasSelectedCompany && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
            Selecione uma empresa emissora para carregar perfil fiscal, produtos, regras e simulador. A tela nao possui
            opcao "Todas as empresas" para evitar mistura de dados fiscais.
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moduleCards.map((card) => (
          <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" key={card.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">{card.status}</p>
            <h3 className="mt-3 text-lg font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">{card.description}</p>
          </article>
        ))}
      </section>

      <FiscalReadinessTimeline readiness={readiness} onNavigate={(tab) => setActiveTab(tab)} />

      <nav className="mt-6 grid gap-3 rounded-3xl border border-slate-100 bg-white p-3 shadow-sm md:grid-cols-5">
        {fiscalTabs.map((tab) => (
          <button
            className={`rounded-2xl px-4 py-3 text-left transition ${
              activeTab === tab.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <span className="block text-sm font-semibold">{tab.title}</span>
            <span className={`mt-1 block text-xs ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {tab.description}
            </span>
          </button>
        ))}
      </nav>

      {activeTab === 'perfil' && !hasSelectedCompany && <CompanySelectionRequired />}

      {activeTab === 'perfil' && hasSelectedCompany && (
        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Empresa emissora</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Perfil fiscal da empresa</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Estes dados alimentam emissao, validacao fiscal, regras tributarias e simulacao da NF-e.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="h-11 rounded-xl border border-indigo-200 px-5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-indigo-300"
                disabled={isEnrichingProfile || isSavingProfile || isLoadingProfile || !hasSelectedCompany}
                onClick={() => void handlePreviewEnrichment()}
                type="button"
              >
                {isEnrichingProfile ? 'Consultando...' : 'Atualizar dados cadastrais'}
              </button>
              <button
                className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                disabled={isSavingProfile || isLoadingProfile || !hasSelectedCompany}
                onClick={() => void handleSaveProfile()}
                type="button"
              >
                {isSavingProfile ? 'Salvando...' : 'Salvar perfil fiscal'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
              <p className="font-semibold">Empresa ativa nesta configuracao</p>
              <p className="mt-1">
                {selectedClient?.companyName} | CNPJ {selectedClient?.cnpj || 'Nao informado'} | {selectedClient?.city || '-'} / {selectedClient?.state || '-'}
              </p>
              <p className="mt-1 text-xs">
                Troque a empresa pelo seletor fixo no topo. Ao trocar, os dados desta aba sao limpos e recarregados.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-2 font-semibold text-slate-900">{profile.approvalStatus}</p>
              <p className="mt-1 text-xs">{profile.active ? 'Perfil ativo' : 'Perfil inativo'}</p>
              {profileId && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.approvalStatus !== 'Aprovado' && (
                    <button
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      onClick={() => void handleApproveProfile()}
                      type="button"
                    >
                      Aprovar
                    </button>
                  )}
                  {profile.approvalStatus !== 'Bloqueado' && (
                    <button
                      className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                      onClick={() => void handleRejectProfile()}
                      type="button"
                    >
                      Rejeitar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {enrichmentSuggestions.length > 0 && (
            <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
              <div className="flex flex-col justify-between gap-3 border-b border-indigo-100 pb-4 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Previa de atualizacao</p>
                  <h4 className="mt-2 text-lg font-bold text-slate-900">Sugestoes cadastrais encontradas</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Revise campo por campo. Valores ja confirmados no perfil aprovado nao sao marcados automaticamente.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setEnrichmentSuggestions([])
                      setSelectedEnrichmentFields(new Set())
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="h-10 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                    disabled={isApplyingEnrichment}
                    onClick={() => void handleApplyEnrichment()}
                    type="button"
                  >
                    {isApplyingEnrichment ? 'Aplicando...' : 'Aplicar selecionados'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {enrichmentSuggestions.map((suggestion) => (
                  <label
                    className={`rounded-2xl border bg-white p-4 text-sm ${
                      suggestion.blocked ? 'border-amber-200' : 'border-slate-100'
                    }`}
                    key={`${suggestion.field}-${suggestion.source}-${suggestion.suggestedValue}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-3">
                        <input
                          checked={selectedEnrichmentFields.has(suggestion.field)}
                          disabled={suggestion.blocked}
                          onChange={(event) => toggleEnrichmentField(suggestion.field, event.target.checked)}
                          type="checkbox"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{suggestion.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Fonte: {fieldSourceLabel(suggestion.source)} | {suggestion.reason}
                          </p>
                        </div>
                      </div>
                      {suggestion.blocked && (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          Confirmado: nao sobrescrever automaticamente
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Atual</p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-700">{suggestion.currentValue}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Sugerido</p>
                        <p className="mt-1 whitespace-pre-wrap text-emerald-900">{suggestion.suggestedValue}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-cnpj">
                CNPJ
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-cnpj"
                onChange={(event) => updateProfile('cnpj', event.target.value)}
                value={profile.cnpj}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-ie">
                Inscricao estadual
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-ie"
                onChange={(event) => updateProfile('stateRegistration', event.target.value)}
                value={profile.stateRegistration}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-im">
                Inscricao municipal
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-im"
                onChange={(event) => updateProfile('municipalRegistration', event.target.value)}
                value={profile.municipalRegistration}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-city">
                Cidade
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-city"
                onChange={(event) => updateProfile('city', event.target.value)}
                value={profile.city}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-uf">
                UF
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm uppercase outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-uf"
                maxLength={2}
                onChange={(event) => updateProfile('stateUf', event.target.value.toUpperCase())}
                value={profile.stateUf}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-ibge">
                Codigo IBGE municipio
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-ibge"
                onChange={(event) => updateProfile('cityIbgeCode', event.target.value)}
                value={profile.cityIbgeCode}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-cnae">
                CNAE principal
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-cnae"
                onChange={(event) => updateProfile('mainCnae', event.target.value)}
                value={profile.mainCnae}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-regime">
                Regime tributario
              </label>
              <select
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-regime"
                onChange={(event) => updateProfile('taxRegime', event.target.value)}
                value={profile.taxRegime}
              >
                {taxRegimeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-crt">
                CRT
              </label>
              <select
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-crt"
                onChange={(event) => updateProfile('crt', event.target.value)}
                value={profile.crt}
              >
                {crtOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-icms-indicator">
                Indicador ICMS
              </label>
              <select
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-icms-indicator"
                onChange={(event) => updateProfile('icmsTaxpayerIndicator', event.target.value)}
                value={profile.icmsTaxpayerIndicator}
              >
                {taxpayerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-series">
                Serie NF-e padrao
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-series"
                onChange={(event) => updateProfile('defaultNfeSeries', event.target.value)}
                value={profile.defaultNfeSeries}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-environment">
                Ambiente padrao
              </label>
              <select
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-environment"
                onChange={(event) =>
                  updateProfile('defaultEnvironment', event.target.value === 'producao' ? 'producao' : 'homologacao')
                }
                value={profile.defaultEnvironment}
              >
                <option value="homologacao">Homologacao</option>
                <option value="producao">Producao</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-pis-cofins">
                Regime PIS/COFINS
              </label>
              <select
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-pis-cofins"
                onChange={(event) => updateProfile('pisCofinsRegime', event.target.value)}
                value={profile.pisCofinsRegime}
              >
                {pisCofinsOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
              <input
                checked={profile.defaultFinalConsumer}
                onChange={(event) => updateProfile('defaultFinalConsumer', event.target.checked)}
                type="checkbox"
              />
              Consumidor final por padrao
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
              <input
                checked={profile.active}
                onChange={(event) => updateProfile('active', event.target.checked)}
                type="checkbox"
              />
              Perfil ativo
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-secondary-cnaes">
                CNAEs secundarios
              </label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-secondary-cnaes"
                onChange={(event) => setSecondaryCnaesText(event.target.value)}
                placeholder="Um CNAE por linha, ou separados por virgula."
                value={secondaryCnaesText}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="fiscal-notes">
                Observacoes fiscais
              </label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="fiscal-notes"
                onChange={(event) => updateProfile('fiscalNotes', event.target.value)}
                placeholder="Ex: regra especial do cliente, beneficio fiscal, observacoes do contador."
                value={profile.fiscalNotes}
              />
            </div>
          </div>
        </section>
      )}

      {activeTab === 'ncm' && (
      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">NCM oficial</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Tabela NCM</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sincronize a tabela oficial e pesquise codigos para usar em produtos e regras fiscais.
              </p>
            </div>
            <button
              className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              disabled={isSyncing}
              onClick={() => void handleSync()}
              type="button"
            >
              {isSyncing ? 'Sincronizando...' : 'Atualizar NCM'}
            </button>
          </div>

          <div className={`mt-6 rounded-2xl border p-4 text-sm ${statusTone(syncStatus?.status)}`}>
            {isLoadingStatus ? (
              'Carregando status...'
            ) : syncStatus ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>Status: {syncStatus.status}</strong>
                  <span>Finalizado em {formatDateTime(syncStatus.finishedAt)}</span>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-4">
                  <span>Total: {syncStatus.totalCodes}</span>
                  <span>Inseridos: {syncStatus.insertedCodes}</span>
                  <span>Atualizados: {syncStatus.updatedCodes}</span>
                  <span>Inativados: {syncStatus.deactivatedCodes}</span>
                  <span>Rejeitados: {syncStatus.rejectedCodes}</span>
                  <span>Fonte: {syncStatus.source || 'Nao informada'}</span>
                  <span>Versao: {syncStatus.sourceVersion || 'Nao informada'}</span>
                  <span>Duracao: {syncStatus.durationMs ? `${syncStatus.durationMs} ms` : 'Nao registrada'}</span>
                </div>
                {syncStatus.errorMessage && <p className="text-rose-700">{syncStatus.errorMessage}</p>}
              </div>
            ) : (
              'Nenhuma sincronizacao registrada ainda.'
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-sm font-bold text-slate-900">Importar arquivo XLSX</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Use somente como contingencia quando a fonte automatica falhar. O arquivo deve ser uma planilha XLSX
                  oficial ou compatível com colunas de código e descrição NCM.
                </p>
                {selectedNcmFile && (
                  <p className="mt-2 text-xs font-semibold text-indigo-700">
                    Selecionado: {selectedNcmFile.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Selecionar XLSX
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
                    className="sr-only"
                    onChange={(event) => setSelectedNcmFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                <button
                  className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isImportingNcm || !selectedNcmFile}
                  onClick={() => void handleImportNcmFile()}
                  type="button"
                >
                  {isImportingNcm ? 'Importando...' : 'Importar XLSX'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-semibold text-slate-700" htmlFor="ncm-search">
              Buscar NCM
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                className="h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="ncm-search"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSearch()
                  }
                }}
                placeholder="Ex: 8504, transformador, software..."
                value={query}
              />
              <button
                className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={isSearching}
                onClick={() => void handleSearch()}
                type="button"
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Resultado</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">NCM encontrados</h3>
            </div>
            <p className="text-sm text-slate-500">
              {items.length} resultado(s), {totalActive} ativo(s)
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <div className="grid grid-cols-[130px_1fr_110px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              <span>Codigo</span>
              <span>Descricao</span>
              <span>Status</span>
            </div>
            {items.length ? (
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div
                    className="grid grid-cols-[130px_1fr_110px] gap-3 px-4 py-4 text-sm text-slate-700"
                    key={item.code}
                  >
                    <strong className="text-slate-900">{item.formattedCode || formatNcmCode(item.code)}</strong>
                    <span>{item.description || 'Sem descricao'}</span>
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                        item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-slate-500">
                Pesquise um codigo ou descricao depois de sincronizar a tabela NCM.
              </div>
            )}
          </div>
        </article>
      </section>
      )}

      {activeTab === 'produtos' && !hasSelectedCompany && <CompanySelectionRequired />}

      {activeTab === 'produtos' && hasSelectedCompany && (
        <FiscalProductsPanel
          clientId={clientId}
          companyLabel={selectedCompanyLabel}
          onChanged={() => void loadReadinessData()}
          onError={setError}
          onFeedback={setFeedback}
          organizationId={organizationId}
        />
      )}

      {activeTab === 'regras' && !hasSelectedCompany && <CompanySelectionRequired />}

      {activeTab === 'regras' && hasSelectedCompany && (
        <FiscalRulesPanel
          clientId={clientId}
          companyLabel={selectedCompanyLabel}
          onChanged={() => void loadReadinessData()}
          onError={setError}
          onFeedback={setFeedback}
          organizationId={organizationId}
        />
      )}

      {activeTab === 'simulador' && !hasSelectedCompany && <CompanySelectionRequired />}

      {activeTab === 'simulador' && hasSelectedCompany && (
        <FiscalSimulatorPanel
          client={selectedClient}
          clientId={clientId}
          companyLabel={selectedCompanyLabel}
          onError={setError}
          onFeedback={setFeedback}
          organizationId={organizationId}
        />
      )}

      <section className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50 p-6 text-sm leading-6 text-indigo-900">
        <h3 className="text-lg font-semibold">Proximo passo do modulo fiscal</h3>
        <p className="mt-2">
          Fluxo recomendado: aprove o perfil fiscal, cadastre produtos, crie regras ativas/aprovadas e valide no
          simulador antes de gerar XML ou transmitir uma NF-e real.
        </p>
      </section>
    </DashboardLayout>
  )
}

function CompanyFact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 min-h-5 font-semibold text-slate-900">{value?.trim() || 'Nao informado'}</p>
    </div>
  )
}

function CompanySelectionRequired() {
  return (
    <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Empresa obrigatoria</p>
      <h3 className="mt-2 text-xl font-bold">Selecione a empresa emissora para continuar</h3>
      <p className="mt-2 max-w-3xl">
        Esta etapa fica bloqueada ate que uma empresa cliente seja escolhida no seletor superior. Isso impede edicao,
        simulacao ou emissao usando dados fiscais de outra empresa.
      </p>
    </section>
  )
}
