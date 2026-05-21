import type { MembershipsListViewProps } from './MembershipsListPage'

export default function MembershipsListPCView({ items, loading, error, reload }: MembershipsListViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">User Membership</h1>
        <p className="platform-admin-page__lede">users에 연결된 user_memberships (삭제 사용자 제외)</p>
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
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>username</th>
                <th>user role</th>
                <th>membership role</th>
                <th>scope</th>
                <th>tenant</th>
                <th>industry</th>
                <th>status</th>
                <th>m.id</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.membershipId}>
                  <td>{row.username}</td>
                  <td>{row.legacyRole}</td>
                  <td>{row.membershipRole}</td>
                  <td className="platform-admin-page__mono">
                    {row.scopeType}
                    {row.scopeId ? ` · ${row.scopeId}` : ''}
                  </td>
                  <td className="platform-admin-page__muted">{row.tenantCode ?? '—'}</td>
                  <td className="platform-admin-page__muted">{row.industryCode ?? '—'}</td>
                  <td>{row.status}</td>
                  <td className="platform-admin-page__mono">{row.membershipId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? <p className="platform-admin-page__muted">행이 없습니다.</p> : null}
        </div>
      ) : null}
    </main>
  )
}
