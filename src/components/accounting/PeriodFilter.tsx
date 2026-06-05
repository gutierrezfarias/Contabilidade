import { months } from '../../services/accountingData'

interface PeriodFilterProps {
  month: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
  years: number[]
  year: number
}

export function PeriodFilter({
  month,
  onMonthChange,
  onYearChange,
  years,
  year,
}: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="filter-month">
        Mês
      </label>
      <select
        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        id="filter-month"
        onChange={(event) => onMonthChange(Number(event.target.value))}
        value={month}
      >
        {months.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-year">
        Ano
      </label>
      <select
        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        id="filter-year"
        onChange={(event) => onYearChange(Number(event.target.value))}
        value={year}
      >
        {years.map((availableYear) => (
          <option key={availableYear} value={availableYear}>
            {availableYear}
          </option>
        ))}
      </select>
    </div>
  )
}
