const SEOUL_TZ = 'Asia/Seoul'

/**
 * 서울 달력 기준 YYYY-MM-DD (Intl, Node 런타임)
 * @param {Date} [now]
 */
export function getSeoulDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) {
    throw new Error('[analytics] Seoul date formatting failed')
  }
  return `${y}-${m}-${d}`
}

/**
 * 서울 기준 "어제" YYYY-MM-DD
 * @param {Date} [now]
 */
export function getSeoulYesterdayDateString(now = new Date()) {
  const today = getSeoulDateString(now)
  const [y, m, d] = today.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() - 1)
  const y2 = t.getUTCFullYear()
  const m2 = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(t.getUTCDate()).padStart(2, '0')
  return `${y2}-${m2}-${d2}`
}

/**
 * @param {string} ymd YYYY-MM-DD (서울 달력)
 * @param {number} deltaDays
 */
export function seoulYmdAddDays(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + deltaDays)
  const y2 = t.getUTCFullYear()
  const m2 = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(t.getUTCDate()).padStart(2, '0')
  return `${y2}-${m2}-${d2}`
}
