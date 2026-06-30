import { Button } from '../ui/Button'
import type { SerproContractPlan } from '../../types/serpro'

type Props = {
  active: boolean
  isLoading: boolean
  plan: SerproContractPlan
  serviceNames: string[]
  onChoose: (plan: SerproContractPlan) => void
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function ContractPlanCard({ active, isLoading, plan, serviceNames, onChoose }: Props) {
  return (
    <article className={`flex h-full flex-col rounded-3xl border p-6 shadow-sm ${
      active ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">{active ? 'Plano atual' : 'Plano disponivel'}</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">{plan.commercialName}</h3>
        </div>
        {active && <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">Ativo</span>}
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-950">{money(plan.monthlyPrice)}<span className="text-sm font-medium text-slate-500">/mes</span></p>
      <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
      <div className="mt-5 flex-1 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Servicos incluidos</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {serviceNames.slice(0, 5).map((name) => <li key={name}>- {name}</li>)}
          {serviceNames.length === 0 && <li>Configuracao de servicos pelo Admin.</li>}
          {serviceNames.length > 5 && <li>+ {serviceNames.length - 5} outros servicos</li>}
        </ul>
      </div>
      {plan.code === 'serpro_direct' && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          O custo SERPRO e contratado diretamente pelo contador. A mensalidade acima cobre o uso da plataforma CONT HUB.
        </p>
      )}
      <Button className="mt-5 w-full" disabled={active} isLoading={isLoading} onClick={() => onChoose(plan)}>
        {active ? 'Plano selecionado' : 'Escolher este plano'}
      </Button>
    </article>
  )
}
