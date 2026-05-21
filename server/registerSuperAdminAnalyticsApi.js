import { getSeoulYesterdayDateString, seoulYmdAddDays } from './lib/analyticsDates.js'

const METRIC_KEYS = [
  'total_users',
  'daily_active_users',
  'weekly_active_users',
  'new_users',
  'customers_created',
  'documents_created',
  'team_messages_created',
]

const COLUMN_BY_METRIC = {
  total_users: 'total_users',
  daily_active_users: 'daily_active_users',
  weekly_active_users: 'weekly_active_users',
  new_users: 'new_users',
  customers_created: 'customers_created',
  documents_created: 'documents_created',
  team_messages_created: 'team_messages_created',
}

function clampEndToYesterday(endRaw, yesterday) {
  if (!endRaw || endRaw <= yesterday) {
    return endRaw
  }
  return yesterday
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.requireSuperAdmin
 * @param {Function} ctx.handleDbError
 * @param {Function} ctx.systemQuery
 */
export function registerSuperAdminAnalyticsApi(apiRouter, ctx) {
  const { pool, requireAuth, requireSuperAdmin, handleDbError, systemQuery } = ctx

  apiRouter.get('/admin/analytics/dashboard', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const statDate = getSeoulYesterdayDateString()
      const gaCountRes = await systemQuery(
        pool,
        `SELECT COUNT(*) AS c FROM ga_companies WHERE is_deleted = false`,
      )
      const gaTotalCount = Number(gaCountRes.rows[0]?.c ?? 0)

      const overallRes = await systemQuery(
        pool,
        `
        SELECT
          total_users, daily_active_users, weekly_active_users, new_users,
          customers_created, documents_created, team_messages_created
        FROM analytics_daily_stats
        WHERE stat_date = $1 AND scope_type = 'overall'
        LIMIT 1
        `,
        [statDate],
      )
      const overallRow = overallRes.rows[0]
      const emptyOverall = {
        total_users: 0,
        daily_active_users: 0,
        weekly_active_users: 0,
        new_users: 0,
        customers_created: 0,
        documents_created: 0,
        team_messages_created: 0,
      }
      const overall = overallRow
        ? {
            total_users: Number(overallRow.total_users ?? 0),
            daily_active_users: Number(overallRow.daily_active_users ?? 0),
            weekly_active_users: Number(overallRow.weekly_active_users ?? 0),
            new_users: Number(overallRow.new_users ?? 0),
            customers_created: Number(overallRow.customers_created ?? 0),
            documents_created: Number(overallRow.documents_created ?? 0),
            team_messages_created: Number(overallRow.team_messages_created ?? 0),
          }
        : emptyOverall

      const gaRowsRes = await systemQuery(
        pool,
        `
        SELECT
          s.ga_id AS "gaId",
          g.code AS "gaCode",
          g.name AS "gaName",
          s.total_users AS "totalUsers",
          s.daily_active_users AS "dailyActiveUsers",
          s.weekly_active_users AS "weeklyActiveUsers",
          s.new_users AS "newUsers",
          s.customers_created AS "customersCreated",
          s.documents_created AS "documentsCreated",
          s.team_messages_created AS "teamMessagesCreated"
        FROM analytics_daily_stats s
        INNER JOIN ga_companies g ON g.id = s.ga_id
        WHERE s.stat_date = $1 AND s.scope_type = 'ga' AND g.is_deleted = false
        ORDER BY g.code ASC NULLS LAST, g.name ASC
        `,
        [statDate],
      )

      res.json({
        statDate,
        gaTotalCount,
        overall,
        gaRows: gaRowsRes.rows,
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/admin/analytics/chart', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const yesterday = getSeoulYesterdayDateString()
      let from = String(req.query.from ?? '').trim()
      let to = String(req.query.to ?? '').trim()
      const metric = String(req.query.metric ?? 'daily_active_users').trim()
      const scope = String(req.query.scope ?? 'overall').trim().toLowerCase()
      const gaIdRaw = req.query.gaId ?? req.query.ga_id
      const gaId =
        gaIdRaw == null || gaIdRaw === '' ? null : Number.parseInt(String(gaIdRaw), 10)

      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        from = seoulYmdAddDays(yesterday, -13)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        to = yesterday
      }
      if (from > to) {
        const t = from
        from = to
        to = t
      }
      to = clampEndToYesterday(to, yesterday)
      if (from > to) {
        from = to
      }
      if (!METRIC_KEYS.includes(metric)) {
        res.status(400).json({ message: '유효하지 않은 metric입니다.' })
        return
      }
      if (scope !== 'overall' && scope !== 'ga') {
        res.status(400).json({ message: 'scope는 overall 또는 ga 여야 합니다.' })
        return
      }
      if (scope === 'ga' && (!Number.isInteger(gaId) || gaId < 1)) {
        res.status(400).json({ message: 'GA 통계는 gaId가 필요합니다.' })
        return
      }

      const col = COLUMN_BY_METRIC[metric]

      const rows =
        scope === 'overall'
          ? (
              await systemQuery(
                pool,
                `
                SELECT CAST(stat_date AS text) AS date, CAST(${col} AS double precision) AS value
                FROM analytics_daily_stats
                WHERE scope_type = 'overall'
                  AND stat_date BETWEEN $1 AND $2
                ORDER BY stat_date ASC
                `,
                [from, to],
              )
            ).rows
          : (
              await systemQuery(
                pool,
                `
                SELECT CAST(stat_date AS text) AS date, CAST(${col} AS double precision) AS value
                FROM analytics_daily_stats
                WHERE scope_type = 'ga' AND ga_id = $3
                  AND stat_date BETWEEN $1 AND $2
                ORDER BY stat_date ASC
                `,
                [from, to, gaId],
              )
            ).rows

      res.json({
        statDateCap: yesterday,
        metric,
        scope,
        gaId: scope === 'ga' ? gaId : null,
        points: rows.map((r) => ({ date: r.date, value: Number(r.value ?? 0) })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/admin/analytics/ga-options', requireAuth, requireSuperAdmin, async (_req, res) => {
    try {
      const r = await systemQuery(
        pool,
        `
        SELECT id, code, name
        FROM ga_companies
        WHERE is_deleted = false
        ORDER BY code ASC NULLS LAST, name ASC
        `,
      )
      res.json(r.rows)
    } catch (error) {
      handleDbError(error, _req, res)
    }
  })
}
