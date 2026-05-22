/**
 * 주류 CRM 고객 접근 제어.
 */
import { parseGaId } from '../parseGaId.js'

export function requireLiquorIndustryCustomerUser(req, res, next) {
  const role = String(req.user?.role ?? '').trim()
  if (!['USER', 'GA_STAFF', 'GA_ADMIN', 'SUPER_ADMIN'].includes(role)) {
    res.status(403).json({ ok: false, message: '접근 권한이 없습니다.' })
    return
  }
  if (role === 'SUPER_ADMIN') {
    next()
    return
  }
  const ic = String(req.user?.tenant_industry_code ?? req.user?.crm_industry_code ?? '')
    .trim()
    .toLowerCase()
  const ctxIc = String(req.platformContext?.tenantIndustryCode ?? '').trim().toLowerCase()
  if (ic === 'liquor' || ctxIc === 'liquor') {
    next()
    return
  }
  res.status(403).json({ ok: false, message: '주류회사 CRM 전용 기능입니다.' })
}

/**
 * @param {import('express').Request} req
 */
export function resolveLiquorGaId(req) {
  const userGa = parseGaId(req.user?.gaId)
  if (String(req.user?.role ?? '') === 'SUPER_ADMIN') {
    const raw =
      req.query?.gaId ??
      req.query?.ga_id ??
      req.body?.gaId ??
      req.body?.ga_id ??
      req.body?.tenantGaId ??
      req.body?.tenant_ga_id
    const qGa = parseGaId(raw)
    if (qGa != null) return qGa
  }
  return userGa
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} customerId
 * @param {number} gaId
 */
export async function assertLiquorCustomerAccess(pool, customerId, gaId) {
  const r = await pool.query(
    `SELECT c.id FROM customers c WHERE c.id = $1 AND c.ga_id = $2 AND c.deleted_at IS NULL LIMIT 1`,
    [customerId, gaId],
  )
  return r.rowCount > 0
}
