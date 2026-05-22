/**
 * 주류 CRM 거래처 첨부문서 API (presign / confirm / download / delete).
 */
import {
  consentGetSignedDownloadUrl,
  getR2InsurerAttachmentsCacheControl,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2DeleteStorageObjectOrThrow,
  r2GetPresignedPutUrl,
} from '../lib/consentStorage.js'
import { assertLiquorCustomerAccess, resolveLiquorGaId } from '../lib/liquorCustomers/access.js'
import {
  assertLiquorCustomerFileObjectKey,
  buildLiquorCustomerFileObjectKey,
} from '../lib/liquorCustomers/liquorCustomerFileStorage.js'
import {
  isValidLiquorCustomerFileName,
  LIQUOR_CUSTOMER_FILE_ALLOWED_MIME,
  LIQUOR_CUSTOMER_FILE_BLOCKED_MIME,
  LIQUOR_CUSTOMER_FILE_MAX_BYTES,
  LIQUOR_CUSTOMER_FILE_MEMO_MAX,
  LIQUOR_CUSTOMER_FILE_TITLE_MAX,
  mapLiquorCustomerFileRow,
  normalizeLiquorCustomerFileName,
  normalizeLiquorDocumentKind,
  parseLiquorCustomerFileLinkIds,
  resolveLiquorCustomerFileContentType,
} from '../lib/liquorCustomers/liquorCustomerFiles.js'

function parseId(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} customerId
 * @param {{ supportContractId?: number|null, repaymentId?: number|null, supportItemId?: number|null }} link
 */
