import type { AnalyticsGaRow } from '../adminAnalyticsApi'
import { analyticsTableWrap, analyticsThRow } from '../analyticsUiClasses'

type Props = {
  statDate: string
  rows: AnalyticsGaRow[]
}

export function GaStatusTable({ statDate, rows }: Props) {
  return (
    <div className={analyticsTableWrap}>
      <table className="min-w-full text-left text-sm text-[var(--text-primary)]">
        <thead>
          <tr className={analyticsThRow}>
            <th className="px-3 py-2">GA</th>
            <th className="px-3 py-2 text-right">유저</th>
            <th className="px-3 py-2 text-right">DAU</th>
            <th className="px-3 py-2 text-right">WAU</th>
            <th className="px-3 py-2 text-right">신규</th>
            <th className="px-3 py-2 text-right">고객+</th>
            <th className="px-3 py-2 text-right">문서+</th>
            <th className="px-3 py-2 text-right">상담+</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-[var(--text-secondary)]">
                {statDate} 집계 데이터가 없습니다. 서버에서 집계 스크립트를 실행했는지 확인하세요.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.gaId} className="table-row last:border-b-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-[var(--text-primary)]">{r.gaName}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{r.gaCode}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.totalUsers.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.dailyActiveUsers.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.weeklyActiveUsers.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.newUsers.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.customersCreated.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.documentsCreated.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.teamMessagesCreated.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
