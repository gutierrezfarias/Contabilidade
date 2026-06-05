import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  loadPlatformCompanySettings,
  savePlatformCompanySettings,
} from '../../services/adminSettingsService'
import {
  deleteFinancialApiIntegration,
  listFinancialApiIntegrations,
  saveFinancialApiIntegration,
} from '../../services/financialIntegrationService'
import {
  canLookupPostalCode,
  getPostalFieldKey,
  lookupCompanyAddress,
} from '../../services/postalCodeService'
import { formatPhone, formatPostalCode, isValidEmail } from '../../utils/formatters'
import { AdminHomeSettingsPanel } from './AdminHomePage'
import type {
  FinancialApiIntegration,
  FinancialIntegrationStatus,
} from '../../types/financialIntegrations'

type SettingsTab = 'empresa' | 'financeiro' | 'pagina-inicial'

type CompanyField = {
  key: string
  label: string
  placeholder?: string
}

const settingsTabs: Array<{ id: SettingsTab; label: string; description: string }> = [
  {
    id: 'empresa',
    label: 'Dados da Empresa',
    description: 'Informacoes da sua empresa/plataforma.',
  },
  {
    id: 'financeiro',
    label: 'Integracoes financeiras',
    description: 'Gateways e bancos para receber assinaturas.',
  },
  {
    id: 'pagina-inicial',
    label: 'Pagina inicial',
    description: 'Slider, banners e footer do site publico.',
  },
]

const countries = [
  { code: 'BR', name: 'Brasil' },
  { code: 'PY', name: 'Paraguai' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'PT', name: 'Portugal' },
  { code: 'UY', name: 'Uruguai' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'OTHER', name: 'Outro pais' },
]

