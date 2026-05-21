import { Link } from 'react-router-dom'
import type { SubscriptionSnapshot } from '../policy'
import {
  PAYMENT_PENDING_NOTICE,
  PLAN_LABEL,
  PLAN_SHORT_DESCRIPTION,
  POLICY_INACTIVE_NOTICE,
  STATUS_LABEL,
} from '../copy'

/**
 * 내 정보 관리 상단의 구독 상태 카드.
 *
 * 역할:
 *   - 유저가 자신의 현재 플랜/상태/남은 기간/만료일을 한 눈에 파악.
 *   - EXPIRED 상태에서는 다음 액션(문의 남기기)으로 자연스럽게 유도.
 *   - 결제 연동 전 단계에서는 "문의로 유도" 를 기본 CTA 로 사용한다.
 *
 * 설계:
 *   - 서버 응답 snapshot 만으로 렌더링(pure, side-effect 없음).
 *   - 모든 텍스트는 `copy.ts` 를 통해 주입 → 문구 변경이 이 컴포넌트를 건드리지 않는다.
 *   - 테일윈드 유틸 + CSS 변수(테마)만 사용해 PC/모바일 동일하게 동작.
 */
export interface SubscriptionStatusCardProps {
  subscription: SubscriptionSnapshot | null
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatRemaining(remaining: number | null): string {
  if (remaining == null) {
    return '—'
  }
  if (remaining <= 0) {
    return '만료됨'
  }
  return `${remaining}일 남음`
}

export function SubscriptionStatusCard({ subscription }: SubscriptionStatusCardProps) {
  // 서버가 snapshot 을 내려주지 못한 경우(로그아웃 직후·초기 로드 실패 등) 은
  // 카드 자체를 숨겨 노이즈를 만들지 않는다. 상위 페이지가 다른 컨텐츠를 이미 가지고 있다.
  if (!subscription) {
    return null
  }

  const { plan, effectiveStatus, remainingDays, expiresAt, policyActive, reason } = subscription
  const isExpired = effectiveStatus === 'EXPIRED'
  const planLabel = PLAN_LABEL[plan]
  const planDescription = PLAN_SHORT_DESCRIPTION[plan]
  const statusLabel = STATUS_LABEL[effectiveStatus]

  // 정책이 꺼져 있으면 모든 유저가 reason='policy-inactive' 로 들어온다 —
  // 이때는 기간/만료 같은 디테일을 보여주면 오히려 혼란스러우므로 요약형으로만 표기.
  const isPolicyInactive = !policyActive || reason === 'policy-inactive'

  return (
    <section
      className="subscription-card"
      aria-label="구독 상태"
      style={{
        border: `1px solid var(--border-default)`,
        background: isExpired ? 'var(--danger-bg, #fff4f4)' : 'var(--bg-elevated)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2
          className="profile-page__section-title"
          style={{ margin: 0, fontSize: 16, fontWeight: 700 }}
        >
          이용 상태
        </h2>
        <span
          style={{
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            background: isExpired ? 'var(--danger)' : 'var(--primary)',
            color: 'white',
            fontWeight: 600,
          }}
        >
          {planLabel} · {statusLabel}
        </span>
      </header>

      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
        {isPolicyInactive ? POLICY_INACTIVE_NOTICE : planDescription}
      </p>

      {/*
        정책이 활성화된 상태에서 기간이 있는 플랜(TRIAL/PAID)일 때만
        상세 메트릭을 노출한다. FREE 와 policy-inactive 는 기간 개념이 없다.
      */}
      {!isPolicyInactive && (plan === 'TRIAL' || plan === 'PAID' || plan === 'EXPIRED') ? (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            columnGap: 12,
            rowGap: 4,
            margin: 0,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <dt>만료일</dt>
          <dd style={{ margin: 0, color: 'var(--text-primary)' }}>{formatDate(expiresAt)}</dd>
          <dt>남은 기간</dt>
          <dd style={{ margin: 0, color: 'var(--text-primary)' }}>
            {formatRemaining(remainingDays)}
          </dd>
        </dl>
      ) : null}

      {/*
        결제 연동 전까지는 "문의로 유도" 를 유일한 CTA 로 사용한다.
        EXPIRED 유저도 `/feature-request` 는 접근 허용(expiredAllowlist) 이므로 안전.
      */}
      {isExpired ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Link
            to="/feature-request"
            className="button button--primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 12px',
              borderRadius: 8,
              background: 'var(--primary)',
              color: 'white',
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            문의 · 요청 남기기
          </Link>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
            {PAYMENT_PENDING_NOTICE}
          </span>
        </div>
      ) : null}
    </section>
  )
}

export default SubscriptionStatusCard
