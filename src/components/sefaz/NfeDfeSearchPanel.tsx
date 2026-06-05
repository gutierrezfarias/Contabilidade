import type { SefazQueryType } from '../../services/sefazDocumentService'
import { Button } from '../ui/Button'

type NfeDfeSearchPanelProps = {
  isLoading: boolean
  onConsult: (queryType: SefazQueryType) => void
}

export function NfeDfeSearchPanel({ isLoading, onConsult }: NfeDfeSearchPanelProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button isLoading={isLoading} onClick={() => onConsult('summary')} type="button">
        Consulta Resumo
      </Button>
      <Button isLoading={isLoading} onClick={() => onConsult('complete')} type="button" variant="secondary">
        Consulta Completa
      </Button>
    </div>
  )
}

