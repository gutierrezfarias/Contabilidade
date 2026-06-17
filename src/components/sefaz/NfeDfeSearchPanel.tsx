import type { SefazQueryType } from '../../services/sefazDocumentService'
import { Button } from '../ui/Button'

type NfeDfeSearchPanelProps = {
  cooldownMessage?: string
  disabledReason?: string
  disabled?: boolean
  isLoading: boolean
  onConsult: (queryType: SefazQueryType) => void
}

export function NfeDfeSearchPanel({
  cooldownMessage = '',
  disabledReason = '',
  disabled = false,
  isLoading,
  onConsult,
}: NfeDfeSearchPanelProps) {
  const buttonTitle = disabled ? disabledReason || cooldownMessage || 'Consulta indisponivel no momento.' : undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span title={buttonTitle}>
          <Button disabled={disabled} isLoading={isLoading} onClick={() => onConsult('summary')} type="button">
            Consulta Resumo
          </Button>
        </span>
        <span title={buttonTitle}>
          <Button disabled={disabled} isLoading={isLoading} onClick={() => onConsult('complete')} type="button" variant="secondary">
            Sincronizar documentos pendentes
          </Button>
        </span>
      </div>
      {cooldownMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          <span className="block font-semibold">Consulta pausada para respeitar o intervalo da SEFAZ.</span>
          <span>{cooldownMessage}</span>
        </div>
      )}
    </div>
  )
}
