export type DashboardAttentionSeverity = 'critical' | 'warning' | 'info' | 'success'
export type DashboardAttentionFilter = 'all' | 'critical' | 'overdue' | 'today' | 'next7' | 'waiting_client'
export type DashboardClientHealthStatus = 'healthy' | 'attention' | 'critical' | 'not_configured' | 'processing'
export type DashboardIntegrationStatus = 'healthy' | 'attention' | 'critical' | 'not_configured' | 'partial'

export interface DashboardPeriodFilter {
  month: number
  year: number
}

export interface DashboardSourceIssue {
  source: string
  message: string
}

export interface DashboardClientSearchItem {
  cnpj: string
  id: string
  name: string
  tradeName: string
}

export interface DashboardActionLink {
  href: string
  label: string
}

export interface DashboardMetric {
  description: string
  href: string
  id: string
  label: string
  status: DashboardAttentionSeverity
  tooltip: string
  value: string
}

export interface DashboardAttentionItem {
  actions: DashboardActionLink[]
  clientId: string
  clientName: string
  dueDate: string
  href: string
  id: string
  origin: string
  reason: string
  responsibleName: string
  severity: DashboardAttentionSeverity
  title: string
  updatedAt: string
}

export interface DashboardObligationProgress {
  category: 'total' | 'completed' | 'inProgress' | 'waitingClient' | 'overdue'
  href: string
  label: string
  value: number
}

export interface DashboardUpcomingDeadline {
  actionHref: string
  clientId: string
  clientName: string
  dueDate: string
  id: string
  responsibleName: string
  status: DashboardAttentionSeverity
  title: string
}

export interface DashboardClientHealth {
  actionHref: string
  certificateSummary: string
  clientId: string
  clientName: string
  documentSummary: string
  integrationSummary: string
  lastActivity: string
  obligationSummary: string
  reasons: string[]
  status: DashboardClientHealthStatus
  taxSummary: string
}

export interface DashboardIntegrationHealth {
  actionHref: string
  errors: number
  id: string
  lastRunAt: string
  name: string
  status: DashboardIntegrationStatus
  successes: number
  summary: string
}

export interface DashboardFinancialSummary {
  averageRevenuePerClient: number
  delinquencyRate: number
  hasPermission: boolean
  overdueAmount: number
  overdueClients: number
  receivedFees: number
  projectedFees: number
}

export interface DashboardTeamMemberLoad {
  completedInPeriod: number
  id: string
  name: string
  nextSevenDays: number
  overdue: number
  role: string
  today: number
}

export interface DashboardRecentActivity {
  action: string
  clientName: string
  createdAt: string
  entityType: string
  href: string
  id: string
  origin: string
  userName: string
}

export interface DashboardSummary {
  attentionItems: DashboardAttentionItem[]
  clientHealth: DashboardClientHealth[]
  clients: DashboardClientSearchItem[]
  financial: DashboardFinancialSummary
  integrationHealth: DashboardIntegrationHealth[]
  lastSyncAt: string
  metrics: DashboardMetric[]
  obligationProgress: DashboardObligationProgress[]
  recentActivities: DashboardRecentActivity[]
  sourceIssues: DashboardSourceIssue[]
  teamLoad: DashboardTeamMemberLoad[]
  upcomingDeadlines: DashboardUpcomingDeadline[]
}
