import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

type NfeAccessKeySearchProps = {
  accessKey: string
  isLoading: boolean
  onChange: (value: string) => void
  onConsult: () => void
}

export function NfeAccessKeySearch({ accessKey, isLoading, onChange, onConsult }: NfeAccessKeySearchProps) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <Input
          id="access-key-lookup"
          label="Consultar NF-e por chave de acesso"
          maxLength={44}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 44))}
          placeholder="Informe os 44 digitos da chave da NF-e"
          value={accessKey}
        />
        <Button isLoading={isLoading} onClick={onConsult} type="button">
          Consultar por chave
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        O certificado autentica a consulta; a chave de acesso identifica a NF-e exata. A consulta salva o retorno na grade do cliente.
      </p>
    </div>
  )
}

