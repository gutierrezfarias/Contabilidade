import { useState } from 'react'

export function JsonViewer({ data }: { data: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false)

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">JSON bruto</h3>
          <p className="mt-1 text-sm text-slate-500">Retorno completo formatado.</p>
        </div>
        <button
          className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={() => void copyJson()}
          type="button"
        >
          {copied ? 'Copiado' : 'Copiar JSON'}
        </button>
      </div>
      <pre className="mt-5 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-5 text-xs leading-6 text-slate-100">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  )
}