const companyFieldsByCountry: Record<string, CompanyField[]> = {
  BR: [
    { key: 'razaoSocial', label: 'Razao social', placeholder: 'CONT HUB LTDA' },
    { key: 'nomeFantasia', label: 'Nome fantasia', placeholder: 'CONT HUB' },
    { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
    { key: 'inscricaoEstadual', label: 'Inscricao estadual' },
    { key: 'inscricaoMunicipal', label: 'Inscricao municipal' },
    { key: 'regimeTributario', label: 'Regime tributario', placeholder: 'Simples Nacional, Lucro Presumido...' },
    { key: 'cnae', label: 'CNAE principal' },
    { key: 'cep', label: 'CEP', placeholder: '00000-000' },
    { key: 'endereco', label: 'Endereco fiscal' },
    { key: 'numero', label: 'Numero' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'cidade', label: 'Cidade' },
    { key: 'estado', label: 'Estado / UF', placeholder: 'SP, PB, PE...' },
    { key: 'email', label: 'E-mail financeiro' },
    { key: 'telefone', label: 'Telefone' },
  ],
  PY: [
    { key: 'razonSocial', label: 'Razon social', placeholder: 'Nome legal da empresa' },
    { key: 'nombreComercial', label: 'Nome comercial' },
    { key: 'ruc', label: 'RUC', placeholder: 'Registro unico do contribuinte' },
    { key: 'digitoVerificador', label: 'Digito verificador' },
    { key: 'registroComercial', label: 'Registro comercial / matricula' },
    { key: 'patenteComercial', label: 'Patente comercial' },
    { key: 'actividadEconomica', label: 'Atividade economica' },
    { key: 'direccionFiscal', label: 'Endereco fiscal' },
    { key: 'ciudad', label: 'Cidade' },
    { key: 'departamento', label: 'Departamento' },
    { key: 'representanteLegal', label: 'Representante legal' },
    { key: 'documentoRepresentante', label: 'Documento do representante' },
    { key: 'email', label: 'E-mail financeiro' },
    { key: 'telefone', label: 'Telefone' },
  ],
  US: [
    { key: 'legalName', label: 'Legal name' },
    { key: 'tradeName', label: 'Trade name' },
    { key: 'ein', label: 'EIN' },
    { key: 'stateRegistration', label: 'State registration' },
    { key: 'businessAddress', label: 'Business address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zipCode', label: 'ZIP Code' },
    { key: 'email', label: 'Billing e-mail' },
    { key: 'phone', label: 'Phone' },
  ],
  PT: [
    { key: 'denominacaoSocial', label: 'Denominacao social' },
    { key: 'nif', label: 'NIF' },
    { key: 'cae', label: 'CAE' },
    { key: 'moradaFiscal', label: 'Morada fiscal' },
    { key: 'localidade', label: 'Localidade' },
    { key: 'codigoPostal', label: 'Codigo postal' },
    { key: 'email', label: 'E-mail financeiro' },
    { key: 'telefone', label: 'Telefone' },
  ],
  OTHER: [
    { key: 'legalName', label: 'Nome legal da empresa' },
    { key: 'tradeName', label: 'Nome comercial' },
    { key: 'taxId', label: 'Identificador fiscal' },
    { key: 'registrationNumber', label: 'Registro comercial' },
    { key: 'address', label: 'Endereco fiscal' },
    { key: 'city', label: 'Cidade' },
    { key: 'region', label: 'Estado / Regiao' },
    { key: 'email', label: 'E-mail financeiro' },
    { key: 'phone', label: 'Telefone' },
  ],
}

function isEmailField(key: string) {
  return key.toLowerCase().includes('email')
}

function isPhoneField(key: string) {
  return key === 'telefone' || key === 'phone'
}

const paymentProviders = [
  {
    provider: 'asaas',
    name: 'Asaas',
    recommendation: 'Recomendado para comecar',
    fit: 'Assinaturas e cobrancas recorrentes para clientes no Brasil.',
    methods: 'Pix, boleto, cartao de credito/debito e conta digital.',
    notes: 'Boa escolha inicial para SaaS pequeno/medio porque junta cliente, cobranca, recorrencia e webhooks.',
    url: 'https://docs.asaas.com/docs',
    fields: [
      { key: 'environment', label: 'Ambiente', placeholder: 'sandbox ou production' },
      { key: 'apiKey', label: 'API Key' },
      { key: 'webhookToken', label: 'Token do webhook' },
      { key: 'walletId', label: 'Wallet ID / carteira' },
      { key: 'pixKey', label: 'Chave Pix' },
    ],
    instructions: [
      'Crie uma conta no Asaas e habilite o acesso a API.',
      'Gere a API Key no painel do Asaas.',
      'Configure o webhook de cobrancas para sua futura API backend.',
      'Use sandbox para testes antes de ativar producao.',
    ],
  },
  {
    provider: 'pagarme',
    name: 'Pagar.me',
    recommendation: 'Gateway robusto',
    fit: 'Checkout, cartao, boleto, Pix e operacoes com mais volume.',
    methods: 'Cartao, boleto, Pix, debito, voucher e transferencias.',
    notes: 'Interessante quando precisar de gateway mais completo e maior controle antifraude.',
    url: 'https://docs.pagar.me/docs/getting-started',
    fields: [
      { key: 'environment', label: 'Ambiente', placeholder: 'sandbox ou production' },
      { key: 'secretKey', label: 'Secret Key' },
      { key: 'publicKey', label: 'Public Key' },
      { key: 'accountId', label: 'Account ID' },
      { key: 'webhookSecret', label: 'Webhook Secret' },
    ],
    instructions: [
      'Crie a conta Pagar.me e acesse o painel de desenvolvedores.',
      'Copie as chaves publica e secreta do ambiente correto.',
      'Cadastre a URL do webhook da sua API backend.',
      'Valide eventos de pagamento aprovado, recusado e cancelado.',
    ],
  },
  {
    provider: 'efi',
    name: 'Efi Bank',
    recommendation: 'Boa opcao Pix/boleto',
    fit: 'Cobrancas Pix, boleto e automacoes financeiras.',
    methods: 'Pix, boleto, cartao e APIs bancarias.',
    notes: 'Boa alternativa quando o foco for Pix/boleto com conta financeira mais proxima do banco.',
    url: 'https://dev.efipay.com.br/',
    fields: [
      { key: 'environment', label: 'Ambiente', placeholder: 'sandbox ou production' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret' },
      { key: 'pixKey', label: 'Chave Pix' },
      { key: 'certificateReference', label: 'Referencia do certificado' },
    ],
    instructions: [
      'Crie uma aplicacao no painel Efi Bank.',
      'Copie Client ID e Client Secret.',
      'Configure a chave Pix e os webhooks.',
      'Certificados e secrets devem ficar em backend/cofre seguro.',
    ],
  },
  {
    provider: 'mercadopago',
    name: 'Mercado Pago',
    recommendation: 'Facil de iniciar',
    fit: 'Links de pagamento, checkout e Pix para operacao simples.',
    methods: 'Pix, cartao, boleto e checkout.',
    notes: 'Forte pela facilidade comercial, mas avalie taxas, conciliacao e suporte para recorrencia.',
    url: 'https://www.mercadopago.com.br/developers/pt/docs',
    fields: [
      { key: 'environment', label: 'Ambiente', placeholder: 'sandbox ou production' },
      { key: 'accessToken', label: 'Access Token' },
      { key: 'publicKey', label: 'Public Key' },
      { key: 'collectorId', label: 'Collector ID' },
      { key: 'webhookSecret', label: 'Webhook Secret' },
    ],
    instructions: [
      'Acesse Credenciais no painel de desenvolvedores Mercado Pago.',
      'Copie Access Token e Public Key do ambiente correto.',
      'Configure notificacoes/webhooks na futura API backend.',
      'Teste Pix, cartao e cancelamento antes de producao.',
    ],
  },
]

export function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('aba') as SettingsTab | null
  const activeTab = settingsTabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'empresa'
  const [countryCode, setCountryCode] = useState('BR')
  const [companyFields, setCompanyFields] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedCountryFields = useMemo(
    () => companyFieldsByCountry[countryCode] ?? companyFieldsByCountry.OTHER,
    [countryCode],
  )

  useEffect(() => {
    let active = true

    loadPlatformCompanySettings()
      .then((settings) => {
        if (!active) return
        setCountryCode(settings.countryCode)
        setCompanyFields(settings.fields)
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar os dados da empresa.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  function changeTab(tab: SettingsTab) {
    setSearchParams({ aba: tab })
    setFeedback('')
    setError('')
  }

  function updateCompanyField(key: string, value: string) {
    const postalFieldKey = getPostalFieldKey(countryCode)
    const nextValue =
      key === postalFieldKey
        ? formatPostalCode(countryCode, value)
        : isPhoneField(key)
        ? formatPhone(countryCode, value)
        : value
    setCompanyFields((current) => ({ ...current, [key]: nextValue }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  async function handlePostalLookup() {
    const postalFieldKey = getPostalFieldKey(countryCode)
    if (!postalFieldKey) {
      setError('Preenchimento automatico ainda nao configurado para este pais.')
      setFeedback('')
      return
    }

    try {
      const result = await lookupCompanyAddress(countryCode, companyFields[postalFieldKey] ?? '')
      setCompanyFields((current) => ({ ...current, ...result.fields }))
      setFeedback(result.message)
      setError('')
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Nao foi possivel consultar o endereco.')
      setFeedback('')
    }
  }

  async function saveCompanyData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFieldErrors: Record<string, string> = {}

    selectedCountryFields.forEach((field) => {
      const value = companyFields[field.key]?.trim()
      if (isEmailField(field.key) && value && !isValidEmail(value)) {
        nextFieldErrors[field.key] = 'Informe um e-mail valido.'
      }
    })

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors)
      setError('Corrija os campos destacados antes de salvar.')
      setFeedback('')
      return
    }

    try {
      await savePlatformCompanySettings({
        countryCode,
        fields: companyFields,
      })
      setFeedback('Dados da empresa salvos com sucesso.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar os dados da empresa.')
      setFeedback('')
    }
  }

  return (
    <AdminLayout title="Configuracoes">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
          Admin
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Configuracoes da plataforma
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Centralize aqui dados da sua empresa, integracoes financeiras e conteudo da pagina
          inicial.
        </p>
      </div>

      {feedback && <div className="mb-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}

      <div className="mb-7 grid gap-3 rounded-2xl bg-white p-2 shadow-sm lg:grid-cols-3">
        {settingsTabs.map((tab) => (
          <button
            className={`rounded-xl p-4 text-left transition ${
              activeTab === tab.id
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
            }`}
            key={tab.id}
            onClick={() => changeTab(tab.id)}
            type="button"
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span className={`mt-1 block text-xs ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {tab.description}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'empresa' && (
        <CompanyDataPanel
          companyFields={companyFields}
          countryCode={countryCode}
          fieldErrors={fieldErrors}
          fields={selectedCountryFields}
          onCountryChange={setCountryCode}
          onFieldChange={updateCompanyField}
          onPostalLookup={handlePostalLookup}
          onSubmit={saveCompanyData}
          postalLookupEnabled={canLookupPostalCode(countryCode)}
          postalLookupFieldKey={getPostalFieldKey(countryCode)}
        />
      )}

      {activeTab === 'financeiro' && <FinancialIntegrationsPanel />}

      {activeTab === 'pagina-inicial' && <AdminHomeSettingsPanel />}
    </AdminLayout>
  )
}

function CompanyDataPanel({
  companyFields,
  countryCode,
  fieldErrors,
  fields,
  onCountryChange,
  onFieldChange,
  onPostalLookup,
  onSubmit,
  postalLookupEnabled,
  postalLookupFieldKey,
}: {
  companyFields: Record<string, string>
  countryCode: string
  fieldErrors: Record<string, string>
  fields: CompanyField[]
  onCountryChange: (countryCode: string) => void
  onFieldChange: (key: string, value: string) => void
  onPostalLookup: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  postalLookupEnabled: boolean
  postalLookupFieldKey?: string
}) {
  const selectedCountry = countries.find((country) => country.code === countryCode)?.name ?? 'Outro pais'

  return (
    <form className="space-y-7" onSubmit={onSubmit}>
      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Dados da Empresa
            </p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              Informacoes administrativas
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Escolha o pais para adaptar os campos principais. Esta tela organiza os dados, mas a
              validacao fiscal final deve ser feita com contador/consultor local.
            </p>
          </div>
          <label className="block min-w-64 space-y-2 text-sm font-medium text-slate-700">
            <span>Pais da empresa</span>
            <select
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
              onChange={(event) => onCountryChange(event.target.value)}
              value={countryCode}
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
          Campos carregados para: <strong>{selectedCountry}</strong>.
          {postalLookupEnabled ? (
            <span className="ml-1">
              Preenchimento automatico disponivel pelo codigo postal.
            </span>
          ) : (
            <span className="ml-1">
              Preenchimento automatico ainda nao configurado para este pais.
            </span>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => {
            const isPostalLookupField = postalLookupEnabled && field.key === postalLookupFieldKey

            return (
              <div className={isPostalLookupField ? 'xl:col-span-3' : ''} key={field.key}>
                {isPostalLookupField ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <Input
                      id={`company-${field.key}`}
                      label={field.label}
                      error={fieldErrors[field.key]}
                      onBlur={() => {
                        if (companyFields[field.key]) void onPostalLookup()
                      }}
                      onChange={(event) => onFieldChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      value={companyFields[field.key] ?? ''}
                    />
                  </div>
                ) : (
                  <Input
                    error={fieldErrors[field.key]}
                    id={`company-${field.key}`}
                    label={field.label}
                    onChange={(event) => onFieldChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    type={isEmailField(field.key) ? 'email' : 'text'}
                    value={companyFields[field.key] ?? ''}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit">Salvar dados da empresa</Button>
      </div>
    </form>
  )
}

function FinancialIntegrationsPanel() {
  const [integrations, setIntegrations] = useState<FinancialApiIntegration[]>([])
  const [selectedProvider, setSelectedProvider] = useState(paymentProviders[0].provider)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [form, setForm] = useState<FinancialApiIntegration>(() => blankFinancialForm(paymentProviders[0].provider))
  const [showInstructions, setShowInstructions] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedTemplate =
    paymentProviders.find((provider) => provider.provider === selectedProvider) ?? paymentProviders[0]

  useEffect(() => {
    let active = true

    listFinancialApiIntegrations()
      .then((loadedIntegrations) => {
        if (active) setIntegrations(loadedIntegrations)
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar integracoes.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function reloadIntegrations() {
    setIntegrations(await listFinancialApiIntegrations())
  }

  function changeProvider(provider: string) {
    setSelectedProvider(provider)
    setEditingId(undefined)
    setForm(blankFinancialForm(provider))
    setShowInstructions(false)
    setFeedback('')
    setError('')
  }

  function updateConfig(key: string, value: string) {
    setForm((current) => ({
      ...current,
      config: { ...current.config, [key]: value },
    }))
  }

  function editIntegration(integration: FinancialApiIntegration) {
    setSelectedProvider(integration.provider)
    setEditingId(integration.id)
    setForm(integration)
    setShowInstructions(false)
    setFeedback('')
    setError('')
  }

  async function deleteIntegration(integrationId?: string) {
    if (!integrationId || !window.confirm('Excluir esta integracao financeira?')) return

    try {
      await deleteFinancialApiIntegration(integrationId)
      await reloadIntegrations()
      if (editingId === integrationId) {
        setEditingId(undefined)
        setForm(blankFinancialForm(selectedProvider))
      }
      setFeedback('Integracao financeira excluida.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Nao foi possivel excluir.')
      setFeedback('')
    }
  }

  async function saveIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Informe o nome da empresa/API financeira.')
      setFeedback('')
      return
    }

    try {
      await saveFinancialApiIntegration({
        ...form,
        id: editingId,
        provider: selectedProvider,
      })
      await reloadIntegrations()
      setEditingId(undefined)
      setForm(blankFinancialForm(selectedProvider))
      setFeedback('Integracao financeira salva com sucesso.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar.')
      setFeedback('')
    }
  }

  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
          Pagamentos
        </p>
        <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Integracoes financeiras
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Sugestao inicial para receber assinaturas dos clientes, liberar apps comprados e
          conciliar pagamentos automaticamente.
        </p>
      </div>

      {feedback && <div className="mb-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}

      <section className="mb-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <strong>Importante:</strong> nao recomendo usar banco fora do Brasil para evitar imposto.
        Isso pode gerar problema fiscal. Se a empresa vende para clientes brasileiros, o caminho
        correto e receber por uma estrutura declarada, emitir/registrar a receita e validar o
        enquadramento com contador.
      </section>

      <section className="mb-7 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Selecionar integracao financeira</span>
            <select
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
              onChange={(event) => changeProvider(event.target.value)}
              value={selectedProvider}
            >
              {paymentProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-slate-900">{selectedTemplate.name}</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                {selectedTemplate.recommendation}
              </span>
              <button
                aria-label={`Como configurar ${selectedTemplate.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white"
                onClick={() => setShowInstructions((current) => !current)}
                type="button"
              >
                i
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700">{selectedTemplate.fit}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{selectedTemplate.methods}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{selectedTemplate.notes}</p>
            <a
              className="mt-4 inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-800"
              href={selectedTemplate.url}
              rel="noreferrer"
              target="_blank"
            >
              Abrir documentacao
            </a>
            {showInstructions && (
              <div className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
                <p className="mb-2 font-semibold text-slate-900">Como configurar</p>
                <ol className="list-decimal space-y-1 pl-5">
                  {selectedTemplate.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-7 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={saveIntegration}>
          <div className="mb-5">
            <h3 className="text-xl font-semibold text-slate-900">
              {editingId ? 'Editar API financeira' : 'Adicionar API financeira'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Os campos mudam conforme a empresa selecionada. Em producao, tokens e certificados
              devem ficar em backend/cofre seguro.
            </p>
          </div>

          <div className="space-y-4">
            <Input
              id="financial-name"
              label="Nome da empresa/API"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={`Ex: ${selectedTemplate.name} principal`}
              value={form.name}
            />
            <Select
              label="Status"
              onChange={(value) => setForm((current) => ({ ...current, status: value as FinancialIntegrationStatus }))}
              value={form.status}
            >
              <option value="teste">Teste</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </Select>
            {selectedTemplate.fields.map((field) => (
              <Input
                id={`financial-${field.key}`}
                key={field.key}
                label={field.label}
                onChange={(event) => updateConfig(field.key, event.target.value)}
                placeholder={field.placeholder}
                type={field.key.toLowerCase().includes('secret') || field.key.toLowerCase().includes('token') || field.key.toLowerCase().includes('key') ? 'password' : 'text'}
                value={form.config[field.key] ?? ''}
              />
            ))}
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Observacoes</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-500"
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                value={form.notes}
              />
            </label>
            <CheckBox
              checked={form.active}
              label="Integracao ativa"
              onChange={(checked) => setForm((current) => ({ ...current, active: checked }))}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit">{editingId ? 'Salvar alteracoes' : 'Adicionar API'}</Button>
            {editingId && (
              <Button
                onClick={() => {
                  setEditingId(undefined)
                  setForm(blankFinancialForm(selectedProvider))
                }}
                variant="secondary"
              >
                Cancelar edicao
              </Button>
            )}
          </div>
        </form>

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-xl font-semibold text-slate-900">Empresas/API cadastradas</h3>
          <div className="space-y-4">
            {integrations.map((integration) => (
              <article className="rounded-2xl border border-slate-100 p-4" key={integration.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{integration.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {paymentProviders.find((provider) => provider.provider === integration.provider)?.name ?? integration.provider}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integration.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {integration.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">Status: {integration.status}</p>
                <div className="mt-4 flex gap-4 text-sm font-semibold">
                  <button className="text-indigo-600" onClick={() => editIntegration(integration)} type="button">
                    Editar
                  </button>
                  <button className="text-rose-600" onClick={() => void deleteIntegration(integration.id)} type="button">
                    Excluir
                  </button>
                </div>
              </article>
            ))}
            {integrations.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                Nenhuma empresa/API financeira cadastrada no banco.
              </p>
            )}
          </div>
        </section>
      </section>

      <section className="mt-7 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Sobre Nomad</h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Eu nao usaria Nomad como API principal para cobrar seus clientes brasileiros. A Nomad e
          mais adequada para conta global/recebimentos internacionais e transferencias em dolar; nao
          encontrei uma API publica oficial focada em checkout/assinatura local com Pix, boleto e
          cartao para o seu caso. Pode ser util para recebimentos internacionais legitimos, nao para
          fugir de tributacao.
        </p>
      </section>
    </>
  )
}

function blankFinancialForm(provider: string): FinancialApiIntegration {
  return {
    provider,
    name: '',
    status: 'teste',
    active: false,
    config: {},
    notes: '',
  }
}

function Select({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  )
}

function CheckBox({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  )
}
