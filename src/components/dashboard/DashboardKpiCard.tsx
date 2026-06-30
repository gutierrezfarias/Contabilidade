import { Link } from 'react-router-dom'
import type { DashboardMetric } from '../../types/dashboard'

const statusClasses = {
  critical: 'border-red-100 bg-red-50 text-red-700',
  info: 'border-blue-100 bg-blue-50 text-blue-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
}

export function DashboardKpiCard({ metric }: { metric: DashboardMetric }) {
  return (
    <Link
      aria-label={`${metric.label}: ${metric.value}. ${metric.tooltip}`}
      className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
      title={metric.tooltip}
      to={metric.href}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{metric.label}</p>
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{metric.value}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[metric.status]}`}>
          {metric.status === 'critical'
            ? 'Critico'
            : metric.status === 'warning'
            ? 'Atencao'
            : metric.status === 'success'
            ? 'Ok'
            : 'Info'}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{metric.description}</p>
    </Link>
  )
}
