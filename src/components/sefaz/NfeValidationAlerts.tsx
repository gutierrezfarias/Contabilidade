import type { NfeMissingField, NfeReadinessResult, NfeValidationIssue } from '../../types/nfe'

type NfeValidationAlertsProps = {
  result: NfeReadinessResult
  title?: string
}

const styles = {
  error: 'border-rose-100 bg-rose-50 text-rose-700',
  info: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
}

function IssueList({ issues }: { issues: NfeValidationIssue[] }) {
  if (issues.length === 0) return null

  return (
    <ul className="space-y-2">
      {issues.map((item) => (
        <li className={`rounded-xl border px-4 py-3 text-sm ${styles[item.severity]}`} key={`${item.entity}-${item.field}-${item.message}`}>
          <span className="block font-semibold">{item.message}</span>
          {item.suggestion && <span className="mt-1 block text-xs opacity-80">{item.suggestion}</span>}
        </li>
      ))}
    </ul>
  )
}

function MissingFieldList({ fields }: { fields: NfeMissingField[] }) {
  if (fields.length === 0) return null

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <summary className="cursor-pointer font-semibold text-slate-800">Campos tecnicos recomendados para o banco</summary>
      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <div className="rounded-lg bg-white p-3" key={`${field.table}-${field.column}`}>
            <p className="font-semibold text-slate-800">
              {field.table}.{field.column}
            </p>
            <p className="mt-1 text-xs text-slate-500">{field.reason}</p>
            {field.suggestedSql && (
              <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-50">
                {field.suggestedSql}
              </code>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

export function NfeValidationAlerts({ result, title = 'Pendencias para operacao fiscal' }: NfeValidationAlertsProps) {
  if (result.errors.length === 0 && result.warnings.length === 0 && result.missingFields.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
        Dados principais validados. A operacao pode chamar a API fiscal preparada.
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Validacao</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${result.isReady ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {result.isReady ? 'Pronto' : `${result.errors.length} erro(s)`}
        </span>
      </div>
      <div className="space-y-3">
        <IssueList issues={result.errors} />
        <IssueList issues={result.warnings} />
        <MissingFieldList fields={result.missingFields} />
      </div>
    </section>
  )
}

