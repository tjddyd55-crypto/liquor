/**
 * 정부지원 전자서명 접근 제어 — government_user(program user) 전용.
 * @module governmentSignatures/access
 */

import { isGovernmentProgramUser } from '../governmentSupport/governmentAccess.js'

/**
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function getAuthUserId(req) {
  const id = req.user?.id ?? req.user?.userId
  return id != null && String(id).trim() ? String(id).trim() : null
}

/**
 * @param {unknown} _raw
 * @returns {null}
 */
export function parseGovOwnerUserId(_raw) {
  return null
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<string | null>}
 */
export async function resolveGovSignatureOwnerUserId(_pool, req) {
  return getAuthUserId(req)
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} templateId
 * @param {string} ownerUserId
 * @param {boolean} allowDraft
 */
export async function assertGovSignatureTemplateAccess(pool, templateId, ownerUserId, allowDraft = true) {
  const tid = String(templateId ?? '').trim()
  const uid = String(ownerUserId ?? '').trim()
  if (!tid || !uid) {
    return { row: null, error: '템플릿을 찾을 수 없습니다.', status: 404 }
  }
  const r = await pool.query(
    `SELECT * FROM gov_signature_templates WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [tid, uid],
  )
  const row = r.rows[0]
  if (!row) {
    return { row: null, error: '템플릿을 찾을 수 없습니다.', status: 404 }
  }
  if (!allowDraft && String(row.status) !== 'active') {
    return { row: null, error: '활성 템플릿만 사용할 수 있습니다.', status: 403 }
  }
  return { row, error: null, status: 200 }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} sendSessionId
 * @param {string} ownerUserId
 */
export async function assertGovSignatureSendSessionAccess(pool, sendSessionId, ownerUserId) {
  const r = await pool.query(
    `SELECT * FROM gov_signature_send_sessions WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [sendSessionId, ownerUserId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} profileId
 * @param {string} ownerUserId
 */
export async function assertGovProfileOwnedByUser(pool, profileId, ownerUserId) {
  const r = await pool.query(
    `SELECT id, tenant_id, owner_user_id, customer_name, business_name, phone
     FROM gov_support_profiles WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
    [profileId, ownerUserId],
  )
  return r.rows[0] ?? null
}

/**
 * government_user(program user)만 전자서명 생성·조회 가능.
 * staff / agency_admin / industry_admin 차단.
 */
export function requireGovernmentProgramUserSignature(req, res, next) {
  const uid = getAuthUserId(req)
  if (!uid) {
    res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
    return
  }
  const ctx = /** @type {import('express').Request & { platformContext?: import('../platformRbac.js').EffectivePlatformContext }} */ (
    req
  ).platformContext
  if (!ctx || !isGovernmentProgramUser(ctx)) {
    res.status(403).json({ ok: false, message: '프로그램 이용자만 전자서명 기능을 사용할 수 있습니다.' })
    return
  }
  next()
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function attachGovernmentSignatureContext(req, _res, next) {
  req.governmentSignatureOwnerUserId = getAuthUserId(req)
  next()
}
