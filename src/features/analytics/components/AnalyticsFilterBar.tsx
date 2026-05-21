import { FormSelect } from '../../../components/form'
import type { AnalyticsChartMetric, AnalyticsGaOption } from '../adminAnalyticsApi'
import {
  analyticsFilterShell,
  analyticsLabel,
  analyticsMuted,
  analyticsSelect,
} from '../analyticsUiClasses'

const METRIC_OPTIONS: { value: AnalyticsChartMetric; label: string }[] = [
  { value: 'daily_active_users', label: 'DAU' },
  { value: 'weekly_active_users', label: 'WAU' },
  { value: 'total_users', label: '총 유저' },
  { value: 'new_users', label: '신규 가입' },
  { value: 'customers_created', label: '신규 고객' },
  { value: 'documents_created', label: '문서 생성' },
  { value: 'team_messages_created', label: '상담 메시지' },
]

type Props = {
  gaOptions: AnalyticsGaOption[]
  metric: AnalyticsChartMetric
  scope: 'overall' | 'ga'
  gaId: number | ''
  statDateCap: string
  onMetricChange: (m: AnalyticsChartMetric) => void
  onScopeChange: (s: 'overall' | 'ga') => void
  onGaIdChange: (id: number | '') => void
}

export function AnalyticsFilterBar({
  gaOptions,
  metric,
  scope,
  gaId,
  statDateCap,
  onMetricChange,
  onScopeChange,
  onGaIdChange,
}: Props) {
  return (
    <div className={analyticsFilterShell}>
      <label className={analyticsLabel}>
        지표
        <FormSelect
          className={analyticsSelect}
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as AnalyticsChartMetric)}
          options={METRIC_OPTIONS}
        />
      </label>
      <label className={analyticsLabel}>
        범위
        <FormSelect
          className={analyticsSelect}
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as 'overall' | 'ga')}
          options={[
            { value: 'overall', label: '전체' },
            { value: 'ga', label: 'GA별' },
          ]}
        />
      </label>
      {scope === 'ga' ? (
        <label className={analyticsLabel}>
          GA
          <FormSelect
            className={analyticsSelect}
            value={gaId === '' ? '' : String(gaId)}
            onChange={(e) => {
              const v = e.target.value
              onGaIdChange(v === '' ? '' : Number(v))
            }}
            options={[
              { value: '', label: '선택…' },
              ...gaOptions.map((g) => ({ value: String(g.id), label: `${g.name} (${g.code})` })),
            ]}
          />
        </label>
      ) : null}
      <p className={analyticsMuted}>
        차트 마지막 날짜는 전일까지(
        {statDateCap})로 제한됩니다.
      </p>
    </div>
  )
}
