import { formatCnpj } from '../../utils/formatters'

interface CnpjFormProps {
  cnpj: string
  isLoading: boolean
  onChange: (value: string) => void
  onClear: () => void
  onSubmit: () => void
}

export function CnpjForm({ cnpj, isLoading, onChange, onClear, onSubmit }: CnpjFormProps) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="cnpj-consulta">
            CNPJ
          </label>
          <input
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            id="cnpj-consulta"
            onChange={(event) => onChange(formatCnpj(event.target.value))}
            placeholder="00.000.000/0000-00"
            value={cnpj}
          />
        </div>
        <button
          className="h-12 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={onSubmit}
          type="button"
        >
          {isLoading ? 'Consultando...' : 'Consultar'}
        </button>
        <button
          className="h-12 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onClear}
          type="button"
        >
          Limpar consulta
        </button>
      </div>
    </section>
  )
}
