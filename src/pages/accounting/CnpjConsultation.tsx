import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CnpjForm } from '../../components/cnpj/CnpjForm'
import { CompanySummary } from '../../components/cnpj/CompanySummary'
import { DynamicJsonRenderer } from '../../components/cnpj/DynamicJsonRenderer'
import { ErrorMessage } from '../../components/cnpj/ErrorMessage'
import { FieldCounter } from '../../components/cnpj/FieldCounter'
import { JsonViewer } from '../../components/cnpj/JsonViewer'
import { Loading } from '../../components/cnpj/Loading'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { createAccountingClient, listAccountingClients } from '../../services/accountingRepository'
import { consultPublicCnpj } from '../../services/cnpjService'
import { resolveOrganizationId } from '../../services/platformService'
import type { ClientCompanySize, ClientTaxRegime } from '../../types/accounting'
import { formatCnpj, onlyDigits } from '../../utils/formatters'
import { countJsonFields } from '../../utils/jsonUtils'

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getText(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function cnpjFromData(data: Record<string, unknown>) {
  const estabelecimento = getRecord(data.estabelecimento)
  return onlyDigits(
    `${getText(data.cnpj_raiz)}${getText(estabelecimento.cnpj_ordem)}${getText(estabelecimento.cnpj_digito_verificador)}`,
  )
}

function mapCompanySize(value: unknown): ClientCompanySize {
  const text = getText(value).toLowerCase()
  if (text.includes('microempreendedor')) return 'MEI'
  if (text.includes('micro')) return 'ME'
  if (text.includes('pequeno')) return 'EPP'
  if (text.includes('medio') || text.includes('médio')) return 'Medio porte'
  if (text.includes('grande')) return 'Grande porte'
  return value ? 'Demais' : 'Nao informado'
}

function mapTaxRegime(data: Record<string, unknown>): ClientTaxRegime {
  const simples = getRecord(data.simples)
  const mei = getRecord(data.mei)
  const simplesValue = getText(simples.simples ?? simples.optante).toLowerCase()
  const meiValue = getText(mei.mei ?? mei.optante).toLowerCase()

  if (meiValue === 'sim' || meiValue === 'true') return 'MEI'
  if (simplesValue === 'sim' || simplesValue === 'true') return 'Simples Nacional'
  return 'Nao informado'
}

function buildClientFromCnpjData(data: Record<string, unknown>) {
  const estabelecimento = getRecord(data.estabelecimento)
  const cidade = getRecord(estabelecimento.cidade)
  const estado = getRecord(estabelecimento.estado)
  const naturezaJuridica = getRecord(data.natureza_juridica)
  const porte = getRecord(data.porte)
  const atividadePrincipal = getRecord(estabelecimento.atividade_principal)
  const phone = [estabelecimento.ddd1, estabelecimento.telefone1].filter(Boolean).join('')

  return {
    companyName: getText(data.razao_social),
    cnpj: cnpjFromData(data),
    phone,
    email: getText(estabelecimento.email).toLowerCase(),
    cep: getText(estabelecimento.cep),
    address: [estabelecimento.tipo_logradouro, estabelecimento.logradouro].filter(Boolean).join(' '),
    addressNumber: getText(estabelecimento.numero),
    addressComplement: getText(estabelecimento.complemento),
    neighborhood: getText(estabelecimento.bairro),
    city: getText(cidade.nome),
    state: getText(estado.sigla),
    cityIbgeCode: getText(cidade.ibge_id ?? cidade.codigo_ibge),
    stateRegistration: '',
    municipalRegistration: '',
    taxRegime: mapTaxRegime(data),
    companySize: mapCompanySize(porte.descricao),
    mainCnae: [atividadePrincipal.id, atividadePrincipal.descricao].filter(Boolean).join(' - '),
    legalNature: getText(naturezaJuridica.descricao),
    photoData: '',
    isMonthly: true,
    monthlyFee: 0,
  }
}

export function CnpjConsultation() {
  const [searchParams] = useSearchParams()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAddingClient, setIsAddingClient] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [showAllData, setShowAllData] = useState(true)

  const counter = useMemo(() => countJsonFields(data), [data])

  useEffect(() => {
    let active = true

    resolveOrganizationId(searchParams.get('organization'))
      .then((id) => {
        if (active) setOrganizationId(id)
      })
      .catch(() => {
        if (active) setOrganizationId(null)
      })

    return () => {
      active = false
    }
  }, [searchParams])

  async function handleSearch() {
    const digits = onlyDigits(cnpj)

    if (digits.length !== 14) {
      setError('CNPJ invalido. Informe 14 digitos.')
      return
    }

    setIsLoading(true)
    setError('')
    setFeedback('')

    try {
      setData(await consultPublicCnpj(digits))
    } catch (searchError) {
      setData(null)
      setError(searchError instanceof Error ? searchError.message : 'Erro inesperado na consulta.')
    } finally {
      setIsLoading(false)
    }
  }

  function clearSearch() {
    setCnpj('')
    setData(null)
    setError('')
    setFeedback('')
    setShowRawJson(false)
    setShowAllData(true)
  }

  async function addCompanyToSystem() {
    if (!data) return

    if (!organizationId) {
      setError('Nao foi possivel identificar o escritorio para salvar a empresa.')
      return
    }

    const client = buildClientFromCnpjData(data)
    if (!client.companyName || onlyDigits(client.cnpj).length !== 14) {
      setError('A consulta nao retornou dados suficientes para cadastrar a empresa.')
      return
    }

    setIsAddingClient(true)
    setError('')
    setFeedback('')

    try {
      const existingClients = await listAccountingClients(organizationId)
      const alreadyExists = existingClients.some((item) => onlyDigits(item.cnpj) === onlyDigits(client.cnpj))

      if (alreadyExists) {
        setFeedback('Esta empresa ja esta cadastrada no sistema.')
        return
      }

      await createAccountingClient(organizationId, client)
      setFeedback('Empresa adicionada ao sistema com sucesso.')
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Nao foi possivel adicionar a empresa.')
    } finally {
      setIsAddingClient(false)
    }
  }

  return (
    <DashboardLayout title="Consulta de CNPJ">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">Dados publicos</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Consulta de CNPJ</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Consulte dados publicos de empresas brasileiras pela API publica CNPJ.ws e visualize o retorno completo.
        </p>
      </div>

      <div className="space-y-6">
        <CnpjForm
          cnpj={formatCnpj(cnpj)}
          isLoading={isLoading}
          onChange={setCnpj}
          onClear={clearSearch}
          onSubmit={() => void handleSearch()}
        />

        {isLoading && <Loading />}
        {error && <ErrorMessage message={error} />}
        {feedback && <Alert type="success">{feedback}</Alert>}

        {data && (
          <>
            <FieldCounter counter={counter} />
            <CompanySummary data={data} />

            <section className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Adicionar esta empresa ao sistema</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    O cadastro sera criado em Gestao de Clientes com os dados principais retornados pela consulta.
                  </p>
                </div>
                <Button disabled={!organizationId} isLoading={isAddingClient} onClick={() => void addCompanyToSystem()}>
                  Adicionar empresa
                </Button>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Todos os dados retornados</h3>
                  <p className="mt-1 text-sm text-slate-500">Renderizacao dinamica e recursiva do JSON.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setShowAllData((current) => !current)}
                    type="button"
                  >
                    {showAllData ? 'Recolher dados' : 'Expandir dados'}
                  </button>
                  <button
                    className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    onClick={() => setShowRawJson((current) => !current)}
                    type="button"
                  >
                    {showRawJson ? 'Ocultar JSON bruto' : 'Ver JSON bruto'}
                  </button>
                </div>
              </div>

              {showAllData && (
                <div className="mt-5">
                  <DynamicJsonRenderer data={data} />
                </div>
              )}
            </section>

            {showRawJson && <JsonViewer data={data} />}
          </>
        )}

        <footer className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Consulta informativa com dados publicos. Confirme as informacoes oficiais quando necessario.
        </footer>
      </div>
    </DashboardLayout>
  )
}
