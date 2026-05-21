import pool from '../db.js'
import { initDb } from '../initDb.js'
import { getSeoulYesterdayDateString } from '../lib/analyticsDates.js'
import { runAnalyticsAggregationForStatDate } from '../lib/analyticsAggregation.js'

const arg = process.argv[2]?.trim()
let statDate
if (!arg || arg === '--yesterday') {
  statDate = getSeoulYesterdayDateString()
} else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  statDate = arg
} else {
  console.error('Usage: node server/scripts/runAnalyticsAggregation.mjs [YYYY-MM-DD | --yesterday]')
  process.exit(1)
}

await initDb()
try {
  await runAnalyticsAggregationForStatDate(pool, statDate)
  console.log(`[analytics] aggregated ${statDate}`)
  const cap = getSeoulYesterdayDateString()
  if (statDate > cap) {
    console.warn(`[analytics] 참고: 오늘 이후 날짜는 집계하지 않는 것이 운영 규칙입니다. cap(전일)=${cap}`)
  }
} finally {
  await pool.end()
}
