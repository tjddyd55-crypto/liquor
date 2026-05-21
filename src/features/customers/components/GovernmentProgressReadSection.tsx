import type { GovernmentProgressMvpModel } from '../utils/governmentCustomerUi'

type GovernmentProgressReadSectionProps = {
  model: GovernmentProgressMvpModel
}

/**
 * Government 업종 고객 상세 — 진행 현황 MVP(읽기 전용).
 * 데이터는 `buildGovernmentProgressMvp`가 crm_extension 기반 필드에서만 조립한다.
 */
export default function GovernmentProgressReadSection({ model }: GovernmentProgressReadSectionProps) {
  return (
    <section
      className="customer-detail-read__section government-progress-mvp"
      aria-labelledby="gov-progress-mvp-heading"
    >
      <div className="customer-detail-read__section-header">
        <h4 id="gov-progress-mvp-heading" className="customer-detail-read__section-title">
          진행 현황
        </h4>
      </div>
      <div className="customer-detail-read__section-body">
        <p className="government-progress-mvp__summary-line" role="note">
          {model.summaryLine}
        </p>
        {model.badges.length > 0 ? (
          <ul className="government-progress-mvp__badges" aria-label="운영 상태 힌트">
            {model.badges.map((b, i) => (
              <li
                key={`${b.variant}-${b.label}-${i}`}
                className={`government-progress-mvp__badge government-progress-mvp__badge--${b.variant}`}
              >
                {b.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="government-progress-mvp__grid" role="list">
          {model.rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="government-progress-mvp__cell" role="listitem">
              <div className="government-progress-mvp__cell-label">{r.label}</div>
              <div className="government-progress-mvp__cell-value">{r.value}</div>
              {r.note ? <div className="government-progress-mvp__cell-note">{r.note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
