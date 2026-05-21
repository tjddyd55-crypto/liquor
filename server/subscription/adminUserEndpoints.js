/**
 * 관리자용 구독 유저 관리 API (PR5).
 *
 * 설계 원칙:
 *   - 저장 상태(`users.subscription_plan` / `subscription_expires_at`) 와
 *     유효 상태(`effectiveStatus`) 를 구분한다. 유효 상태는 `evaluateSubscription()` 으로
 *     런타임 계산하며 DB 에 중복 저장하지 않는다 (SSOT = policy.js).
 *   - 필터(near-expiry, expired-only 등) 는 SQL 조건을 이 파일이 캡슐화한다.
 *     UI 는 라벨과 파라미터만 알면 되고, 판정 로직은 서버가 독점한다.
 *   - 모든 변경은 단일 트랜잭션 + `subscription_change_logs` 감사 로그.
 *
 * 확장 포인트:
 *   - 필터 추가 → `buildUserListQuery()` 의 WHERE 조립만 수정.
 *   - 일괄 액션 추가 → `applyBulkAction()` 의 switch 에 case 추가.
 */

import pool from '../db.js'
import { evaluateSubscription } from './policy.js'
import {
  invalidateAppSettingsCache,
  readPolicyActive,
  readTrialDefaultDays,
  writeTrialDefaultDays,
} from './appSettings.js'

const VALID_PLANS = Object.freeze(['FREE', 'TRIAL', 'PAID', 'EXPIRED'])
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const MEMO_MAX_LEN = 500
const NEAR_EXPIRY_DEFAULT_DAYS = 7

// 역할별 구독 대상 여부는 policy 와 동일하게 유지한다.
const SUBSCRIPTION_SUBJECT_ROLES = Object.freeze(['GA_ADMIN', 'GA_STAFF', 'USER'])

// -----------------------------------------------------------------------------
// 공용 유틸
// -----------------------------------------------------------------------------

function parsePositiveInt(raw, fallback, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }
  return Math.min(Math.floor(n), max)
}

function parseNonNegativeInt(raw, fallback) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    return fallback
  }
  return Math.floor(n)
}

function normalizePlanInput(value) {
  if (typeof value !== 'string') {
    return null
  }
  const upper = value.trim().toUpperCase()
  return VALID_PLANS.includes(upper) ? upper : null
}

function normalizeMemo(value) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.slice(0, MEMO_MAX_LEN)
}

