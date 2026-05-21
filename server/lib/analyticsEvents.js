import { systemQuery } from '../utils/dbSafeQuery.js'

export const ANALYTICS_EVENT_TYPES = Object.freeze([
  'login',
  'customer_created',
  'document_created',
  'team_message_created',
])

/**
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, gaId: number | null, eventType: string }} opts
 */
export function recordAnalyticsEvent(pool, { userId, gaId, eventType }) {
  if (!ANALYTICS_EVENT_TYPES.includes(eventType)) {
    return
  }
  const uid = String(userId ?? '').trim()
  if (!uid) {
    return
  }
  const gid = gaId == null || !Number.isFinite(Number(gaId)) ? null : Number(gaId)
  void systemQuery(
    pool,
    `
    INSERT INTO analytics_events (user_id, ga_id, event_type)
    VALUES ($1, $2, $3)
    `,
    [uid, gid, eventType],
  ).catch((e) => {
    console.error('[analytics_events] insert failed', e)
  })
}
