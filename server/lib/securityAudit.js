import { systemQuery } from '../utils/dbSafeQuery.js'

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {object} row
 * @param {string} row.actorUserId
 * @param {string} row.actorRole
 * @param {string} row.action
 * @param {string} [row.targetType]
 * @param {string} [row.targetId]
 * @param {number | null} [row.gaId]
 * @param {number | null} [row.companyId]
 * @param {object} [row.meta]
 */
export async function writeSecurityAudit(executor, row) {
  const metaJson = row.meta != null ? JSON.stringify(row.meta) : null
  await systemQuery(
    executor,
    `
    INSERT INTO security_audit_logs (
      actor_user_id, actor_role, action, target_type, target_id, ga_id, company_id, meta
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS jsonb))
    `,
    [
      String(row.actorUserId ?? '').slice(0, 200),
      String(row.actorRole ?? '').slice(0, 64),
      String(row.action ?? '').slice(0, 128),
      row.targetType != null ? String(row.targetType).slice(0, 64) : null,
      row.targetId != null ? String(row.targetId).slice(0, 128) : null,
      row.gaId != null && Number.isInteger(row.gaId) ? row.gaId : null,
      row.companyId != null && Number.isInteger(row.companyId) ? row.companyId : null,
      metaJson,
    ],
  )
}

/** 실패해도 요청 흐름을 막지 않는 래퍼 */
export async function logSecurityEvent(executor, row) {
  try {
    await writeSecurityAudit(executor, row)
  } catch (e) {
    console.error('[logSecurityEvent]', e)
  }
}
