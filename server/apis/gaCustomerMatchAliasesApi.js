/**
 * 고객별 GA 피보험자 매칭 예외값(alias) API.
 */

import { safeQuery } from '../utils/dbSafeQuery.js'
import { assertCustomerRowAccessibleByVisibility } from '../lib/customerRowVisibilitySql.js'
import {
  listGaCustomerMatchAliases,
  replaceGaCustomerMatchAliases,
  sanitizeGaMatchAliasesForSave,
} from '../lib/gaCustomerMatchAliases.js'

function parseCustomerIdParam(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 * @param {number} customerId
 */
async function loadCustomerNameIfAccessible(pool, req, customerId) {
  const ok = await assertCustomerRowAccessibleByVisibility(pool, safeQuery, req, customerId)
  if (!ok) return null
  const gaId = Number(req.user?.gaId)
  if (!Number.isInteger(gaId) || gaId < 1) return null
  const r = await safeQuery(
    pool,
    `
    SELECT name
    FROM customers
    WHERE id = $1 AND ga_id = $2 AND deleted_at IS NULL
    LIMIT 1
    `,
    [customerId, gaId],
  )
  if ((r.rowCount ?? 0) === 0) return null
  return String(r.rows[0].name ?? '')
}

export function registerGaCustomerMatchAliasesApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError, parseGaId } = ctx

  apiRouter.get('/ga-customer-match-aliases', requireAuth, async (req, res) => {
    try {
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const customerId = parseCustomerIdParam(req.query?.customerId)
      if (customerId == null) {
        res.status(400).json({ message: 'customerId가 올바르지 않습니다.' })
        return
      }
      const customerName = await loadCustomerNameIfAccessible(pool, req, customerId)
      if (customerName == null) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const aliases = await listGaCustomerMatchAliases(pool, gaId, customerId)
      res.json({ customerName, aliases })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.put('/ga-customer-match-aliases', requireAuth, async (req, res) => {
    try {
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const customerId = parseCustomerIdParam(req.body?.customerId)
      if (customerId == null) {
        res.status(400).json({ message: 'customerId가 올바르지 않습니다.' })
        return
      }
      const customerName = await loadCustomerNameIfAccessible(pool, req, customerId)
      if (customerName == null) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const rawAliases = Array.isArray(req.body?.aliases) ? req.body.aliases : []
      const cleaned = sanitizeGaMatchAliasesForSave(rawAliases, customerName)
      const saved = await replaceGaCustomerMatchAliases(pool, gaId, customerId, cleaned)
      res.json({ ok: true, customerName, aliases: saved })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
