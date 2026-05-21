import type { ExternalAccountsSummaryViewProps } from './ExternalAccountsSummaryPage'

export default function ExternalAccountsSummaryPCView({
  loading,
  error,
  notFound,
  notFoundMessage,
  summary,
  reload,
}: ExternalAccountsSummaryViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">보험 외부 계정 요약</h1>
        <p className="platform-admin-page__lede">tenant 코드 yjasset · legacy_ga_id 기준 insurer_managers / loss_adjusters 건수</p>
      </header>
      {error ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{error}</p>
          <button type="button" className="platform-admin-page__btn" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : null}
      {notFound ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p className="platform-admin-page__panel-title">데이터 없음 (404)</p>
          <p className="platform-admin-page__muted">{notFoundMessage ?? 'yjasset 테넌트가 없습니다.'}</p>
        </div>
      ) : null}
      {loading ? <p className="platform-admin-page__muted">불러오는 중…</p> : null}
      {!loading && summary ? (
        <div className="platform-admin-page__summary-grid">
          <section className="platform-admin-page__summary-card">
            <h2 className="platform-admin-page__summary-card-title">Tenant / GA</h2>
            <dl className="platform-admin-page__dl">
              <div>
                <dt>테넌트</dt>
                <dd>
                  {summary.tenant.tenantName} ({summary.tenant.tenantCode})
                </dd>
              </div>
              <div>
                <dt>GA</dt>
                <dd>
                  {summary.tenant.gaName} ({summary.tenant.gaCode})
                </dd>
              </div>
              <div>
                <dt>legacy_ga_id</dt>
                <dd className="platform-admin-page__mono">{summary.tenant.legacyGaId}</dd>
              </div>
            </dl>
          </section>
          <section className="platform-admin-page__summary-card">
            <h2 className="platform-admin-page__summary-card-title">Insurer managers</h2>
            <p className="platform-admin-page__stat">
              전체 <strong>{summary.insurerManagers.total}</strong>
            </p>
            <p className="platform-admin-page__stat">
              ACTIVE <strong>{summary.insurerManagers.active}</strong>
            </p>
            <p className="platform-admin-page__muted platform-admin-page__stat-note">status UPPER(TRIM) = ACTIVE, 삭제 제외</p>
          </section>
          <section className="platform-admin-page__summary-card">
            <h2 className="platform-admin-page__summary-card-title">Loss adjusters</h2>
            <p className="platform-admin-page__stat">
              전체 <strong>{summary.lossAdjusters.total}</strong>
            </p>
            <p className="platform-admin-page__stat">
              ACTIVE <strong>{summary.lossAdjusters.active}</strong>
            </p>
            <p className="platform-admin-page__muted platform-admin-page__stat-note">동일 기준</p>
          </section>
        </div>
      ) : null}
    </main>
  )
}
