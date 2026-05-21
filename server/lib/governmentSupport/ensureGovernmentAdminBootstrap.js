/**
 * 정부지원 CRM 최초 관리자 — ENV 기반 idempotent bootstrap.
 * 로그인 식별자는 users.username (아이디). email 컬럼은 사용하지 않는다.
 * 비밀번호는 bcrypt 저장만 하며 로그·DB에 평문을 남기지 않는다.
 */
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { GOVERNMENT_INDUSTRY_CODE } from './constants.js'

const LOG_PREFIX = '[government-bootstrap]'

function isBootstrapEnabled() {
  return String(process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED ?? '').trim() === 'true'
}

function isDevelopRailwayEnvironment() {
  const name = String(
    process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT ?? '',
  )
    .trim()
    .toLowerCase()
  return name === 'develop' || name === 'development'
}

function isResetPasswordOnBootstrap() {
  return (
    String(process.env.GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP ?? '').trim() === 'true'
  )
}

/** @returns {'off' | 'bootstrap' | 'develop-sync'} */
function resolveAdminBootstrapMode() {
  const password = String(
    process.env.GOVERNMENT_ADMIN_PASSWORD ?? process.env.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD ?? '',
  ).trim()
  if (!password) {
    return 'off'
  }
  if (isBootstrapEnabled()) {
    return 'bootstrap'
  }
  if (String(process.env.GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP ?? '').trim() === 'true') {
    return 'bootstrap'
  }
  if (isDevelopRailwayEnvironment()) {
    return 'develop-sync'
  }
  return 'off'
}

function readBootstrapCredentials() {
  const loginIdFromEnv = String(process.env.GOVERNMENT_ADMIN_LOGIN_ID ?? '').trim()
  const legacyEmail = String(process.env.GOVERNMENT_ADMIN_EMAIL ?? '').trim()
  if (!loginIdFromEnv && legacyEmail) {
    console.warn(
      `${LOG_PREFIX} GOVERNMENT_ADMIN_EMAIL 은 더 이상 사용하지 않습니다. GOVERNMENT_ADMIN_LOGIN_ID 로 설정하세요.`,
    )
  }
  const password = String(
    process.env.GOVERNMENT_ADMIN_PASSWORD ??
      process.env.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD ??
      '',
  ).trim()
  const resolvedLoginId = loginIdFromEnv || (password ? 'admin' : '')
  const displayName = String(process.env.GOVERNMENT_ADMIN_NAME ?? '정부지원 CRM 관리자').trim()
  return { loginId: resolvedLoginId, password, displayName }
}

/**
 * users.ga_id NOT NULL 제약 — 정부지원 전용 GA 코드 사용 (보험 YJASSET 과 분리).
 * @param {import('pg').Pool} pool
 */
async function resolveGovernmentBootstrapGaId(pool) {
  const r = await pool.query(
    `
    INSERT INTO ga_companies (name, code)
    VALUES ('정부지원 CRM', 'GOVERNMENT_CRM')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
    `,
  )
  const id = r.rows[0]?.id
  if (id == null) {
    throw new Error(`${LOG_PREFIX} GOVERNMENT_CRM ga_companies 행을 확보하지 못했습니다.`)
  }
  return id
}

/**
 * @param {import('pg').Pool} pool
 */
async function resolveGovernmentIndustryIdForBootstrap(pool) {
  const r = await pool.query(
    `SELECT id FROM industries WHERE LOWER(TRIM(code)) = $1 LIMIT 1`,
    [GOVERNMENT_INDUSTRY_CODE],
  )
  const id = r.rows[0]?.id
  if (id == null) {
    throw new Error(
      `${LOG_PREFIX} industries.code='${GOVERNMENT_INDUSTRY_CODE}' 행이 없습니다. initDb industries 시드를 확인하세요.`,
    )
  }
  return id
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {number|string} industryId
 */
async function ensureGovernmentIndustryAdminMembership(pool, userId, industryId) {
  const iid = String(industryId)
  const scopeId = iid
  const existing = await pool.query(
    `
    SELECT id, role
    FROM user_memberships
    WHERE user_id = $1
      AND role = 'government_industry_admin'
      AND scope_type = 'industry'
      AND COALESCE(scope_id, '') = $2
    LIMIT 1
    `,
    [userId, scopeId],
  )
  if (existing.rowCount > 0) {
    console.log(
      `${LOG_PREFIX} membership already present: user=${userId} role=government_industry_admin industry=${iid}`,
    )
    return
  }

  await pool.query(
    `
    INSERT INTO user_memberships (
      user_id, role, scope_type, scope_id, industry_id, status
    )
    VALUES ($1, 'government_industry_admin', 'industry', $2, $3, 'active')
    `,
    [userId, scopeId, industryId],
  )
  console.log(
    `${LOG_PREFIX} membership created: user=${userId} role=government_industry_admin industry=${iid}`,
  )
}

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureGovernmentAdminBootstrap(pool) {
  const mode = resolveAdminBootstrapMode()
  if (mode === 'off') {
    return
  }

  if (mode === 'develop-sync') {
    console.log(
      `${LOG_PREFIX} develop password sync — GOVERNMENT_ADMIN_PASSWORD 로 admin 비밀번호를 갱신합니다 (loginId 기본 admin).`,
    )
  } else {
    console.log(`${LOG_PREFIX} bootstrap enabled — checking credentials`)
  }

  const { loginId, password, displayName } = readBootstrapCredentials()
  if (!loginId) {
    console.warn(
      `${LOG_PREFIX} GOVERNMENT_ADMIN_LOGIN_ID 가 없고 기본 admin 도 적용할 수 없어 건너뜁니다.`,
    )
    return
  }
  if (!password) {
    console.warn(
      `${LOG_PREFIX} GOVERNMENT_ADMIN_PASSWORD(또는 fallback) 가 없어 건너뜁니다.`,
    )
    return
  }

  const forcePasswordReset = mode === 'develop-sync' || isResetPasswordOnBootstrap()

  const industryId = await resolveGovernmentIndustryIdForBootstrap(pool)
  const gaId = await resolveGovernmentBootstrapGaId(pool)
  const username = loginId
  const existing = await pool.query(
    `SELECT id, username FROM users WHERE username = $1 AND COALESCE(is_deleted, false) IS NOT TRUE LIMIT 1`,
    [username],
  )

  let userId
  if (existing.rowCount === 0) {
    userId = randomUUID()
    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      `
      INSERT INTO users (id, username, password_hash, role, ga_id, display_name, invited_by_user_id)
      VALUES ($1, $2, $3, 'USER', $4, $5, $1)
      `,
      [userId, username, hash, gaId, displayName],
    )
    console.log(
      `${LOG_PREFIX} user created: loginId=${username} role=USER membership=government_industry_admin`,
    )
  } else {
    userId = String(existing.rows[0].id)
    console.log(`${LOG_PREFIX} existing user found: loginId=${username}`)
    const dn = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [userId])
    if (!String(dn.rows[0]?.display_name ?? '').trim() && displayName) {
      await pool.query(`UPDATE users SET display_name = $1 WHERE id = $2`, [displayName, userId])
    }
    if (forcePasswordReset) {
      const hash = await bcrypt.hash(password, 10)
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId])
      console.log(`${LOG_PREFIX} password reset applied: loginId=${username}`)
    } else {
      console.log(`${LOG_PREFIX} password unchanged: loginId=${username}`)
    }
  }

  await ensureGovernmentIndustryAdminMembership(pool, userId, industryId)
}
