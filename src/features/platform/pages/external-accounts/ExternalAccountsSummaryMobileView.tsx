import type { ExternalAccountsSummaryViewProps } from './ExternalAccountsSummaryPage'

export default function ExternalAccountsSummaryMobileView({
  loading,
  error,
  notFound,
  notFoundMessage,
  summary,
  reload,
}: ExternalAccountsSummaryViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">외부 계정 요약</h1>
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
          <p className="platform-admin-page__panel-title">404</p>
          <p className="platform-admin-page__muted">{notFoundMessage ?? 'yjasset 테넌트 없음'}</p>
        </div>
      ) : null}
      {loading ? <p className="platform-admin-page__muted">불러오는 중…</p> : null}
      {!loading && summary ? (
        <div className="platform-admin-page__card-list">
          <div className="platform-admin-page__stack-card">
            <div className="platform-admin-page__stack-title">Tenant / GA</div>
            <div className="platform-admin-page__stack-meta">
              {summary.tenant.tenantName} · {summary.tenant.tenantCode}
            </div>
            <div className="platform-admin-page__stack-meta">
              {summary.tenant.gaName} · legacy {summary.tenant.legacyGaId}
            </div>
          </div>
          <div className="platform-admin-page__stack-card">
            <div className="platform-admin-page__stack-title">Insurer managers</div>
            <div className="platform-admin-page__stack-meta">
              전체 {summary.insurerManagers.total} · ACTIVE {summary.insurerManagers.active}
            </div>
          </div>
          <div className="platform-admin-page__stack-card">
            <div className="platform-admin-page__stack-title">Loss adjusters</div>
            <div className="platform-admin-page__stack-meta">
              전체 {summary.lossAdjusters.total} · ACTIVE {summary.lossAdjusters.active}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
