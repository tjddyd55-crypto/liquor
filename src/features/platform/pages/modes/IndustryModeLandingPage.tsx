import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../../auth/AuthProvider'
import { usePlatformLandingAccess } from '../../hooks/usePlatformLandingAccess'
import PlatformLandingAccessFeedback from './PlatformLandingAccessFeedback'

/** SUPER_ADMIN 전용 Industry Mode 시작점 placeholder(`/admin/industry/:industryId`). */
export default function IndustryModeLandingPage() {
  const { industryId } = useParams<{ industryId: string }>()
  const idRaw = String(industryId ?? '').trim()
  const displayId = idRaw || '—'

  const { token } = useAuth()
  const { decision, reload } = usePlatformLandingAccess({
    token,
    scopeType: 'industry',
    scopeId: industryId,
  })

  const showPlaceholder = decision === 'allowed'

  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
      </div>

      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Industry Mode</h1>
        <p className="platform-admin-page__lede platform-mode-landing platform-mode-landing__id-row">
          <span className="platform-admin-page__muted">업종 ID</span>{' '}
          <span className="platform-admin-page__mono">{displayId}</span>
        </p>
      </header>

      <PlatformLandingAccessFeedback decision={decision} onRetry={reload} />

      {showPlaceholder ? (
        <div className="platform-admin-page__panel platform-mode-landing">
          <p className="platform-mode-landing__p">이 화면은 업종 관리자 모드의 시작 페이지입니다.</p>
          <p className="platform-mode-landing__p">
            현재는 placeholder 단계이며, 실제 테넌트 생성/관리 기능은 기존 플랫폼 관리 화면에서 진행합니다.
          </p>

          <h2 className="platform-mode-landing__subhead">향후 기능(예정)</h2>
          <ul className="platform-mode-landing__list">
            <li>업종별 테넌트 목록</li>
            <li>테넌트 생성</li>
            <li>테넌트 관리자 지정</li>
            <li>Staff/User 관리</li>
            <li>업종별 템플릿 확인</li>
          </ul>

          <p className="platform-mode-landing__link-row">
            <Link
              to={
                idRaw ? `/admin/platform/industries/${encodeURIComponent(idRaw)}` : '/admin/platform/industries'
              }
              className="platform-admin-page__inline-link"
            >
              기존 플랫폼 관리 · 이 업종 상세로 이동
            </Link>
          </p>
        </div>
      ) : null}
    </main>
  )
}
