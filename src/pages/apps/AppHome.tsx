import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { ApplicationCard } from '../../components/apps/ApplicationCard'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { listPlatformAppPricing } from '../../services/adminAppsService'
import { catalogApplications, formatMonthlyPrice } from '../../services/appCatalog'
import { paymentService } from '../../services/paymentService'

export function AppHome() {
  const { logout, user } = useAuth()
  const { isAdmin, isLoading: isRoleLoading } = useRole()
  const navigate = useNavigate()
  const [pricing, setPricing] = useState<Record<string, { active: boolean; monthlyPrice: number }>>({})
  const [unlockedApplications, setUnlockedApplications] = useState<string[]>([])
  const visibleApplications = useMemo(
    () =>
      catalogApplications.map((application) => {
        const appPricing = pricing[application.id]
        if (!appPricing) return application
        return {
          ...application,
          price: formatMonthlyPrice(appPricing.monthlyPrice),
          status: appPricing.active ? application.status : 'coming-soon',
        }
      }),
    [pricing],
  )

  useEffect(() => {
    Promise.all([
      listPlatformAppPricing().catch(() => []),
      user ? paymentService.getActiveApplicationIdsFromSupabase(user.id).catch(() => paymentService.getActiveApplicationIds(user.id)) : Promise.resolve([]),
    ])
      .then(([items, accessIds]) => {
        setPricing(
          Object.fromEntries(
            items.map((item) => [item.applicationId, { active: item.active, monthlyPrice: item.monthlyPrice }]),
          ),
        )
        setUnlockedApplications(accessIds)
      })
      .catch(() => {
        setPricing({})
        setUnlockedApplications(user ? paymentService.getActiveApplicationIds(user.id) : [])
      })
  }, [user])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (isRoleLoading) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
  }

  if (isAdmin) {
    return <Navigate replace to="/admin" />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <Link className="flex items-center gap-3 text-lg font-semibold text-slate-900" to="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">
              A
            </span>
            Aurora Personal
          </Link>
          <div className="flex items-center gap-4">
            <Link
              className="hidden text-sm font-semibold text-slate-600 transition hover:text-indigo-600 md:block"
              to="/configuracoes/pagamentos"
            >
              Configurações
            </Link>
            {isAdmin && (
              <Link
                className="hidden text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 md:block"
                to="/admin"
              >
                Menu Admin
              </Link>
            )}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button onClick={handleLogout} variant="secondary">
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
            Home - Aplicativos
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Escolha seu aplicativo
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">
            Acesse seus sistemas em um único lugar. Novos aplicativos serão adicionados
            gradualmente. Aplicativos premium são liberados após a compra.
          </p>
        </div>

        <section aria-label="Aplicativos disponíveis" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleApplications.map((application) => (
            <ApplicationCard
              application={
                isAdmin && application.id === 'gestao-contabil'
                  ? { ...application, route: '/admin' }
                  : application
              }
              isUnlocked={unlockedApplications.includes(application.id)}
              key={application.id}
            />
          ))}
        </section>
      </main>
    </div>
  )
}
