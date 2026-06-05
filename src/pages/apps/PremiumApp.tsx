import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { getApplication } from '../../services/appCatalog'
import { paymentService } from '../../services/paymentService'

interface PremiumAppProps {
  applicationId: string
}

const appHighlights: Record<string, string[]> = {
  'crie-seu-site': [
    'Escolha um modelo visual',
    'Personalize seus serviços',
    'Publique quando estiver pronto',
  ],
  'psicologa-ia': [
    'Conversa acolhedora e privada',
    'Rotinas de bem-estar',
    'Acompanhamento de hábitos',
  ],
}

export function PremiumApp({ applicationId }: PremiumAppProps) {
  const { user } = useAuth()
  const application = getApplication(applicationId)

  if (!application) {
    return <Navigate replace to="/aplicativos" />
  }

  if (!user || !paymentService.hasActiveAccess(user.id, applicationId)) {
    return (
      <Navigate
        replace
        to={`/configuracoes/pagamentos?app=${encodeURIComponent(applicationId)}`}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3 font-semibold text-slate-900" to="/aplicativos">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">
              A
            </span>
            Aurora Personal
          </Link>
          <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-700" to="/aplicativos">
            Meus aplicativos
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-12">
          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Assinatura ativa
          </span>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {application.name}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">
            Seu acesso foi liberado. Esta é a tela inicial do aplicativo, pronta
            para receber suas funcionalidades nas próximas etapas.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {(appHighlights[applicationId] ?? []).map((highlight) => (
              <div className="rounded-2xl bg-slate-50 p-5" key={highlight}>
                <div className="mb-4 h-2 w-10 rounded-full bg-indigo-600" />
                <p className="text-sm font-medium leading-6 text-slate-700">{highlight}</p>
              </div>
            ))}
          </div>

          <Button className="mt-10" disabled variant="secondary">
            Em construção
          </Button>
        </div>
      </main>
    </div>
  )
}
