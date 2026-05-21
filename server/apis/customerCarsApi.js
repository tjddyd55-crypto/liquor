import { safeQuery } from '../utils/dbSafeQuery.js'
import { parseGaId } from '../lib/parseGaId.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {unknown} raw
 * @returns {string}
 */
function trimStr(raw) {
  return String(raw ?? '').trim()
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeRenewalDateOrNull(raw) {
  const s = trimStr(raw)
  if (!s) {
    return null
  }
  const head = s.slice(0, 10)
  if (!DATE_RE.test(head)) {
    return null
  }
  return head
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} customerId
 */
async function syncCustomerPrimaryCarFields(client, customerId) {
  const r = await client.query(
    `
    SELECT car_type, car_number, car_model, car_year, renewal_date
    FROM customer_cars
    WHERE customer_id = $1 AND is_primary = true
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
    `,
    [customerId],
  )
  if (r.rowCount === 0) {
    await client.query(
      `
      UPDATE customers
      SET car_type = '',
          car_number = '',
          car_model = '',
          car_year = '',
          renewal_date = NULL
      WHERE id = $1
      `,
      [customerId],
    )
    return
  }
  const row = r.rows[0]
  await client.query(
    `
    UPDATE customers
    SET car_type = $2,
        car_number = $3,
        car_model = $4,
        car_year = $5,
        renewal_date = $6
    WHERE id = $1
    `,
    [
      customerId,
      trimStr(row.car_type),
      trimStr(row.car_number),
      trimStr(row.car_model),
      trimStr(row.car_year),
      row.renewal_date ?? null,
    ],
  )
}

/**
 * @param {Record<string, unknown>} row
 */
function mapCarRow(row) {
  const renewal = row.renewal_date
  let renewalDate = ''
  if (renewal instanceof Date) {
    renewalDate = renewal.toISOString().slice(0, 10)
  } else if (renewal) {
    renewalDate = String(renewal).slice(0, 10)
  }
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    carType: trimStr(row.car_type),
    carNumber: trimStr(row.car_number),
    carModel: trimStr(row.car_model),
    carYear: trimStr(row.car_year),
    renewalDate,
    memo: trimStr(row.memo),
    isPrimary: row.is_primary === true,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ''),
  }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool; requireAuth: import('express').RequestHandler; handleDbError: (e: unknown, req: import('express').Request, res: import('express').Response) => void }} deps
 */
