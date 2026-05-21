/**
 * 구독 정책 활성화/비활성화 — 트랜잭션 단위 상태 전환 SSOT
 *
 * 설계 원칙:
 * 1) "배포 ≠ 활성화" — 정책 활성화는 관리자가 명시적으로 수행한다.
 *    활성화 "순간" = TRIAL 타이머 시작 시점. 배포 시각이 아니다.
 * 2) 단일 트랜잭션으로 (a) 대상 유저 잠금 → (b) TRIAL 전환 → (c) 감사 로그 → (d) 플래그 토글.
 *    중간에 실패하면 전부 롤백되어 half-activated 상태가 존재하지 않는다.
 * 3) 멱등성: 이미 TRIAL/PAID/EXPIRED 로 바뀌었거나 started_at 이 채워진 유저는 대상에서 제외.
 *    두 번째 활성화 호출이 기존 타이머를 절대 덮어쓰지 않는다.
 * 4) 비활성화는 비파괴적 — 플래그만 false 로 되돌리고 유저 타이머는 보존한다.
 *    재활성화 시 이미 발급된 TRIAL 은 남은 기간 그대로 이어진다.
 * 5) `dryRun=true` 는 READ-ONLY. 실제 변경 없이 영향 받을 유저 수만 센다.
 *
 * 향후 확장 지점:
 * - GA 단위 활성화가 필요해지면 input 에 `gaId` 를 받아 WHERE 절에 추가.
 * - 역할별 상이한 trial 일수가 필요해지면 `perRoleTrialDays` 맵을 받아 분기.
 */

import pool from '../db.js'
import { SUBSCRIPTION_SUBJECT_ROLES } from './policy.js'
import {
  invalidateAppSettingsCache,
  readTrialDefaultDays,
} from './appSettings.js'

/** @typedef {'policy-activation' | 'policy-deactivation' | 'manual'} ChangeReason */

/**
 * @typedef {Object} ActivationInput
 * @property {string | null} actorUserId            변경을 수행한 관리자 user id (감사 로그용)
 * @property {number | undefined} [trialDays]       명시적 지정 시 이 값, 아니면 app_settings 기본값
 * @property {boolean | undefined} [dryRun]         true 면 아무 것도 바꾸지 않고 대상 수만 반환
 * @property {string | undefined} [memo]            감사 로그 memo
 */

/**
 * @typedef {Object} ActivationResult
 * @property {boolean} dryRun
 * @property {boolean} alreadyActive              이번 호출 전에 이미 policy_active=true 였는지
 * @property {number}  trialDays                  실제 적용된 trial 일수
 * @property {number}  eligibleCount              전환 대상으로 잡힌 유저 수 (변경 전 기준)
 * @property {number}  convertedCount             실제로 TRIAL 로 바뀐 유저 수 (dryRun 이면 0)
 * @property {boolean} policyActive               종료 시점 플래그 값
 */

const TRIAL_DAYS_MIN = 1
const TRIAL_DAYS_MAX = 365

/**
 * trialDays 를 안전 범위로 클램프. 유효하지 않으면 null 반환 (호출자가 기본값 사용 판단).
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
function normalizeTrialDays(raw) {
  if (raw === undefined || raw === null) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  const floored = Math.floor(n)
  if (floored < TRIAL_DAYS_MIN || floored > TRIAL_DAYS_MAX) return null
  return floored
}

/**
 * 역할 목록을 $1,$2,... 플레이스홀더 문자열로 변환.
 * 예: (['GA_ADMIN','GA_STAFF','USER'], 2) → { placeholders: '$2,$3,$4', values: [...] }
 *
 * @param {ReadonlyArray<string>} roles
 * @param {number} startIndex   1-based 첫 번째 파라미터 번호
 * @returns {{ placeholders: string, values: string[] }}
 */
function buildRolePlaceholders(roles, startIndex) {
  const placeholders = roles.map((_, i) => `$${startIndex + i}`).join(',')
  return { placeholders, values: [...roles] }
}

