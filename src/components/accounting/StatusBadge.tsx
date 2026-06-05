import type { ObligationStatus, PaymentStatus } from '../../types/accounting'

interface StatusBadgeProps {
  status: ObligationStatus | PaymentStatus
}

const statusStyles = {
  Pago: 'bg-emerald-50 text-emerald-700',
  Concluido: 'bg-emerald-50 text-emerald-700',
  Concluído: 'bg-emerald-50 text-emerald-700',
  Pendente: 'bg-amber-50 text-amber-700',
  Vencido: 'bg-rose-50 text-rose-700',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  )
}
