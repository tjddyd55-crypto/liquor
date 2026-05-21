/**
 * 고객 행(customer row) 단일 조회·수정 시 `buildCustomerRowVisibilityWhere` 절 재사용.
 * @import { Request } from 'express'
 */

import { buildCustomerRowVisibilityWhere } from './customerAccessScope.js'
import { parseGaId } from './parseGaId.js'

/**
 * customers 별칭 `c` 절을 다른 테이블 별칭으로 치환.
 * @param {string | undefined | null} clause
 * @param {string} [table]
 */
export function replaceCustomerSqlAliasC(clause, table = 'customers') {
  const t = String(table).trim() || 'customers'
  return String(clause ?? '').replace(/\bc\./g, `${t}.`)
}

/**
 * @param {string | undefined | null} clause
 * @param {number} offset
 */
export function offsetSqlPlaceholders(clause, offset) {
  const o = Number(offset) || 0
  if (o === 0) return String(clause ?? '')
  return String(clause ?? '').replace(/\$(\d+)/g, (_, num) => `$${Number(num) + o}`)
}

/**
 * @param {import('express').Request} req
 * @param {string} userId
 * @param {number} gaId
 * @returns {{ blocked: true; clause: string; params: unknown[] } | { blocked: false; clause: string; params: unknown[] }}
 */
export function resolveCustomerVisibilitySqlForSelect(req, userId, gaId) {
  const access = req.user?.customerAccess ?? 'own'
  if (access === 'none') {
    return { blocked: true, clause: '(FALSE)', params: [] }
  }
  let tidRaw = req.user?.customerTenantDbId
  let tenantDbParsed =
    typeof tidRaw === 'number' && Number.isFinite(tidRaw)
      ? tidRaw
      : Number(String(tidRaw ?? '').trim())
  tenantDbParsed = Number.isSafeInteger(tenantDbParsed) && tenantDbParsed >= 1 ? tenantDbParsed : null
  return {
    blocked: false,
    ...buildCustomerRowVisibilityWhere({
      access,
      userId,
      gaId,
      tenantDbId: tenantDbParsed,
    }),
  }
}

/**
 * UPDATE customers — 별칭 없음
 * @param {import('express').Request} req
 * @param {string} userId
 * @param {number} gaId
 */
export function resolveCustomerVisibilitySqlForUpdate(req, userId, gaId) {
  const sel = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
  if (sel.blocked) return sel
  return {
    blocked: false,
    clause: replaceCustomerSqlAliasC(sel.clause),
    params: sel.params,
  }
}

/**
 * 세션(req.user customerAccess) 기준으로 특정 고객 행 접근 가능 여부.
 * @param {import('pg').Pool} pool
 * @param {typeof import('../utils/dbSafeQuery.js').safeQuery} safeQueryExec
 * @param {import('express').Request} req
 * @param {number} customerId
 * @param {{ requireNonDeleted?: boolean }} [opts]
 */
export async function assertCustomerRowAccessibleByVisibility(pool, safeQueryExec, req, customerId, opts = {}) {
  const requireNonDeleted = opts.requireNonDeleted !== false
  const userId = req.user?.id ? String(req.user.id) : ''
  const gaId = parseGaId(req.user?.gaId)
  if (!userId || gaId == null) {
    return false
  }
  const cid = Number(customerId)
  if (!Number.isInteger(cid) || cid < 1) {
    return false
  }
  const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
  if (vis.blocked) {
    return false
  }
  const plc = vis.params.length
  const idPh = `$${plc + 1}`
  const deletedPart = requireNonDeleted ? ' AND c.deleted_at IS NULL' : ''
  const r = await safeQueryExec(
    pool,
    `
    SELECT 1 FROM customers c
    WHERE c.id = ${idPh}
      AND (${vis.clause})
      ${deletedPart}
    LIMIT 1
    `,
    [...vis.params, cid],
  )
  return (r.rowCount ?? 0) > 0
}