export function registerCustomerCarsApi(apiRouter, { pool, requireAuth, handleDbError }) {
  /**
   * @param {number} customerId
   * @param {string} userId
   * @param {number} gaId
   */
  async function assertCustomerOwned(client, customerId, userId, gaId) {
    const r = await client.query(
      `
      SELECT id FROM customers
      WHERE id = $1 AND user_id = $2 AND ga_id = $3 AND deleted_at IS NULL
      `,
      [customerId, userId, gaId],
    )
    return r.rowCount > 0
  }

  apiRouter.get('/customers/:customerId/cars', requireAuth, async (req, res) => {
    try {
      const userId = String(req.user?.id ?? '').trim()
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const customerId = Number(req.params.customerId)
      if (!Number.isInteger(customerId) || customerId < 1) {
        res.status(400).json({ message: '유효한 고객 id가 없습니다.' })
        return
      }
      const owned = await assertCustomerOwned(pool, customerId, userId, gaId)
      if (!owned) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const rows = await safeQuery(
        pool,
        `
        SELECT *
        FROM customer_cars
        WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        `,
        [customerId, userId, gaId],
      )
      res.json({ cars: rows.rows.map(mapCarRow) })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:customerId/cars', requireAuth, async (req, res) => {
    const userId = String(req.user?.id ?? '').trim()
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const customerId = Number(req.params.customerId)
    if (!Number.isInteger(customerId) || customerId < 1) {
      res.status(400).json({ message: '유효한 고객 id가 없습니다.' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    let carType = trimStr(body.carType)
    const carNumber = trimStr(body.carNumber)
    const carModel = trimStr(body.carModel)
    const carYear = trimStr(body.carYear)
    const memo = trimStr(body.memo)
    const renewalRaw = body.renewalDate
    const renewalDate = normalizeRenewalDateOrNull(renewalRaw)
    if (trimStr(renewalRaw) && renewalDate === null) {
      res.status(400).json({ message: '만기일은 YYYY-MM-DD 형식이어야 합니다.' })
      return
    }
    let isPrimary = body.isPrimary === true

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ok = await assertCustomerOwned(client, customerId, userId, gaId)
      if (!ok) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const cntQ = await client.query(
        `SELECT COUNT(*)::int AS c FROM customer_cars WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3`,
        [customerId, userId, gaId],
      )
      const existingCount = Number(cntQ.rows[0]?.c ?? 0)
      if (existingCount === 0) {
        isPrimary = true
      }
      if (isPrimary) {
        await client.query(
          `UPDATE customer_cars SET is_primary = false, updated_at = NOW() WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3`,
          [customerId, userId, gaId],
        )
      }
      const ordQ = await client.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM customer_cars WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3`,
        [customerId, userId, gaId],
      )
      const sortOrder = Number(ordQ.rows[0]?.n ?? 0)

      const ins = await client.query(
        `
        INSERT INTO customer_cars (
          customer_id, user_id, ga_id,
          car_type, car_number, car_model, car_year, renewal_date, memo,
          is_primary, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          customerId,
          userId,
          gaId,
          carType,
          carNumber,
          carModel,
          carYear,
          renewalDate,
          memo,
          isPrimary,
          sortOrder,
        ],
      )
      const carRowId = ins.rows[0].id
      const primLeft = await client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM customer_cars
        WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3 AND is_primary = true
        `,
        [customerId, userId, gaId],
      )
      if (Number(primLeft.rows[0]?.c ?? 0) === 0) {
        await client.query(
          `
          UPDATE customer_cars
          SET is_primary = true, updated_at = NOW()
          WHERE id = (
            SELECT id FROM customer_cars
            WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3
            ORDER BY sort_order ASC, id ASC
            LIMIT 1
          )
          `,
          [customerId, userId, gaId],
        )
      }
      await syncCustomerPrimaryCarFields(client, customerId)
      const finalRow = await client.query(`SELECT * FROM customer_cars WHERE id = $1`, [carRowId])
      await client.query('COMMIT')
      res.status(201).json(mapCarRow(finalRow.rows[0]))
    } catch (error) {
      await client.query('ROLLBACK')
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.patch('/customers/:customerId/cars/:carId', requireAuth, async (req, res) => {
    const userId = String(req.user?.id ?? '').trim()
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const customerId = Number(req.params.customerId)
    const carId = Number(req.params.carId)
    if (!Number.isInteger(customerId) || customerId < 1 || !Number.isInteger(carId) || carId < 1) {
      res.status(400).json({ message: '유효한 식별자가 없습니다.' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ok = await assertCustomerOwned(client, customerId, userId, gaId)
      if (!ok) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const cur = await client.query(
        `
        SELECT * FROM customer_cars
        WHERE id = $1 AND customer_id = $2 AND user_id = $3 AND ga_id = $4
        `,
        [carId, customerId, userId, gaId],
      )
      if (cur.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '자동차 정보를 찾을 수 없습니다.' })
        return
      }
      const row = cur.rows[0]
      let carType = trimStr(row.car_type)
      let carNumber = trimStr(row.car_number)
      let carModel = trimStr(row.car_model)
      let carYear = trimStr(row.car_year)
      let memo = trimStr(row.memo)
      let renewalDate = row.renewal_date
      let isPrimary = row.is_primary === true

      if (Object.prototype.hasOwnProperty.call(body, 'carType')) {
        carType = trimStr(body.carType)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'carNumber')) {
        carNumber = trimStr(body.carNumber)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'carModel')) {
        carModel = trimStr(body.carModel)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'carYear')) {
        carYear = trimStr(body.carYear)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'memo')) {
        memo = trimStr(body.memo)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'renewalDate')) {
        const n = normalizeRenewalDateOrNull(body.renewalDate)
        if (trimStr(body.renewalDate) && n === null) {
          await client.query('ROLLBACK')
          res.status(400).json({ message: '만기일은 YYYY-MM-DD 형식이어야 합니다.' })
          return
        }
        renewalDate = n
      }
      if (Object.prototype.hasOwnProperty.call(body, 'isPrimary') && body.isPrimary === true) {
        isPrimary = true
        await client.query(
          `UPDATE customer_cars SET is_primary = false, updated_at = NOW() WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3 AND id <> $4`,
          [customerId, userId, gaId, carId],
        )
      } else if (Object.prototype.hasOwnProperty.call(body, 'isPrimary') && body.isPrimary === false) {
        isPrimary = false
      }

      const upd = await client.query(
        `
        UPDATE customer_cars
        SET car_type = $1,
            car_number = $2,
            car_model = $3,
            car_year = $4,
            renewal_date = $5,
            memo = $6,
            is_primary = $7,
            updated_at = NOW()
        WHERE id = $8 AND customer_id = $9 AND user_id = $10 AND ga_id = $11
        RETURNING *
        `,
        [carType, carNumber, carModel, carYear, renewalDate, memo, isPrimary, carId, customerId, userId, gaId],
      )

      const stillRows = await client.query(
        `SELECT COUNT(*)::int AS c FROM customer_cars WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3`,
        [customerId, userId, gaId],
      )
      const nLeft = Number(stillRows.rows[0]?.c ?? 0)
      const primQ = await client.query(
        `SELECT COUNT(*)::int AS c FROM customer_cars WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3 AND is_primary = true`,
        [customerId, userId, gaId],
      )
      const nPrim = Number(primQ.rows[0]?.c ?? 0)
      if (nLeft > 0 && nPrim === 0) {
        const pick = await client.query(
          `
          SELECT id FROM customer_cars
          WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
          `,
          [customerId, userId, gaId],
        )
        if (pick.rowCount > 0) {
          await client.query(
            `UPDATE customer_cars SET is_primary = true, updated_at = NOW() WHERE id = $1`,
            [pick.rows[0].id],
          )
        }
      }

      await syncCustomerPrimaryCarFields(client, customerId)
      await client.query('COMMIT')
      res.json(mapCarRow(upd.rows[0]))
    } catch (error) {
      await client.query('ROLLBACK')
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.delete('/customers/:customerId/cars/:carId', requireAuth, async (req, res) => {
    const userId = String(req.user?.id ?? '').trim()
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const customerId = Number(req.params.customerId)
    const carId = Number(req.params.carId)
    if (!Number.isInteger(customerId) || customerId < 1 || !Number.isInteger(carId) || carId < 1) {
      res.status(400).json({ message: '유효한 식별자가 없습니다.' })
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ok = await assertCustomerOwned(client, customerId, userId, gaId)
      if (!ok) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const del = await client.query(
        `
        DELETE FROM customer_cars
        WHERE id = $1 AND customer_id = $2 AND user_id = $3 AND ga_id = $4
        RETURNING is_primary
        `,
        [carId, customerId, userId, gaId],
      )
      if (del.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '자동차 정보를 찾을 수 없습니다.' })
        return
      }
      const wasPrimary = del.rows[0]?.is_primary === true
      if (wasPrimary) {
        const next = await client.query(
          `
          SELECT id FROM customer_cars
          WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
          `,
          [customerId, userId, gaId],
        )
        if (next.rowCount > 0) {
          await client.query(
            `UPDATE customer_cars SET is_primary = true, updated_at = NOW() WHERE id = $1`,
            [next.rows[0].id],
          )
        }
      }
      await syncCustomerPrimaryCarFields(client, customerId)
      await client.query('COMMIT')
      res.status(204).send()
    } catch (error) {
      await client.query('ROLLBACK')
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })
}
