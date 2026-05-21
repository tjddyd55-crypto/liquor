import { Link } from 'react-router-dom'
import type { IndustriesListViewProps } from './IndustriesListPage'
import IndustriesIndustryCreateSection from './IndustriesIndustryCreateSection'

export default function IndustriesListMobileView({
  items,
  loading,
  listRefreshing,
  error,
  reload,
  create,
}: IndustriesListViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Industry 목록</h1>
      </header>
      <IndustriesIndustryCreateSection {...create} />
      {error ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{error}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      ) : null}
      {loading ? <p className="platform-admin-page__muted">불러오는 중…</p> : null}
      {!loading && !error ? (
        <>
          {listRefreshing ? <p className="platform-admin-page__muted">목록 갱신 중…</p> : null}
          <ul className="platform-admin-page__card-list">
            {items.map((row) => (
              <li key={row.id} className="platform-admin-page__stack-card">
                <div className="platform-admin-page__stack-title">{row.name}</div>
                <div className="platform-admin-page__stack-meta">
                  {row.code} · {row.status}
                </div>
                <div className="platform-admin-page__stack-meta platform-admin-page__mono">id {row.id}</div>
                <div className="platform-admin-page__stack-meta">
                  <Link className="platform-admin-page__inline-link" to={`/admin/platform/industries/${row.id}`}>
                    Industry Admin 관리 →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {items.length === 0 ? <p className="platform-admin-page__muted">행이 없습니다.</p> : null}
        </>
      ) : null}
    </main>
  )
}
