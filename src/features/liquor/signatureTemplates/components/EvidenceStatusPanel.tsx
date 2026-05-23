import { FormButton } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import { buildCustomerPublicSignUrl } from '../../signatures/liquorSignatureHistoryClient'
import {
  downloadStaffEvidencePdfFile,
  downloadStaffSignedPdfFile,
  type SendSessionDetail,
} from '../liquorSignatureTemplateClient'
import {
  formatStaffSessionDateParts,
  staffDocumentStatusLabel,
  staffSendSessionDisplayLabel,
} from '../../signatures/sendSessionStaffDisplay'

type Props = {
  detail: SendSessionDetail | null
  loading: boolean
  onRefresh: () => void
  layout?: 'desktop' | 'mobile'
}

export function EvidenceStatusPanel({ detail, loading, onRefresh, layout = 'desktop' }: Props) {
  const { token } = useAuth()
  const t = token?.trim() ?? ''
  const isMobile = layout === 'mobile'

  const sessionCompleted = detail != null && detail.status === 'completed'
  const consoleIsConfirmation = detail?.templateMode === 'confirmation_only'
  const signedCompleteDocDlLabel = consoleIsConfirmation
    ? '완료 확인서 PDF 다운로드'
    : '완료 계약서 PDF 다운로드'
  const signedCompleteDocPendingLabel = consoleIsConfirmation
    ? '완료 확인서 PDF를 아직 다운로드할 수 없습니다'
    : '완료 계약서 PDF를 아직 다운로드할 수 없습니다'
  const completedDocPdfLabel = consoleIsConfirmation ? '완료 확인서 PDF' : '완료 계약서 PDF'

  async function downloadSignedPdf(docId: string) {
    if (!detail || !t) {
      return
    }
    const r = await downloadStaffSignedPdfFile(t, detail.id, docId)
    if (!r.ok) {
      window.alert(r.message)
    }
  }

  async function downloadEvidencePdf() {
    if (!detail || !t) {
      return
    }
    const r = await downloadStaffEvidencePdfFile(t, detail.id)
    if (!r.ok) {
      window.alert(r.message)
    }
  }

  const copyLink = async (linkCode: string) => {
    const url = buildCustomerPublicSignUrl(linkCode)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('링크를 복사하세요', url)
    }
  }

  const openTab = (linkCode: string) => {
    window.open(buildCustomerPublicSignUrl(linkCode), '_blank', 'noopener,noreferrer')
  }

  if (isMobile) {
    return (
      <div>
        {!detail ? (
          <>
            <p className="contract-signature-console__empty-state-text">
              발송 세션을 만든 뒤 새로고침하면 문서 상태가 표시됩니다.
            </p>
            <FormButton
              htmlType="button"
              variant="secondary"
              size="sm"
              fullWidth
              disabled={loading}
              onClick={onRefresh}
              className="contract-mobile-btn-primary-wide"
            >
              {loading ? '불러오는 중…' : '상태 새로고침'}
            </FormButton>
          </>
        ) : (
          <>
            {(() => {
              const docs = detail.documents ?? []
              const done = docs.filter((d) => d.status === 'completed').length
              const total = Math.max(docs.length, 1)
              const sentParts = formatStaffSessionDateParts(detail.sentAt ?? detail.createdAt)
              const doneParts = formatStaffSessionDateParts(detail.completedAt)
              const statusLabel = staffSendSessionDisplayLabel(detail.status)
              const anyPdfReady = docs.some(
                (d) => d.status === 'completed' && Boolean(d.evidence?.hasSignedPdfFile),
              )
              return (
                <div className="contract-mobile-summary">
                  <div className="contract-mobile-evidence-kv">
                    <div>
                      <dt>상태</dt>
                      <dd>{statusLabel}</dd>
                    </div>
                    <div>
                      <dt>진행</dt>
                      <dd>
                        {done}/{total} 완료
                      </dd>
                    </div>
                    <div>
                      <dt>발송일</dt>
                      <dd>
                        {sentParts
                          ? `${sentParts.date} ${sentParts.time}`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>완료일</dt>
                      <dd>
                        {doneParts ? `${doneParts.date} ${doneParts.time}` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>{completedDocPdfLabel}</dt>
                      <dd>{anyPdfReady ? '다운로드 가능' : '아직 다운로드할 수 없습니다'}</dd>
                    </div>
                    <div>
                      <dt>증빙 PDF</dt>
                      <dd>{sessionCompleted ? '다운로드 가능' : '문서 완료 후'}</dd>
                    </div>
                  </div>
                  <div className="contract-mobile-action-grid">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void copyLink(detail.linkCode)}
                    >
                      링크 복사
                    </FormButton>
                    <FormButton htmlType="button" variant="secondary" size="sm" onClick={() => openTab(detail.linkCode)}>
                      링크 열기
                    </FormButton>
                  </div>
                  {docs.map((d) => {
                    const ev = d.evidence
                    const canDl = d.status === 'completed' && Boolean(ev?.hasSignedPdfFile)
                    return (
                      <div key={d.id} className="contract-mobile-doc-card">
                        <div className="contract-mobile-doc-card__title">{d.titleSnapshot}</div>
                        <div className="contract-signature-console__hint">문서 상태: {staffDocumentStatusLabel(d.status)}</div>
                        <div className="contract-session-pdf-dl-stack" style={{ marginTop: 8 }}>
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            fullWidth
                            className="contract-mobile-btn-primary-wide contract-session-pdf-dl-btn"
                            disabled={!canDl}
                            onClick={() => void downloadSignedPdf(d.id)}
                          >
                            {signedCompleteDocDlLabel}
                          </FormButton>
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            fullWidth
                            className="contract-mobile-btn-primary-wide contract-session-pdf-dl-btn"
                            disabled={!sessionCompleted || !t}
                            onClick={() => void downloadEvidencePdf()}
                          >
                            증빙 PDF 다운로드
                          </FormButton>
                        </div>
                        {!sessionCompleted ? (
                          <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
                            고객이 문서를 완료하면 증빙 PDF를 다운로드할 수 있습니다.
                          </p>
                        ) : null}
                        {d.status === 'completed' && !canDl ? (
                          <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
                            {signedCompleteDocPendingLabel}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                  <div className="contract-mobile-action-grid contract-mobile-action-grid--stack">
                    <FormButton htmlType="button" variant="secondary" size="sm" disabled={loading} onClick={onRefresh}>
                      {loading ? '불러오는 중…' : '상태 새로고침'}
                    </FormButton>
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="contract-signature-console__toolbar">
        <FormButton htmlType="button" variant="secondary" size="sm" disabled={loading || !detail} onClick={onRefresh}>
          {loading ? '불러오는 중…' : '상태 새로고침'}
        </FormButton>
      </div>
      {!detail ? (
        <p className="contract-signature-console__empty-state-text">
          발송 세션을 만든 뒤 새로고침하면 문서 상태가 표시됩니다.
        </p>
      ) : (
        <div className="contract-signature-console__body-text">
          <h3 className="contract-signature-console__subsection-title">세션</h3>
          <ul className="contract-signature-console__unordered-list">
            <li>상태: {staffSendSessionDisplayLabel(detail.status)}</li>
            <li>
              발송일:{' '}
              {(() => {
                const parts = formatStaffSessionDateParts(detail.sentAt ?? detail.createdAt)
                return parts ? `${parts.date} ${parts.time}` : '—'
              })()}
            </li>
            <li>
              완료일:{' '}
              {(() => {
                const parts = formatStaffSessionDateParts(detail.completedAt)
                return parts ? `${parts.date} ${parts.time}` : '—'
              })()}
            </li>
          </ul>
          {detail.confirmationItems != null && detail.confirmationItems.length > 0 ? (
            <>
              <h3 className="contract-signature-console__subsection-title">고객 확인 항목</h3>
              <ul className="contract-signature-console__unordered-list">
                {detail.confirmationItems.map((c) => (
                  <li key={c.id}>
                    {c.label}
                    {c.required ? ' (필수)' : ''}:{' '}
                    {c.checked ? (
                      <>
                        확인 완료
                        {c.checkedAt ? ` — ${String(c.checkedAt).slice(0, 19)}` : ''}
                      </>
                    ) : (
                      <span className="contract-signature-console__hint">미확인</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3 className="contract-signature-console__subsection-title">문서 목록</h3>
          <div className="contract-signature-console__scroll-x">
            <table className="pdf-engine-table contract-signature-console__table--compact">
              <thead>
                <tr>
                  <th>문서명</th>
                  <th>상태</th>
                  <th>{completedDocPdfLabel}</th>
                  <th>증빙 PDF</th>
                </tr>
              </thead>
              <tbody>
                {detail.documents.map((d, idx) => {
                  const ev = d.evidence
                  const canDl = Boolean(ev?.hasSignedPdfFile)
                  const n = detail.documents.length
                  return (
                    <tr key={d.id}>
                      <td>{d.titleSnapshot}</td>
                      <td>{staffDocumentStatusLabel(d.status)}</td>
                      <td>
                        {d.status === 'completed' && canDl ? (
                          <FormButton htmlType="button" variant="secondary" size="sm" onClick={() => void downloadSignedPdf(d.id)}>
                            다운로드
                          </FormButton>
                        ) : d.status === 'completed' ? (
                          <span className="contract-signature-console__hint">아직 다운로드할 수 없습니다</span>
                        ) : (
                          <span className="contract-signature-console__hint">—</span>
                        )}
                      </td>
                      {idx === 0 ? (
                        <td rowSpan={Math.max(n, 1)}>
                          {sessionCompleted && t ? (
                            <FormButton
                              htmlType="button"
                              variant="secondary"
                              size="sm"
                              className="contract-session-pdf-dl-btn"
                              onClick={() => void downloadEvidencePdf()}
                            >
                              다운로드
                            </FormButton>
                          ) : (
                            <span className="contract-signature-console__hint">
                              고객이 문서를 완료하면 다운로드할 수 있습니다.
                            </span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
