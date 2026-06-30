import { Button } from '../ui/Button'
import type { SerproLocalAgent } from '../../types/serpro'
import { formatDateTime } from '../../utils/serproRecords'

type Props = {
  agent: SerproLocalAgent
  installerUrl: string
  isLoading: boolean
  pairingKey: string
  onRenewKey: () => void
}

const statusLabels: Record<SerproLocalAgent['status'], string> = {
  blocked: 'Bloqueado',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  outdated: 'Versao desatualizada',
  pairing_pending: 'Aguardando pareamento',
}

export function LocalAgentPanel({ agent, installerUrl, isLoading, pairingKey, onRenewKey }: Props) {
  const connected = agent.status === 'connected'
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Robo local</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">Agente CONT HUB</h3>
          <p className="mt-1 text-sm text-slate-500">Pareie a aplicacao instalada no computador ou servidor do escritorio.</p>
        </div>
        <span className={`rounded-full px-4 py-2 text-xs font-bold ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {statusLabels[agent.status]}
        </span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Info label="Versao instalada" value={agent.installedVersion || 'Nao informada'} />
        <Info label="Ultima comunicacao" value={formatDateTime(agent.lastSeenAt ?? '')} />
        <Info label="Ultima sincronizacao" value={formatDateTime(agent.lastSyncAt ?? '')} />
      </div>
      {pairingKey && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-900">Copie esta chave agora</p>
          <p className="mt-2 break-all font-mono text-sm text-emerald-800">{pairingKey}</p>
          <p className="mt-2 text-xs text-emerald-700">Por seguranca, a chave completa nao sera exibida novamente.</p>
        </div>
      )}
      {!pairingKey && agent.pairingKeyPrefix && (
        <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Chave atual: {agent.pairingKeyPrefix}...</p>
      )}
      {agent.lastError && <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{agent.lastError}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button isLoading={isLoading} onClick={onRenewKey}>Gerar/Renovar chave de pareamento</Button>
        {installerUrl ? (
          <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={installerUrl} rel="noreferrer" target="_blank">
            Baixar aplicativo local
          </a>
        ) : (
          <button className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-400" disabled type="button">
            Instalador ainda nao publicado
          </button>
        )}
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-800">{value}</p></div>
}
