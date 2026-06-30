export type ReceitaFederalTabId =
  | 'plan'
  | 'credentials'
  | 'services'
  | 'manual'
  | 'authorizations'
  | 'audit'

const tabs: Array<{ id: ReceitaFederalTabId; label: string; description: string }> = [
  { id: 'plan', label: 'Plano e contrato', description: 'Escolha como usar a Receita Federal.' },
  { id: 'credentials', label: 'Credenciais e acesso', description: 'Configure somente o acesso do plano.' },
  { id: 'services', label: 'Servicos', description: 'Controle os servicos habilitados.' },
  { id: 'manual', label: 'Importacao manual', description: 'Importe arquivos baixados do e-CAC.' },
  { id: 'authorizations', label: 'Autorizacoes', description: 'Acompanhe procuracoes por cliente.' },
  { id: 'audit', label: 'Consumo e auditoria', description: 'Consulte uso, custos e eventos.' },
]

type Props = {
  activeTab: ReceitaFederalTabId
  onChange: (tab: ReceitaFederalTabId) => void
}

export function ReceitaFederalTabs({ activeTab, onChange }: Props) {
  return (
    <nav aria-label="Configuracoes Receita Federal" className="overflow-x-auto rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      <div className="flex min-w-max gap-2 xl:grid xl:min-w-0 xl:grid-cols-6">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={`min-w-48 rounded-2xl px-4 py-3 text-left transition ${
                active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
            >
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className={`mt-1 block text-xs ${active ? 'text-slate-300' : 'text-slate-400'}`}>{tab.description}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
