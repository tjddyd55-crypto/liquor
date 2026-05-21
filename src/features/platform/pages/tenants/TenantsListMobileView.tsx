import { Link } from 'react-router-dom'
import type { TenantsListViewProps } from './TenantsListPage'

function isTenantManageable(row: TenantsListViewProps['items'][number]): boolean {
  return String(row.status ?? '').trim().toLowerCase() === 'active'
}

export default function TenantsListMobileView({ items, loading, error, reload }: TenantsListViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Tenant 목록</h1>
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
            <li key={row.id} className="platform-admin-page__stack-card">
              <div className="platform-admin-page__stack-title">{row.name}</div>
              <div className="platform-admin-page__stack-meta">{row.code}</div>
              <div className="platform-admin-page__stack-meta">
                industry {row.industryCode ?? '—'} · {row.status}
              </div>
              <div className="platform-admin-page__stack-meta platform-admin-page__mono">
                legacy_ga_id {row.legacyGaId ?? '—'} · id {row.id}
              </div>
              {isTenantManageable(row) ? (
                <div className="platform-admin-page__tenant-admin-card-actions">
                  <Link
                    className="platform-admin-page__btn platform-admin-page__btn--compact"
                    to={`/admin/platform/tenants/${encodeURIComponent(row.id)}`}
                  >
                    코드·사용자 관리
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !error && items.length === 0 ? <p className="platform-admin-page__muted">행이 없습니다.</p> : null}
    </main>
  )
}
