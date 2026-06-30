import { useState } from 'react'
import { Button } from '../ui/Button'
import { confirmManualRevenueImport, previewManualRevenueImport } from '../../services/serproService'
import { formatDateTime, recordNumber, recordString } from '../../utils/serproRecords'

type ClientOption = { companyName: string; cnpj: string; id: string }

type Props = {
  clients: ClientOption[]
  history: Array<Record<string, unknown>>
  organizationId: string
  onError: (message: string) => void
  onMessage: (message: string) => void
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function ManualImportPanel({ clients, history, organizationId, onError, onMessage }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)

  function updateItem(index: number, patch: Record<string, unknown>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  async function preview() {
    onError('')
    onMessage('')
    setLoading(true)
    try {
      const result = await previewManualRevenueImport(organizationId, files)
      setItems(result.items)
      onMessage(result.message)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel gerar a previa.')
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    onError('')
    onMessage('')
    setLoading(true)
    try {
      const result = await confirmManualRevenueImport(organizationId, files, items)
      onMessage(`${result.message} Importados: ${result.importedCount}. Duplicados: ${result.duplicateCount}. Erros: ${result.errorCount}.`)
      setItems([])
      setFiles([])
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nao foi possivel confirmar a importacao.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Sem consumo SERPRO</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">Importacao manual do e-CAC</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Importe arquivos baixados manualmente do e-CAC: PDF, XML, JSON, CSV ou ZIP. Essa modalidade nao chama a API SERPRO e nao consome creditos SERPRO.
        </p>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          O sistema bloqueia extensoes executaveis, ZIP perigoso e conteudo suspeito. Confira sempre cliente, tipo e competencia na previa antes de confirmar.
        </div>
        <input
          accept=".pdf,.xml,.json,.csv,.zip,application/pdf,application/xml,text/xml,application/json,text/csv,application/zip"
          className="mt-5 block w-full rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-5 text-sm"
          multiple
          type="file"
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []))
            setItems([])
          }}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={files.length === 0} isLoading={loading} onClick={preview}>Gerar previa</Button>
          <Button disabled={items.length === 0} isLoading={loading} onClick={confirm} variant="secondary">Confirmar importacao</Button>
        </div>
        {items.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Arquivo</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">CPF/CNPJ</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Competencia</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ignorar</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={recordString(item, 'id', 'fileHash') || String(index)}>
                    <td className="max-w-56 px-3 py-3 font-medium text-slate-900">{recordString(item, 'fileName')}</td>
                    <td className="px-3 py-3"><select className="h-10 min-w-52 rounded-xl border border-slate-200 px-3" value={recordString(item, 'clientId')} onChange={(event) => updateItem(index, { clientId: event.target.value })}><option value="">Cliente nao encontrado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.companyName} - {client.cnpj}</option>)}</select></td>
                    <td className="px-3 py-3">{recordString(item, 'taxId') || 'Nao identificado'}</td>
                    <td className="px-3 py-3"><input className="h-10 w-44 rounded-xl border border-slate-200 px-3" value={recordString(item, 'documentType')} onChange={(event) => updateItem(index, { documentType: event.target.value })} /></td>
                    <td className="px-3 py-3"><input className="h-10 w-32 rounded-xl border border-slate-200 px-3" value={recordString(item, 'competency')} onChange={(event) => updateItem(index, { competency: event.target.value })} /></td>
                    <td className="px-3 py-3">{recordNumber(item, 'amount') ? money(recordNumber(item, 'amount')) : 'Nao informado'}</td>
                    <td className="px-3 py-3">{recordString(item, 'actionRequired', 'matchStatus') || 'Revisar'}</td>
                    <td className="px-3 py-3"><input checked={Boolean(item.ignored)} type="checkbox" onChange={(event) => updateItem(index, { ignored: event.target.checked })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-bold text-slate-950">Historico de importacoes</h3>
        <div className="mt-4 space-y-3">
          {history.map((item) => <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 text-sm sm:grid-cols-4" key={recordString(item, 'id')}><span><strong>Status:</strong> {recordString(item, 'status')}</span><span><strong>Importados:</strong> {recordNumber(item, 'imported_count')}</span><span><strong>Duplicados:</strong> {recordNumber(item, 'duplicate_count')}</span><span><strong>Data:</strong> {formatDateTime(recordString(item, 'created_at'))}</span></div>)}
          {history.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma importacao confirmada ainda.</p>}
        </div>
      </section>
    </div>
  )
}