function toIsoOrNull(value) {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function addDays(base, days) {
  const t = base instanceof Date ? base.getTime() : new Date(base).getTime()
  if (!Number.isFinite(t)) {
    throw new Error('addDays: 유효하지 않은 기준 시각')
  }
  const n = Math.floor(Number(days))
  if (!Number.isFinite(n)) {
    throw new Error('addDays: 유효하지 않은 일수')
  }
  return new Date(t + n * 24 * 60 * 60 * 1000)
}

// -----------------------------------------------------------------------------
// 유저 목록 조회
// -----------------------------------------------------------------------------

/**
 * 쿼리 파라미터 → SQL 조립.
 *
 *   filters:
 *     gaId          : 숫자 (특정 GA)
 *     plan          : FREE|TRIAL|PAID|EXPIRED
 *     status        : ACTIVE|EXPIRED (effectiveStatus 기준; 런타임 계산 대신 저장값+기간 조건으로 근사)
 *     nearExpiry    : boolean; expires_at 이 지금부터 N일 이내
 *     nearDays      : 숫자; nearExpiry 의 N (기본 7)
 *     expiredOnly   : boolean; plan='EXPIRED' OR (plan IN ('TRIAL','PAID') AND expires_at <= NOW())
 *     keyword       : 이름/아이디 부분 일치
 *
 *   page, pageSize
 */
function buildUserListQuery(filters) {
  const where = []
  const params = []

  // 구독 대상 역할만 본다 (SUPER_ADMIN/AUDIT_LOG_READER 등 관리자는 제외)
  where.push(
    `u.role = ANY($${params.push(SUBSCRIPTION_SUBJECT_ROLES.slice())}::text[])`,
  )

  if (filters.gaId != null) {
    where.push(`u.ga_id = $${params.push(filters.gaId)}`)
  }
  if (filters.plan) {
    where.push(`u.subscription_plan = $${params.push(filters.plan)}`)
  }
  if (filters.expiredOnly === true) {
    // "운영상 만료" = 강제 EXPIRED 또는 TRIAL/PAID 가 만료된 것
    where.push(
      `(u.subscription_plan = 'EXPIRED' OR (u.subscription_plan IN ('TRIAL','PAID') AND u.subscription_expires_at <= NOW()))`,
    )
  } else if (filters.status === 'EXPIRED') {
    // expiredOnly 와 동일한 판정
    where.push(
      `(u.subscription_plan = 'EXPIRED' OR (u.subscription_plan IN ('TRIAL','PAID') AND u.subscription_expires_at <= NOW()))`,
    )
  } else if (filters.status === 'ACTIVE') {
    where.push(
      `(u.subscription_plan = 'FREE' OR (u.subscription_plan IN ('TRIAL','PAID') AND u.subscription_expires_at > NOW()))`,
    )
  }
  if (filters.nearExpiry === true) {
    const days = parsePositiveInt(filters.nearDays, NEAR_EXPIRY_DEFAULT_DAYS, 180)
    where.push(
      `u.subscription_plan IN ('TRIAL','PAID')
        AND u.subscription_expires_at IS NOT NULL
        AND u.subscription_expires_at > NOW()
        AND u.subscription_expires_at <= NOW() + ($${params.push(days)}::int * INTERVAL '1 day')`,
    )
  }
  if (filters.keyword) {
    const pattern = `%${String(filters.keyword).replace(/[\\%_]/g, '\\$&')}%`
    where.push(
      `(u.display_name ILIKE $${params.push(pattern)} OR u.username ILIKE $${params.push(pattern)})`,
    )
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  return { whereSql, params }
}

async function selectUsersPage(filters, page, pageSize) {
  const { whereSql, params } = buildUserListQuery(filters)

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
    params,
  )
  const total = countResult.rows[0]?.total ?? 0

  const limit = pageSize
  const offset = (page - 1) * pageSize
  const limitParamIdx = params.push(limit)
  const offsetParamIdx = params.push(offset)

  const listResult = await pool.query(
    `
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.role,
      u.status,
      u.ga_id,
      ga.name AS ga_name,
      u.subscription_plan,
      u.subscription_started_at,
      u.subscription_expires_at
    FROM users u
    LEFT JOIN ga_companies ga ON ga.id = u.ga_id
    ${whereSql}
    ORDER BY u.subscription_expires_at NULLS LAST, u.created_at DESC, u.id
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `,
    params,
  )

  return { rows: listResult.rows, total }
}

function shapeUserRow(row, policyActive) {
  const evalResult = evaluateSubscription({
    role: row.role,
    plan: row.subscription_plan,
    expiresAt: row.subscription_expires_at,
    startedAt: row.subscription_started_at,
    policyActive,
  })
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    ga_id: row.ga_id,
    ga_name: row.ga_name ?? null,
    plan: row.subscription_plan,
    started_at: toIsoOrNull(row.subscription_started_at),
    expires_at: toIsoOrNull(row.subscription_expires_at),
    effective_status: evalResult.effectiveStatus,
    remaining_days: evalResult.remainingDays,
    reason: evalResult.reason,
  }
}

// -----------------------------------------------------------------------------
// 변경 로직 (단건 · 일괄)
// -----------------------------------------------------------------------------

/**
 * 하나의 유저에 대한 변경을 트랜잭션 안에서 적용한다.
 * 호출자가 BEGIN/COMMIT 을 책임진다 (단건/일괄 공용 사용을 위함).
 *
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 * @param {{ plan?: string | null, expiresAt?: Date | string | null, startedAt?: Date | string | null, memo?: string | null }} patch
 * @param {{ changedByUserId: string, reason: string }} meta
 */
