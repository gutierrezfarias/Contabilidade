import { useMemo, useState } from 'react'
import { CnpjForm } from '../../components/cnpj/CnpjForm'
import { CompanySummary } from '../../components/cnpj/CompanySummary'
import { DynamicJsonRenderer } from '../../components/cnpj/DynamicJsonRenderer'
import { ErrorMessage } from '../../components/cnpj/ErrorMessage'
import { FieldCounter } from '../../components/cnpj/FieldCounter'
import { JsonViewer } from '../../components/cnpj/JsonViewer'
import { Loading } from '../../components/cnpj/Loading'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { consultPublicCnpj } from '../../services/cnpjService'
import { formatCnpj, onlyDigits } from '../../utils/formatters'
import { countJsonFields } from '../../utils/jsonUtils'

export function CnpjConsultation() {
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [showAllData, setShowAllData] = useState(true)

  const counter = useMemo(() => countJsonFields(data), [data])

  async function handleSearch() {
    const digits = onlyDigits(cnpj)

    if (digits.length !== 14) {
      setError('CNPJ invalido. Informe 14 digitos.')
      return
    }

    setIsLoading(true)
    setError('')

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
    setShowRawJson(false)
    setShowAllData(true)
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

        {data && (
          <>
            <FieldCounter counter={counter} />
            <CompanySummary data={data} />

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
