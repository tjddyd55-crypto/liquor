import { safeQuery } from '../utils/dbSafeQuery.js'
import { parseGaId } from '../lib/parseGaId.js'
import {
  assertCustomerRowAccessibleByVisibility,
  replaceCustomerSqlAliasC,
  resolveCustomerVisibilitySqlForSelect,
} from '../lib/customerRowVisibilitySql.js'

const SOURCE_TYPES = new Set([
  'manual',
  'customer_memo',
  'consultation_note',
  'pdf_document',
  'e_document',
  'system',
])
const RELATED_TYPES = new Set(['customer', 'document', 'e_document', 'case', 'tenant'])
const STATUSES = new Set(['pending', 'completed', 'canceled'])
const PRIORITIES = new Set(['low', 'normal', 'high'])

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD in Asia/Seoul
 */
export function formatSeoulYmd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * @returns {{ start: string; end: string }} 해당 주 월~일 달력일(Asia/Seoul)
 */
export function seoulWeekRangeYmd(reference = new Date()) {
  const wdStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(reference)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayNum = map[/** @type {keyof typeof map} */ (wdStr)] ?? 0
  const mondayOffset = dayNum === 0 ? -6 : 1 - dayNum

  const refYmd = formatSeoulYmd(reference)
  const anchor = /** @type {Date} */ (new Date(`${refYmd}T12:00:00+09:00`))
  const monday = new Date(anchor)
  monday.setDate(monday.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: formatSeoulYmd(monday), end: formatSeoulYmd(sunday) }
}

/**
 * @param {import('pg').QueryResultRow} row
 */
function mapTodoRow(row) {
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null
  /** @type {string | null} */
  let dueTime = null
  if (row.due_time) {
    const s = String(row.due_time)
    dueTime = s.length >= 5 ? s.slice(0, 5) : s
  }
  let meta = row.metadata ?? null
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      meta = null
    }
  }
  return {
    id: String(row.id),
    tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
    gaId: Number(row.ga_id),
    ownerUserId: row.owner_user_id ?? '',
    assigneeUserId: row.assignee_user_id ?? null,
    title: row.title ?? '',
    description: row.description ?? '',
    dueDate: due,
    dueTime,
    status: row.status ?? 'pending',
    priority: row.priority ?? 'normal',
    sourceType: row.source_type ?? 'manual',
    sourceId: row.source_id != null ? String(row.source_id) : null,
    relatedEntityType: row.related_entity_type ?? null,
    relatedEntityId: row.related_entity_id != null ? String(row.related_entity_id) : null,
    metadata: meta,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    canceledAt: row.canceled_at ? new Date(row.canceled_at).toISOString() : null,
    customerName: row.customer_name ?? null,
  }
}

function resolveGaIdStrict(req, res) {
  const gid = parseGaId(req.gaId ?? req.user?.gaId)
  if (gid == null) {
    res.status(400).json({ message: 'GA 컨텍스트가 필요합니다.' })
    return null
  }
  return gid
}