async function applySingleUpdate(client, userId, patch, meta) {
  const existing = await client.query(
    `SELECT id, role, subscription_plan, subscription_started_at, subscription_expires_at
     FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  )
  const before = existing.rows[0]
  if (!before) {
    throw Object.assign(new Error(`유저를 찾을 수 없습니다 (id=${userId})`), { statusCode: 404 })
  }
  if (!SUBSCRIPTION_SUBJECT_ROLES.includes(before.role)) {
    throw Object.assign(
      new Error(`구독 관리 대상이 아닌 역할(${before.role}) 의 유저입니다.`),
      { statusCode: 400 },
    )
  }

  const nextPlan = patch.plan != null ? normalizePlanInput(patch.plan) : before.subscription_plan
  if (!nextPlan) {
    throw Object.assign(new Error('plan 값이 올바르지 않습니다.'), { statusCode: 400 })
  }

  // 기간 필드는 plan 에 따라 의미가 달라진다.
  //   - FREE/EXPIRED: 기간 null 로 정리 (깔끔한 상태 유지)
  //   - TRIAL/PAID : 만료일 필수 (없으면 기존 유지 / 단건 변경 호출자가 보장)
  let nextExpiresAt
  let nextStartedAt
  if (nextPlan === 'FREE') {
    nextExpiresAt = null
    nextStartedAt = null
  } else if (nextPlan === 'EXPIRED') {
    nextExpiresAt = patch.expiresAt !== undefined ? toDateOrNull(patch.expiresAt) : before.subscription_expires_at
    nextStartedAt = before.subscription_started_at
  } else {
    nextExpiresAt =
      patch.expiresAt !== undefined ? toDateOrNull(patch.expiresAt) : before.subscription_expires_at
    nextStartedAt =
      patch.startedAt !== undefined
        ? toDateOrNull(patch.startedAt)
        : before.subscription_started_at ?? new Date()
  }

  await client.query(
    `UPDATE users
       SET subscription_plan = $1,
           subscription_started_at = $2,
           subscription_expires_at = $3,
           updated_at = NOW()
     WHERE id = $4`,
    [nextPlan, nextStartedAt, nextExpiresAt, userId],
  )

  await client.query(
    `INSERT INTO subscription_change_logs
       (user_id, changed_by_user_id, prev_plan, next_plan, prev_expires_at, next_expires_at, reason, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      meta.changedByUserId ?? null,
      before.subscription_plan,
      nextPlan,
      before.subscription_expires_at,
      nextExpiresAt,
      meta.reason,
      normalizeMemo(patch.memo),
    ],
  )
}

