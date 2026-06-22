import { PageSizeSelector } from './PageSizeSelector'
import { PaginationSummary } from './PaginationSummary'

type PaginationControlsProps = {
  disabled?: boolean
  label?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function PaginationButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function PaginationControls({
  disabled = false,
  label,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
  totalPages,
}: PaginationControlsProps) {
  const canGoBack = page > 1
  const canGoNext = page < totalPages

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 md:flex-row md:items-center md:justify-between">
      <PaginationSummary label={label} page={page} pageSize={pageSize} total={total} />
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeSelector disabled={disabled} onChange={onPageSizeChange} pageSize={pageSize} />
        <PaginationButton disabled={disabled || !canGoBack} onClick={() => onPageChange(1)}>
          Primeira
        </PaginationButton>
        <PaginationButton disabled={disabled || !canGoBack} onClick={() => onPageChange(page - 1)}>
          Anterior
        </PaginationButton>
        <span className="px-2 text-sm font-semibold text-slate-600">
          Pagina {page} de {totalPages}
        </span>
        <PaginationButton disabled={disabled || !canGoNext} onClick={() => onPageChange(page + 1)}>
          Proxima
        </PaginationButton>
        <PaginationButton disabled={disabled || !canGoNext} onClick={() => onPageChange(totalPages)}>
          Ultima
        </PaginationButton>
      </div>
    </div>
  )
}