function resolveTenantDbId(req) {
  const t = req.user?.customerTenantDbId
  const n = typeof t === 'number' ? t : Number(String(t ?? '').trim())
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

function todoCustomerVisibilityExistsSql(req, userId, gaId) {
  const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
  if (vis.blocked) {
    return `(t.related_entity_type IS DISTINCT FROM 'customer' OR t.related_entity_id IS NULL OR trim(t.related_entity_id) = '')`
  }
  const clause = replaceCustomerSqlAliasC(vis.clause, 'cu')
  return `(
      t.related_entity_type IS DISTINCT FROM 'customer'
      OR t.related_entity_id IS NULL OR trim(t.related_entity_id) = ''
      OR (
        trim(t.related_entity_id) ~ '^[0-9]+$'
        AND EXISTS (
          SELECT 1 FROM customers cu
          WHERE cu.id = CAST(trim(t.related_entity_id) AS INTEGER)
            AND (${clause})
        )
      )
    )`
}

async function validateCustomerTodoLink(pool, safeQueryExec, req, gaId, relType, relIdRaw) {
  if (relType !== 'customer' || relIdRaw == null || String(relIdRaw).trim() === '') {
    return { ok: /** @type {const} */ (true) }
  }
  const cid = Number(relIdRaw)
  if (!Number.isInteger(cid) || cid < 1) {
    return { ok: /** @type {const} */ (false), msg: '고객 연결 ID 형식이 올바르지 않습니다.', status: 400 }
  }
  const accessible = await assertCustomerRowAccessibleByVisibility(pool, safeQueryExec, req, cid)
  if (!accessible) {
    return { ok: /** @type {const} */ (false), msg: '해당 고객에 대한 접근 권한이 없습니다.', status: 403 }
  }
  return { ok: /** @type {const} */ (true) }
}

async function fetchTodoMine(poolq, todoIdBig, gaId, userId) {
  const r = await safeQuery(
    poolq,
    `
    SELECT *
    FROM todos
    WHERE id = $1::bigint AND ga_id = $2
      AND (owner_user_id = $3 OR assignee_user_id = $3)
    LIMIT 1
    `,
    [todoIdBig, gaId, userId],
  )
  return r.rows[0] ?? null
}

async function enrichCustomerName(poolq, gaId, row) {
  if (!row?.related_entity_type || row.related_entity_type !== 'customer' || !row.related_entity_id) {
    return row
  }
  const idTrim = String(row.related_entity_id).trim()
  if (!/^[0-9]+$/.test(idTrim)) return row
  const cr = await safeQuery(
    poolq,
    `SELECT name FROM customers WHERE id = $1::integer AND ga_id = $2 LIMIT 1`,
    [Number(idTrim), gaId],
  )
  if ((cr.rowCount ?? 0) > 0) {
    return { ...row, customer_name: cr.rows[0].name ?? null }
  }
  return row
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool; requireAuth: import('express').RequestHandler; handleDbError: Function }} ctx
 */
