import type { AnalyticsOverall } from '../adminAnalyticsApi'
import { analyticsCard, analyticsHealthMeta, analyticsHealthTitle } from '../analyticsUiClasses'

type Props = {
  statDate: string
  overall: AnalyticsOverall
}

export function UserHealthCards({ statDate, overall }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={analyticsCard}>
        <div className={analyticsHealthTitle}>신규 가입</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
          {overall.new_users.toLocaleString()}
        </div>
        <div className={analyticsHealthMeta}>users.created_at · {statDate} (서울)</div>
      </div>
      <div className={analyticsCard}>
        <div className={analyticsHealthTitle}>활동 사용자(전일)</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
          {overall.daily_active_users.toLocaleString()}
        </div>
        <div className={analyticsHealthMeta}>analytics_events.login</div>
      </div>
    </div>
  )
}
