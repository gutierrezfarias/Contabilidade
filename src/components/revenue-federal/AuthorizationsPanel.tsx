import { Link } from 'react-router-dom'
import { formatDateTime, nestedRecord, recordString } from '../../utils/serproRecords'

type Props = {
  authorizations: Array<Record<string, unknown>>
  organizationId: string
}

export function AuthorizationsPanel({ authorizations, organizationId }: Props) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-xl font-bold text-slate-950">Autorizacoes e procuracoes</h3><p className="mt-1 text-sm text-slate-500">Acompanhamento por cliente, sem criar acesso externo que ainda nao existe.</p></div>
        <Link className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={`/gestao-clientes?organization=${encodeURIComponent(organizationId)}`}>Gerenciar clientes e certificados</Link>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">CPF/CNPJ</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Validade</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Ultima validacao</th><th className="px-3 py-3">Pendencia</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {authorizations.map((item) => {
              const client = nestedRecord(item, 'clients')
              return <tr key={recordString(item, 'id')}><td className="px-3 py-4 font-semibold text-slate-900">{client ? recordString(client, 'company_name', 'companyName') : 'Cliente nao informado'}</td><td className="px-3 py-4">{client ? recordString(client, 'cnpj') : '-'}</td><td className="px-3 py-4">{recordString(item, 'authorization_type') || 'Procuracao digital'}</td><td className="px-3 py-4">{recordString(item, 'valid_until') || 'Nao informada'}</td><td className="px-3 py-4">{recordString(item, 'status') || 'Rascunho'}</td><td className="px-3 py-4">{formatDateTime(recordString(item, 'last_validated_at'))}</td><td className="px-3 py-4 text-amber-700">{recordString(item, 'pending_reason') || 'Nenhuma informada'}</td></tr>
            })}
          </tbody>
        </table>
        {authorizations.length === 0 && <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma autorizacao cadastrada. Use a Gestao de Clientes para vincular certificado e documentacao.</p>}
      </div>
    </section>
  )
}
