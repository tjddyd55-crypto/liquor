/**
 * 구독 정책 관리자 API — /api/admin/subscription/*
 *
 * 역할 분리:
 * - 비즈니스 로직은 server/subscription/activatePolicy.js 가 단독으로 담당.
 * - 이 파일은 HTTP 인터페이스(입력 검증 → 호출 → 응답) 만 담당한다.
 *
 * 권한:
 * - 전부 SUPER_ADMIN 전용. 미들웨어는 index.js 에서 주입받아 DI 경계를 유지한다.
 *
 * 라우팅:
 *   GET    /api/admin/subscription/policy       → 현재 플래그 + 영향 규모
 *   POST   /api/admin/subscription/activate     → 정책 ON + TRIAL 일괄 부여
 *                                                 body: { trialDays?: number, dryRun?: boolean, memo?: string }
 *   POST   /api/admin/subscription/deactivate   → 정책 OFF (타이머는 보존)
 */

import {
  activateSubscriptionPolicy,
  deactivateSubscriptionPolicy,
  getSubscriptionPolicyStatus,
} from './subscription/activatePolicy.js'
import { registerSubscriptionAdminUserEndpoints } from './subscription/adminUserEndpoints.js'

/**
 * @param {unknown} body
 * @returns {{ trialDays?: number, dryRun?: boolean, memo?: string }}
 */
function parseActivateBody(body) {
  if (body === null || typeof body !== 'object') return {}
  const src = /** @type {Record<string, unknown>} */ (body)
  const out = {}

  if (src.trialDays !== undefined) {
    const n = typeof src.trialDays === 'number' ? src.trialDays : Number(src.trialDays)
    if (Number.isFinite(n)) out.trialDays = n
  }
  if (typeof src.dryRun === 'boolean') out.dryRun = src.dryRun
  if (typeof src.memo === 'string' && src.memo.trim().length > 0) {
    out.memo = src.memo.trim().slice(0, 500)
  }
  return out
}

/**
 * 라우터에 구독 관리자 API 를 등록한다.
 *
 * @param {import('express').Router} apiRouter
 * @param {{
 *   requireAuth: import('express').RequestHandler,
 *   requireSuperAdmin: import('express').RequestHandler,
 * }} deps
 */
export function registerSubscriptionAdminApi(apiRouter, deps) {
  const { requireAuth, requireSuperAdmin } = deps

  apiRouter.get(
    '/admin/subscription/policy',
    requireAuth,
    requireSuperAdmin,
    async (_req, res) => {
      try {
        const status = await getSubscriptionPolicyStatus()
        res.json({ ok: true, status })
      } catch (error) {
        console.error('[subscription-admin] GET policy 실패:', error)
        res.status(500).json({ ok: false, error: '정책 상태 조회 실패' })
      }
    },
  )

  apiRouter.post(
    '/admin/subscription/activate',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      try {
        const body = parseActivateBody(req.body)
        const actorUserId = req.user?.id ?? null
        const result = await activateSubscriptionPolicy({
          actorUserId,
          trialDays: body.trialDays,
          dryRun: body.dryRun,
          memo: body.memo,
        })
        res.json({ ok: true, result })
      } catch (error) {
        console.error('[subscription-admin] POST activate 실패:', error)
        res.status(500).json({ ok: false, error: '정책 활성화 실패' })
      }
    },
  )

  apiRouter.post(
    '/admin/subscription/deactivate',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      try {
        const actorUserId = req.user?.id ?? null
        const result = await deactivateSubscriptionPolicy({ actorUserId })
        res.json({ ok: true, result })
      } catch (error) {
        console.error('[subscription-admin] POST deactivate 실패:', error)
        res.status(500).json({ ok: false, error: '정책 비활성화 실패' })
      }
    },
  )

  registerSubscriptionAdminUserEndpoints(apiRouter, { requireAuth, requireSuperAdmin })
}
