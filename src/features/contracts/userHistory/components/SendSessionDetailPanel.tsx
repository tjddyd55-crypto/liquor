import { useState } from 'react'
import { FormButton } from '../../../../components/form'
import type { SendSessionDetail, SendSessionDocumentDetail } from '../../testConsole/contractSignatureTestConsoleClient'
import {
  downloadStaffEvidencePdfFile,
  downloadStaffSignedPdfFile,
} from '../../testConsole/contractSignatureTestConsoleClient'
import { buildCustomerPublicSignUrl } from '../contractSignatureHistoryClient'
import { SendSessionStatusBadge } from './SendSessionStatusBadge'
import { formatStaffSessionDate, staffDocumentStatusLabel, staffSendSessionDisplayLabel } from '../sendSessionStaffDisplay'
import { ContractTableDateCell, ContractTableHashCell } from './ContractTableCells'

type Props = {
  open: boolean
  detail: SendSessionDetail | null
  loading: boolean
  error: string | null
  token: string
  listHints?: { hasSignedNotCompleted?: boolean } | null
  layout?: 'desktop' | 'mobile'
  onClose: () => void
  onRefresh: () => void
  onCancelSession: () => void
  cancelBusy: boolean
  onCopyLink: (linkCode: string) => void
  onOpenLink: (linkCode: string) => void
}

