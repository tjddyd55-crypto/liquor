import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { FormButton } from '../../../components/form'
import { getCustomerClaimRequestDetail, type CustomerAppClaimRequestDetail } from '../api/customerAppApi'
import { useCustomerAppSession } from '../session/useCustomerAppSession'
import { resolveClaimStatusMeta } from '../utils/claimStatus'

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return '0 KB'
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.ceil(bytes / 1024)} KB`
}

function isImageFile(contentType: string): boolean {
  return String(contentType ?? '').startsWith('image/')
}

export default function CustomerAppRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const [detail, setDetail] = useState<CustomerAppClaimRequestDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const parsedRequestId = Number(requestId)
  const hasInvalidRequestId = !Number.isInteger(parsedRequestId) || parsedRequestId < 1

  const loadDetail = useCallback(async (token: string, id: number) => {
    setLoading(true)
    try {
      const data = await getCustomerClaimRequestDetail(token, id)
      setDetail(data)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '요청 상세를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      navigate('/customer-app', { replace: true })
      return
    }
    if (hasInvalidRequestId) {
      return
    }
    let active = true
    const run = async () => {
      if (!active) {
        return
      }
      await loadDetail(session.appToken, parsedRequestId)
    }
    void run()
    const timer = window.setInterval(() => {
      void run()
    }, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [hasInvalidRequestId, loadDetail, navigate, parsedRequestId, session])

  const statusMeta = detail ? resolveClaimStatusMeta(detail.status) : null

  return (
    <div className="customer-app-claim-page">
      <StatusMessage message={hasInvalidRequestId ? '잘못된 요청 번호입니다.' : error} tone="error" />
        {!detail && loading ? <div className="customer-app-claim-empty">불러오는 중…</div> : null}
        {detail ? (
          <>
            <section className="customer-app-claim-card">
              <div className="customer-app-claim-detail-header">
                <h2 className="customer-app-claim-section-title">#{detail.id} 청구 요청</h2>
                {statusMeta ? <span className={`customer-app-claim-status ${statusMeta.className}`}>{statusMeta.label}</span> : null}
              </div>
              <div className="customer-app-claim-detail-meta">
                <span>접수 {formatDateTime(detail.submittedAt)}</span>
                {detail.processedAt ? <span>처리 {formatDateTime(detail.processedAt)}</span> : null}
              </div>
              {detail.memo ? <div className="customer-app-claim-detail-memo">{detail.memo}</div> : null}
              <div className="customer-app-claim-refresh-wrap">
                <FormButton
                  htmlType="button"
                  variant="secondary"
                  className="button button--secondary customer-app-claim-refresh-btn"
                  onClick={() => {
                    if (!session || hasInvalidRequestId) {
                      return
                    }
                    void loadDetail(session.appToken, parsedRequestId)
                  }}
                  loading={loading}
                >
                  상태 새로고침
                </FormButton>
              </div>
            </section>

            <section className="customer-app-claim-card">
              <h2 className="customer-app-claim-section-title">첨부 파일</h2>
              <p className="customer-app-claim-section-description">제출한 이미지와 PDF를 확인할 수 있습니다.</p>
              {detail.files.length === 0 ? (
                <div className="customer-app-claim-empty customer-app-claim-empty--in-card">첨부 파일이 없습니다.</div>
              ) : (
                <div className="customer-app-claim-detail-files">
                  {detail.files.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="customer-app-claim-detail-file"
                    >
                      {isImageFile(file.contentType) ? (
                        <img className="customer-app-claim-detail-file__thumb" src={file.url} alt="" loading="lazy" />
                      ) : (
                        <span className="customer-app-claim-detail-file__placeholder">PDF</span>
                      )}
                      <span>
                        <span className="customer-app-claim-detail-file__name">{file.fileName}</span>
                        <span className="customer-app-claim-detail-file__meta">
                          {formatFileSize(file.fileSize)} · 열기
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="customer-app-claim-card">
              <h2 className="customer-app-claim-section-title">상태 이력</h2>
              {detail.statusLogs.length === 0 ? (
                <div className="customer-app-claim-empty customer-app-claim-empty--in-card">상태 이력이 없습니다.</div>
              ) : (
                <ul className="customer-app-claim-timeline">
                  {detail.statusLogs.map((log) => (
                    <li key={log.id} className="customer-app-claim-timeline__item">
                      <div className="customer-app-claim-timeline__main">
                        {log.fromStatus ? `${resolveClaimStatusMeta(log.fromStatus).label} → ` : '초기 → '}
                        {resolveClaimStatusMeta(log.toStatus).label}
                      </div>
                      <div className="customer-app-claim-timeline__meta">{formatDateTime(log.changedAt)}</div>
                      {log.memo ? <div className="customer-app-claim-timeline__memo">{log.memo}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
  )
}
