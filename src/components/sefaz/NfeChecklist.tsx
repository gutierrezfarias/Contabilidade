import type { NfeReadinessResult } from '../../types/nfe'

type NfeChecklistProps = {
  result: NfeReadinessResult
}

export function NfeChecklist({ result }: NfeChecklistProps) {
  const items = [
    { label: 'Empresa selecionada e CNPJ valido', ok: !result.errors.some((item) => item.entity === 'empresa') },
    { label: 'Certificado ativo com arquivo e senha', ok: !result.errors.some((item) => item.entity === 'certificado') },
    { label: 'Ambiente e UF configurados', ok: !result.errors.some((item) => ['environment', 'state_uf'].includes(item.field)) },
    { label: 'Backend/API fiscal disponivel', ok: !result.errors.some((item) => item.entity === 'integracao') },
    { label: 'Avisos revisados', ok: result.warnings.length === 0 },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Checklist de pendencias</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm" key={item.label}>
            <span className={`h-3 w-3 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span className={item.ok ? 'text-slate-700' : 'text-amber-800'}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