export function registerTodosApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx

  apiRouter.get('/todos', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const statusQ = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : ''
      const bucket = typeof req.query.bucket === 'string' ? req.query.bucket.trim().toLowerCase() : ''
      const due = typeof req.query.due === 'string' ? req.query.due.trim().toLowerCase() : ''
      const overdueRaw = String(req.query.overdue ?? '').trim()
      const hasRelatedRaw = typeof req.query.hasRelated === 'string' ? req.query.hasRelated.trim().toLowerCase() : ''
      const sourceType = typeof req.query.sourceType === 'string' ? req.query.sourceType.trim().toLowerCase() : ''

      const conditions = [`t.ga_id = $1`, `(t.owner_user_id = $2 OR t.assignee_user_id = $2)`]
      const params = [gaId, userId]
      let p = 3

      conditions.push(`(${todoCustomerVisibilityExistsSql(req, userId, gaId)})`)

      if (statusQ && STATUSES.has(statusQ)) {
        conditions.push(`t.status = $${p}`)
        params.push(statusQ)
        p += 1
      } else if (bucket === 'open') {
        conditions.push(`t.status = $${p}`)
        params.push('pending')
        p += 1
      }

      if (due === 'today') {
        conditions.push(`t.due_date = $${p}`)
        params.push(formatSeoulYmd(new Date()))
        p += 1
      } else if (due === 'tomorrow') {
        const t = formatSeoulYmd(new Date())
        const dt = new Date(`${t}T12:00:00+09:00`)
        dt.setDate(dt.getDate() + 1)
        conditions.push(`t.due_date = $${p}`)
        params.push(formatSeoulYmd(dt))
        p += 1
      } else if (due === 'week') {
        const { start, end } = seoulWeekRangeYmd()
        conditions.push(`t.due_date >= $${p} AND t.due_date <= $${p + 1}`)
        params.push(start, end)
        p += 2
      }

      if (overdueRaw === '1' || overdueRaw === 'true') {
        const today = formatSeoulYmd(new Date())
        conditions.push(`t.status = $${p} AND t.due_date IS NOT NULL AND t.due_date < $${p + 1}`)
        params.push('pending', today)
        p += 2
      }

      if (hasRelatedRaw === 'yes' || hasRelatedRaw === '1') {
        conditions.push(`t.related_entity_type IS NOT NULL AND trim(t.related_entity_type) <> ''`)
        conditions.push(`t.related_entity_id IS NOT NULL AND trim(t.related_entity_id) <> ''`)
      } else if (hasRelatedRaw === 'no' || hasRelatedRaw === '0') {
        conditions.push(
          `(t.related_entity_type IS NULL OR trim(t.related_entity_type) = '' OR t.related_entity_id IS NULL OR trim(t.related_entity_id) = '')`,
        )
      }

      if (sourceType && SOURCE_TYPES.has(sourceType)) {
        conditions.push(`t.source_type = $${p}`)
        params.push(sourceType)
        p += 1
      }

      const whereSql = conditions.map((c) => `(${c})`).join(' AND ')
      const r = await safeQuery(
        pool,
        `
        SELECT
          t.*,
          CASE
            WHEN t.related_entity_type = 'customer' AND trim(t.related_entity_id) ~ '^[0-9]+$'
            THEN cu.name
            ELSE NULL
          END AS customer_name
        FROM todos t
        LEFT JOIN customers cu
          ON t.related_entity_type = 'customer'
          AND trim(t.related_entity_id) ~ '^[0-9]+$'
          AND cu.id = CAST(trim(t.related_entity_id) AS INTEGER)
          AND cu.ga_id = t.ga_id
        WHERE ${whereSql}
        ORDER BY t.due_date NULLS LAST, t.updated_at DESC NULLS LAST, t.id DESC
        LIMIT 500
        `,
        params,
      )
      res.json(r.rows.map(mapTodoRow))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/todos', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const body = req.body ?? {}
      const title = String(body.title ?? '').trim()
      if (!title) {
        res.status(400).json({ message: '제목을 입력해 주세요.' })
        return
      }
      let sourceType = String(body.sourceType ?? body.source_type ?? 'manual').trim().toLowerCase()
      if (!SOURCE_TYPES.has(sourceType)) {
        sourceType = 'manual'
      }
      const description = String(body.description ?? '').slice(0, 20000)
      const dueDateRaw = body.dueDate ?? body.due_date
      const dueTimeRaw = body.dueTime ?? body.due_time

      /** @type {string | null} */
      let dueDate =
        typeof dueDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw.trim())
          ? dueDateRaw.trim()
          : null
      const dueTimeNorm =
        typeof dueTimeRaw === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(dueTimeRaw.trim())
          ? dueTimeRaw.trim().slice(0, 5)
          : null

      let relType = body.relatedEntityType ?? body.related_entity_type
      relType = typeof relType === 'string' && relType.trim() ? relType.trim().toLowerCase() : null
      if (relType && !RELATED_TYPES.has(relType)) {
        res.status(400).json({ message: '연결 대상 종류 값이 올바르지 않습니다.' })
        return
      }

      let relId = body.relatedEntityId ?? body.related_entity_id
      relId = relId != null && String(relId).trim() ? String(relId).trim() : null

      const linkCheck = await validateCustomerTodoLink(pool, safeQuery, req, gaId, relType, relId)
      if (!linkCheck.ok) {
        res.status(linkCheck.status ?? 400).json({ message: linkCheck.msg ?? '연결 검증 실패' })
        return
      }

      let priority = String(body.priority ?? 'normal').trim().toLowerCase()
      if (!PRIORITIES.has(priority)) priority = 'normal'

      const sourceId = body.sourceId ?? body.source_id
      const sourceIdStr =
        sourceId != null && String(sourceId).trim() ? String(sourceId).slice(0, 256) : null

      /** @type {string} */
      let metaJson = '{}'
      const metaObj = body.metadata
      if (metaObj != null && typeof metaObj === 'object') metaJson = JSON.stringify(metaObj)
      else if (typeof metaObj === 'string' && metaObj.trim()) metaJson = metaObj

      const tenantDbId = resolveTenantDbId(req)

      const ins = await safeQuery(
        pool,
        `
        INSERT INTO todos (
          tenant_id, ga_id, owner_user_id, assignee_user_id,
          title, description, due_date, due_time,
          status, priority, source_type, source_id,
          related_entity_type, related_entity_id, metadata,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,$8::time,
          'pending',$9,$10,$11::text,
          $12,$13,$14::jsonb,
          NOW(),NOW()
        )
        RETURNING *
        `,
        [
          tenantDbId,
          gaId,
          userId,
          userId,
          title.slice(0, 500),
          description,
          dueDate,
          dueTimeNorm,
          priority,
          sourceType,
          sourceIdStr,
          relType,
          relId,
          metaJson,
        ],
      )
      const enriched = await enrichCustomerName(pool, gaId, ins.rows[0])
      res.status(201).json(mapTodoRow(enriched))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/todos/:todoId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const todoIdBig = Number(req.params.todoId)
      if (!Number.isFinite(todoIdBig) || todoIdBig < 1) {
        res.status(400).json({ message: '유효한 할 일 식별자가 아닙니다.' })
        return
      }

      const prev = await fetchTodoMine(pool, todoIdBig, gaId, userId)
      if (!prev) {
        res.status(404).json({ message: '할 일을 찾을 수 없습니다.' })
        return
      }

      const body = req.body ?? {}
      const sets = []
      /** @type {unknown[]} */
      const params = []
      let p = 1

      if (typeof body.title === 'string') {
        const t = body.title.trim()
        if (!t) {
          res.status(400).json({ message: '제목을 비울 수 없습니다.' })
          return
        }
        sets.push(`title = $${p++}`)
        params.push(t.slice(0, 500))
      }
      if (typeof body.description === 'string') {
        sets.push(`description = $${p++}`)
        params.push(String(body.description).slice(0, 20000))
      }
      if ('dueDate' in body || 'due_date' in body) {
        const d = body.dueDate ?? body.due_date
        if (d == null || d === '') {
          sets.push('due_date = NULL')
        } else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
          sets.push(`due_date = $${p++}`)
          params.push(d.trim())
        } else {
          res.status(400).json({ message: '마감일 형식이 올바르지 않습니다.' })
          return
        }
      }

      if ('dueTime' in body || 'due_time' in body) {
        const t = body.dueTime ?? body.due_time
        if (t == null || t === '') {
          sets.push('due_time = NULL')
        } else if (typeof t === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(t.trim())) {
          sets.push(`due_time = $${p++}::time`)
          params.push(t.trim().slice(0, 5))
        } else {
          res.status(400).json({ message: '시간 형식이 올바르지 않습니다.' })
          return
        }
      }

      let nextRelType = prev.related_entity_type ?? null
      let nextRelId = prev.related_entity_id != null ? String(prev.related_entity_id) : null
      if ('relatedEntityType' in body || 'related_entity_type' in body) {
        const raw = body.relatedEntityType ?? body.related_entity_type
        nextRelType =
          typeof raw === 'string' && raw.trim()
            ? raw.trim().toLowerCase()
            : raw === null
              ? null
              : prev.related_entity_type
      }
      if ('relatedEntityId' in body || 'related_entity_id' in body) {
        const rid = body.relatedEntityId ?? body.related_entity_id ?? null
        nextRelId = rid != null && String(rid).trim() ? String(rid).trim() : null
      }
      const relHandled =
        'relatedEntityType' in body ||
        'related_entity_type' in body ||
        'relatedEntityId' in body ||
        'related_entity_id' in body

      if (relHandled) {
        if (nextRelType && !RELATED_TYPES.has(nextRelType)) {
          res.status(400).json({ message: '연결 대상 종류 값이 올바르지 않습니다.' })
          return
        }
        const linkCheck = await validateCustomerTodoLink(pool, safeQuery, req, gaId, nextRelType, nextRelId)
        if (!linkCheck.ok) {
          res.status(linkCheck.status ?? 400).json({ message: linkCheck.msg ?? '연결 검증 실패' })
          return
        }
        sets.push(`related_entity_type = $${p++}`)
        params.push(nextRelType)
        sets.push(`related_entity_id = $${p++}`)
        params.push(nextRelId)
      }

      if ('priority' in body) {
        const pr = String(body.priority ?? 'normal').trim().toLowerCase()
        sets.push(`priority = $${p++}`)
        params.push(PRIORITIES.has(pr) ? pr : 'normal')
      }

      if ('status' in body) {
        const st = String(body.status ?? '').trim().toLowerCase()
        if (!STATUSES.has(st)) {
          res.status(400).json({ message: '상태 값이 올바르지 않습니다.' })
          return
        }
        sets.push(`status = $${p++}`)
        params.push(st)
        if (st === 'completed') {
          sets.push('completed_at = NOW()')
          sets.push('canceled_at = NULL')
        } else if (st === 'canceled') {
          sets.push('canceled_at = NOW()')
          sets.push('completed_at = NULL')
        } else {
          sets.push('completed_at = NULL')
          sets.push('canceled_at = NULL')
        }
      }

      if ('metadata' in body) {
        sets.push(`metadata = $${p++}::jsonb`)
        params.push(JSON.stringify(body.metadata ?? {}))
      }

      if (sets.length === 0) {
        res.status(400).json({ message: '변경 내용이 없습니다.' })
        return
      }
      sets.push('updated_at = NOW()')

      const idPhStart = p
      params.push(todoIdBig, gaId, userId)

      await safeQuery(
        pool,
        `
        UPDATE todos
        SET ${sets.join(', ')}
        WHERE id = $${idPhStart}::bigint AND ga_id = $${idPhStart + 1}
          AND (owner_user_id = $${idPhStart + 2} OR assignee_user_id = $${idPhStart + 2})
        `,
        params,
      )

      const next = await fetchTodoMine(pool, todoIdBig, gaId, userId)
      if (!next) {
        res.status(404).json({ message: '할 일을 찾을 수 없습니다.' })
        return
      }
      const enriched = await enrichCustomerName(pool, gaId, next)
      res.json(mapTodoRow(enriched))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/todos/:todoId/complete', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const todoIdBig = Number(req.params.todoId)
      if (!Number.isFinite(todoIdBig) || todoIdBig < 1) {
        res.status(400).json({ message: '유효한 할 일 식별자가 아닙니다.' })
        return
      }

      await safeQuery(
        pool,
        `
        UPDATE todos
        SET status = 'completed', completed_at = NOW(), canceled_at = NULL, updated_at = NOW()
        WHERE id = $1::bigint AND ga_id = $2
          AND (owner_user_id = $3 OR assignee_user_id = $3)
          AND status <> 'canceled'
        `,
        [todoIdBig, gaId, userId],
      )

      const next = await fetchTodoMine(pool, todoIdBig, gaId, userId)
      if (!next || next.status !== 'completed') {
        res.status(404).json({ message: '할 일을 찾을 수 없거나 완료 처리할 수 없습니다.' })
        return
      }
      const enriched = await enrichCustomerName(pool, gaId, next)
      res.json(mapTodoRow(enriched))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/todos/:todoId/reopen', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const todoIdBig = Number(req.params.todoId)
      if (!Number.isFinite(todoIdBig) || todoIdBig < 1) {
        res.status(400).json({ message: '유효한 할 일 식별자가 아닙니다.' })
        return
      }

      await safeQuery(
        pool,
        `
        UPDATE todos
        SET status = 'pending', completed_at = NULL, updated_at = NOW()
        WHERE id = $1::bigint AND ga_id = $2
          AND (owner_user_id = $3 OR assignee_user_id = $3)
          AND status = 'completed'
        `,
        [todoIdBig, gaId, userId],
      )

      const next = await fetchTodoMine(pool, todoIdBig, gaId, userId)
      if (!next || next.status !== 'pending') {
        res.status(404).json({ message: '할 일을 찾을 수 없거나 완료 취소할 수 없습니다.' })
        return
      }
      const enriched = await enrichCustomerName(pool, gaId, next)
      res.json(mapTodoRow(enriched))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/todos/:todoId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = resolveGaIdStrict(req, res)
      if (gaId == null) return

      const todoIdBig = Number(req.params.todoId)
      if (!Number.isFinite(todoIdBig) || todoIdBig < 1) {
        res.status(400).json({ message: '유효한 할 일 식별자가 아닙니다.' })
        return
      }

      const r = await safeQuery(
        pool,
        `
        DELETE FROM todos
        WHERE id = $1::bigint AND ga_id = $2
          AND (owner_user_id = $3 OR assignee_user_id = $3)
        RETURNING id
        `,
        [todoIdBig, gaId, userId],
      )
      if ((r.rowCount ?? 0) < 1) {
        res.status(404).json({ message: '할 일을 찾을 수 없습니다.' })
        return
      }
      res.status(204).end()
    } catch (error) {
      handleDbError(error, req, res)
    }
  })
}
