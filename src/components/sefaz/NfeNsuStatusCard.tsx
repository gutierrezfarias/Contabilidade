import type { SefazSyncState } from '../../services/sefazDocumentService'

type NfeNsuStatusCardProps = {
  documentsCount?: number
  state?: SefazSyncState | null
}

function formatValue(value: string | undefined) {
  return value && value.trim() ? value : 'Nao informado'
}

function normalizeNsu(value: string | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(15, '0').slice(-15) : '000000000000000'
}

function formatDateTime(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
}

function getNsuStatus(state?: SefazSyncState | null) {
  if (!state) {
    return {
      badge: 'Sem consulta',
      description: 'Nenhuma sincronizacao DF-e foi registrada para este cliente/certificado.',
      style: 'bg-slate-100 text-slate-600',
    }
  }

  const lastNsu = normalizeNsu(state.lastNsu)
  const maxNsu = normalizeNsu(state.maxNsu)
  const nextAllowed = state.nextAllowedSyncAt ? new Date(state.nextAllowedSyncAt) : null
  const inCooldown = Boolean(nextAllowed && nextAllowed.getTime() > Date.now())

  if (inCooldown) {
    return {
      badge: 'Em cooldown',
      description: `Aguarde ate ${formatDateTime(state.nextAllowedSyncAt)} para consultar novamente sem risco de consumo indevido.`,
      style: 'bg-amber-50 text-amber-700',
    }
  }

  if (lastNsu > maxNsu && maxNsu !== '000000000000000') {
    return {
      badge: 'Revisar NSU',
      description: 'O ultimo NSU esta maior que o max NSU. Use o diagnostico antes de nova chamada real.',
      style: 'bg-rose-50 text-rose-700',
    }
  }

  if (lastNsu === '000000000000000' && maxNsu === '000000000000000') {
    return {
      badge: 'Iniciado',
      description: 'O controle existe, mas a SEFAZ ainda nao retornou documentos para este escopo.',
      style: 'bg-indigo-50 text-indigo-700',
    }
  }

  return {
    badge: 'Sequencial',
    description: 'O proximo ciclo continua a partir do ultimo NSU salvo.',
    style: 'bg-emerald-50 text-emerald-700',
  }
}

export function NfeNsuStatusCard({ documentsCount = 0, state }: NfeNsuStatusCardProps) {
  const nsuStatus = getNsuStatus(state)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">NSU</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Controle DF-e</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${nsuStatus.style}`}>
          {nsuStatus.badge}
        </span>
      </div>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{nsuStatus.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Ultimo NSU" value={formatValue(state?.lastNsu)} />
        <Info label="Max NSU" value={formatValue(state?.maxNsu)} />
        <Info label="Ultimo cStat" value={formatValue(state?.lastStatusCode)} />
        <Info label="Ultimo xMotivo" value={formatValue(state?.lastStatusMessage)} />
        <Info label="Proxima consulta" value={formatValue(formatDateTime(state?.nextAllowedSyncAt))} />
        <Info label="Documentos na tela" value={`${documentsCount}`} />
        <Info label="Ultima consulta" value={formatValue(formatDateTime(state?.lastSuccessAt))} />
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
