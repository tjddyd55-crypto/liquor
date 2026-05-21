import { Link } from 'react-router-dom'
import { GOVERNMENT_USER_NAV } from '../../config/governmentUserNav'
import { useDocumentTitle } from '../../../../hooks/useDocumentTitle'
import { useAuth } from '../../../auth/AuthProvider'
import '../../government-support.css'

const HOME_LINKS = GOVERNMENT_USER_NAV.filter((item) => item.to !== '/government/workspace')

export default function GovernmentUserHomePage() {
  useDocumentTitle('정부지원 CRM · 홈')
  const { user } = useAuth()
  const displayName = user?.displayName?.trim() || user?.username || '이용자'

  return (
    <section className="government-user-section">
      <h1 className="government-page__title">안녕하세요, {displayName}님</h1>
      <p className="government-page__muted government-user-home__lead">
        사업장 등록·고객/신청 관리·공지·자료를 이용자 메뉴에서 이용할 수 있습니다.
      </p>
      <div className="government-user-home__cards">
        {HOME_LINKS.map((item) => (
          <Link key={item.to} to={item.to} className="government-user-home__card">
            <span className="government-user-home__card-label">{item.label}</span>
            <span className="government-page__muted government-user-home__card-hint">바로가기</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
