import type { MembershipsListViewProps } from './MembershipsListPage'

export default function MembershipsListMobileView({ items, loading, error, reload }: MembershipsListViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">User Membership</h1>
      </header>
      {error ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{error}</p>
          <button type="button" className="platform-admin-page__btn" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : null}
      {loading ? <p className="platform-admin-page__muted">불러오는 중…</p> : null}
      {!loading && !error ? (
        <ul className="platform-admin-page__card-list">
          {items.map((row) => (
            <li key={row.membershipId} className="platform-admin-page__stack-card">
              <div className="platform-admin-page__stack-title">{row.username}</div>
              <div className="platform-admin-page__stack-meta">
                {row.legacyRole} → {row.membershipRole} · {row.status}
              </div>
              <div className="platform-admin-page__stack-meta">{row.scopeType}</div>
              <div className="platform-admin-page__stack-meta platform-admin-page__mono">
                tenant {row.tenantCode ?? '—'} · industry {row.industryCode ?? '—'}
              </div>
              <div className="platform-admin-page__stack-meta platform-admin-page__mono">m.{row.membershipId}</div>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !error && items.length === 0 ? <p className="platform-admin-page__muted">행이 없습니다.</p> : null}
    </main>
  )
}
