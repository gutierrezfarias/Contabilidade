import type { DashboardAttentionSeverity } from '../types/dashboard'

const dayInMs = 86400000

export function todayLocalDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function periodDateRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    end: formatDateInput(end),
    start: formatDateInput(start),
  }
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function parseLocalDate(value: string) {
  const dateOnly = value.split('T')[0]
  const [year, month, day] = dateOnly.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function daysFromToday(value: string) {
  const date = parseLocalDate(value)
  if (!date) return Number.POSITIVE_INFINITY
  return Math.ceil((date.getTime() - todayLocalDate().getTime()) / dayInMs)
}

export function isSameLocalDay(value: string, date = todayLocalDate()) {
  const parsed = parseLocalDate(value)
  if (!parsed) return false
  return formatDateInput(parsed) === formatDateInput(date)
}

export function isDateInRange(value: string, start: string, end: string) {
  const date = parseLocalDate(value)
  const startDate = parseLocalDate(start)
  const endDate = parseLocalDate(end)
  if (!date || !startDate || !endDate) return false
  return date >= startDate && date <= endDate
}

export function isClosedStatus(status: string) {
  return ['approved', 'archived', 'cancelled', 'delivered', 'downloaded', 'exempt', 'ignored', 'paid', 'rejected', 'replaced'].includes(
    status,
  )
}

export function severityFromDueDate(
  dueDate: string,
  status: string,
  warningDays = 7,
): DashboardAttentionSeverity {
  if (isClosedStatus(status)) return 'success'
  const remaining = daysFromToday(dueDate)
  if (remaining < 0) return 'critical'
  if (remaining <= warningDays) return 'warning'
  return 'info'
}

export function certificateSeverity(validUntil: string, status: string): DashboardAttentionSeverity {
  if (status !== 'Ativo') return 'critical'
  const remaining = daysFromToday(validUntil)
  if (remaining < 0 || remaining <= 7) return 'critical'
  if (remaining <= 30) return 'warning'
  return 'success'
}

export function integrationSeverity(status: string, lastErrorMessage = ''): DashboardAttentionSeverity {
  const normalized = status.toLowerCase()
  if (normalized.includes('error') || normalized.includes('falha') || lastErrorMessage) return 'critical'
  if (normalized.includes('paused') || normalized.includes('partial') || normalized.includes('pending')) return 'warning'
  if (normalized.includes('success') || normalized.includes('active') || normalized.includes('ok')) return 'success'
  return 'info'
}

export function severityRank(severity: DashboardAttentionSeverity) {
  return {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  }[severity]
}