async function assertLiquorFileLinkTargets(pool, customerId, link) {
  if (link.supportContractId != null) {
    const r = await pool.query(
      `SELECT id FROM liquor_support_contracts WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [link.supportContractId, customerId],
    )
    if (!r.rowCount) return { ok: false, message: '지원계약을 찾을 수 없습니다.' }
  }
  if (link.repaymentId != null) {
    const r = await pool.query(
      `SELECT id FROM liquor_repayments WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [link.repaymentId, customerId],
    )
    if (!r.rowCount) return { ok: false, message: '상환내역을 찾을 수 없습니다.' }
  }
  if (link.supportItemId != null) {
    const r = await pool.query(
      `SELECT id FROM liquor_support_items WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [link.supportItemId, customerId],
    )
    if (!r.rowCount) return { ok: false, message: '지원물품을 찾을 수 없습니다.' }
  }
  return { ok: true }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, handleDbError: Function, chain: import('express').RequestHandler[] }} ctx
 */
export function registerLiquorCustomerFileApi(apiRouter, ctx) {
  const { pool, handleDbError, chain } = ctx

  apiRouter.post('/liquor/customers/:customerId/files/presign', ...chain, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ ok: false, message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!customerId || gaId == null || !userId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }

      const body = req.body ?? {}
      const fileName = normalizeLiquorCustomerFileName(body.fileName ?? body.file_name ?? '')
      const contentType = resolveLiquorCustomerFileContentType(
        body.contentType ?? body.content_type ?? body.mimeType,
      )
      const sizeBytes = Number(body.sizeBytes ?? body.size ?? body.fileSize ?? 0)

      if (!isValidLiquorCustomerFileName(fileName)) {
        res.status(400).json({ ok: false, message: '파일 이름이 올바르지 않습니다.' })
        return
      }
      if (LIQUOR_CUSTOMER_FILE_BLOCKED_MIME.has(contentType) || !LIQUOR_CUSTOMER_FILE_ALLOWED_MIME.has(contentType)) {
        res.status(400).json({ ok: false, message: '허용되지 않는 파일 형식입니다.' })
        return
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > LIQUOR_CUSTOMER_FILE_MAX_BYTES) {
        res.status(400).json({ ok: false, message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }

      const client = await pool.connect()
      let fileId = 0
      let objectKey = ''
      try {
        await client.query('BEGIN')
        const quota = await client.query(
          `SELECT storage_used, storage_limit FROM users WHERE id = $1 AND ga_id = $2 FOR UPDATE`,
          [userId, gaId],
        )
        if (!quota.rowCount) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '사용자 정보를 확인할 수 없습니다.' })
          return
        }
        const pending = await client.query(
          `
          SELECT COALESCE(SUM(file_size), 0)::bigint AS pending_bytes
          FROM files
          WHERE user_id = $1 AND ga_id = $2 AND team_id IS NULL AND deleted_at IS NULL AND status = 'uploading'
          `,
          [userId, gaId],
        )
        const used = Number(quota.rows[0].storage_used)
        const limit = Number(quota.rows[0].storage_limit)
        const pendingBytes = Number(pending.rows[0]?.pending_bytes ?? 0)
        if (!Number.isFinite(used) || !Number.isFinite(limit) || used + pendingBytes + sizeBytes > limit) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '저장 공간 한도를 초과했습니다.' })
          return
        }

        const ins = await client.query(
          `
          INSERT INTO files (
            user_id, ga_id, customer_id, team_id, folder_id,
            original_name, display_name, file_path, file_size, mime_type,
            content, is_confirmed, status, created_at
          ) VALUES ($1, $2, $3, NULL, NULL, $4, $5, '', $6, $7, '', false, 'uploading', NOW())
          RETURNING id
          `,
          [userId, gaId, customerId, fileName, fileName, sizeBytes, contentType],
        )
        fileId = Number(ins.rows[0].id)
        objectKey = buildLiquorCustomerFileObjectKey({ gaId, customerId, fileId, fileName })
        await client.query(`UPDATE files SET file_path = $2 WHERE id = $1`, [fileId, objectKey])
        await client.query('COMMIT')
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        handleDbError(e, req, res)
        return
      } finally {
        client.release()
      }

      const cacheControl = getR2InsurerAttachmentsCacheControl()
      let uploadUrl = ''
      try {
        uploadUrl = (await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })) || ''
      } catch (e) {
        console.warn('[LIQUOR_FILE_PRESIGN_URL_FAIL]', fileId, objectKey, e)
      }
      if (!uploadUrl) {
        await pool.query(`DELETE FROM files WHERE id = $1 AND status = 'uploading' AND user_id = $2`, [fileId, userId])
        res.status(503).json({ ok: false, message: '업로드 URL을 만들 수 없습니다.' })
        return
      }

      const putHeaders = cacheControl ? { 'Cache-Control': cacheControl } : {}
      res.status(201).json({
        ok: true,
        data: {
          fileId,
          uploadUrl,
          objectKey,
          putHeaders,
          fileName,
          customerId,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/liquor/customers/:customerId/files', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!customerId || gaId == null || !userId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }

      const body = req.body ?? {}
      const fileId = parseId(body.fileId ?? body.file_id ?? body.uploadFileId)
      const objectKey = String(body.objectKey ?? body.object_key ?? '').trim()
      const fileName = normalizeLiquorCustomerFileName(body.fileName ?? body.file_name ?? body.originalName ?? '')
      const fileSize = Number(body.size ?? body.fileSize ?? body.file_size ?? 0)
      const mimeType = resolveLiquorCustomerFileContentType(body.mimeType ?? body.mime_type ?? body.contentType)
      const documentKind = normalizeLiquorDocumentKind(body.documentKind ?? body.document_kind)
      const title = String(body.title ?? '').trim().slice(0, LIQUOR_CUSTOMER_FILE_TITLE_MAX)
      const memo = String(body.memo ?? body.description ?? '').trim().slice(0, LIQUOR_CUSTOMER_FILE_MEMO_MAX)
      const link = parseLiquorCustomerFileLinkIds(body)

      if (!fileId) {
        res.status(400).json({ ok: false, message: 'fileId가 필요합니다.' })
        return
      }
      if (!objectKey) {
        res.status(400).json({ ok: false, message: 'object key가 필요합니다.' })
        return
      }
      if (!isValidLiquorCustomerFileName(fileName)) {
        res.status(400).json({ ok: false, message: '파일 이름이 올바르지 않습니다.' })
        return
      }
      if (!assertLiquorCustomerFileObjectKey(objectKey, { gaId, customerId, fileId })) {
        res.status(400).json({ ok: false, message: '허용되지 않은 저장 경로입니다.' })
        return
      }
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > LIQUOR_CUSTOMER_FILE_MAX_BYTES) {
        res.status(400).json({ ok: false, message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }
      if (LIQUOR_CUSTOMER_FILE_BLOCKED_MIME.has(mimeType) || !LIQUOR_CUSTOMER_FILE_ALLOWED_MIME.has(mimeType)) {
        res.status(400).json({ ok: false, message: '허용되지 않는 파일 형식입니다.' })
        return
      }

      const linkCheck = await assertLiquorFileLinkTargets(pool, customerId, link)
      if (!linkCheck.ok) {
        res.status(400).json({ ok: false, message: linkCheck.message })
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const fileRow = await client.query(
          `
          SELECT id, file_path, file_size, mime_type, status, customer_id
          FROM files
          WHERE id = $1 AND user_id = $2 AND ga_id = $3 AND deleted_at IS NULL
          FOR UPDATE
          `,
          [fileId, userId, gaId],
        )
        if (!fileRow.rowCount) {
          await client.query('ROLLBACK')
          res.status(404).json({ ok: false, message: '업로드 파일을 찾을 수 없습니다.' })
          return
        }
        const fr = fileRow.rows[0]
        if (String(fr.status) !== 'uploading') {
          await client.query('ROLLBACK')
          res.status(409).json({ ok: false, message: '이미 등록된 파일입니다.' })
          return
        }
        if (Number(fr.customer_id) !== customerId) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '고객과 파일 범위가 일치하지 않습니다.' })
          return
        }
        if (String(fr.file_path ?? '').trim() !== objectKey) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'object key가 presign 시점과 일치하지 않습니다.' })
          return
        }
        const rowSize = Number(fr.file_size ?? 0)
        if (fileSize !== rowSize) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '파일 크기가 presign 시점과 일치하지 않습니다.' })
          return
        }

        await client.query(
          `
          UPDATE files
          SET original_name = $2, display_name = $3, file_size = $4, mime_type = $5,
              is_confirmed = true, status = 'active'
          WHERE id = $1
          `,
          [fileId, fileName, fileName, fileSize, mimeType],
        )

        const linkIns = await client.query(
          `
          INSERT INTO liquor_customer_files (
            customer_id, support_contract_id, repayment_id, support_item_id, ga_id,
            document_kind, file_id, title, memo, uploaded_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
          `,
          [
            customerId,
            link.supportContractId,
            link.repaymentId,
            link.supportItemId,
            gaId,
            documentKind,
            fileId,
            title,
            memo,
            userId,
          ],
        )

        await client.query(
          `UPDATE users SET storage_used = storage_used + $2 WHERE id = $1 AND ga_id = $3`,
          [userId, fileSize, gaId],
        )

        await client.query('COMMIT')

        const joined = await pool.query(
          `
          SELECT lcf.*, f.original_name, f.display_name, f.file_size, f.mime_type, f.status AS file_status,
                 u.display_name AS uploaded_by_name
          FROM liquor_customer_files lcf
          JOIN files f ON f.id = lcf.file_id AND f.deleted_at IS NULL
          LEFT JOIN users u ON u.id = lcf.uploaded_by_user_id
          WHERE lcf.id = $1
          LIMIT 1
          `,
          [linkIns.rows[0].id],
        )
        res.status(201).json({ ok: true, data: mapLiquorCustomerFileRow(joined.rows[0] ?? linkIns.rows[0]) })
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        handleDbError(e, req, res)
      } finally {
        client.release()
      }
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/customers/:customerId/files/:linkId/download', ...chain, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ ok: false, message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const customerId = parseId(req.params.customerId)
      const linkId = parseId(req.params.linkId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || !linkId || gaId == null) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }

      const r = await pool.query(
        `
        SELECT lcf.*, f.file_path, f.original_name, f.display_name, f.mime_type, f.status AS file_status
        FROM liquor_customer_files lcf
        JOIN files f ON f.id = lcf.file_id AND f.deleted_at IS NULL
        WHERE lcf.id = $1 AND lcf.customer_id = $2 AND lcf.ga_id = $3
        LIMIT 1
        `,
        [linkId, customerId, gaId],
      )
      if (!r.rowCount) {
        res.status(404).json({ ok: false, message: '첨부문서를 찾을 수 없습니다.' })
        return
      }
      const row = r.rows[0]
      if (String(row.file_status) !== 'active') {
        res.status(404).json({ ok: false, message: '첨부문서를 찾을 수 없습니다.' })
        return
      }
      const objectKey = String(row.file_path ?? '').trim()
      if (!assertLiquorCustomerFileObjectKey(objectKey, { gaId, customerId, fileId: row.file_id })) {
        res.status(400).json({ ok: false, message: '허용되지 않은 저장 경로입니다.' })
        return
      }
      const downloadUrl = await consentGetSignedDownloadUrl(objectKey, 900)
      if (!downloadUrl) {
        res.status(503).json({ ok: false, message: '다운로드 URL을 만들 수 없습니다.' })
        return
      }
      res.json({
        ok: true,
        data: {
          downloadUrl,
          fileName: String(row.display_name ?? row.original_name ?? 'download'),
          mimeType: String(row.mime_type ?? ''),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.delete('/liquor/customers/:customerId/files/:linkId', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const linkId = parseId(req.params.linkId)
      const gaId = resolveLiquorGaId(req)
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!customerId || !linkId || gaId == null) {
        res.status(404).json({ ok: false, message: '첨부문서를 찾을 수 없습니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }

      const peek = await pool.query(
        `
        SELECT lcf.id, lcf.file_id, f.file_path, f.file_size, f.user_id, f.status
        FROM liquor_customer_files lcf
        JOIN files f ON f.id = lcf.file_id AND f.deleted_at IS NULL
        WHERE lcf.id = $1 AND lcf.customer_id = $2 AND lcf.ga_id = $3
        LIMIT 1
        `,
        [linkId, customerId, gaId],
      )
      if (!peek.rowCount) {
        res.status(404).json({ ok: false, message: '첨부문서를 찾을 수 없습니다.' })
        return
      }
      const row = peek.rows[0]
      const fileId = Number(row.file_id)
      const objectKey = String(row.file_path ?? '').trim()

      await pool.query(`DELETE FROM liquor_customer_files WHERE id = $1 AND customer_id = $2 AND ga_id = $3`, [
        linkId,
        customerId,
        gaId,
      ])

      const otherLinks = await pool.query(
        `SELECT id FROM liquor_customer_files WHERE file_id = $1 LIMIT 1`,
        [fileId],
      )
      const otherUsage = await pool.query(
        `
        SELECT id FROM liquor_repayments WHERE evidence_file_id = $1
        UNION ALL
        SELECT id FROM liquor_support_items WHERE photo_file_id = $1
        LIMIT 1
        `,
        [fileId],
      )

      if (!otherLinks.rowCount && !otherUsage.rowCount && objectKey) {
        if (assertLiquorCustomerFileObjectKey(objectKey, { gaId, customerId, fileId })) {
          try {
            await r2DeleteStorageObjectOrThrow(objectKey)
          } catch (e) {
            console.warn('[LIQUOR_FILE_DELETE_R2_FAIL]', fileId, objectKey, e)
          }
        }
        const sz = Number(row.file_size) || 0
        await pool.query(
          `UPDATE files SET deleted_at = NOW(), status = 'failed' WHERE id = $1 AND deleted_at IS NULL`,
          [fileId],
        )
        if (sz > 0 && row.user_id) {
          await pool.query(
            `UPDATE users SET storage_used = GREATEST(0, storage_used - $2) WHERE id = $1 AND ga_id = $3`,
            [String(row.user_id), sz, gaId],
          )
        }
      }

      res.json({ ok: true })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
