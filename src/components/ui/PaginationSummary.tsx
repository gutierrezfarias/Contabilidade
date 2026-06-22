type PaginationSummaryProps = {
  label?: string
  page: number
  pageSize: number
  total: number
}

export function PaginationSummary({ label = 'registro(s)', page, pageSize, total }: PaginationSummaryProps) {
  if (total <= 0) {
    return <p className="text-sm text-slate-500">Nenhum {label} encontrado.</p>
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <p className="text-sm text-slate-500">
      Exibindo <strong className="text-slate-700">{start}-{end}</strong> de{' '}
      <strong className="text-slate-700">{total}</strong> {label}.
    </p>
  )
}
