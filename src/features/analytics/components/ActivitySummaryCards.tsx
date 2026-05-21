import type { AnalyticsOverall } from '../adminAnalyticsApi'
import { analyticsCard, analyticsHealthMeta, analyticsKpiTitle } from '../analyticsUiClasses'

type Props = {
  statDate: string
  overall: AnalyticsOverall
}

export function ActivitySummaryCards({ statDate, overall }: Props) {
  const items = [
    { label: '신규 고객', value: overall.customers_created },
    { label: '문서(신청서) 생성', value: overall.documents_created },
    { label: '팀 상담 메시지', value: overall.team_messages_created },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className={analyticsCard}>
          <div className={analyticsKpiTitle}>{it.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
            {it.value.toLocaleString()}
          </div>
          <div className={analyticsHealthMeta}>전일 {statDate}</div>
        </div>
      ))}
    </div>
  )
}
