/**
 * 구독 상태 UI 문구 SSOT.
 *
 * - 모든 플랜/상태 텍스트를 한 곳에서 관리해, 정책·마케팅 문구 변경 시
 *   컴포넌트를 뒤지지 않고 이 파일 하나만 수정하면 되도록 한다.
 * - 모든 키는 `SubscriptionSnapshot.plan` / `effectiveStatus` 값과 1:1 매칭.
 */

import type { EffectiveSubscriptionStatus, SubscriptionPlan } from './policy'

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  FREE: '무제한',
  TRIAL: '체험',
  PAID: '유료',
  EXPIRED: '이용 종료',
}

export const PLAN_SHORT_DESCRIPTION: Record<SubscriptionPlan, string> = {
  FREE: '기간 제한 없이 전체 기능을 이용할 수 있습니다.',
  TRIAL: '체험 기간 동안 전체 기능을 이용할 수 있습니다.',
  PAID: '정상적으로 이용 중입니다.',
  EXPIRED: '이용 기간이 종료되어 핵심 기능이 제한되었습니다.',
}

export const STATUS_LABEL: Record<EffectiveSubscriptionStatus, string> = {
  ACTIVE: '이용 중',
  EXPIRED: '이용 종료',
}

// 정책이 꺼져 있을 때(배포 직후·관리자가 비활성화한 상태)는 서버가 모두를 FREE 로 간주한다.
// 이때 유저에게는 "현재 무료로 제공 중" 이라는 중립적인 문구로 안내한다.
export const POLICY_INACTIVE_NOTICE =
  '현재 모든 기능이 무료로 제공되고 있습니다. 유료 전환 일정은 추후 공지됩니다.'

export const EXPIRED_CTA_TITLE = '이용 기간이 종료되었습니다'
export const EXPIRED_CTA_DESCRIPTION =
  '핵심 업무 기능이 제한되었습니다. 내 정보 관리에서 상태를 확인하거나 문의·요청을 남겨 주세요.'

export const PAYMENT_PENDING_NOTICE =
  '결제 연동은 준비 중입니다. 기간 연장이나 유료 전환이 필요하시면 "문의·요청" 으로 남겨 주세요.'
