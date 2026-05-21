import { FormButton } from '../../../../components/form'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import { gaLabel, insurerLabel, pdfFileNameFromKey } from '../consentAdminMeta'
import { listAdminConsentTemplates, type ConsentTemplateListRow } from '../consentTemplateAdminApi'
import '../consent-admin.css'

function formatDt(value: string | Date | null | undefined): string {
  if (value == null) {
    return '—'
  }
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return d.toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function TemplateListPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<ConsentTemplateListRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setError('로그인이 필요합니다.')
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await listAdminConsentTemplates(token)
      setRows(data)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="consent-admin">
      <div className="consent-admin__inner">
        <h1 className="consent-admin__title">동의서 템플릿</h1>
        <div className="consent-admin__toolbar">
          <Link to="/internal/admin/consent-template/edit" className="consent-admin__btn">
            새 템플릿 등록
          </Link>
          <FormButton htmlType="button" className="consent-admin__btn consent-admin__btn--ghost" onClick={() => void load()}>
            새로고침
          </FormButton>
        </div>

        {error ? <div className="consent-admin__err">{error}</div> : null}

        {loading ? (
          <p style={{ color: 'var(--consent-sub)' }}>불러오는 중…</p>
        ) : (
          <div className="consent-admin__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>GA</th>
                  <th>보험사</th>
                  <th>PDF 파일</th>
                  <th>수정일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--consent-sub)', textAlign: 'center' }}>
                      등록된 템플릿이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>{gaLabel(row.ga_id)}</td>
                      <td>{insurerLabel(row.insurance_company_id)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {pdfFileNameFromKey(row.pdf_storage_key)}
                      </td>
                      <td>{formatDt(row.updated_at)}</td>
                      <td>
                        <Link
                          to={`/internal/admin/consent-template/edit/${row.id}`}
                          className="consent-admin__link"
                        >
                          수정
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
