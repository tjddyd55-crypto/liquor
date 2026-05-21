import { Link } from 'react-router-dom'
import type { IndustriesListViewProps } from './IndustriesListPage'
import IndustriesIndustryCreateSection from './IndustriesIndustryCreateSection'

export default function IndustriesListPCView({
  items,
  loading,
  listRefreshing,
  error,
  reload,
  create,
}: IndustriesListViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Industry 목록</h1>
        <p className="platform-admin-page__lede">industries 테이블 · 목록 및 생성(Super Admin)</p>
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
          <div className="platform-admin-page__table-wrap">
            <table className="platform-admin-page__table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>이름</th>
                  <th>상태</th>
                  <th>id</th>
                  <th>생성</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.status}</td>
                    <td className="platform-admin-page__mono">{row.id}</td>
                    <td>
                      <Link
                        className="platform-admin-page__inline-link"
                        to={`/admin/platform/industries/${row.id}`}
                      >
                        관리
                      </Link>
                    </td>
                    <td className="platform-admin-page__muted">{row.createdAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? <p className="platform-admin-page__muted">행이 없습니다.</p> : null}
          </div>
        </>
      ) : null}
    </main>
  )
}
