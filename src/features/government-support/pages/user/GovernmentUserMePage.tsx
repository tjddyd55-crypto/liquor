import { useEffect, useState } from 'react'
import { LoadingState, StatusMessage } from '../../../../components/feedback'
import { useDocumentTitle } from '../../../../hooks/useDocumentTitle'
import { useAuth } from '../../../auth/AuthProvider'
import { fetchMe } from '../../../auth/authApi'
import { useGovernmentAccess } from '../../hooks/useGovernmentAccess'
import { formatOpsDate } from '../../constants/governmentOperations'
import '../../government-support.css'

function labelForAccountStatus(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'active') return '정상'
  if (s === 'blocked') return '차단'
  if (s === 'inactive') return '비활성'
  return status || '-'
}

export default function GovernmentUserMePage() {
  useDocumentTitle('정부지원 CRM · 내 정보')
  const { token, user } = useAuth()
  const { summary } = useGovernmentAccess(token)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void fetchMe(token)
      .then((row) => {
        if (!cancelled) setStatus(row.status)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '내 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) return <LoadingState message="불러오는 중…" />
  if (error) return <StatusMessage message={error} tone="error" className="m-3" />

  const rows: { label: string; value: string }[] = [
    { label: '아이디', value: user?.username ?? '-' },
    { label: '이름', value: user?.displayName?.trim() || user?.username || '-' },
    {
      label: '소속 대행사',
      value: summary?.programUserTenantName?.trim() || '소속 대행사 정보 없음',
    },
    {
      label: '가입일',
      value: summary?.accountCreatedAt ? formatOpsDate(summary.accountCreatedAt) : '-',
    },
    { label: '계정 상태', value: labelForAccountStatus(status) },
  ]

  return (
    <section className="government-user-section">
      <h1 className="government-page__title">내 정보</h1>
      <p className="government-page__muted">정부지원 CRM 이용자 계정 정보입니다.</p>
      <dl className="government-user-me__list">
        {rows.map((row) => (
          <div key={row.label} className="government-user-me__row">
            <dt className="government-user-me__label">{row.label}</dt>
            <dd className="government-user-me__value">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="government-page__muted government-user-me__note">
        비밀번호 변경은 추후 제공 예정입니다.
      </p>
    </section>
  )
}
