import { FormButton } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import { buildCustomerPublicSignUrl } from '../../userHistory/contractSignatureHistoryClient'
import {
  downloadStaffEvidencePdfFile,
  downloadStaffSignedPdfFile,
  type SendSessionDetail,
} from '../contractSignatureTestConsoleClient'
import {
  formatStaffSessionDateParts,
  staffDocumentStatusLabel,
  staffSendSessionDisplayLabel,
} from '../../userHistory/sendSessionStaffDisplay'

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
    ? '완료 확인서 PDF 준비 중'
    : '완료 계약서 PDF 준비 중'
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
              발송 세션을 만든 뒤 새로고침하면 문서 상태와 evidence가 표시됩니다.
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
              const evPrefix =
                docs.map((d) => d.evidence?.evidenceHashPrefix).find((p) => p && String(p).trim() !== '') ?? null
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
                      <dt>증빙</dt>
                      <dd>{evPrefix && String(evPrefix).trim() !== '' ? String(evPrefix).trim() : '—'}</dd>
                    </div>
                    <div>
                      <dt>{completedDocPdfLabel}</dt>
                      <dd>{anyPdfReady ? '다운로드 가능' : '준비 중 또는 없음'}</dd>
                    </div>
                    <div>
                      <dt>증빙 PDF</dt>
                      <dd>{sessionCompleted ? '다운로드 가능' : '세션 완료 후'}</dd>
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
                        <div className="contract-signature-console__hint" style={{ marginTop: 4 }}>
                          evidence: {ev?.evidenceHashPrefix ?? '—'}
                        </div>
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
            <details style={{ marginTop: 14 }}>
              <summary className="contract-signature-console__hint" style={{ cursor: 'pointer' }}>
                테스트 절차 안내
              </summary>
              <ol className="contract-signature-console__ordered-list" style={{ marginTop: 8 }}>
                <li>고객 공개 링크를 새 탭으로 엽니다.</li>
                <li>마스킹된 번호가 맞는지 확인합니다.</li>
                <li>인증번호 받기를 누릅니다.</li>
                <li>개발 환경에서는 mock OTP 로그를 확인합니다.</li>
                <li>인증번호를 입력합니다.</li>
                <li>문서 상세에서 값을 입력합니다.</li>
                <li>손사인을 저장합니다.</li>
                <li>문서 완료를 진행합니다.</li>
                <li>이 화면에서 상태 새로고침 후 evidenceHash(prefix)를 확인합니다.</li>
              </ol>
            </details>
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
          발송 세션을 만든 뒤 새로고침하면 문서·evidence 가 표시됩니다.
        </p>
      ) : (
        <div className="contract-signature-console__body-text">
          <h3 className="contract-signature-console__subsection-title">세션</h3>
          <ul className="contract-signature-console__unordered-list">
            <li>status: {detail.status}</li>
            <li>sentAt: {detail.sentAt ?? '—'}</li>
            <li>completedAt: {detail.completedAt ?? '—'}</li>
            <li>지정 휴대폰 인증 세션 ID: {detail.identitySessionId ?? '—'}</li>
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
          <h3 className="contract-signature-console__subsection-title">문서 / evidence</h3>
          <div className="contract-signature-console__scroll-x">
            <table className="pdf-engine-table contract-signature-console__table--compact">
              <thead>
                <tr>
                  <th>문서 ID</th>
                  <th>제목 스냅샷</th>
                  <th>문서 상태</th>
                  <th>필수(정렬)</th>
                  <th>evidenceHash(prefix)</th>
                  <th>identityProvider</th>
                  <th>identityLevel</th>
                  <th>otpVerifiedAt</th>
                  <th>signedAt</th>
                  <th>{completedDocPdfLabel}</th>
                  <th>증빙 PDF</th>
                </tr>
              </thead>
              <tbody>
                {detail.documents.map((d, idx) => {
                  const ev = d.evidence
                  const hashShow = ev?.evidenceHash ?? '—'
                  const canDl = Boolean(ev?.hasSignedPdfFile)
                  const n = detail.documents.length
                  return (
                    <tr key={d.id}>
                      <td>
                        <code>{d.id.slice(0, 14)}…</code>
                      </td>
                      <td>{d.titleSnapshot}</td>
                      <td>{d.status}</td>
                      <td>{d.sortOrder}</td>
                      <td title={hashShow !== '—' ? `전체 해시(관리자): ${hashShow}` : undefined}>
                        {ev?.evidenceHashPrefix ?? '—'}
                      </td>
                      <td>{ev?.identityProvider ?? '—'}</td>
                      <td>{ev?.identityLevel ?? '—'}</td>
                      <td>{ev?.otpVerifiedAt ?? '—'}</td>
                      <td>{ev?.signedAt ?? '—'}</td>
                      <td>
                        {d.status === 'completed' && canDl ? (
                          <FormButton htmlType="button" variant="secondary" size="sm" onClick={() => void downloadSignedPdf(d.id)}>
                            다운로드
                          </FormButton>
                        ) : d.status === 'completed' ? (
                          <span className="contract-signature-console__hint">준비 중</span>
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
          <p className="contract-signature-console__footnote">
            전체 <code>evidenceHash</code>는 행에 마우스를 올리면 툴팁으로 확인할 수 있습니다.
          </p>
        </div>
      )}

      <h3 className="contract-signature-console__subsection-title">테스트 절차 안내</h3>
      <ol className="contract-signature-console__ordered-list">
        <li>고객 공개 링크를 새 탭으로 엽니다.</li>
        <li>마스킹된 번호가 맞는지 확인합니다.</li>
        <li>인증번호 받기를 누릅니다.</li>
        <li>개발 환경에서는 mock OTP 로그를 확인합니다.</li>
        <li>인증번호를 입력합니다.</li>
        <li>문서 상세에서 값을 입력합니다.</li>
        <li>손사인을 저장합니다.</li>
        <li>문서 완료를 진행합니다.</li>
        <li>이 화면에서 상태 새로고침 후 evidenceHash(prefix)를 확인합니다.</li>
      </ol>
    </div>
  )
}
