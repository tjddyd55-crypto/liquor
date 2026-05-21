import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { FormButton, FormInput } from '../../../components/form'
import { fetchSecurityAuditLogs, type SecurityAuditLogRow } from '../../auth/authApi'
import { useAuth } from '../../auth/AuthProvider'

function formatMeta(meta: unknown): string {
  if (meta == null) {
    return '—'
  }
  try {
    return JSON.stringify(meta)
  } catch {
    return String(meta)
  }
}

export default function AuditLogsPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<SecurityAuditLogRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')

  const load = useCallback(async () => {
    if (!token?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const list = await fetchSecurityAuditLogs(token, {
        limit: 50,
        action: actionFilter.trim() || undefined,
        actor_user_id: actorFilter.trim() || undefined,
        since: sinceFilter.trim() || undefined,
      })
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, actionFilter, actorFilter, sinceFilter])

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    void load()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps -- 초기 로드만

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void load()
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>보안 감사 로그</h1>
        <p style={{ color: 'var(--text-sub)', margin: 0 }}>
          최근 이벤트(로그인, 권한 거부, 담당자 변경 등). 비밀번호는 기록하지 않습니다.
        </p>
      </header>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ margin: 0, minWidth: 140 }}>
            <span className="field__label">action</span>
            <FormInput
              className="field__control"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="예: login_success"
            />
          </label>
          <label className="field" style={{ margin: 0, minWidth: 140 }}>
            <span className="field__label">actor_user_id</span>
            <FormInput
              className="field__control"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="사용자 id"
            />
          </label>
          <label className="field" style={{ margin: 0, minWidth: 160 }}>
            <span className="field__label">since (ISO)</span>
            <FormInput
              className="field__control"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
              placeholder="2026-01-01"
            />
          </label>
          <FormButton htmlType="submit" variant="primary" className="button button--primary" disabled={loading}>
            {loading ? '조회 중…' : '조회'}
          </FormButton>
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" disabled={loading} onClick={() => void load()}>
            새로고침
          </FormButton>
        </div>
      </form>

      {error ? <p className="status status--error">{error}</p> : null}

      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="admin-data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>시각</th>
              <th>action</th>
              <th>actor</th>
              <th>role</th>
              <th>target</th>
              <th>ga_id</th>
              <th>meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 20, color: 'var(--text-sub)' }}>
                  {loading ? '불러오는 중…' : '내역이 없습니다. 필터를 조정하거나 조회를 누르세요.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '—'}
                  </td>
                  <td>{r.action}</td>
                  <td style={{ wordBreak: 'break-all', maxWidth: 120 }}>{r.actor_user_id}</td>
                  <td>{r.actor_role}</td>
                  <td style={{ wordBreak: 'break-all', maxWidth: 140 }}>
                    {r.target_type ? `${r.target_type}:${r.target_id ?? ''}` : '—'}
                  </td>
                  <td>{r.ga_id ?? '—'}</td>
                  <td style={{ maxWidth: 280, wordBreak: 'break-all' }}>{formatMeta(r.meta)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