export function SendSessionDetailPanel({
  open,
  detail,
  loading,
  error,
  token,
  listHints,
  layout = 'desktop',
  onClose,
  onRefresh,
  onCancelSession,
  cancelBusy,
  onCopyLink,
  onOpenLink,
}: Props) {
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null)
  const isMobile = layout === 'mobile'

  if (!open) {
    return null
  }

  const linkCode = detail?.linkCode ?? ''
  const publicUrl = linkCode ? buildCustomerPublicSignUrl(linkCode) : ''
  const sessionSt = detail?.status ?? ''
  const hasCompletedDoc = detail?.documents?.some((d) => d.status === 'completed') ?? false
  const canCancel =
    detail != null && !['completed', 'cancelled', 'expired'].includes(String(sessionSt)) && !hasCompletedDoc
  const derivedSignedPending = detail?.documents?.some((d) => d.status === 'signed') ?? false
  const signedHint = listHints?.hasSignedNotCompleted ?? derivedSignedPending
  const sessionCompleted = detail != null && detail.status === 'completed'
  const isConfirmationSession = detail?.templateMode === 'confirmation_only'
  const canDownloadEvidencePdf = sessionCompleted
  const evidencePdfDownloadLabel = '증빙 PDF'
  const preCompleteHint = '고객이 문서를 완료하면 다운로드할 수 있습니다.'
  const docs = detail?.documents ?? []

  const runSignedDownload = (documentInstanceId: string) => {
    if (!detail) {
      return
    }
    setDownloadMessage(null)
    void downloadStaffSignedPdfFile(token, detail.id, documentInstanceId).then((r) => {
      if (!r.ok) {
        setDownloadMessage(r.message)
      }
    })
  }

  const runEvidenceDownload = () => {
    if (!detail) {
      return
    }
    setDownloadMessage(null)
    void downloadStaffEvidencePdfFile(token, detail.id).then((r) => {
      if (!r.ok) {
        setDownloadMessage(r.message)
      }
    })
  }

  const signedPdfDownloadLabel = isConfirmationSession ? '완료 확인서 다운로드' : '완료 계약서 다운로드'

  const signedPdfCell = (d: SendSessionDocumentDetail) => {
    const ev = d.evidence
    const canDlSigned = d.status === 'completed' && Boolean(ev?.hasSignedPdfFile)
    return (
      <div className="contract-session-doc-dl-wrap">
        <FormButton
          htmlType="button"
          variant="secondary"
          size="sm"
          className="contract-session-pdf-dl-btn"
          disabled={!canDlSigned}
          onClick={() => runSignedDownload(d.id)}
        >
          {signedPdfDownloadLabel}
        </FormButton>
        {d.status === 'completed' && !ev?.hasSignedPdfFile ? (
          <span className="contract-signature-console__hint contract-session-doc-pending">준비 중</span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="contract-signature-console__detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="발송 세션 상세"
    >
      <div className="contract-signature-console__detail-dialog">
        <h2 className="contract-signature-console__section-title">발송 세션 상세</h2>
        {downloadMessage ? (
          <div className="contract-signature-console__alert--danger" role="alert">
            {downloadMessage}
          </div>
        ) : null}
        {error ? (
          <div className="contract-signature-console__alert--danger" role="alert">
            {error}
          </div>
        ) : null}
        {loading && !detail ? <p className="contract-signature-console__hint">불러오는 중…</p> : null}
        {detail ? (
          <>
            <p className="contract-signature-console__hint">
              고객: {detail.customerName ?? '—'}{' '}
              {detail.customerCode ? <span>({detail.customerCode})</span> : null}
            </p>
            <p className="contract-signature-console__hint">마스킹 연락처: {detail.maskedPhone ?? '—'}</p>
            <p className="contract-signature-console__hint">
              발송 링크:{' '}
              <code style={{ fontSize: 12, wordBreak: 'break-all' }} title={publicUrl}>
                {publicUrl}
              </code>
            </p>
            <p className="contract-signature-console__hint">
              세션 상태:{' '}
              <SendSessionStatusBadge sessionStatus={detail.status} hasSignedNotCompleted={signedHint} />{' '}
              <span className="contract-signature-console__hint">
                (
                {staffSendSessionDisplayLabel(detail.status, {
                  hasSignedNotCompleted: signedHint,
                })}
                )
              </span>
            </p>
            <p className="contract-signature-console__hint">
              인증 상태: {detail.identityStatus ?? '—'}
              {detail.identityVerifiedAt ? ` · ${formatStaffSessionDate(detail.identityVerifiedAt)}` : ''}
            </p>
            <p className="contract-signature-console__hint">
              열람: {detail.openedAt ? formatStaffSessionDate(detail.openedAt) : '—'}
            </p>

            <h3 className="contract-signature-console__section-title" style={{ marginTop: 12 }}>
              완료·증빙 PDF 다운로드
            </h3>
            <p className="contract-signature-console__hint" style={{ marginTop: 4 }}>
              {isConfirmationSession
                ? '완료 확인서 PDF는 고객이 확인·서명한 최종 문서입니다. 증빙 PDF는 본인확인·확인 항목·첨부·서명·해시 등 감사 기록을 담은 별도 문서로, 혼동되지 않게 구분되어 있습니다.'
                : '완료 계약서 PDF는 고객 입력값과 전자서명이 반영된 최종 문서입니다. 증빙 PDF는 본인확인, 문서·첨부 확인, 전자서명 및 제출 동의 등 감사 기록을 정리한 별도 문서입니다.'}
            </p>

            {isMobile ? (
              <div className="contract-session-detail-mobile-docs">
                {docs.map((d) => {
                  const ev = d.evidence
                  const docLabel = staffDocumentStatusLabel(d.status)
                  const canDlSigned = d.status === 'completed' && Boolean(ev?.hasSignedPdfFile)
                  return (
                    <div key={d.id} className="contract-session-detail-doc-card">
                      <div className="contract-session-detail-doc-card__title" title={d.titleSnapshot}>
                        {d.titleSnapshot}
                      </div>
                      <div className="contract-signature-console__hint">
                        상태:{' '}
                        <span
                          className="contract-signature-console__status-badge contract-status-badge contract-status-badge--doc"
                          data-doc-status={d.status}
                        >
                          {docLabel}
                        </span>
                      </div>
                      <div className="contract-signature-console__hint">
                        완료일: {d.completedAt ? formatStaffSessionDate(d.completedAt) : '—'}
                      </div>
                      <div className="contract-signature-console__hint">
                        증빙: <ContractTableHashCell prefix={ev?.evidenceHashPrefix ?? null} />
                      </div>
                      <div className="contract-session-pdf-dl-stack" style={{ marginTop: 10 }}>
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          size="sm"
                          className="contract-session-pdf-dl-btn contract-session-pdf-dl-btn--wide"
                          disabled={!canDlSigned}
                          onClick={() => runSignedDownload(d.id)}
                        >
                          {signedPdfDownloadLabel}
                        </FormButton>
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          size="sm"
                          className="contract-session-pdf-dl-btn contract-session-pdf-dl-btn--wide"
                          disabled={!canDownloadEvidencePdf}
                          onClick={runEvidenceDownload}
                        >
                          {evidencePdfDownloadLabel} 다운로드
                        </FormButton>
                      </div>
                      {d.status === 'completed' && !ev?.hasSignedPdfFile ? (
                        <p className="contract-signature-console__hint" style={{ margin: '8px 0 0' }}>
                          {isConfirmationSession ? '완료 확인서 PDF 준비 중입니다.' : '완료 계약서 PDF 준비 중입니다.'}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="contract-signature-console__session-doc-table-wrap">
                <table className="contract-session-doc-table">
                  <colgroup>
                    <col style={{ width: '170px' }} />
                    <col style={{ width: '86px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '148px' }} />
                    <col style={{ width: '148px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="contract-table-cell-left">문서명</th>
                      <th className="contract-table-cell-center">상태</th>
                      <th className="contract-table-cell-center">완료일</th>
                      <th className="contract-table-cell-center">
                        {isConfirmationSession ? '완료 확인서 PDF' : '완료 계약서 PDF'}
                      </th>
                      <th className="contract-table-cell-center">{evidencePdfDownloadLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d, idx) => {
                      const docLabel = staffDocumentStatusLabel(d.status)
                      return (
                        <tr key={d.id}>
                          <td className="contract-table-cell-left">
                            <div className="contract-table-document" title={d.titleSnapshot}>
                              {d.titleSnapshot}
                            </div>
                          </td>
                          <td className="contract-table-cell-center">
                            <span
                              className="contract-signature-console__status-badge contract-status-badge contract-status-badge--doc"
                              data-doc-status={d.status}
                            >
                              {docLabel}
                            </span>
                          </td>
                          <td className="contract-table-cell-center">
                            <ContractTableDateCell iso={d.completedAt} />
                          </td>
                          <td className="contract-table-cell-center">{signedPdfCell(d)}</td>
                          {idx === 0 ? (
                            <td className="contract-table-cell-center" rowSpan={Math.max(docs.length, 1)}>
                              <div className="contract-session-detail-evidence-cell">
                                {!sessionCompleted ? (
                                  <p
                                    className="contract-signature-console__hint contract-session-doc-pending"
                                    style={{ margin: '0 0 8px' }}
                                  >
                                    {preCompleteHint}
                                  </p>
                                ) : null}
                                <FormButton
                                  htmlType="button"
                                  variant="secondary"
                                  size="sm"
                                  className="contract-session-pdf-dl-btn"
                                  disabled={!canDownloadEvidencePdf}
                                  onClick={runEvidenceDownload}
                                >
                                  {evidencePdfDownloadLabel} 다운로드
                                </FormButton>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        <div className="session-modal-actions">
          <div className="session-modal-actions__left">
            <FormButton htmlType="button" variant="secondary" size="sm" disabled={!linkCode} onClick={() => onCopyLink(linkCode)}>
              링크 복사
            </FormButton>
            <FormButton htmlType="button" variant="secondary" size="sm" disabled={!linkCode} onClick={() => onOpenLink(linkCode)}>
              링크 열기
            </FormButton>
            <FormButton htmlType="button" variant="primary" size="sm" disabled={loading || !detail} onClick={onRefresh}>
              상태 새로고침
            </FormButton>
          </div>
          <div className="session-modal-actions__right">
            <FormButton
              htmlType="button"
              variant="secondary"
              size="sm"
              disabled={!canCancel || cancelBusy}
              onClick={onCancelSession}
            >
              발송취소
            </FormButton>
            <FormButton htmlType="button" variant="secondary" size="sm" onClick={onClose}>
              닫기
            </FormButton>
          </div>
        </div>
      </div>
    </div>
  )
}
