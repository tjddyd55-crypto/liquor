import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { listCustomerClaimRequests } from '../api/customerAppApi'
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

export default function CustomerAppRequestsPage() {
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const [rows, setRows] = useState<Array<{ id: number; status: string; title: string; memo: string; submittedAt: string | null; fileCount: number }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      navigate('/customer-app', { replace: true })
      return
    }
    let mounted = true
    const run = async () => {
      try {
        const data = await listCustomerClaimRequests(session.appToken)
        if (!mounted) {
          return
        }
        setRows(data)
      } catch (loadError) {
        if (!mounted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : '요청 내역을 불러오지 못했습니다.')
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [navigate, session])

  return (
    <div className="customer-app-claim-page">
      <StatusMessage message={error} tone="error" />
        {rows.length === 0 ? <div className="customer-app-claim-empty">요청 내역이 없습니다.</div> : null}
        {rows.length > 0 ? (
          <ul className="customer-app-claim-request-list">
            {rows.map((row) => {
              const meta = resolveClaimStatusMeta(row.status)
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className="customer-app-claim-request-card"
                    onClick={() => navigate(`/customer-app/requests/${row.id}`)}
                  >
                    <div className="customer-app-claim-request-card__top">
                      <div>
                        <div className="customer-app-claim-request-card__title">
                          #{row.id} {row.title || '청구 요청'}
                        </div>
                        <div className="customer-app-claim-request-card__meta">
                          첨부 {row.fileCount}개 · {formatDateTime(row.submittedAt)}
                        </div>
                      </div>
                      <span className={`customer-app-claim-status ${meta.className}`}>{meta.label}</span>
                    </div>
                    {row.memo ? <div className="customer-app-claim-request-card__memo">{row.memo}</div> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
    </div>
  )
}
