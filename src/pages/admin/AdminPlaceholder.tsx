import { AdminLayout } from '../../components/layout/AdminLayout'

interface AdminPlaceholderProps {
  title: string
  description: string
}

export function AdminPlaceholder({ description, title }: AdminPlaceholderProps) {
  return (
    <AdminLayout title={title}>
      <section className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </section>
    </AdminLayout>
  )
}
