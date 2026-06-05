import { Link } from 'react-router-dom'
import type { ApplicationIcon, ApplicationItem } from '../../types/apps'

interface ApplicationCardProps {
  application: ApplicationItem
  isUnlocked?: boolean
}

function ApplicationIconView({ icon }: { icon: ApplicationIcon }) {
  const iconPaths: Record<ApplicationIcon, string> = {
    accounting: 'M4 5h16v14H4V5Zm3 4h10M7 12h4m-4 3h7',
    crm: 'M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4m4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 4c-.2-1.5-1.1-2.7-2.4-3.3M17 8.2a2.7 2.7 0 0 1 0 5',
    chat: 'M5 6h14v10H9l-4 3V6Zm4 4h6m-6 3h4',
    website: 'M4 5h16v14H4V5Zm0 4h16M7 7h.01M10 7h.01m-3 5h5m-5 3h10',
    psychology: 'M12 20v-5m0 0c-3.5 0-6-2.2-6-5.3C6 6.6 8.5 4 12 4s6 2.6 6 5.7c0 3.1-2.5 5.3-6 5.3Zm-3-5h6',
  }

  return (
    <svg
      aria-hidden="true"
      className="h-9 w-9"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[icon]} />
    </svg>
  )
}

function CardBody({
  application,
  isUnlocked = false,
}: ApplicationCardProps) {
  const available = application.status === 'available' || isUnlocked
  const requiresPurchase = application.status === 'requires-purchase' && !isUnlocked
  const statusLabel = available
    ? application.status === 'available'
      ? 'Disponível'
      : 'Liberado'
    : requiresPurchase
      ? 'Comprar acesso'
      : 'Em breve'

  return (
    <>
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
          available ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <ApplicationIconView icon={application.icon} />
      </div>
      <div className="mt-auto">
        <span
          className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            available
              ? 'bg-emerald-50 text-emerald-700'
              : requiresPurchase
                ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {statusLabel}
        </span>
        <h2 className="text-lg font-semibold leading-snug text-slate-900">
          {application.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{application.description}</p>
        {requiresPurchase && (
          <p className="mt-3 text-sm font-semibold text-slate-900">{application.price}</p>
        )}
      </div>
    </>
  )
}

export function ApplicationCard({ application, isUnlocked = false }: ApplicationCardProps) {
  const baseClassName =
    'flex aspect-square min-h-[260px] flex-col rounded-3xl border bg-white p-6 text-left shadow-sm transition'
  const hasAccess = application.status === 'available' || isUnlocked

  if (hasAccess && application.route) {
    return (
      <Link
        className={`${baseClassName} border-slate-100 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/70`}
        to={application.route}
      >
        <CardBody application={application} isUnlocked={isUnlocked} />
      </Link>
    )
  }

  if (application.status === 'requires-purchase') {
    return (
      <article className={`${baseClassName} border-amber-100`}>
        <CardBody application={application} />
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
          to={`/configuracoes/pagamentos?app=${application.id}`}
        >
          Comprar
        </Link>
      </article>
    )
  }

  return (
    <div className={`${baseClassName} border-slate-100 opacity-80`}>
      <CardBody application={application} />
    </div>
  )
}
