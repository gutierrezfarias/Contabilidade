import { formatEmptyValue } from '../../utils/formatters'
import { humanizeJsonKey, isObjectRecord } from '../../utils/jsonUtils'

interface DynamicJsonRendererProps {
  data: unknown
  level?: number
}

export function DynamicJsonRenderer({ data, level = 0 }: DynamicJsonRendererProps) {
  if (Array.isArray(data)) {
    if (!data.length) {
      return <p className="text-sm text-slate-500">Nao informado</p>
    }

    return (
      <div className="space-y-3">
        {data.map((item, index) => (
          <div className="rounded-2xl border border-slate-100 bg-white p-4" key={index}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Item {index + 1}</p>
            <DynamicJsonRenderer data={item} level={level + 1} />
          </div>
        ))}
      </div>
    )
  }

  if (isObjectRecord(data)) {
    return (
      <div className={level === 0 ? 'space-y-4' : 'space-y-3'}>
        {Object.entries(data).map(([key, value]) => (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {humanizeJsonKey(key)}
            </p>
            <DynamicJsonRenderer data={value} level={level + 1} />
          </div>
        ))}
      </div>
    )
  }

  return <p className="break-words text-sm font-medium text-slate-800">{formatEmptyValue(data)}</p>
}
