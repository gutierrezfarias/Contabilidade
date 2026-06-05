import { DashboardLayout } from '../../components/layout/DashboardLayout'

const integrations = [
  {
    name: 'Omie',
    scope: 'ERP, clientes, financeiro e webhooks',
    auth: 'App Key/App Secret em backend',
  },
  {
    name: 'Conta Azul',
    scope: 'ERP, financeiro, pessoas e notas fiscais',
    auth: 'OAuth 2.0 com tokens em backend',
  },
  {
    name: 'Nibo',
    scope: 'Gestao financeira e consultas OData',
    auth: 'ApiToken em backend',
  },
  {
    name: 'PlugNotas / Tecnospeed',
    scope: 'Documentos fiscais via API, incluindo NF-e e NFS-e',
    auth: 'x-api-key e certificados em backend/cofre',
  },
]

export function Integrations() {
  return (
    <DashboardLayout title="Integracoes">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Ambiente de Integracoes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Conectores planejados para conversar com ERPs, financeiro e emissores fiscais brasileiros.
        </p>
      </div>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => (
          <article className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" key={integration.name}>
            <h3 className="text-lg font-semibold text-slate-900">{integration.name}</h3>
            <p className="mt-3 text-sm text-slate-500">{integration.scope}</p>
            <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">{integration.auth}</p>
            <button className="mt-5 text-sm font-semibold text-indigo-600" type="button">
              Configurar futuramente
            </button>
          </article>
        ))}
      </section>
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Tokens, certificados e segredos desses provedores nao devem ser gravados no navegador. A tela
        fica pronta para conectar um backend seguro.
      </div>
    </DashboardLayout>
  )
}
