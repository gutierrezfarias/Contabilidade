import { Link } from 'react-router-dom'

interface DashboardEmptyStateProps {
  actionHref?: string
  actionLabel?: string
  description: string
  title: string
}

export function DashboardEmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: DashboardEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</p>
      {actionHref && actionLabel && (
        <Link
          className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          to={actionHref}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
