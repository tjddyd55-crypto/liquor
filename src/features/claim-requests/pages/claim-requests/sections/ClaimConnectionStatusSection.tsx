import type { CustomerAppLinkInfo } from '../../../api/claimRequestsApi'

type ClaimConnectionStatusSectionProps = {
  title: string
  subtitle: string
  className?: string
  linkStatus?: CustomerAppLinkInfo | null
  loading?: boolean
  latestDeviceLabel?: string
  showDescription?: boolean
  formatDateTime: (iso: string | null) => string
}

export default function ClaimConnectionStatusSection({
  title,
  subtitle,
  className = 'claim-requests-page__status-value',
  linkStatus,
  loading = false,
  latestDeviceLabel = '미확인',
  showDescription = true,
  formatDateTime,
}: ClaimConnectionStatusSectionProps) {
  return (
    <section className="claim-requests-page__card claim-requests-page__connection-section">
      <div className="claim-requests-page__section-header">
        <div className="claim-requests-page__section-heading">
          <h2 className="claim-requests-page__section-title">연결 상태</h2>
          {showDescription ? (
            <p className="claim-requests-page__section-description">고객앱 링크 생성 및 접속 상태를 확인합니다.</p>
          ) : null}
        </div>
      </div>

      <dl className="claim-requests-page__status-grid">
        <div>
          <dt>현재 상태</dt>
          <dd className={className}>{loading ? '확인 중…' : title}</dd>
          <dd className="claim-requests-page__status-subtext">{subtitle}</dd>
        </div>
        <div>
          <dt>최근 접속</dt>
          <dd>{formatDateTime(linkStatus?.lastConnectedAt ?? null)}</dd>
        </div>
        <div>
          <dt>연결 기기</dt>
          <dd>{Number(linkStatus?.deviceCount ?? 0)}대</dd>
        </div>
        <div>
          <dt>설치자 기기</dt>
          <dd>{latestDeviceLabel}</dd>
        </div>
      </dl>
    </section>
  )
}
