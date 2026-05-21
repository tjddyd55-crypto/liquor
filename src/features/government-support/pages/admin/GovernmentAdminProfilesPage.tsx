import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../../../../components/feedback'
import { useAuth } from '../../../auth/AuthProvider'
import { fetchGovProfiles } from '../../api/governmentProfilesApi'
import type { GovSupportProfile } from '../../types/governmentProfile.types'

export default function GovernmentAdminProfilesPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<GovSupportProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchGovProfiles(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="government-admin-page">
      <div className="government-admin-page__toolbar">
        <h1 className="government-page__title">고객/사업장 관리</h1>
        <Link to="/government/workspace" className="dark-link">
          + 워크스페이스에서 등록
        </Link>
      </div>
      {loading ? <LoadingState message="불러오는 중…" /> : null}
      {error ? <p className="government-admin-page__error">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState message="등록된 고객/사업장이 없습니다. 워크스페이스에서 추가하거나 수행기관을 먼저 등록하세요." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <div className="government-admin-table-wrap">
          <table className="government-admin-table">
            <thead>
              <tr>
                <th>고객명</th>
                <th>사업장</th>
                <th>연락처</th>
                <th>진행상태</th>
                <th>지역</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to="/government/workspace" className="dark-link">
                      {r.customerName || '—'}
                    </Link>
                  </td>
                  <td>{r.businessName || '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.progressStatus || '—'}</td>
                  <td>{r.region || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
