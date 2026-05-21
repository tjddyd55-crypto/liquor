/**
 * 구독 정책 가드 미들웨어 — `requireAuth` 의 마지막 단계(최종 `next()` 직전) 에 체이닝된다.
 *
 * 설계 의도:
 * 1) "인증 + 구독 정책" 을 단일 진입점(requireAuth) 에서 강제한다. 각 엔드포인트마다
 *    `[requireAuth, requireActiveSubscription]` 을 붙이는 방식은 누락 위험이 크다.
 *    → `requireAuth` 내부 끝에서 호출 → 모든 API 에 자동 적용.
 *
 * 2) 정책 OFF(`policy_active=false`) 상태에서는 항상 통과 — 배포 시점에 타이머가 즉시
 *    돌지 않고, 관리자가 활성화 스위치를 켠 순간부터만 EXPIRED 판정이 유효해진다.
 *
 * 3) 서버에서도 예외 허용 경로를 가진다. EXPIRED 유저는 "로그인은 되지만 내 정보 관리 / 문의 /
 *    구독 조회 / 결제 입구" 까지만 허용. 화이트리스트는 `expiredAllowlist.js` SSOT 참조.
 *
 * 4) 에러 발생 시 보수적으로 통과(open-fail). 이 결정은 "정책 판정 장애로 서비스 전체가 죽는 것"
 *    과 "일시적으로 EXPIRED 유저가 업무 API 를 지나는 것" 의 트레이드오프에서 전자가 더 치명적이라는
 *    판단. 모니터링 지표에 `[requireActiveSubscription] ...` 로그를 연결해 둔다.
 *
 * 향후 확장 지점:
 * - 캐싱: 현재는 매 요청 users 1-row SELECT. 성능 문제가 나면 userId 단위 LRU(30s TTL) 추가.
 *   변경 시점에 `invalidateSubscriptionCache(userId)` 를 활성화/비활성화/개별 PATCH 핸들러에서 호출.
 * - 이벤트 훅: 차단 시 감사 로그 남기려면 `onBlocked(userId, path)` 콜백만 추가.
 */

import pool from '../db.js'
import { buildSubscriptionResponse } from './applyToResponseUser.js'
import { readPolicyActive } from './appSettings.js'
import { isSubscriptionSubjectRole } from './policy.js'
import { isAllowedForExpiredApi } from './expiredAllowlist.js'

/**
 * @param {import('express').Request & { user?: { id: string; role: string } }} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function enforceActiveSubscription(req, res, next) {
  try {
    if (!req.user) {
      next()
      return
    }

    if (!isSubscriptionSubjectRole(req.user.role)) {
      next()
      return
    }

    if (isAllowedForExpiredApi(req.path)) {
      next()
      return
    }

    const policyActive = await readPolicyActive()
    if (!policyActive) {
      next()
      return
    }

    const userId = String(req.user.id ?? '').trim()
    if (!userId) {
      next()
      return
    }

    const { rows } = await pool.query(
      `SELECT role, subscription_plan, subscription_started_at, subscription_expires_at
         FROM users
         WHERE id = $1 AND is_deleted = false
         LIMIT 1`,
      [userId],
    )
    const row = rows[0]
    if (!row) {
      next()
      return
    }

    const subscription = buildSubscriptionResponse(row, { policyActive: true })
    if (subscription.effective_status === 'EXPIRED') {
      res.status(403).json({
        error: 'SUBSCRIPTION_EXPIRED',
        message: '이용 기간이 종료되었습니다. 내 정보 관리에서 구독 갱신 또는 문의를 진행해 주세요.',
        subscription,
      })
      return
    }

    next()
  } catch (error) {
    console.error('[requireActiveSubscription] 정책 판정 실패(open-fail):', error)
    next()
  }
}
