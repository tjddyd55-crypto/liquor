import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthProvider'
import { fetchGovAgencies } from '../../api/governmentProfilesApi'
import { fetchGovernmentAdminUsers } from '../../api/governmentAdminUsersApi'
import { useGovernmentAccess } from '../../hooks/useGovernmentAccess'
import { canManageGovernmentUsers } from '../../lib/governmentAccess'

type HubCard = {
  to: string
  title: string
  description: string
}

export default function GovernmentAdminDashboardPage() {
  const { token } = useAuth()
  const { summary } = useGovernmentAccess(token)
  const showUserMgmt = canManageGovernmentUsers(summary)
  const [agencyCount, setAgencyCount] = useState<number | null>(null)
  const [programUserCount, setProgramUserCount] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return
    void fetchGovAgencies(token)
      .then((agencies) => setAgencyCount(agencies.length))
      .catch(() => setAgencyCount(0))
  }, [token])

  useEffect(() => {
    if (!token || !showUserMgmt) return
    void fetchGovernmentAdminUsers(token, { role: 'government_user' })
      .then((users) => setProgramUserCount(users.length))
      .catch(() => setProgramUserCount(0))
  }, [token, showUserMgmt])

  const cards = useMemo((): HubCard[] => {
    const list: HubCard[] = [
      {
        to: '/government/admin/agencies',
        title: '대행사 관리',
        description: `등록 대행사 ${agencyCount ?? '—'}곳 · 기관 코드·가입 링크 발급`,
      },
    ]
    if (showUserMgmt) {
      list.push(
        {
          to: '/government/admin/program-users',
          title: '이용자 관리',
          description: `프로그램 이용자 ${programUserCount ?? '—'}명 · 사업장 요약은 이용자 상세에서만`,
        },
        {
          to: '/government/admin/users',
          title: '직원 관리',
          description: '대행사 직원·관리자 계정 등록·상태 관리',
        },
      )
    }
    list.push(
      {
        to: '/government/admin/notices',
        title: '공지/전달사항',
        description: '운영 공지·전달사항 게시',
      },
      {
        to: '/government/admin/resources',
        title: '자료실/서식함',
        description: '운영 자료·서식 파일 관리',
      },
    )
    return list
  }, [agencyCount, programUserCount, showUserMgmt])

  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">정부지원 CRM 관리</h1>
        <p className="platform-admin-page__lede">
          대행사·직원·이용자·운영 공지/자료를 관리합니다. 사업장/고객 전체 목록은 제공하지 않으며, 이용자
          워크스페이스 또는 이용자 상세 요약에서만 확인합니다.
        </p>
      </header>
      <div className="platform-admin-page__grid">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="platform-admin-page__card">
            <h2 className="platform-admin-page__card-title">{c.title}</h2>
            <p className="platform-admin-page__card-desc">{c.description}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
