import { useCallback, useEffect, useState } from 'react'
import { FormButton } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  fetchAnalyticsChart,
  fetchAnalyticsDashboard,
  fetchAnalyticsGaOptions,
  type AnalyticsChartMetric,
  type AnalyticsDashboardResponse,
  type AnalyticsGaOption,
} from '../adminAnalyticsApi'
import { ActivitySummaryCards } from '../components/ActivitySummaryCards'
import { AnalyticsFilterBar } from '../components/AnalyticsFilterBar'
import { AnalyticsLineChart } from '../components/AnalyticsLineChart'
import { GaStatusTable } from '../components/GaStatusTable'
import { SummaryKpiCards } from '../components/SummaryKpiCards'
import { UserHealthCards } from '../components/UserHealthCards'

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + delta)
  const y2 = t.getUTCFullYear()
  const m2 = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(t.getUTCDate()).padStart(2, '0')
  return `${y2}-${m2}-${d2}`
}

export default function AdminAnalyticsPage() {
  const { user, token } = useAuth()
  const [tab, setTab] = useState<'board' | 'chart'>('board')
  const [dash, setDash] = useState<AnalyticsDashboardResponse | null>(null)
  const [gaOptions, setGaOptions] = useState<AnalyticsGaOption[]>([])
  const [error, setError] = useState('')
  const [metric, setMetric] = useState<AnalyticsChartMetric>('daily_active_users')
  const [scope, setScope] = useState<'overall' | 'ga'>('overall')
  const [gaId, setGaId] = useState<number | ''>('')
  const [chartCap, setChartCap] = useState('')
  const [chartPoints, setChartPoints] = useState<{ date: string; value: number }[]>([])

  const loadDash = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    try {
      const d = await fetchAnalyticsDashboard(token)
      setError('')
      setDash(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : '통계를 불러오지 못했습니다.')
    }
  }, [token, user?.role])

  const loadGaOptions = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    try {
      const g = await fetchAnalyticsGaOptions(token)
      setGaOptions(g)
    } catch {
      /* 차트 탭에서만 사용 */
    }
  }, [token, user?.role])

  useEffect(() => {
    queueMicrotask(() => {
      void loadDash()
      void loadGaOptions()
    })
  }, [loadDash, loadGaOptions])

  const loadChart = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN' || tab !== 'chart') {
      return
    }
    if (scope === 'ga' && (gaId === '' || !Number.isInteger(gaId))) {
      setChartPoints([])
      return
    }
    try {
      const cap = dash?.statDate ?? ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) {
        setChartPoints([])
        return
      }
      const from = addDaysYmd(cap, -13)
      const res = await fetchAnalyticsChart(token, {
        from,
        to: cap,
        metric,
        scope,
        gaId: scope === 'ga' && gaId !== '' ? gaId : undefined,
      })
      setError('')
      setChartCap(res.statDateCap)
      setChartPoints(res.points)
    } catch (e) {
      setError(e instanceof Error ? e.message : '차트 데이터를 불러오지 못했습니다.')
    }
  }, [token, user?.role, tab, dash, metric, scope, gaId])

  useEffect(() => {
    queueMicrotask(() => {
      void loadChart()
    })
  }, [loadChart])

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>통계</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>운영 통계</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          표시 데이터는 모두 <strong>전일(서울)</strong> 기준입니다. 당일 실시간 수치는 사용하지 않습니다.
        </p>
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </header>

      <div className="mb-4 flex gap-2 border-b border-[var(--border-default)]">
        <FormButton
          htmlType="button"
          variant="action"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === 'board'
              ? 'border-[var(--brand)] text-[var(--brand)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setTab('board')}
        >
          현황판
        </FormButton>
        <FormButton
          htmlType="button"
          variant="action"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === 'chart'
              ? 'border-[var(--brand)] text-[var(--brand)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setTab('chart')}
        >
          통계 분석
        </FormButton>
      </div>

      {tab === 'board' && dash ? (
        <div className="space-y-6">
          <SummaryKpiCards
            statDate={dash.statDate}
            gaTotalCount={dash.gaTotalCount}
            overall={dash.overall}
          />
          <UserHealthCards statDate={dash.statDate} overall={dash.overall} />
          <ActivitySummaryCards statDate={dash.statDate} overall={dash.overall} />
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
              GA별 ({dash.statDate})
            </h2>
            <GaStatusTable statDate={dash.statDate} rows={dash.gaRows} />
          </section>
        </div>
      ) : null}

      {tab === 'board' && !dash ? (
        <p className="text-sm text-[var(--text-secondary)]">불러오는 중…</p>
      ) : null}

      {tab === 'chart' ? (
        <div className="space-y-4">
          <AnalyticsFilterBar
            gaOptions={gaOptions}
            metric={metric}
            scope={scope}
            gaId={gaId}
            statDateCap={chartCap || dash?.statDate || '—'}
            onMetricChange={setMetric}
            onScopeChange={(s) => {
              setScope(s)
              if (s === 'overall') {
                setGaId('')
              }
            }}
            onGaIdChange={setGaId}
          />
          <AnalyticsLineChart
            points={chartPoints}
            label={`${metric} · 최대 전일까지`}
          />
        </div>
      ) : null}
    </main>
  )
}
