import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LoadingState, StatusMessage } from '../../../../components/feedback'
import { useAuth } from '../../../auth/AuthProvider'
import {
  fetchGovernmentProgramUserDetail,
  type GovernmentProgramUserDetail,
} from '../../api/governmentProgramUsersApi'
import '../../government-support.css'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR')
}

const STATUS_LABELS: Record<string, string> = {
  active: '정상',
  blocked: '접근금지',
  inactive: '비활성',
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="government-admin-program-user-detail__row">
      <span className="government-admin-program-user-detail__label">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function GovernmentAdminProgramUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const { token } = useAuth()
  const [data, setData] = useState<GovernmentProgramUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !userId) return
    setLoading(true)
    setError(null)
    void fetchGovernmentProgramUserDetail(token, userId)
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : '이용자 정보를 불러오지 못했습니다.')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [token, userId])

  if (loading) {
    return <LoadingState message="이용자 정보 불러오는 중…" />
  }

  if (error || !data) {
    return (
      <div className="government-admin-page">
        <StatusMessage message={error ?? '이용자를 찾을 수 없습니다.'} tone="error" />
        <Link to="/government/admin/program-users" className="dark-link">
          ← 이용자 목록
        </Link>
      </div>
    )
  }

  const agencyLabel =
    data.tenantName && data.agencyCode
      ? `${data.tenantName} (${data.agencyCode})`
      : data.tenantName || data.agencyCode || '—'

  return (
    <div className="government-admin-page government-admin-program-user-detail">
      <p>
        <Link to="/government/admin/program-users" className="dark-link">
          ← 이용자 목록
        </Link>
      </p>
      <h1 className="government-page__title">이용자 상세</h1>
      <p className="government-page__muted">{data.profilesAccessNote}</p>

      <section className="government-admin-program-user-detail__card">
        <DetailRow label="이용자 아이디" value={data.username} />
        <DetailRow label="이름" value={data.displayName || '—'} />
        <DetailRow label="소속 대행사" value={agencyLabel} />
        <DetailRow label="가입일" value={formatDate(data.createdAt)} />
        <DetailRow label="상태" value={STATUS_LABELS[data.status] ?? data.status} />
        <DetailRow label="최근 로그인" value={formatDate(data.lastLoginAt)} />
      </section>
    </div>
  )
}
