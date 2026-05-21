import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { EXPIRED_CTA_DESCRIPTION, EXPIRED_CTA_TITLE } from '../copy'

/**
 * EXPIRED 유저에게 앱 최상단에 상시 노출되는 안내 배너.
 *
 * 책임:
 *   - 현재 이용이 종료되었음을 전역적으로 상기시킨다.
 *   - "내 정보 관리" / "문의·요청" 으로 자연스러운 이동 경로를 제공한다.
 *
 * 비렌더 조건:
 *   - 로그인 전(user 없음) — 앱이 비인증 경로에서 쓸 일이 없다.
 *   - 정책 비활성 또는 FREE/TRIAL-active/PAID-active (effectiveStatus === 'ACTIVE').
 *   - `/profile` 에 있을 때 — `SubscriptionStatusCard` 와 중복 노출을 피한다.
 *
 * 이 컴포넌트는 레이아웃이 아니라 "얇은 정책 컨테이너" 이다.
 * 스타일은 CSS 변수로만 묶어 PC/모바일 공용으로 동작한다.
 */
export function ExpiredBanner() {
  const { user } = useAuth()
  const location = useLocation()
  const effectiveStatus = user?.subscription?.effectiveStatus

  if (effectiveStatus !== 'EXPIRED') {
    return null
  }
  if (location.pathname === '/profile' || location.pathname.startsWith('/profile/')) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="expired-banner"
      style={{
        background: 'var(--danger-bg, #fff4f4)',
        borderBottom: '1px solid var(--danger, #d92d20)',
        padding: '10px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <strong style={{ fontSize: 14, color: 'var(--danger, #d92d20)' }}>
          {EXPIRED_CTA_TITLE}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {EXPIRED_CTA_DESCRIPTION}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Link
          to="/profile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--primary)',
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          내 정보 관리
        </Link>
        <Link
          to="/feature-request"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            background: 'var(--bg-elevated)',
          }}
        >
          문의 · 요청
        </Link>
      </div>
    </div>
  )
}

export default ExpiredBanner