function toDateOrNull(value) {
  if (value == null) {
    return null
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 일괄 작업의 핵심 — 각 userId 에 대해 action 을 `applySingleUpdate` 로 환원해 실행한다.
 */
async function applyBulkAction(client, userIds, action, meta) {
  const trialDefaultDays = await readTrialDefaultDays()

  for (const userId of userIds) {
    const { rows } = await client.query(
      `SELECT subscription_plan, subscription_expires_at, subscription_started_at, role
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    )
    const current = rows[0]
    if (!current || !SUBSCRIPTION_SUBJECT_ROLES.includes(current.role)) {
      continue
    }

    const patch = resolveBulkPatch(action, current, trialDefaultDays)
    if (!patch) {
      continue
    }

    await applySingleUpdate(client, userId, patch, {
      changedByUserId: meta.changedByUserId,
      reason: 'admin-bulk',
    })
  }
}

function resolveBulkPatch(action, current, trialDefaultDays) {
  switch (action.kind) {
    case 'SET_PLAN': {
      const plan = normalizePlanInput(action.plan)
      if (!plan) {
        throw Object.assign(new Error('SET_PLAN: 잘못된 plan'), { statusCode: 400 })
      }
      if (plan === 'TRIAL' || plan === 'PAID') {
        // 일괄 SET_PLAN 에 기간을 별도로 주지 않았으면 trial 기본값/기존값 로직 적용
        const days = parsePositiveInt(action.days, trialDefaultDays, 365)
        const base = new Date()
        return {
          plan,
          startedAt: base,
          expiresAt: addDays(base, days),
          memo: action.memo,
        }
      }
      return { plan, expiresAt: null, startedAt: null, memo: action.memo }
    }
    case 'EXTEND_DAYS': {
      const days = parsePositiveInt(action.days, 0, 365)
      if (days <= 0) {
        throw Object.assign(new Error('EXTEND_DAYS: days 는 1 이상'), { statusCode: 400 })
      }
      if (!['TRIAL', 'PAID'].includes(current.subscription_plan)) {
        // FREE/EXPIRED 는 기간 개념 부재 → 스킵
        return null
      }
      const base =
        current.subscription_expires_at && new Date(current.subscription_expires_at) > new Date()
          ? new Date(current.subscription_expires_at)
          : new Date()
      return {
        plan: current.subscription_plan,
        expiresAt: addDays(base, days),
        memo: action.memo,
      }
    }
    case 'SET_EXPIRY': {
      const expiresAt = toDateOrNull(action.expiresAt)
      if (!expiresAt) {
        throw Object.assign(new Error('SET_EXPIRY: expiresAt 형식 오류'), { statusCode: 400 })
      }
      if (!['TRIAL', 'PAID'].includes(current.subscription_plan)) {
        return null
      }
      return {
        plan: current.subscription_plan,
        expiresAt,
        memo: action.memo,
      }
    }
    default:
      throw Object.assign(new Error(`알 수 없는 bulk action: ${action.kind}`), { statusCode: 400 })
  }
}

// -----------------------------------------------------------------------------
// 엔드포인트 등록
// -----------------------------------------------------------------------------

/**
 * @param {import('express').IRouter} apiRouter
 * @param {{ requireAuth: Function, requireSuperAdmin: Function }} deps
 */
export function registerSubscriptionAdminUserEndpoints(apiRouter, deps) {
  const { requireAuth, requireSuperAdmin } = deps

  apiRouter.get(
    '/admin/subscriptions/users',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      try {
        const filters = {
          gaId: req.query.ga_id ? parsePositiveInt(req.query.ga_id, null) : null,
          plan: normalizePlanInput(req.query.plan),
          status:
            req.query.status === 'ACTIVE' || req.query.status === 'EXPIRED' ? req.query.status : null,
          nearExpiry: req.query.near_expiry === 'true',
          nearDays: req.query.near_days ? parsePositiveInt(req.query.near_days, 7, 180) : 7,
          expiredOnly: req.query.expired_only === 'true',
          keyword: typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '',
        }
        const page = parsePositiveInt(req.query.page, 1, 10_000)
        const pageSize = parsePositiveInt(req.query.page_size, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

        const [policyActive, { rows, total }] = await Promise.all([
          readPolicyActive(),
          selectUsersPage(filters, page, pageSize),
        ])

        res.json({
          ok: true,
          policy_active: policyActive,
          page,
          page_size: pageSize,
          total,
          users: rows.map((row) => shapeUserRow(row, policyActive)),
        })
      } catch (error) {
        console.error('[admin/subscriptions/users] 조회 실패:', error)
        res.status(500).json({ ok: false, error: '유저 목록을 불러오지 못했습니다.' })
      }
    },
  )

  apiRouter.patch(
    '/admin/subscriptions/users/:userId',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      const userId = String(req.params.userId || '').trim()
      if (!userId) {
        res.status(400).json({ ok: false, error: 'userId 누락' })
        return
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await applySingleUpdate(
          client,
          userId,
          {
            plan: req.body?.plan,
            expiresAt: req.body?.expires_at,
            startedAt: req.body?.started_at,
            memo: req.body?.memo,
          },
          { changedByUserId: req.user?.id ?? null, reason: 'admin-manual' },
        )
        await client.query('COMMIT')
        invalidateAppSettingsCache()
        res.json({ ok: true })
      } catch (error) {
        await client.query('ROLLBACK')
        const statusCode = error?.statusCode ?? 500
        console.error('[admin/subscriptions/users PATCH] 실패:', error)
        res.status(statusCode).json({ ok: false, error: error?.message ?? '변경 실패' })
      } finally {
        client.release()
      }
    },
  )

  apiRouter.post(
    '/admin/subscriptions/users/bulk',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      const userIds = Array.isArray(req.body?.user_ids)
        ? req.body.user_ids.filter((v) => typeof v === 'string' && v.trim())
        : []
      const action = req.body?.action
      if (userIds.length === 0 || !action || typeof action !== 'object') {
        res.status(400).json({ ok: false, error: 'user_ids 또는 action 누락' })
        return
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await applyBulkAction(client, userIds, action, {
          changedByUserId: req.user?.id ?? null,
        })
        await client.query('COMMIT')
        invalidateAppSettingsCache()
        res.json({ ok: true, affected: userIds.length })
      } catch (error) {
        await client.query('ROLLBACK')
        const statusCode = error?.statusCode ?? 500
        console.error('[admin/subscriptions/users/bulk] 실패:', error)
        res.status(statusCode).json({ ok: false, error: error?.message ?? '일괄 변경 실패' })
      } finally {
        client.release()
      }
    },
  )

  apiRouter.get(
    '/admin/settings/subscription',
    requireAuth,
    requireSuperAdmin,
    async (_req, res) => {
      try {
        const [policyActive, trialDefaultDays] = await Promise.all([
          readPolicyActive(),
          readTrialDefaultDays(),
        ])
        res.json({
          ok: true,
          policy_active: policyActive,
          trial_default_days: trialDefaultDays,
        })
      } catch (error) {
        console.error('[admin/settings/subscription GET] 실패:', error)
        res.status(500).json({ ok: false, error: '설정을 불러오지 못했습니다.' })
      }
    },
  )

  apiRouter.patch(
    '/admin/settings/subscription',
    requireAuth,
    requireSuperAdmin,
    async (req, res) => {
      try {
        const trialDefaultDaysRaw = req.body?.trial_default_days
        if (trialDefaultDaysRaw != null) {
          const saved = await writeTrialDefaultDays(trialDefaultDaysRaw, req.user?.id ?? null)
          res.json({ ok: true, trial_default_days: saved })
          return
        }
        res.status(400).json({ ok: false, error: '변경할 설정 키가 없습니다.' })
      } catch (error) {
        console.error('[admin/settings/subscription PATCH] 실패:', error)
        res.status(400).json({ ok: false, error: error?.message ?? '설정 변경 실패' })
      }
    },
  )
}
