/**
 * 구독 조회/결제 입구 API — 인증된 유저 본인용.
 *
 * 엔드포인트:
 * - GET  /api/subscription/me        → 자기 구독 스냅샷(서버 계산 결과 포함)
 * - POST /api/subscription/checkout  → 501 NOT_IMPLEMENTED (결제 연동 준비 중)
 *
 * 설계 원칙:
 * 1) `requireAuth` 만 붙이고, 구독 가드는 `requireAuth` 내부에 이미 체이닝되어 있으므로
 *    여기서 별도 가드를 중복 장착하지 않는다. 그리고 이 두 경로는 `expiredAllowlist` 에 포함되어
 *    EXPIRED 유저도 자기 상태 조회·결제 진입이 가능해야 한다.
 *
 * 2) `/me` 는 JWT 에 의존하지 않고 DB 를 한 번 더 읽는다 — 관리자가 방금 plan 을 바꿨을 때도
 *    유저가 즉시 정확한 값을 볼 수 있어야 한다.
 *
 * 3) `/checkout` 은 향후 PG 연동의 단일 진입점. 지금은 501 로만 내려주지만, 프론트가 이 경로를
 *    호출하도록 이미 설계해 두면 연동 추가 시 프론트는 변경하지 않아도 된다.
 *
 * 향후 확장 지점:
 * - PG 연동 시: plan·기간 파라미터 검증 + 주문 생성 + redirectUrl 반환으로 교체.
 * - 영수증/이력: `/api/subscription/history` 추가(감사 테이블 `subscription_change_logs` 활용).
 */

import pool from '../db.js'
import { buildSubscriptionResponseForUser } from './applyToResponseUser.js'

/**
 * @param {import('express').Router} apiRouter
 * @param {{ requireAuth: import('express').RequestHandler }} deps
 */
export function registerSubscriptionEndpoints(apiRouter, deps) {
  const { requireAuth } = deps

  apiRouter.get('/subscription/me', requireAuth, async (req, res) => {
    try {
      const userId = String(req.user?.id ?? '').trim()
      if (!userId) {
        res.status(401).json({ error: 'UNAUTHORIZED' })
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
        res.status(404).json({ error: 'USER_NOT_FOUND' })
        return
      }

      const subscription = await buildSubscriptionResponseForUser({
        role: String(row.role ?? ''),
        subscription_plan: row.subscription_plan ?? null,
        subscription_started_at: row.subscription_started_at ?? null,
        subscription_expires_at: row.subscription_expires_at ?? null,
      })
      res.json({ subscription })
    } catch (error) {
      console.error('[subscription] GET /me 실패:', error)
      res.status(500).json({ error: 'INTERNAL' })
    }
  })

  apiRouter.post('/subscription/checkout', requireAuth, async (_req, res) => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: '결제 연동은 준비 중입니다. 문의 요청을 이용해 주세요.',
    })
  })
}
