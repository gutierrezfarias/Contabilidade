import type { SefazSyncState } from '../../services/sefazDocumentService'

type NfeNsuStatusCardProps = {
  state?: SefazSyncState | null
}

function formatValue(value: string | undefined) {
  return value && value.trim() ? value : 'Nao informado'
}

export function NfeNsuStatusCard({ state }: NfeNsuStatusCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">NSU</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Controle DF-e</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {state ? 'Carregado' : 'Sem consulta'}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Ultimo NSU" value={formatValue(state?.lastNsu)} />
        <Info label="Max NSU" value={formatValue(state?.maxNsu)} />
        <Info label="Ultimo cStat" value={formatValue(state?.lastStatusCode)} />
        <Info label="Ultimo xMotivo" value={formatValue(state?.lastStatusMessage)} />
        <Info label="Ultima consulta" value={formatValue(state?.lastSuccessAt)} />
        <Info label="Ultimo erro" value={formatValue(state?.lastErrorMessage)} />
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