/**
 * 현재 policy_active 값을 row-level lock 으로 읽는다 (트랜잭션 내부에서만 사용).
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<boolean>}
 */
async function readPolicyActiveForUpdate(client) {
  const { rows } = await client.query(
    `SELECT value_json
     FROM app_settings
     WHERE key = 'subscription.policy_active'
     FOR UPDATE`,
  )
  return rows[0]?.value_json === true
}

/**
 * 정책 활성화. FREE 상태의 구독 주체 유저를 TRIAL 로 일괄 전환하면서
 * started_at = NOW(), expires_at = NOW() + trialDays 로 타이머를 시작한다.
 *
 * @param {ActivationInput} input
 * @returns {Promise<ActivationResult>}
 */
export async function activateSubscriptionPolicy(input) {
  const dryRun = input.dryRun === true
  const memo = typeof input.memo === 'string' ? input.memo : null
  const actorUserId =
    typeof input.actorUserId === 'string' && input.actorUserId.length > 0
      ? input.actorUserId
      : null

  const explicitDays = normalizeTrialDays(input.trialDays)
  const trialDays = explicitDays ?? (await readTrialDefaultDays())

  const { placeholders, values: roleValues } = buildRolePlaceholders(
    SUBSCRIPTION_SUBJECT_ROLES,
    1,
  )

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const alreadyActive = await readPolicyActiveForUpdate(client)

    const eligibleResult = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM users
       WHERE role IN (${placeholders})
         AND subscription_plan = 'FREE'
         AND subscription_started_at IS NULL
         AND subscription_expires_at IS NULL`,
      roleValues,
    )
    const eligibleCount = eligibleResult.rows[0]?.n ?? 0

    if (dryRun) {
      await client.query('ROLLBACK')
      return {
        dryRun: true,
        alreadyActive,
        trialDays,
        eligibleCount,
        convertedCount: 0,
        policyActive: alreadyActive,
      }
    }

    // 1) 대상 유저 잠금 + TRIAL 전환 + 감사 로그 (CTE 한 방)
    const updateResult = await client.query(
      `WITH eligible AS (
         SELECT id,
                subscription_plan AS prev_plan,
                subscription_expires_at AS prev_expires_at
         FROM users
         WHERE role IN (${placeholders})
           AND subscription_plan = 'FREE'
           AND subscription_started_at IS NULL
           AND subscription_expires_at IS NULL
         FOR UPDATE
       ),
       updated AS (
         UPDATE users u
         SET subscription_plan = 'TRIAL',
             subscription_started_at = NOW(),
             subscription_expires_at = NOW() + MAKE_INTERVAL(days => $${roleValues.length + 1}::int)
         FROM eligible e
         WHERE u.id = e.id
         RETURNING u.id,
                   e.prev_plan,
                   e.prev_expires_at,
                   u.subscription_plan AS next_plan,
                   u.subscription_expires_at AS next_expires_at
       ),
       logged AS (
         INSERT INTO subscription_change_logs (
           user_id, changed_by_user_id,
           prev_plan, next_plan,
           prev_expires_at, next_expires_at,
           reason, memo
         )
         SELECT id, $${roleValues.length + 2},
                prev_plan, next_plan,
                prev_expires_at, next_expires_at,
                'policy-activation', $${roleValues.length + 3}
         FROM updated
         RETURNING user_id
       )
       SELECT COUNT(*)::int AS n FROM logged`,
      [...roleValues, trialDays, actorUserId, memo],
    )
    const convertedCount = updateResult.rows[0]?.n ?? 0

    // 2) 플래그 토글 (이미 true 여도 updated_at/updated_by 갱신 의미 있음)
    await client.query(
      `UPDATE app_settings
       SET value_json = CAST('true' AS jsonb),
           updated_at = NOW(),
           updated_by_user_id = $1
       WHERE key = 'subscription.policy_active'`,
      [actorUserId],
    )

    await client.query('COMMIT')

    // 3) 캐시 무효화 — 다음 요청부터 새 값 반영
    invalidateAppSettingsCache('subscription.policy_active')

    return {
      dryRun: false,
      alreadyActive,
      trialDays,
      eligibleCount,
      convertedCount,
      policyActive: true,
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('[activatePolicy] ROLLBACK 실패:', rollbackError)
    }
    throw error
  } finally {
    client.release()
  }
}

/**
 * @typedef {Object} DeactivationInput
 * @property {string | null} actorUserId
 */

/**
 * @typedef {Object} DeactivationResult
 * @property {boolean} wasActive
 * @property {boolean} policyActive
 */

/**
 * 정책 비활성화. 플래그만 false 로 돌린다. 유저의 plan/started_at/expires_at 은 그대로 보존되어
 * 재활성화 시 남은 기간을 이어갈 수 있다.
 *
 * @param {DeactivationInput} input
 * @returns {Promise<DeactivationResult>}
 */
export async function deactivateSubscriptionPolicy(input) {
  const actorUserId =
    typeof input.actorUserId === 'string' && input.actorUserId.length > 0
      ? input.actorUserId
      : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const wasActive = await readPolicyActiveForUpdate(client)

    await client.query(
      `UPDATE app_settings
       SET value_json = CAST('false' AS jsonb),
           updated_at = NOW(),
           updated_by_user_id = $1
       WHERE key = 'subscription.policy_active'`,
      [actorUserId],
    )

    await client.query('COMMIT')
    invalidateAppSettingsCache('subscription.policy_active')

    return { wasActive, policyActive: false }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('[activatePolicy] ROLLBACK 실패:', rollbackError)
    }
    throw error
  } finally {
    client.release()
  }
}

/**
 * @typedef {Object} PolicyStatus
 * @property {boolean} policyActive
 * @property {number}  trialDefaultDays
 * @property {number}  eligibleUserCount     정책 ON 시 FREE → TRIAL 로 전환될 유저 수
 * @property {number}  trialUserCount         현재 TRIAL 상태 유저 수
 * @property {number}  expiredUserCount       현재 expires_at 경과한 유저 수 (plan 과 무관)
 */

/**
 * 관리자 대시보드/활성화 버튼 툴팁용 — 플래그 상태 + 영향 규모 일괄 조회.
 *
 * @returns {Promise<PolicyStatus>}
 */
export async function getSubscriptionPolicyStatus() {
  const { placeholders, values } = buildRolePlaceholders(
    SUBSCRIPTION_SUBJECT_ROLES,
    1,
  )

  const [policyActiveRow, trialDaysRow, countsRow] = await Promise.all([
    pool.query(
      `SELECT value_json FROM app_settings WHERE key = 'subscription.policy_active'`,
    ),
    pool.query(
      `SELECT value_json FROM app_settings WHERE key = 'subscription.trial_default_days'`,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE role IN (${placeholders})
             AND subscription_plan = 'FREE'
             AND subscription_started_at IS NULL
             AND subscription_expires_at IS NULL
         )::int AS eligible,
         COUNT(*) FILTER (WHERE subscription_plan = 'TRIAL')::int AS trial,
         COUNT(*) FILTER (
           WHERE subscription_expires_at IS NOT NULL
             AND subscription_expires_at < NOW()
         )::int AS expired
       FROM users`,
      values,
    ),
  ])

  const rawDays = trialDaysRow.rows[0]?.value_json
  const daysNumber = typeof rawDays === 'number' ? rawDays : Number(rawDays)
  const trialDefaultDays = Number.isFinite(daysNumber) ? Math.floor(daysNumber) : 30

  return {
    policyActive: policyActiveRow.rows[0]?.value_json === true,
    trialDefaultDays,
    eligibleUserCount: countsRow.rows[0]?.eligible ?? 0,
    trialUserCount: countsRow.rows[0]?.trial ?? 0,
    expiredUserCount: countsRow.rows[0]?.expired ?? 0,
  }
}
