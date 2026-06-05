type NfeStatusCardProps = {
  label: string
  ok?: boolean
  value: string
}

export function NfeStatusCard({ label, ok = true, value }: NfeStatusCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</p>
    </div>
  )
}

