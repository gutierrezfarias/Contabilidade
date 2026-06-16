import type { SefazQueryType } from '../../services/sefazDocumentService'
import { Button } from '../ui/Button'

type NfeDfeSearchPanelProps = {
  cooldownMessage?: string
  disabled?: boolean
  isLoading: boolean
  onConsult: (queryType: SefazQueryType) => void
}

export function NfeDfeSearchPanel({
  cooldownMessage = '',
  disabled = false,
  isLoading,
  onConsult,
}: NfeDfeSearchPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={disabled} isLoading={isLoading} onClick={() => onConsult('summary')} type="button">
        Consulta Resumo
      </Button>
      <Button disabled={disabled} isLoading={isLoading} onClick={() => onConsult('complete')} type="button" variant="secondary">
        Sincronizar documentos pendentes
      </Button>
      {cooldownMessage && <span className="text-xs font-medium text-amber-700">{cooldownMessage}</span>}
    </div>
  )
}
