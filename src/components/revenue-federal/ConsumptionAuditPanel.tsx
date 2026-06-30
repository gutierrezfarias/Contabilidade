import { useMemo, useState } from 'react'
import { formatDateTime, nestedRecord, recordNumber, recordString } from '../../utils/serproRecords'

type Props = {
  auditLogs: Array<Record<string, unknown>>
  manualImports: Array<Record<string, unknown>>
  requests: Array<Record<string, unknown>>
  usage: Array<Record<string, unknown>>
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function ConsumptionAuditPanel({ auditLogs, manualImports, requests, usage }: Props) {
  const [view, setView] = useState<'requests' | 'audit'>('requests')
  const totals = useMemo(() => ({
    calls: requests.length,
    consumed: usage.reduce((total, item) => total + recordNumber(item, 'sale_amount', 'saleAmount'), 0),
    imports: manualImports.reduce((total, item) => total + recordNumber(item, 'imported_count'), 0),
  }), [manualImports, requests.length, usage])

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3"><Metric label="Chamadas registradas" value={String(totals.calls)} /><Metric label="Creditos/valor consumido" value={money(totals.consumed)} /><Metric label="Documentos importados" value={String(totals.imports)} /></section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-xl font-bold text-slate-950">Consumo e auditoria</h3><p className="mt-1 text-sm text-slate-500">Transparencia operacional sem exibir credenciais ou documentos sensiveis.</p></div><div className="flex rounded-xl bg-slate-100 p-1"><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'requests' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setView('requests')}>Chamadas</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'audit' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setView('audit')}>Auditoria</button></div></div>
        {view === 'requests' ? <RequestTable requests={requests} /> : <AuditTable logs={auditLogs} />}
      </section>
    </div>
  )
}

function RequestTable({ requests }: { requests: Array<Record<string, unknown>> }) {
  return <div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Data</th><th className="px-3 py-3">Origem</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Servico</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Consumo</th><th className="px-3 py-3">Execucao</th><th className="px-3 py-3">Erro resumido</th></tr></thead><tbody className="divide-y divide-slate-100">{requests.map((item) => { const client=nestedRecord(item,'clients'); const mode=recordString(item,'billing_mode'); return <tr key={recordString(item,'id')}><td className="px-3 py-4">{formatDateTime(recordString(item,'created_at'))}</td><td className="px-3 py-4">{mode === 'direct_serpro' ? 'SERPRO direto' : 'CONT HUB'}</td><td className="px-3 py-4">{client ? recordString(client,'company_name') : recordString(item,'cnpj') || '-'}</td><td className="px-3 py-4">{recordString(item,'service_id')}</td><td className="px-3 py-4">{recordString(item,'status')}</td><td className="px-3 py-4">{money(recordNumber(item,'sale_amount'))}</td><td className="px-3 py-4 font-mono text-xs">{recordString(item,'correlation_id') || recordString(item,'id')}</td><td className="max-w-72 px-3 py-4 text-rose-600">{recordString(item,'provider_message') || '-'}</td></tr>})}</tbody></table>{requests.length===0 && <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma chamada registrada.</p>}</div>
}

function AuditTable({ logs }: { logs: Array<Record<string, unknown>> }) {
  return <div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Data</th><th className="px-3 py-3">Evento</th><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Entidade</th><th className="px-3 py-3">Servico</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((item) => <tr key={recordString(item,'id')}><td className="px-3 py-4">{formatDateTime(recordString(item,'created_at'))}</td><td className="px-3 py-4 font-semibold text-slate-900">{recordString(item,'event_type')}</td><td className="px-3 py-4 font-mono text-xs">{recordString(item,'actor_user_id') || 'Sistema'}</td><td className="px-3 py-4 font-mono text-xs">{recordString(item,'client_id') || '-'}</td><td className="px-3 py-4">{recordString(item,'entity_type')}</td><td className="px-3 py-4">{recordString(item,'service_id') || '-'}</td></tr>)}</tbody></table>{logs.length===0 && <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhum evento de auditoria registrado.</p>}</div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>
}
