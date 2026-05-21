import type { GovernmentCustomerStatusSummary, GovernmentDetailStatusCardRow } from '../utils/governmentCustomerStatusSummary'

type GovernmentDetailStatusSummaryCardProps = {
  summary: GovernmentCustomerStatusSummary
  rows: GovernmentDetailStatusCardRow[]
}

/**
 * Government 업종 상세 — 진행 현황 요약 카드(읽기 전용).
 * 데이터는 `buildGovernmentCustomerStatusSummary` / `buildGovernmentDetailStatusCardRows`에서만 조립한다.
 */
export default function GovernmentDetailStatusSummaryCard({ summary, rows }: GovernmentDetailStatusSummaryCardProps) {
  const showEmpty = rows.length === 0 && !summary.hasAnySignal
  const showFallback = rows.length === 0 && summary.hasAnySignal

  return (
    <section
      className="customer-detail-read__section government-status-summary-card"
      aria-labelledby="gov-status-summary-heading"
    >
      <div className="customer-detail-read__section-header">
        <h4 id="gov-status-summary-heading" className="customer-detail-read__section-title">
          진행 현황 요약
        </h4>
      </div>
      <div className="customer-detail-read__section-body">
        {summary.badges.length > 0 ? (
          <ul className="government-status-summary-card__badges" aria-label="진행 상태 힌트">
            {summary.badges.map((b, i) => (
              <li
                key={`${b.label}-${i}`}
                className={`government-status-summary-card__badge government-status-summary-card__badge--${b.tone}`}
              >
                {b.label}
              </li>
            ))}
          </ul>
        ) : null}

        {showEmpty ? (
          <p className="government-status-summary-card__empty" role="note">
            표시할 진행 현황이 없습니다.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <dl className="government-status-summary-card__grid">
            {rows.map((r, i) => (
              <div key={`${r.label}-${i}`} className="government-status-summary-card__cell">
                <dt className="government-status-summary-card__cell-label">{r.label}</dt>
                <dd
                  className={
                    r.valueTone
                      ? `government-status-summary-card__cell-value government-status-summary-card__cell-value--tone-${r.valueTone}`
                      : 'government-status-summary-card__cell-value'
                  }
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {showFallback ? (
          <p className="government-status-summary-card__fallback" role="note">
            {summary.secondaryLine.trim() || summary.primaryLine}
          </p>
        ) : null}
      </div>
    </section>
  )
}
