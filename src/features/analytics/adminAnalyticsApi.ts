import { apiRequest } from '../../lib/apiClient'

export interface AnalyticsOverall {
  total_users: number
  daily_active_users: number
  weekly_active_users: number
  new_users: number
  customers_created: number
  documents_created: number
  team_messages_created: number
}

export interface AnalyticsGaRow {
  gaId: number
  gaCode: string
  gaName: string
  totalUsers: number
  dailyActiveUsers: number
  weeklyActiveUsers: number
  newUsers: number
  customersCreated: number
  documentsCreated: number
  teamMessagesCreated: number
}

export interface AnalyticsDashboardResponse {
  statDate: string
  gaTotalCount: number
  overall: AnalyticsOverall
  gaRows: AnalyticsGaRow[]
}

export type AnalyticsChartMetric =
  | 'total_users'
  | 'daily_active_users'
  | 'weekly_active_users'
  | 'new_users'
  | 'customers_created'
  | 'documents_created'
  | 'team_messages_created'

export interface AnalyticsChartPoint {
  date: string
  value: number
}

export interface AnalyticsChartResponse {
  statDateCap: string
  metric: AnalyticsChartMetric
  scope: 'overall' | 'ga'
  gaId: number | null
  points: AnalyticsChartPoint[]
}

export interface AnalyticsGaOption {
  id: number
  code: string
  name: string
}

export function fetchAnalyticsDashboard(token: string): Promise<AnalyticsDashboardResponse> {
  return apiRequest<AnalyticsDashboardResponse>('/api/admin/analytics/dashboard', {
    method: 'GET',
    token,
  })
}

export function fetchAnalyticsChart(
  token: string,
  params: {
    from: string
    to: string
    metric: AnalyticsChartMetric
    scope: 'overall' | 'ga'
    gaId?: number
  },
): Promise<AnalyticsChartResponse> {
  const q = new URLSearchParams({
    from: params.from,
    to: params.to,
    metric: params.metric,
    scope: params.scope,
  })
  if (params.scope === 'ga' && params.gaId != null) {
    q.set('gaId', String(params.gaId))
  }
  return apiRequest<AnalyticsChartResponse>(`/api/admin/analytics/chart?${q.toString()}`, {
    method: 'GET',
    token,
  })
}

export function fetchAnalyticsGaOptions(token: string): Promise<AnalyticsGaOption[]> {
  return apiRequest<AnalyticsGaOption[]>('/api/admin/analytics/ga-options', {
    method: 'GET',
    token,
  })
}
