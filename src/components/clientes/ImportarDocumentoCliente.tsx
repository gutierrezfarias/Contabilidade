import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { importClientDocument } from '../../services/documentImportService'
import type { ImportedClientDocument, ImportedClientDocumentFile } from '../../services/documentImportService'
import { Button } from '../ui/Button'

interface ImportarDocumentoClienteProps {
  onConfirm: (client: ImportedClientDocument, file: ImportedClientDocumentFile) => void
}

const acceptedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']

const previewFields: Array<{ key: keyof ImportedClientDocument; label: string }> = [
  { key: 'razaoSocial', label: 'Razao social' },
  { key: 'nomeFantasia', label: 'Nome fantasia' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'cep', label: 'CEP' },
  { key: 'endereco', label: 'Endereco' },
  { key: 'numero', label: 'Numero' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'Estado' },
  { key: 'cnaePrincipal', label: 'CNAE principal' },
  { key: 'naturezaJuridica', label: 'Natureza juridica' },
  { key: 'porte', label: 'Porte / enquadramento' },
  { key: 'regimeTributario', label: 'Regime tributario' },
  { key: 'situacaoCadastral', label: 'Situacao cadastral' },
]

export function ImportarDocumentoCliente({ onConfirm }: ImportarDocumentoClienteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [options, setOptions] = useState<ImportedClientDocument[]>([])
  const [sourceFile, setSourceFile] = useState<ImportedClientDocumentFile | null>(null)
  const [selectedCnpj, setSelectedCnpj] = useState('')

  const selectedClient = useMemo(
    () => options.find((option) => option.cnpj === selectedCnpj) ?? options[0],
    [options, selectedCnpj],
  )

  function reset() {
    setError('')
    setOptions([])
    setSourceFile(null)
    setSelectedCnpj('')
    setIsLoading(false)
  }

  function close() {
    reset()
    setIsOpen(false)
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!acceptedTypes.includes(file.type)) {
      setError('Envie um PDF, PNG, JPG ou JPEG.')
      return
    }

    if (file.size > 5_000_000) {
      setError('Use um arquivo com ate 5 MB para importar por documento.')
      return
    }

    setIsLoading(true)
    setError('')
    setOptions([])

    try {
      const result = await importClientDocument(file)
      setOptions(result.options)
      setSourceFile(result.sourceFile)
      setSelectedCnpj(result.options[0]?.cnpj ?? '')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel importar o documento.')
    } finally {
      setIsLoading(false)
    }
  }

  function confirmImport() {
    if (!selectedClient || !sourceFile) return
    onConfirm(selectedClient, sourceFile)
    close()
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="secondary">
        Importar por Documento
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">OCR + CNPJ</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Importar cliente por documento</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Envie o comprovante CNPJ em PDF ou imagem. O sistema extrai o CNPJ, consulta a API publica e
                  mostra a pre-visualizacao antes de preencher o formulario.
                </p>
              </div>
              <Button onClick={close} variant="secondary">
                Fechar
              </Button>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 p-5">
              <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700">
                {isLoading ? 'Lendo documento...' : 'Selecionar PDF ou imagem'}
                <input
                  accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                  className="hidden"
                  disabled={isLoading}
                  onChange={(event) => void handleUpload(event)}
                  type="file"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                  i
                </span>
                <div>
                  <h4 className="font-semibold text-slate-900">Regras para importar por documento</h4>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                    <li>Envie o comprovante CNPJ em PDF, PNG, JPG ou JPEG.</li>
                    <li>Para imagem, use arquivo legivel, sem cortes e com o CNPJ visivel.</li>
                    <li>Para PDF com texto, o sistema extrai o texto direto; para imagem ou PDF escaneado, usa OCR.</li>
                    <li>Se houver mais de um CNPJ, voce escolhe qual deseja importar.</li>
                    <li>Nada e salvo automaticamente: revise a pre-visualizacao e depois confirme.</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {options.length > 1 && (
              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700" htmlFor="import-cnpj-choice">
                  Mais de um CNPJ encontrado. Escolha qual importar.
                </label>
                <select
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"
                  id="import-cnpj-choice"
                  onChange={(event) => setSelectedCnpj(event.target.value)}
                  value={selectedCnpj}
                >
                  {options.map((option) => (
                    <option key={option.cnpj} value={option.cnpj}>
                      {option.cnpj} - {option.razaoSocial || 'Razao social nao informada'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedClient && (
              <div className="mt-6">
                <h4 className="text-lg font-semibold text-slate-900">Pre-visualizacao</h4>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {previewFields.map((field) => (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3" key={field.key}>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {field.label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {selectedClient[field.key] || 'Nao informado'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button onClick={confirmImport}>Usar dados no formulario</Button>
                  <Button onClick={close} variant="secondary">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
