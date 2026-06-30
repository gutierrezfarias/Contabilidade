import type { SerproAccessMode, SerproContractPlan, SerproService } from '../../types/serpro'
import { recordBoolean, recordString } from '../../utils/serproRecords'

type Props = {
  accessMode: SerproAccessMode
  organizationServices: Array<Record<string, unknown>>
  plan: SerproContractPlan | null
  savingServiceId: string
  services: SerproService[]
  onToggle: (serviceId: string, enabled: boolean) => void
}

function compatible(service: SerproService, accessMode: SerproAccessMode, plan: SerproContractPlan | null) {
  if (!plan?.allowedServiceIds.includes(service.id) || service.status !== 'active') return false
  if (accessMode === 'direct_serpro') return service.supportsDirectMode
  if (accessMode === 'local_agent') return service.supportsLocalAgent
  return service.supportsManagedMode
}

export function RevenueServicesPanel({ accessMode, organizationServices, plan, savingServiceId, services, onToggle }: Props) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-xl font-bold text-slate-950">Servicos Receita Federal</h3>
      <p className="mt-1 text-sm text-slate-500">Habilite apenas servicos autorizados e compativeis com {plan?.commercialName ?? 'o plano selecionado'}.</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {services.map((service) => {
          const organizationService = organizationServices.find((item) => recordString(item, 'service_id', 'serviceId') === service.id)
          const enabled = organizationService ? recordBoolean(organizationService, 'enabled') : false
          const available = compatible(service, accessMode, plan)
          const origins = [
            service.supportsManagedMode && 'Contrato CONT HUB',
            service.supportsLocalAgent && 'Robo local',
            service.supportsDirectMode && 'SERPRO direto',
            service.supportsManualImport && 'Importacao manual',
          ].filter(Boolean).join(' / ')
          return (
            <article className={`rounded-2xl border p-5 ${available ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}`} key={service.id}>
              <div className="flex items-start justify-between gap-4">
                <div><h4 className="font-bold text-slate-950">{service.name}</h4><p className="mt-1 text-sm leading-6 text-slate-500">{service.description}</p></div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input checked={enabled && available} disabled={!available || savingServiceId === service.id} type="checkbox" onChange={(event) => onToggle(service.id, event.target.checked)} />{enabled && available ? 'Ativo' : 'Inativo'}</label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs"><Badge text={service.requiresCertificate ? 'Exige certificado' : 'Sem certificado'} /><Badge text={service.requiresAuthorization ? 'Exige procuracao' : 'Sem procuracao'} /><Badge text={service.consumesCredit ? 'Pode consumir credito' : 'Sem credito SERPRO'} /></div>
              <p className="mt-3 text-xs text-slate-500"><strong>Origens:</strong> {origins || 'Nao configurada'}</p>
              {!available && <p className="mt-3 text-xs font-semibold text-amber-700">Indisponivel no plano atual ou ainda em preparacao.</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Badge({ text }: { text: string }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">{text}</span>
}
