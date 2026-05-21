import { safeQuery } from '../utils/dbSafeQuery.js'

/**
 * files 테이블 합산으로 해당 GA 테넌트의 users.storage_used / teams.storage_used 를 재설정한다.
 * 관리자 복구용 — 일반 코드에서 storage_used 를 임의 UPDATE 하지 않는다.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 */
export async function recalculateStorageUsedForGa(pool, gaId) {
  if (!Number.isInteger(gaId) || gaId < 1) {
    throw new Error('gaId가 올바르지 않습니다.')
  }
  await safeQuery(
    pool,
    `
    UPDATE users u
    SET storage_used = COALESCE(
      (
        SELECT SUM(f.file_size)::bigint
        FROM files f
        WHERE f.user_id = u.id
          AND f.ga_id = u.ga_id
          AND f.status = 'active'
          AND f.team_id IS NULL
          AND f.deleted_at IS NULL
      ),
      0
    )
    WHERE u.ga_id = $1
    `,
    [gaId],
  )
  await safeQuery(
    pool,
    `
    UPDATE teams t
    SET storage_used = COALESCE(
      (
        SELECT SUM(f.file_size)::bigint
        FROM files f
        WHERE f.team_id = t.id
          AND f.ga_id = t.ga_id
          AND f.status = 'active'
          AND f.deleted_at IS NULL
      ),
      0
    )
    WHERE t.ga_id = $1
    `,
    [gaId],
  )
  return { ok: true, gaId }
}
