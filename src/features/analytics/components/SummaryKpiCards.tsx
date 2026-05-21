import type { AnalyticsOverall } from '../adminAnalyticsApi'
import { analyticsCard, analyticsKpiHint, analyticsKpiTitle, analyticsKpiValue } from '../analyticsUiClasses'

type Props = {
  statDate: string
  gaTotalCount: number
  overall: AnalyticsOverall
}

export function SummaryKpiCards({ statDate, gaTotalCount, overall }: Props) {
  const items = [
    { label: '총 GA', value: gaTotalCount, hint: '활성 GA 수' },
    { label: '총 유저(스냅샷)', value: overall.total_users, hint: `기준일 ${statDate}` },
    { label: '전일 접속자(DAU)', value: overall.daily_active_users, hint: '로그인 기준' },
    { label: 'WAU(7일)', value: overall.weekly_active_users, hint: '전일까지 7일·로그인' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className={analyticsCard}>
          <div className={analyticsKpiTitle}>{it.label}</div>
          <div className={analyticsKpiValue}>{it.value.toLocaleString()}</div>
          <div className={analyticsKpiHint}>{it.hint}</div>
        </div>
      ))}
    </div>
  )
}
