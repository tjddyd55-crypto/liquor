import { getSeoulDateString, getSeoulYesterdayDateString } from './analyticsDates.js'
import { runAnalyticsAggregationForStatDate } from './analyticsAggregation.js'

/**
 * 매 정각 근처에 한 번씩 호출. 서울 03시대에 어제분 집계를 실행한다(중복 방지 키는 집계 함수의 DELETE).
 * @param {import('pg').Pool} pool
 * @param {{ lastRunSeoulYmd: string | null }} state
 */
export async function tickAnalyticsAggregationScheduler(pool, state) {
  const now = new Date()
  const hourPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now).find((p) => p.type === 'hour')
  const seoulHour = hourPart ? Number(hourPart.value) : -1
  if (!Number.isInteger(seoulHour) || seoulHour !== 3) {
    return
  }
  const ymd = getSeoulDateString(now)
  if (state.lastRunSeoulYmd === ymd) {
    return
  }
  const yesterday = getSeoulYesterdayDateString(now)
  try {
    await runAnalyticsAggregationForStatDate(pool, yesterday)
    state.lastRunSeoulYmd = ymd
    console.log(`[analytics] scheduled aggregation ok for ${yesterday} (tick ${ymd})`)
  } catch (e) {
    console.error('[analytics] scheduled aggregation failed', e)
  }
}
