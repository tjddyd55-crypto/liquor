import { createHash, randomUUID } from 'node:crypto'
import { consentGetBuffer } from '../lib/consentStorage.js'

const CSA_PREFIX = 'csa_'
export const CONTRACT_SEND_ATTACHMENTS_MAX = 20

export function newSendSessionAttachmentId() {
  return `${CSA_PREFIX}${randomUUID()}`
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, items: { fileId: string, required: boolean, sortOrder: number }[] } | { ok: false, message: string }}
 */
export function parseAttachmentsFromBody(raw) {
  if (raw == null) {
    return { ok: true, items: [] }
  }
  if (!Array.isArray(raw)) {
    return { ok: false, message: '첨부자료 목록 형식이 올바르지 않습니다.' }
  }
  if (raw.length > CONTRACT_SEND_ATTACHMENTS_MAX) {
    return { ok: false, message: `첨부자료는 최대 ${CONTRACT_SEND_ATTACHMENTS_MAX}개까지 추가할 수 있습니다.` }
  }
  const items = []
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i]
    const fid = entry?.fileId ?? entry?.file_id
    if (fid == null || String(fid).trim() === '') {
      return { ok: false, message: '첨부자료 fileId 가 누락되었습니다.' }
    }
    const required = entry?.required !== false
    items.push({ fileId: String(fid).trim(), required, sortOrder: i })
  }
  return { ok: true, items }
}

/**
 * 발송 세션에 첨부를 연결한다. 파일은 발송자 소유이며 customer_id 가 비었거나 동일 고객이어야 한다.
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 * @param {number} customerId
 * @param {string} userId
 * @param {number} gaId
 * @param {{ fileId: string, required: boolean, sortOrder: number }[]} items
 */
export async function insertSendSessionAttachmentsForSend(client, sendSessionId, customerId, userId, gaId, items) {
  for (const it of items) {
    const lock = await client.query(
      `
      SELECT id, original_name, display_name, mime_type, file_size, file_path, customer_id
      FROM files
      WHERE id = $1::bigint
        AND user_id = $2
        AND ga_id = $3
        AND (customer_id IS NULL OR customer_id = $4::int)
      FOR UPDATE
      `,
      [it.fileId, userId, gaId, customerId],
    )
    if (!lock.rowCount) {
      throw Object.assign(new Error('첨부 파일을 찾을 수 없거나 이 발송에 사용할 수 없습니다.'), {
        code: 'attachment_file_invalid',
      })
    }
    const f = lock.rows[0]
    const path = String(f.file_path ?? '').trim()
    if (!path) {
      throw Object.assign(new Error('첨부 파일 저장 경로가 없습니다.'), { code: 'attachment_file_invalid' })
    }
    let buf
    try {
      buf = await consentGetBuffer(path)
    } catch {
      throw Object.assign(new Error('첨부 파일을 읽지 못했습니다.'), { code: 'attachment_file_unreadable' })
    }
    if (!buf || buf.length === 0) {
      throw Object.assign(new Error('첨부 파일이 비어 있습니다.'), { code: 'attachment_file_invalid' })
    }
    const contentHash = createHash('sha256').update(buf).digest('hex')
    const displayName = String(f.display_name ?? f.original_name ?? 'attachment').trim() || 'attachment'
    const mimeType = f.mime_type == null ? null : String(f.mime_type)
    const sizeBytes = f.file_size != null ? Number(f.file_size) : buf.length
    const aid = newSendSessionAttachmentId()
    await client.query(
      `
      INSERT INTO contract_send_session_attachments (
        id,
        send_session_id,
        file_id,
        display_filename,
        mime_type,
        size_bytes,
        content_hash,
        required,
        sort_order,
        viewed,
        confirmed,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, false, false, NOW(), NOW())
      `,
      [aid, sendSessionId, it.fileId, displayName, mimeType, sizeBytes, contentHash, it.required, it.sortOrder],
    )
    await client.query(
      `
      UPDATE files
      SET customer_id = COALESCE(customer_id, $2::int)
      WHERE id = $1::bigint
      `,
      [it.fileId, customerId],
    )
  }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {string} sendSessionId
 */
export async function listSendSessionAttachmentsPublic(executor, sendSessionId) {
  const r = await executor.query(
    `
    SELECT
      id,
      display_filename AS "displayFilename",
      mime_type AS "mimeType",
      size_bytes AS "sizeBytes",
      content_hash AS "fileHash",
      required,
      sort_order AS "sortOrder",
      viewed,
      viewed_at AS "viewedAt",
      confirmed,
      confirmed_at AS "confirmedAt"
    FROM contract_send_session_attachments
    WHERE send_session_id = $1
    ORDER BY sort_order ASC, created_at ASC
    `,
    [sendSessionId],
  )
  return r.rows.map((row) => ({
    id: String(row.id),
    displayFilename: String(row.displayFilename ?? ''),
    mimeType: row.mimeType == null ? null : String(row.mimeType),
    sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
    fileHash: String(row.fileHash ?? ''),
    required: row.required === true || row.required === 1,
    sortOrder: Number(row.sortOrder ?? 0),
    viewed: Boolean(row.viewed),
    viewedAt: row.viewedAt ? new Date(row.viewedAt).toISOString() : null,
    confirmed: Boolean(row.confirmed),
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
  }))
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {string} sendSessionId
 * @param {string} attachmentId
 */
export async function loadSendSessionAttachmentRow(executor, sendSessionId, attachmentId) {
  const r = await executor.query(
    `
    SELECT
      a.id,
      a.send_session_id,
      a.file_id,
      a.display_filename,
      a.mime_type,
      a.size_bytes,
      a.content_hash,
      a.required,
      a.sort_order,
      a.viewed,
      a.viewed_at,
      a.confirmed,
      a.confirmed_at
    FROM contract_send_session_attachments a
    WHERE a.id = $1 AND a.send_session_id = $2
    LIMIT 1
    `,
    [String(attachmentId).trim(), sendSessionId],
  )
  return r.rows[0] ?? null
}

/**
 * 증빙 해시용 스냅샷
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 */
export async function listSendSessionAttachmentsForEvidence(client, sendSessionId) {
  const r = await client.query(
    `
    SELECT
      id,
      display_filename,
      mime_type,
      size_bytes,
      content_hash,
      required,
      sort_order,
      viewed,
      viewed_at,
      confirmed,
      confirmed_at
    FROM contract_send_session_attachments
    WHERE send_session_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [sendSessionId],
  )
  return r.rows
}
