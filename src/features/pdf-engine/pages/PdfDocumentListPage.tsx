/**
 * 사용자용 문서(PDF 템플릿) 목록.
 *
 * 서버가 이미 GA 범위와 `is_active` 를 필터링하므로, 이 페이지는 표시/정렬만 담당한다.
 * 발급/폼은 상세 페이지로 위임하여 "목록은 네비게이션, 상세는 작업" 경계를 유지한다.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { parseSelectedCustomerId } from '../../customers/utils/customerWorkspaceNavigation'
import { useAuth } from '../../auth/AuthProvider'
import { listPdfTemplates } from '../api/pdfTemplateApi'
import type { PdfTemplateSummary } from '../types'
import {
  appendQueryToHref,
  buildPdfDocumentDetailHref,
  usePdfDocumentsWorkspacePaths,
} from '../utils/pdfCustomerWorkspacePaths'
import '../pdf-engine.css'

export default function PdfDocumentListPage() {
  const { token } = useAuth()
  const params = useParams<{ customerId?: string }>()
  const [searchParams] = useSearchParams()
  const { workspaceCustomerId, historyPath, issuerQuerySuffix } = usePdfDocumentsWorkspacePaths()
  const isWorkspaceEmbedded = workspaceCustomerId != null

  const linkedCustomerId = useMemo(() => {
    const fromPath = parseSelectedCustomerId(params.customerId ?? null)
    if (fromPath != null) return fromPath
    return parseSelectedCustomerId(searchParams.get('customerId'))
  }, [params.customerId, searchParams])

  const [rows, setRows] = useState<PdfTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token?.trim()) return
    let cancelled = false
    /* 토큰 재로드 시 "로딩 중" UX 를 보장하기 위한 의도적 동기 setState.
       외부 HTTP 소스와 동기화하는 전형적 effect 패턴이라 경고 억제가 맞다. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    listPdfTemplates(token)
      .then((res) => {
        if (cancelled) return
        const sorted = [...res.templates].sort((a, b) => a.title.localeCompare(b.title, 'ko'))
        setRows(sorted)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.message : '문서 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main
      className={`insurance-dark-forms pdf-engine-page${isWorkspaceEmbedded ? ' pdf-engine-page--workspace-embedded' : ''}`}
    >
      <h1 className="pdf-engine-page__title">신청서 작성</h1>
      <p className="pdf-engine-page__hint">
        PDF 템플릿 기반으로 작성 가능한 문서만 표시됩니다. 항목을 선택한 뒤 안내에 따라 입력하면 PDF로
        발급할 수 있습니다.
      </p>
      <p className="pdf-engine-page__hint">
        <Link to={historyPath}>과거 작성·발급 목록(다운로드) →</Link>
      </p>
      {linkedCustomerId != null ? (
        <p className="pdf-engine-page__hint" role="status">
          {workspaceCustomerId != null
            ? `고객 작업 영역 · 고객 #${linkedCustomerId}`
            : `참고: 고객 #${linkedCustomerId}에서 이동했습니다. 문서와 고객 카드 자동 연동은 다음 단계에서 붙일 예정입니다.`}
        </p>
      ) : null}
      {loading ? <p className="pdf-engine-page__hint">불러오는 중…</p> : null}

      {!loading && rows.length === 0 && !error ? (
        <p className="pdf-engine-page__hint">현재 사용 가능한 문서가 없습니다.</p>
      ) : null}

      <ul className="pdf-engine-doc-list">
        {rows.map((r) => (
          <li key={r.id} className="pdf-engine-doc-list__item">
            <Link
              to={appendQueryToHref(buildPdfDocumentDetailHref(workspaceCustomerId, r.id), issuerQuerySuffix)}
              className="pdf-engine-doc-list__link"
            >
              <strong>{r.title}</strong>
              {r.description ? (
                <span className="pdf-engine-editor__field-meta">{r.description}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
