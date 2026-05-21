/**
 * 관리자 PDF 템플릿 목록 페이지.
 *
 * 책임: 서버에서 목록을 받아와 표로 보여주고, "새 템플릿" 페이지로의 진입점만 제공.
 * 신규 등록은 별도 페이지(`/admin/pdf-templates/new`) 에서 진행한다.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { ApiError } from '../../../lib/apiClient'
import { FormButton } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { deleteAdminPdfTemplate, listAdminPdfTemplates } from '../api/pdfTemplateApi'
import type { PdfTemplateSummary } from '../types'
import '../pdf-engine.css'

export default function PdfTemplateListPage() {
  const { token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [rows, setRows] = useState<PdfTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!token?.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await listAdminPdfTemplates(token)
      setRows(res.templates)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleDelete = async (id: number, title: string) => {
    if (!token?.trim()) return
    const ok = await confirm({
      title: '템플릿 삭제',
      message: `"${title}" 템플릿을 삭제할까요? 되돌릴 수 없습니다.`,
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteAdminPdfTemplate(token, id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <main className="insurance-dark-forms pdf-engine-page">
      <h1 className="pdf-engine-page__title">PDF 문서 템플릿</h1>
      <div className="pdf-engine-page__toolbar">
        <Link to="/admin/pdf-templates/new" className="pdf-engine-editor__btn pdf-engine-editor__btn--primary">
          새 템플릿 등록
        </Link>
        <FormButton htmlType="button" className="pdf-engine-editor__btn" onClick={() => void load()}>
          새로고침
        </FormButton>
      </div>

      {error ? <div className="pdf-engine-page__error">{error}</div> : null}
      {loading ? <p className="pdf-engine-page__hint">불러오는 중…</p> : null}

      {/* 내부 식별자(code) 컬럼은 의도적으로 노출하지 않는다.
          관리자는 "제목 + 소속 GA + 상태" 만으로 템플릿을 식별한다. */}
      <table className="pdf-engine-table">
        <thead>
          <tr>
            <th style={{ width: 80 }}>ID</th>
            <th>제목</th>
            <th style={{ width: 180 }}>GA</th>
            <th style={{ width: 100 }}>상태</th>
            <th style={{ width: 180 }}>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td colSpan={5} className="pdf-engine-page__hint">
                등록된 템플릿이 없습니다.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>
                <strong>{r.title}</strong>
                {r.description ? (
                  <div className="pdf-engine-editor__field-meta">{r.description}</div>
                ) : null}
              </td>
              <td>
                {r.gaId == null ? (
                  <span className="pdf-engine-badge">공용</span>
                ) : (
                  <span>{r.gaName ?? `GA#${r.gaId}`}</span>
                )}
              </td>
              <td>
                {r.isActive ? (
                  <span className="pdf-engine-badge">활성</span>
                ) : (
                  <span className="pdf-engine-badge pdf-engine-badge--muted">비활성</span>
                )}
              </td>
              <td>
                <Link
                  to={`/admin/pdf-templates/${r.id}`}
                  className="pdf-engine-editor__btn"
                  style={{ marginRight: 8 }}
                >
                  수정
                </Link>
                <FormButton
                  htmlType="button"
                  variant="danger"
                  className="pdf-engine-editor__btn pdf-engine-editor__btn--danger"
                  onClick={() => void handleDelete(r.id, r.title)}
                >
                  삭제
                </FormButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirmDialog}
    </main>
  )
}
