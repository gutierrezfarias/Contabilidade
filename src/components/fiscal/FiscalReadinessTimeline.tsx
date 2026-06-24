import type { FiscalReadiness, FiscalReadinessStatus, FiscalReadinessTarget } from '../../services/fiscalReadinessService'

type FiscalReadinessTimelineProps = {
  readiness: FiscalReadiness
  onNavigate: (tab: FiscalReadinessTarget) => void
}

const toneByStatus: Record<FiscalReadinessStatus, string> = {
  Atencao: 'border-amber-200 bg-amber-50 text-amber-800',
  Bloqueado: 'border-rose-200 bg-rose-50 text-rose-800',
  Concluido: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Erro: 'border-red-300 bg-red-50 text-red-800',
  Parcial: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  Pendente: 'border-slate-200 bg-slate-50 text-slate-700',
}

const symbolByStatus: Record<FiscalReadinessStatus, string> = {
  Atencao: '!',
  Bloqueado: 'x',
  Concluido: 'ok',
  Erro: '!',
  Parcial: '~',
  Pendente: '-',
}

export function FiscalReadinessTimeline({ onNavigate, readiness }: FiscalReadinessTimelineProps) {
  const percentage = Math.round((readiness.completedCount / readiness.totalCount) * 100)

  return (
    <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Jornada fiscal</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">Jornada de preparacao fiscal</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Status calculado a partir do cliente, perfil fiscal, catalogo NCM, produtos, regras e simulador.
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
          <strong>{readiness.completedCount} de {readiness.totalCount} etapas concluidas</strong>
          <p className="mt-1">Proxima acao: {readiness.nextAction}</p>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`${percentage}% concluido`}>
        <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percentage}%` }} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {readiness.steps.map((step, index) => (
          <details className={`rounded-2xl border p-4 ${toneByStatus[step.status]}`} key={step.id}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black shadow-sm">
                      {symbolByStatus[step.status]}
                    </span>
                    <div>
                      <p className="text-sm font-bold">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mt-1 text-xs opacity-80">{step.scope}</p>
                    </div>
                  </div>
                </div>
                <span className="w-fit rounded-full bg-white/80 px-3 py-1 text-xs font-bold shadow-sm">{step.status}</span>
              </div>
            </summary>

            <div className="mt-4 border-t border-current/10 pt-4 text-sm leading-6">
              {step.details.length > 0 && (
                <div>
                  <p className="font-semibold">Evidencias</p>
                  <ul className="mt-1 space-y-1">
                    {step.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step.missing.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold">Pendencias</p>
                  <ul className="mt-1 space-y-1">
                    {step.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                onClick={() => onNavigate(step.targetTab)}
                type="button"
              >
                {step.nextAction}
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
