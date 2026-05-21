/**
 * PDF 고객 매핑용 고객 1건 조회 — 기존 고객 상세와 동일한 가시성 규칙.
 */

import { mapCustomerRow } from '../../lib/customerRowMap.js'
import { resolveCustomerVisibilitySqlForSelect } from '../../lib/customerRowVisibilitySql.js'
import { parseGaId } from '../../lib/parseGaId.js'

/**
 * @param {import('pg').Pool} pool
 * @param {typeof import('../../utils/dbSafeQuery.js').safeQuery} safeQueryExec
 * @param {import('express').Request} req
 * @param {number} customerId
 * @returns {Promise<ReturnType<typeof mapCustomerRow> | null>}
 */
export async function getCustomerForPdfMapping(pool, safeQueryExec, req, customerId) {
  const userId = req.user?.id ? String(req.user.id) : ''
  const gaId = parseGaId(req.user?.gaId)
  if (!userId || gaId == null) {
    return null
  }
  const cid = Number(customerId)
  if (!Number.isInteger(cid) || cid < 1) {
    return null
  }

  const accessEarly = req.user?.customerAccess ?? 'own'
  if (accessEarly === 'none') {
    return null
  }

  const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
  if (vis.blocked) {
    return null
  }

  const plc = vis.params.length
  const cidPlace = `$${plc + 1}`
  const result = await safeQueryExec(
    pool,
    `
    SELECT
      c.id, c.user_id, c.name, c.birth_date, c.ssn, c.phone, c.carrier, c.address, c.height, c.weight, c.job, c.driving, c.medical,
      c.car_number, c.car_model, c.car_year, c.renewal_date,
      c.gender, c.insurance_age, c.next_age_date, c.is_driver, c.car_type, c.notes,
      c.is_favorite, c.created_at, c.customer_code, c.crm_extension
    FROM customers c
    WHERE c.id = ${cidPlace} AND (${vis.clause}) AND c.deleted_at IS NULL
    LIMIT 1
    `,
    [...vis.params, cid],
  )

  if ((result.rowCount ?? 0) === 0) {
    return null
  }
  return mapCustomerRow(result.rows[0])
}
