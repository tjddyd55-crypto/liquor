import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../../../../components/feedback'
import FormButton from '../../../../components/form/FormButton'
import FormInput from '../../../../components/form/FormInput'
import { useAuth } from '../../../auth/AuthProvider'
import GovernmentAdminPageShell from '../../components/GovernmentAdminPageShell'
import { createGovAgency, fetchGovAgencies } from '../../api/governmentProfilesApi'
import type { GovAgencyRow } from '../../types/governmentProfile.types'

export default function GovernmentAdminAgenciesPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<GovAgencyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [agencyCode, setAgencyCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setRows(await fetchGovAgencies(token))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    if (!token) return
    if (!name.trim()) {
      setErr('대행사명을 입력하세요.')
      return
    }
    if (!agencyCode.trim() || agencyCode.trim().length < 3) {
      setErr('기관 코드는 3자 이상이어야 합니다.')
      return
    }
    setErr(null)
    setMsg(null)
    try {
      await createGovAgency(token, { name: name.trim(), agencyCode: agencyCode.trim() })
      setName('')
      setAgencyCode('')
      setMsg('수행기관/대행사를 등록하고 가입 코드를 발급했습니다.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '등록에 실패했습니다.')
    }
  }

  return (
    <GovernmentAdminPageShell
      title="수행기관/대행사 관리"
      description="기관명·기관 코드를 등록하면 가입 링크가 발급됩니다."
      toolbar={
        <>
          <FormInput label="기관명" value={name} onChange={(e) => setName(e.target.value)} />
          <FormInput
            label="기관 코드 (가입 코드)"
            value={agencyCode}
            onChange={(e) => setAgencyCode(e.target.value)}
          />
          <FormButton htmlType="button" variant="primary" className="button button--primary" onClick={() => void onCreate()}>
            등록
          </FormButton>
          {loading ? <LoadingState message="불러오는 중…" className="m-0 text-sm text-[var(--text-sub)]" /> : null}
        </>
      }
    >
      {msg ? <p style={{ padding: '12px 16px', color: 'var(--success)' }}>{msg}</p> : null}
      {err ? <p style={{ padding: '12px 16px', color: 'var(--danger)' }}>{err}</p> : null}

      <div className="table-container table-container--desktop">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>기관 코드</th>
              <th>기관명</th>
              <th>상태</th>
              <th>가입 URL</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '20px 14px', color: 'var(--text-sub)' }}>
                  등록된 수행기관/대행사가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.agencyCode}</td>
                  <td>{r.name}</td>
                  <td>{r.status}</td>
                  <td>
                    <Link to={`/government/join/${r.agencyCode}`} className="dark-link">
                      /government/join/{r.agencyCode}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-responsive-card-list" style={{ padding: 12 }}>
        {rows.length === 0 && !loading ? (
          <EmptyState message="등록된 수행기관/대행사가 없습니다." className="m-0 px-1 py-2 text-[var(--text-sub)]" />
        ) : (
          rows.map((r) => (
            <article key={r.id} className="admin-ga-card">
              <div className="admin-ga-card__row">
                <span className="admin-ga-card__label">기관 코드</span>
                <span className="admin-ga-card__value">{r.agencyCode}</span>
              </div>
              <div className="admin-ga-card__row">
                <span className="admin-ga-card__label">기관명</span>
                <span className="admin-ga-card__value">{r.name}</span>
              </div>
              <div className="admin-ga-card__row">
                <span className="admin-ga-card__label">상태</span>
                <span className="admin-ga-card__value">{r.status}</span>
              </div>
              <div className="admin-ga-card__actions">
                <Link to={`/government/join/${r.agencyCode}`} className="button button--secondary dark-link">
                  가입 URL
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </GovernmentAdminPageShell>
  )
}
