import { Link } from 'react-router-dom'

import { FormButton } from '../../../../components/form'
import type { PlatformLandingDecision } from '../../hooks/usePlatformLandingAccess'

type Props = {
  decision: PlatformLandingDecision
  onRetry: () => void
}

/**
 * Industry/Tenant landing 전용 — 로딩·에러·거부 UI(redirect 없음).
 */
export default function PlatformLandingAccessFeedback(props: Props) {
  if (props.decision === 'allowed') {
    return null
  }

  if (props.decision === 'loading') {
    return (
      <div
        className="platform-admin-page__panel platform-mode-landing platform-mode-landing--gate"
        role="status"
        aria-live="polite"
      >
        <p className="platform-mode-landing__gate-message">권한 정보를 불러오는 중입니다.</p>
      </div>
    )
  }

  if (props.decision === 'error') {
    return (
      <div
        className="platform-admin-page__panel platform-admin-page__panel--error platform-mode-landing platform-mode-landing--gate"
        role="alert"
      >
        <p className="platform-mode-landing__gate-message">권한 정보를 불러오지 못했습니다.</p>
        <div className="platform-mode-landing__gate-actions">
          <FormButton htmlType="button" variant="secondary" onClick={() => void props.onRetry()}>
            다시 시도
          </FormButton>
        </div>
      </div>
    )
  }

  return (
    <div
      className="platform-admin-page__panel platform-admin-page__panel--warn platform-mode-landing platform-mode-landing--gate"
      role="region"
      aria-label="접근 제한"
    >
      <p className="platform-mode-landing__gate-title">접근 권한이 없습니다.</p>
      <p className="platform-mode-landing__gate-detail">
        이 모드에 접근할 수 있는 멤버십이 없거나, 현재 URL의 스코프가 내 권한 범위에 없습니다.
      </p>
      <p className="platform-mode-landing__link-row">
        <Link to="/admin/platform" className="platform-admin-page__inline-link">
          플랫폼 관리로 돌아가기
        </Link>
      </p>
    </div>
  )
}
