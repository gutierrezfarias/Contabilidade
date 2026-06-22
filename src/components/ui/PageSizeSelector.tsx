import { PAGE_SIZE_OPTIONS } from '../../types/pagination'

type PageSizeSelectorProps = {
  disabled?: boolean
  onChange: (pageSize: number) => void
  pageSize: number
}

export function PageSizeSelector({ disabled = false, onChange, pageSize }: PageSizeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      <span>Itens por pagina</span>
      <select
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        value={pageSize}
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
