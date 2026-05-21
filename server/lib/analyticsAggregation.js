import { getSeoulYesterdayDateString, seoulYmdAddDays } from './analyticsDates.js'

/**
 * 전일(또는 지정일) 기준일의 집계를 채운다. 동일 stat_date 기존 행은 삭제 후 재작성.
 *
 * @param {import('pg').Pool} pool
 * @param {string} statDate YYYY-MM-DD (Asia/Seoul 달력)
 */
export async function runAnalyticsAggregationForStatDate(pool, statDate) {
  const wauStart = seoulYmdAddDays(statDate, -6)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM analytics_daily_stats WHERE stat_date = $1`, [statDate])

    const overall = await computeMetricsForScope(client, statDate, wauStart, null)
    await client.query(
      `
      INSERT INTO analytics_daily_stats (
        stat_date, scope_type, ga_id,
        total_users, daily_active_users, weekly_active_users, new_users,
        customers_created, documents_created, team_messages_created
      ) VALUES ($1, 'overall', NULL, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        statDate,
        overall.total_users,
        overall.daily_active_users,
        overall.weekly_active_users,
        overall.new_users,
        overall.customers_created,
        overall.documents_created,
        overall.team_messages_created,
      ],
    )

    const gaRes = await client.query(
      `
      SELECT id
      FROM ga_companies
      WHERE is_deleted = false
      ORDER BY id ASC
      `,
    )
    for (const row of gaRes.rows) {
      const gid = Number(row.id)
      if (!Number.isInteger(gid) || gid < 1) {
        continue
      }
      const m = await computeMetricsForScope(client, statDate, wauStart, gid)
      await client.query(
        `
        INSERT INTO analytics_daily_stats (
          stat_date, scope_type, ga_id,
          total_users, daily_active_users, weekly_active_users, new_users,
          customers_created, documents_created, team_messages_created
        ) VALUES ($1, 'ga', $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          statDate,
          gid,
          m.total_users,
          m.daily_active_users,
          m.weekly_active_users,
          m.new_users,
          m.customers_created,
          m.documents_created,
          m.team_messages_created,
        ],
      )
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} statDate
 * @param {string} wauStart
 * @param {number | null} gaId
 */
async function computeMetricsForScope(client, statDate, wauStart, gaId) {
  const totalUsersRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(*) AS c
          FROM users
          WHERE is_deleted = false
            AND LOWER(COALESCE(status, 'active')) IN ('active', 'reset')
          `,
        )
      : await client.query(
          `
          SELECT COUNT(*) AS c
          FROM users
          WHERE is_deleted = false
            AND LOWER(COALESCE(status, 'active')) IN ('active', 'reset')
            AND ga_id = $1
          `,
          [gaId],
        )
  const total_users = Number(totalUsersRes.rows[0]?.c ?? 0)

  const newUsersRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(*) AS c FROM users
          WHERE is_deleted = false
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate],
        )
      : await client.query(
          `
          SELECT COUNT(*) AS c FROM users
          WHERE is_deleted = false AND ga_id = $2
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate, gaId],
        )
  const new_users = Number(newUsersRes.rows[0]?.c ?? 0)

  const customersRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(*) AS c FROM customers
          WHERE deleted_at IS NULL
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate],
        )
      : await client.query(
          `
          SELECT COUNT(*) AS c FROM customers
          WHERE deleted_at IS NULL AND ga_id = $2
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate, gaId],
        )
  const customers_created = Number(customersRes.rows[0]?.c ?? 0)

  const formsRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(*) AS c FROM insurance_forms
          WHERE CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate],
        )
      : await client.query(
          `
          SELECT COUNT(*) AS c FROM insurance_forms
          WHERE ga_id = $2
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate, gaId],
        )
  const documents_created = Number(formsRes.rows[0]?.c ?? 0)

  const consultRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(*) AS c FROM customer_consultations
          WHERE CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate],
        )
      : await client.query(
          `
          SELECT COUNT(*) AS c FROM customer_consultations
          WHERE ga_id = $2
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate, gaId],
        )
  const team_messages_created = Number(consultRes.rows[0]?.c ?? 0)

  const dauRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(DISTINCT user_id) AS c FROM analytics_events
          WHERE event_type = 'login'
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate],
        )
      : await client.query(
          `
          SELECT COUNT(DISTINCT user_id) AS c FROM analytics_events
          WHERE event_type = 'login' AND ga_id = $2
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) = $1
          `,
          [statDate, gaId],
        )
  const daily_active_users = Number(dauRes.rows[0]?.c ?? 0)

  const wauRes =
    gaId == null
      ? await client.query(
          `
          SELECT COUNT(DISTINCT user_id) AS c FROM analytics_events
          WHERE event_type = 'login'
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) BETWEEN $1 AND $2
          `,
          [wauStart, statDate],
        )
      : await client.query(
          `
          SELECT COUNT(DISTINCT user_id) AS c FROM analytics_events
          WHERE event_type = 'login' AND ga_id = $3
            AND CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date) BETWEEN $1 AND $2
          `,
          [wauStart, statDate, gaId],
        )
  const weekly_active_users = Number(wauRes.rows[0]?.c ?? 0)

  return {
    total_users,
    daily_active_users,
    weekly_active_users,
    new_users,
    customers_created,
    documents_created,
    team_messages_created,
  }
}

/** @param {import('pg').Pool} pool */
export async function ensureYesterdayAnalyticsAggregated(pool) {
  const y = getSeoulYesterdayDateString()
  const exists = await pool.query(
    `
    SELECT 1 FROM analytics_daily_stats
    WHERE stat_date = $1 AND scope_type = 'overall'
    LIMIT 1
    `,
    [y],
  )
  if (exists.rowCount > 0) {
    return
  }
  try {
    await runAnalyticsAggregationForStatDate(pool, y)
    console.log(`[analytics] backfilled daily stats for ${y}`)
  } catch (e) {
    console.error('[analytics] backfill failed', e)
  }
}
