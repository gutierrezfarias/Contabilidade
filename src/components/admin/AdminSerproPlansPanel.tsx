import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { SerproContractPlan, SerproService } from '../../types/serpro'

type Props = {
  plans: SerproContractPlan[]
  savingCode: string
  services: SerproService[]
  onChange: (plan: SerproContractPlan) => void
  onSave: (plan: SerproContractPlan) => void
}

export function AdminSerproPlansPanel({ plans, savingCode, services, onChange, onSave }: Props) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Planos comerciais</p><h3 className="mt-2 text-xl font-bold text-slate-950">Receita Federal</h3><p className="mt-1 text-sm text-slate-500">Valores e regras exibidos aos escritorios. Alteracoes nao modificam credenciais existentes.</p></div>
      <div className="mt-6 space-y-6">
        {plans.map((plan) => (
          <article className="rounded-2xl border border-slate-200 p-5" key={plan.code}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input label="Nome comercial" value={plan.commercialName} onChange={(event) => onChange({ ...plan, commercialName: event.target.value })} />
              <Input label="Codigo" disabled value={plan.code} />
              <Input label="Valor mensal" min="0" step="0.01" type="number" value={plan.monthlyPrice} onChange={(event) => onChange({ ...plan, monthlyPrice: Number(event.target.value) })} />
              <Input label="Limite diario padrao" min="0" type="number" value={plan.defaultDailyLimit} onChange={(event) => onChange({ ...plan, defaultDailyLimit: Number(event.target.value) })} />
              <Input label="Ordem" type="number" value={plan.displayOrder} onChange={(event) => onChange({ ...plan, displayOrder: Number(event.target.value) })} />
              {plan.code === 'cont_hub_local_agent' && <Input label="URL do instalador" value={plan.installerUrl} onChange={(event) => onChange({ ...plan, installerUrl: event.target.value })} />}
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">Descricao<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 p-4 text-sm" value={plan.description} onChange={(event) => onChange({ ...plan, description: event.target.value })} /></label>
            <div className="mt-4"><p className="text-sm font-semibold text-slate-700">Servicos permitidos</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{services.map((service) => <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700" key={service.id}><input checked={plan.allowedServiceIds.includes(service.id)} type="checkbox" onChange={(event) => onChange({ ...plan, allowedServiceIds: event.target.checked ? [...plan.allowedServiceIds, service.id] : plan.allowedServiceIds.filter((id) => id !== service.id) })} />{service.name}</label>)}</div></div>
            <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-slate-700"><Check label="Plano ativo" checked={plan.active} onChange={(checked) => onChange({ ...plan, active: checked })} /><Check label="Permite fallback" checked={plan.allowsFallback} onChange={(checked) => onChange({ ...plan, allowsFallback: checked })} /><Check label="Homologacao" checked={plan.allowsHomologation} onChange={(checked) => onChange({ ...plan, allowsHomologation: checked })} /><Check label="Producao" checked={plan.allowsProduction} onChange={(checked) => onChange({ ...plan, allowsProduction: checked })} /></div>
            <Button className="mt-5" isLoading={savingCode === plan.code} onClick={() => onSave(plan)}>Salvar plano</Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2"><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />{label}</label>
}
