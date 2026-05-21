import { safeQuery } from '../utils/dbSafeQuery.js'
import { r2DeleteStorageObjectOrThrow, r2StorageObjectExists } from './consentStorage.js'

/**
 * 오래된 uploading / failed 파일 행을 정리한다.
 * - uploading: 만료 시 R2 존재 여부 확인 후 R2 삭제(있을 때만)·DB 행 삭제
 * - failed: 오래된 행은 DB 삭제 + R2에 남아 있으면 삭제 시도
 *
 * R2 버킷 전체 목록(list)은 사용하지 않는다.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   gaId: number
 *   uploadingOlderThanMinutes?: number
 *   failedOlderThanHours?: number
 *   batchLimit?: number
 * }} opts
 */
export async function runStorageUploadOrphanCleanup(pool, opts) {
  const gaId = opts.gaId
  const uploadingOlderThanMinutes =
    Number.isFinite(opts.uploadingOlderThanMinutes) && opts.uploadingOlderThanMinutes >= 1
      ? Math.floor(opts.uploadingOlderThanMinutes)
      : 20
  const failedOlderThanHours =
    Number.isFinite(opts.failedOlderThanHours) && opts.failedOlderThanHours >= 1
      ? Math.floor(opts.failedOlderThanHours)
      : 168
  const batchLimit =
    Number.isFinite(opts.batchLimit) && opts.batchLimit >= 1
      ? Math.min(Math.floor(opts.batchLimit), 500)
      : 80

  if (!Number.isInteger(gaId) || gaId < 1) {
    throw new Error('gaId가 올바르지 않습니다.')
  }

  /** @type {{ uploading: number; failed: number; r2Deleted: number; errors: string[] }} */
  const stats = { uploading: 0, failed: 0, r2Deleted: 0, errors: [] }

  const uploadingRows = await safeQuery(
    pool,
    `
    SELECT id, file_path
    FROM files
    WHERE ga_id = $1
      AND status = 'uploading'
      AND deleted_at IS NULL
      AND created_at < NOW() - ($2::integer * INTERVAL '1 minute')
    ORDER BY created_at ASC
    LIMIT $3
    `,
    [gaId, uploadingOlderThanMinutes, batchLimit],
  )

  for (const row of uploadingRows.rows) {
    const id = Number(row.id)
    const objectKey = row.file_path != null ? String(row.file_path).trim() : ''
    if (!Number.isInteger(id) || id < 1 || !objectKey) {
      continue
    }
    stats.uploading += 1
    try {
      const exists = await r2StorageObjectExists(objectKey)
      if (exists) {
        await r2DeleteStorageObjectOrThrow(objectKey)
        stats.r2Deleted += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      stats.errors.push(`uploading#${id}: ${msg}`)
      console.warn('[storage orphan cleanup] uploading R2 처리 실패', id, objectKey, e)
      continue
    }
    await safeQuery(
      pool,
      `
      DELETE FROM files
      WHERE id = $1
        AND ga_id = $2
        AND status = 'uploading'
      `,
      [id, gaId],
    )
  }

  const failedRows = await safeQuery(
    pool,
    `
    SELECT id, file_path
    FROM files
    WHERE ga_id = $1
      AND status = 'failed'
      AND deleted_at IS NULL
      AND created_at < NOW() - ($2::integer * INTERVAL '1 hour')
    ORDER BY created_at ASC
    LIMIT $3
    `,
    [gaId, failedOlderThanHours, batchLimit],
  )

  for (const row of failedRows.rows) {
    const id = Number(row.id)
    const objectKey = row.file_path != null ? String(row.file_path).trim() : ''
    if (!Number.isInteger(id) || id < 1 || !objectKey) {
      continue
    }
    stats.failed += 1
    try {
      const exists = await r2StorageObjectExists(objectKey)
      if (exists) {
        await r2DeleteStorageObjectOrThrow(objectKey)
        stats.r2Deleted += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      stats.errors.push(`failed#${id}: ${msg}`)
      console.warn('[storage orphan cleanup] failed R2 처리 실패', id, objectKey, e)
      continue
    }
    await safeQuery(
      pool,
      `
      DELETE FROM files
      WHERE id = $1
        AND ga_id = $2
        AND status = 'failed'
      `,
      [id, gaId],
    )
  }

  return stats
}
