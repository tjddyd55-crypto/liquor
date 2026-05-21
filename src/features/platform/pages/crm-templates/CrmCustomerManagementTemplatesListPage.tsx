import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthProvider'
import {
  listCrmCustomerManagementTemplates,
  type CrmTemplateListRow,
} from '../../api/crmCustomerManagementTemplatesApi'

function formatIso(s: string | undefined) {
  if (!s) return '—'
  return s.slice(0, 16).replace('T', ' ')
}

export default function CrmCustomerManagementTemplatesListPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<CrmTemplateListRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeArchived, setIncludeArchived] = useState(false)

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setErr('로그인이 필요합니다.')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const data = await listCrmCustomerManagementTemplates(token, undefined, { includeArchived })
      setRows(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, includeArchived])

  useEffect(() => {
    void load()
  }, [load])

  const body = useMemo(() => {
    if (loading) {
      return <p className="platform-admin-page__muted">불러오는 중…</p>
    }
    if (err) {
      return <p className="platform-admin-page__error">{err}</p>
    }
    if (rows.length === 0) {
      return <p className="platform-admin-page__muted">등록된 동적 템플릿이 없습니다. 신규 생성을 눌러 주세요.</p>
    }
    return (
      <table className="platform-admin-page__table">
        <thead>
          <tr>
            <th>ID</th>
            <th>이름</th>
            <th>Industry</th>
            <th>상태</th>
            <th>rev</th>
            <th>수정 시각</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              <td>
                <code>{r.industry_code}</code>
              </td>
              <td>{r.status}</td>
              <td>{r.revision}</td>
              <td>{formatIso(typeof r.updated_at === 'string' ? r.updated_at : undefined)}</td>
              <td>
                <Link className="platform-admin-page__link" to={`/admin/platform/crm-customer-management-templates/${r.id}/edit`}>
                  편집
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }, [err, loading, rows])

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
        <button type="button" className="filter-button ml-4" disabled={loading} onClick={() => void load()}>
          새로고침
        </button>
        <label className="platform-admin-page__toolbar-check ml-4 flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span className="platform-admin-page__muted text-sm">보관(archived) 템플릿 포함</span>
        </label>
        <Link
          to="/admin/platform/crm-customer-management-templates/new"
          className="filter-button filter-button--workspace-active ml-auto"
        >
          신규 템플릿
        </Link>
      </div>
      <main className="page platform-admin-page platform-admin-page--pc page--with-back">
        <header className="platform-admin-page__head">
          <h1 className="platform-admin-page__title">동적 고객관리 템플릿</h1>
          <p className="platform-admin-page__lede">
          업종별로 고객 등록 폼·목록·상세 탭 구성을 DB에 저장합니다. 보험(insurance) 업종은 적용하지 않습니다.
          </p>
        </header>

        {body}
      </main>
    </>
  )
}
