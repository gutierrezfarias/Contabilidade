import type { FieldCounterResult } from '../../utils/jsonUtils'

export function FieldCounter({ counter }: { counter: FieldCounterResult }) {
  const items = [
    { label: 'Campos encontrados', value: counter.total },
    { label: 'Preenchidos', value: counter.filled },
    { label: 'Vazios / nulos', value: counter.empty },
    { label: 'Preenchimento', value: `${counter.percentage}%` },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((item) => (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={item.label}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  )
}
