interface AccountingMetricCardProps {
  accent?: 'default' | 'success' | 'danger'
  change?: string
  label: string
  progress?: number
  value: string
}

const accents = {
  default: 'text-slate-900',
  success: 'text-emerald-600',
  danger: 'text-rose-600',
}

export function AccountingMetricCard({
  accent = 'default',
  change,
  label,
  progress,
  value,
}: AccountingMetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className={`mt-4 text-3xl font-bold tracking-tight ${accents[accent]}`}>{value}</p>
      {typeof progress === 'number' ? (
        <div className="mt-5 h-2 rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full ${accent === 'danger' ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">{change}</p>
      )}
    </div>
  )
}
