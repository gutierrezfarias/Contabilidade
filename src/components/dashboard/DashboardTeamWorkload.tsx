import type { DashboardTeamMemberLoad } from '../../types/dashboard'

export function DashboardTeamWorkload({ team }: { team: DashboardTeamMemberLoad[] }) {
  if (team.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Carga da equipe</h2>
      <p className="mt-1 text-sm text-slate-500">Somente responsaveis com itens atribuidos aparecem aqui.</p>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-3 pr-4">Responsavel</th>
              <th className="py-3 pr-4">Hoje</th>
              <th className="py-3 pr-4">Atrasados</th>
              <th className="py-3 pr-4">Proximos 7 dias</th>
              <th className="py-3">Concluidos no periodo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.map((member) => (
              <tr key={member.id}>
                <td className="py-3 pr-4">
                  <p className="font-semibold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role || 'Sem cargo informado'}</p>
                </td>
                <td className="py-3 pr-4 font-semibold text-slate-700">{member.today}</td>
                <td className="py-3 pr-4 font-semibold text-slate-700">{member.overdue}</td>
                <td className="py-3 pr-4 font-semibold text-slate-700">{member.nextSevenDays}</td>
                <td className="py-3 font-semibold text-slate-700">{member.completedInPeriod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
