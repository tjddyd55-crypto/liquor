/**
 * 주류회사 CRM 전자서명 접근 제어 — liquor 업종 테넌트 USER/GA_STAFF 전용.
 * @module liquorSignatures/access
 */

import { parseGaId } from '../parseGaId.js'

/**
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function getAuthUserId(req) {
  const id = req.user?.id ?? req.user?.userId
  return id != null && String(id).trim() ? String(id).trim() : null
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isLiquorIndustryRequest(req) {
  const jwtIc = String(req.user?.tenant_industry_code ?? req.user?.crm_industry_code ?? '')
    .trim()
    .toLowerCase()
  if (jwtIc === 'liquor') return true
  const ctx = /** @type {{ tenantIndustryCode?: string | null } | undefined} */ (
    /** @type {import('express').Request & { platformContext?: { tenantIndustryCode?: string | null } }} */ (req)
      .platformContext
  )
  const ctxIc = String(ctx?.tenantIndustryCode ?? '').trim().toLowerCase()
  return ctxIc === 'liquor'
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 */
export async function resolveEffectiveGaId(pool, req) {
  const userGa = parseGaId(req.user?.gaId)
  if (userGa != null) return userGa
  const raw =
    req.body?.tenantGaId ??
    req.body?.tenant_ga_id ??
    req.body?.gaId ??
    req.body?.ga_id ??
    req.query?.tenantGaId ??
    req.query?.tenant_ga_id ??
    req.query?.gaId ??
    req.query?.ga_id
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} templateId
 * @param {number} gaId
 * @param {boolean} allowDraft
 */
export async function assertLiquorSignatureTemplateAccess(pool, templateId, gaId, allowDraft = true) {
  const tid = String(templateId ?? '').trim()
  if (!tid || gaId == null) {
    return { row: null, error: '템플릿을 찾을 수 없습니다.', status: 404 }
  }
  const r = await pool.query(
    `SELECT * FROM liquor_signature_templates WHERE id = $1 AND ga_id = $2 LIMIT 1`,
    [tid, gaId],
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

/** USER · GA_STAFF — liquor 업종만 */
export function requireLiquorIndustrySignatureUser(req, res, next) {
  const uid = getAuthUserId(req)
  if (!uid) {
    res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
    return
  }
  const role = String(req.user?.role ?? '').trim()
  if (role !== 'USER' && role !== 'GA_STAFF') {
    res.status(403).json({ ok: false, message: '주류회사 CRM 이용자만 전자서명을 사용할 수 있습니다.' })
    return
  }
  if (!isLiquorIndustryRequest(req)) {
    res.status(403).json({ ok: false, message: '주류회사 CRM 전용 기능입니다.' })
    return
  }
  next()
}

/** SUPER_ADMIN · GA_ADMIN — liquor 템플릿 관리 */
export function requireLiquorIndustrySignatureAdmin(req, res, next) {
  const uid = getAuthUserId(req)
  if (!uid) {
    res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
    return
  }
  const role = String(req.user?.role ?? '').trim()
  if (role !== 'SUPER_ADMIN' && role !== 'GA_ADMIN') {
    res.status(403).json({ ok: false, message: '관리자만 템플릿을 관리할 수 있습니다.' })
    return
  }
  if (role !== 'SUPER_ADMIN' && !isLiquorIndustryRequest(req)) {
    res.status(403).json({ ok: false, message: '주류회사 CRM 전용 기능입니다.' })
    return
  }
  next()
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function attachLiquorSignatureContext(req, _res, next) {
  req.liquorSignatureGaId = parseGaId(req.user?.gaId)
  next()
}
