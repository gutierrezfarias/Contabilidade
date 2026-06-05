import type { ReactNode } from 'react'

interface AlertProps {
  children: ReactNode
  type?: 'error' | 'success' | 'info' | 'warning'
}

const styles = {
  error: 'border-rose-100 bg-rose-50 text-rose-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  info: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
}

export function Alert({ children, type = 'info' }: AlertProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[type]}`} role="status">
      {children}
    </div>
  )
}
