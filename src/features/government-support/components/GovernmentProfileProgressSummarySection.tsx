import type { GovernmentProfileProgressSummaryModel } from '../utils/governmentProfileProgressSummary'

type Props = {
  summary: GovernmentProfileProgressSummaryModel
}

/**
 * 보험 `GovernmentDetailStatusSummaryCard` UI 복사 — 정부 CRM profile 요약.
 */
export default function GovernmentProfileProgressSummarySection({ summary }: Props) {
  const showEmpty = summary.rows.length === 0 && !summary.hasAnySignal
  const showFallback = summary.rows.length === 0 && summary.hasAnySignal

  return (
    <section
      className="customer-detail-read__section government-status-summary-card"
      aria-labelledby="gov-profile-progress-summary-heading"
    >
      <div className="customer-detail-read__section-header">
        <h4 id="gov-profile-progress-summary-heading" className="customer-detail-read__section-title">
          진행 현황 요약
        </h4>
      </div>
      <div className="customer-detail-read__section-body">
        {summary.badges.length > 0 ? (
          <ul className="government-status-summary-card__badges" aria-label="진행 상태">
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

        {summary.primaryLine ? (
          <p className="government-progress-mvp__summary-line" role="note">
            {summary.primaryLine}
            {summary.secondaryLine ? ` · ${summary.secondaryLine}` : ''}
          </p>
        ) : null}

        {showEmpty ? (
          <p className="government-status-summary-card__empty" role="note">
            표시할 진행 현황이 없습니다.
          </p>
        ) : null}

        {summary.rows.length > 0 ? (
          <dl className="government-status-summary-card__grid">
            {summary.rows.map((r, i) => (
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
