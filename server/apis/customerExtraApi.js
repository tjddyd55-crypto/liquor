import { safeQuery } from '../utils/dbSafeQuery.js'
import { buildCustomerRowVisibilityWhere } from '../lib/customerAccessScope.js'
import { assertCustomerRowAccessibleByVisibility } from '../lib/customerRowVisibilitySql.js'
import { parseGaId } from '../lib/parseGaId.js'
import { mapCustomerRow } from '../lib/customerRowMap.js'
import { recordAnalyticsEvent } from '../lib/analyticsEvents.js'
import { isGaTenantAdminRole } from '../lib/rbacScope.js'
import {
  consentGetBuffer,
  consentPutInsurerAttachment,
  getR2InsurerAttachmentsCacheControl,
  getR2PublicCdnBase,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2DeleteStorageObjectOrThrow,
  r2GetPresignedPutUrl,
} from '../lib/consentStorage.js'
import { recalculateStorageUsedForGa } from '../lib/storageUsedRecalculate.js'
import {
  isR2ObjectRootEnabled,
  stripR2ObjectRootIfPresent,
  withR2ObjectRoot,
} from '../lib/r2KeyPolicy.js'
import { runStorageUploadOrphanCleanup } from '../lib/storageOrphanCleanup.js'
import {
  getStorageOpenMeta,
  issueStorageOpenToken,
  toSinglePathFilename,
} from '../lib/inlinePreviewTokens.js'

const CONSULTATION_BODY_MAX = 20000

const CUSTOMER_FILE_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
])
/** presign 단계에서 명시 차단 (실행/HTML/바이너리 등) */
const CUSTOMER_FILE_BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/x-msdos-program',
  'application/x-executable',
])
const CUSTOMER_FILE_MAX_BYTES = 25 * 1024 * 1024
const CUSTOMER_FILE_CONTENT_MAX = 100_000

const FILE_NAME_MAX_LENGTH = 120
const FOLDER_NAME_MAX_LENGTH = 12
const STORAGE_FILE_NAME_REGEX = /^[A-Za-z0-9._\-() \u3131-\u318e\uac00-\ud7a3]+$/
const STORAGE_FOLDER_NAME_REGEX = /^[A-Za-z0-9 \u3131-\u318e\uac00-\ud7a3]+$/

function sanitizeUserIdForObjectKeySegment(userId) {
  const s = String(userId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
  return s || '_'
}

function normalizeSpaces(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeStorageFileName(raw) {
  const value = normalizeSpaces(raw)
  if (!value) {
    return ''
  }
  return value.slice(0, FILE_NAME_MAX_LENGTH)
}

function isValidStorageFileName(raw) {
  const value = normalizeStorageFileName(raw)
  if (!value) {
    return false
  }
  if (value.length > FILE_NAME_MAX_LENGTH) {
    return false
  }
  return STORAGE_FILE_NAME_REGEX.test(value)
}

function normalizeFolderName(raw) {
  const value = normalizeSpaces(raw)
  if (!value) {
    return ''
  }
  return value.slice(0, FOLDER_NAME_MAX_LENGTH)
}

function isValidFolderName(raw) {
  const value = normalizeFolderName(raw)
  if (!value) {
    return false
  }
  if (value.length > FOLDER_NAME_MAX_LENGTH) {
    return false
  }
  return STORAGE_FOLDER_NAME_REGEX.test(value)
}

const FOLDER_DUPLICATE_NAME_MESSAGE = '이미 ��재하는 �����명입니다'
const STORAGE_USAGE_BASE_SUMMARY = [
  { source: 'personal-storage', label: '내 파일' },
  { source: 'customer-storage', label: '고객 파일' },
  { source: 'claim-file', label: '청구 첨부' },
  { source: 'customer-news', label: '소식지 첨부' },
]

function toIsoStringOrNull(value) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function toFiniteNonNegativeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return parsed
}

function normalizeCustomerNewsScope(scopeRaw) {
  return String(scopeRaw ?? '').trim().toLowerCase() === 'personal' ? 'personal' : 'all'
}

function buildStorageUsageSummary(items) {
  const groups = STORAGE_USAGE_BASE_SUMMARY.map((row) => ({
    source: row.source,
    label: row.label,
    count: 0,
    size: 0,
  }))
  const bySource = new Map(groups.map((group) => [group.source, group]))
  for (const item of items) {
    const group = bySource.get(item.source)
    if (!group) {
      continue
    }
    group.count += 1
    group.size += toFiniteNonNegativeNumber(item.size)
  }
  return groups
}

function toSortTimestamp(isoOrNull) {
  if (!isoOrNull) {
    return 0
  }
  const ms = new Date(isoOrNull).getTime()
  return Number.isFinite(ms) ? ms : 0
}

async function folderNameExistsForScope(pool, userId, gaId, customerId, folderName, excludeFolderId) {
  if (excludeFolderId == null) {
    const row = await safeQuery(
      pool,
      `
      SELECT 1 AS x
      FROM folders
      WHERE user_id = $1
        AND ga_id IS NOT DISTINCT FROM $2
        AND (
          ($3::INTEGER IS NULL AND customer_id IS NULL)
          OR customer_id = $3
        )
        AND lower(btrim(name)) = lower(btrim($4))
      LIMIT 1
      `,
      [userId, gaId, customerId, folderName],
    )
    return row.rowCount > 0
  }
  const row = await safeQuery(
    pool,
    `
    SELECT 1 AS x
    FROM folders
    WHERE user_id = $1
      AND ga_id IS NOT DISTINCT FROM $2
      AND id <> $3
      AND (
        ($4::INTEGER IS NULL AND customer_id IS NULL)
        OR customer_id = $4
      )
      AND lower(btrim(name)) = lower(btrim($5))
    LIMIT 1
    `,
    [userId, gaId, excludeFolderId, customerId, folderName],
  )
  return row.rowCount > 0
}

function sanitizeStorageFileNameForObjectKey(fileNameRaw) {
  const normalized = normalizeStorageFileName(fileNameRaw)
  const safe =
    normalized
      .replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, FILE_NAME_MAX_LENGTH) || 'file'
  return safe
}

function buildStorageObjectKey(gaIdPath, userId, fileNameRaw) {
  const userSeg = sanitizeUserIdForObjectKeySegment(userId)
  const safeName = sanitizeStorageFileNameForObjectKey(fileNameRaw)
  const ts = Date.now()
  const relative = isR2ObjectRootEnabled()
    ? `files/${userSeg}/${ts}-${safeName}`
    : `insurer/${gaIdPath}/${userSeg}/${ts}-${safeName}`
  return withR2ObjectRoot(relative)
}

function assertStorageObjectKey(key, gaPathCandidates, userId) {
  const k = stripR2ObjectRootIfPresent(String(key ?? '').replace(/^\//, ''))
  if (!k || k.includes('..')) {
    return false
  }
  const userSeg = sanitizeUserIdForObjectKeySegment(userId)

  const crmFilesPrefix = `files/${userSeg}/`
  if (k.startsWith(crmFilesPrefix)) {
    const fileSeg = k.slice(crmFilesPrefix.length)
    if (!fileSeg.includes('/') && /^\d+-.+/.test(fileSeg)) {
      return true
    }
  }

  const candidates = Array.isArray(gaPathCandidates)
    ? gaPathCandidates.map((v) => String(v ?? '').trim()).filter(Boolean)
    : []
  if (candidates.length === 0) {
    return false
  }
  for (const gaPath of candidates) {
    const newPrefix = `insurer/${gaPath}/${userSeg}/`
    if (k.startsWith(newPrefix)) {
      const fileSeg = k.slice(newPrefix.length)
      if (!fileSeg.includes('/') && /^\d+-.+/.test(fileSeg)) {
        return true
      }
    }
    const legacyPrefix = `platform-assets/insurer/${gaPath}/${userSeg}/files/storage/`
    if (k.startsWith(legacyPrefix)) {
      const legacyRest = k.slice(legacyPrefix.length)
      const parts = legacyRest.split('/').filter(Boolean)
      if (parts.length !== 3) {
        continue
      }
      const [y, mo, fileSeg] = parts
      if (/^\d{4}$/.test(y) && /^\d{2}$/.test(mo) && /^\d+_.+/.test(fileSeg)) {
        return true
      }
    }
  }
  return false
}

function parseStorageObjectKeyFromPublicUrl(fileUrl) {
  const base = getR2PublicCdnBase().replace(/\/$/, '')
  const u = String(fileUrl ?? '').trim()
  if (!u.startsWith(`${base}/`)) {
    return null
  }
  return u.slice(base.length + 1).replace(/^\//, '')
}

/** DB file_path → R2/로컬 객체 키 (presign URL 생성 로직은 변경하지 않음) */
function resolveStorageFileObjectKey(filePath) {
  const raw = String(filePath ?? '').trim()
  if (!raw) {
    return null
  }
  if (/^https?:\/\//i.test(raw)) {
    return parseStorageObjectKeyFromPublicUrl(raw)
  }
  return raw.replace(/^\//, '')
}

/**
 * 다운로드용 Content-Disposition (한글 등은 filename* 사용)
 * @param {string} displayNameRaw
 */
function buildAttachmentContentDisposition(displayNameRaw) {
  const name = String(displayNameRaw ?? '').trim() || 'download'
  const ascii =
    name
      .replace(/["\r\n\\]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim()
      .slice(0, 200) || 'download'
  const star = encodeURIComponent(name)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${star}`
}

/**
 * 인라인 미리보기(새 탭 PDF 뷰어) — filename 이 주소창·뷰어 다운로드 기본명에 반영되도록.
 * @param {string} displayNameRaw
 */
function buildInlineContentDisposition(displayNameRaw) {
  const name = String(displayNameRaw ?? '').trim() || 'document'
  const ascii =
    name
      .replace(/["\r\n\\]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim()
      .slice(0, 200) || 'document'
  const star = encodeURIComponent(name)
  return `inline; filename="${ascii}"; filename*=UTF-8''${star}`
}

function inferDefaultExtFromStorageFile(file) {
  const mime = String(file.mime_type ?? '').toLowerCase()
  if (mime.includes('pdf')) return '.pdf'
  if (mime.includes('png')) return '.png'
  if (mime.includes('jpeg')) return '.jpg'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('sheet')) return '.xlsx'
  if (mime.includes('csv')) return '.csv'
  return '.bin'
}

function normalizeGaCodePath(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

async function resolveGaPathByGaId(pool, gaId, gaCodeRaw) {
  if (!Number.isInteger(gaId) || gaId < 1) {
    return null
  }
  const fromSession = normalizeGaCodePath(gaCodeRaw)
  if (fromSession) {
    return fromSession
  }
  const row = await safeQuery(
    pool,
    `
    SELECT code
    FROM ga_companies
    WHERE id = $1
      AND is_deleted = false
    LIMIT 1
    `,
    [gaId],
  )
  if (row.rowCount > 0) {
    const fromDb = normalizeGaCodePath(row.rows[0]?.code)
    if (fromDb) {
      return fromDb
    }
  }
  return `ga${gaId}`
}

function toPublicFileUrl(filePath) {
  const raw = String(filePath ?? '').trim()
  if (!raw) {
    return ''
  }
  if (/^file:\/\//i.test(raw)) {
    return ''
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw
  }
  const base = getR2PublicCdnBase().replace(/\/$/, '')
  return `${base}/${raw.replace(/^\//, '')}`
}

function mapCustomerFileRow(row) {
  const filePath = row.file_path != null ? String(row.file_path) : row.file_url ?? ''
  const localFileScheme = /^file:\/\//i.test(filePath)
  const objectKeyCandidate = /^https?:\/\//i.test(filePath)
    ? parseStorageObjectKeyFromPublicUrl(filePath)
    : localFileScheme
      ? null
      : filePath
  return {
    id: Number(row.id),
    customerId: row.customer_id != null ? Number(row.customer_id) : null,
    teamId: row.team_id != null ? String(row.team_id) : null,
    folderId: row.folder_id != null ? Number(row.folder_id) : null,
    content: row.content != null ? String(row.content) : '',
    fileName: row.display_name ?? row.file_name ?? row.original_name ?? '',
    originalName: row.original_name ?? row.file_name ?? '',
    displayName: row.display_name ?? row.file_name ?? '',
    objectKey: objectKeyCandidate ? String(objectKeyCandidate) : null,
    filePath,
    fileUrl: toPublicFileUrl(filePath),
    fileSize: row.file_size != null ? Number(row.file_size) : null,
    mimeType: row.mime_type ?? null,
    isConfirmed: row.is_confirmed == null ? true : Boolean(row.is_confirmed),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    expiresAt:
      row.expires_at != null ? new Date(row.expires_at).toISOString() : null,
    deletedAt:
      row.deleted_at != null ? new Date(row.deleted_at).toISOString() : null,
    uploadStatus:
      row.status != null
        ? String(row.status)
        : row.upload_status != null
          ? String(row.upload_status)
          : 'active',
  }
}

function mapFolderRow(row) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    customerId: row.customer_id != null ? Number(row.customer_id) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
  }
}

function escapeIlikePattern(raw) {
  return String(raw ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

const CUSTOMER_SELECT_LIST = `
  c.id, c.user_id, c.name, c.birth_date, c.ssn, c.phone, c.carrier, c.address, c.height, c.weight, c.job, c.driving, c.medical,
  c.car_number, c.car_model, c.car_year, c.renewal_date,
  c.gender, c.insurance_age, c.next_age_date, c.is_driver, c.car_type, c.notes,
  c.is_favorite, c.created_at,
  c.crm_extension
`

const CUSTOMER_SELECT_LIST_NO_ALIAS = `
  id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
  car_number, car_model, car_year, renewal_date,
  gender, insurance_age, next_age_date, is_driver, car_type, notes,
  is_favorite, created_at,
  crm_extension
`

/**
 * @param {import('pg').Pool} pool
 * @param {number} customerId
 * @param {string} userId
 * @param {number} gaId
 */
async function assertCustomerActiveOwned(pool, req, customerId) {
  return assertCustomerRowAccessibleByVisibility(pool, safeQuery, req, customerId, { requireNonDeleted: true })
}

/**
 * 고객 파일 API: customer_access + tenant 고객 가시성과 일치해야 한다.
 */
async function assertCustomerFileAccess(pool, req, customerId, res) {
  const okRow = await assertCustomerRowAccessibleByVisibility(pool, safeQuery, req, customerId, {
    requireNonDeleted: true,
  })
  if (!okRow) {
    res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
    return false
  }
  return true
}

function requireGaIdFromUser(req, res) {
  const gaId = parseGaId(req.gaId ?? req.user?.gaId)
  if (gaId == null) {
    res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
    return null
  }
  return gaId
}

function parseCustomerIdParam(req, res) {
  const customerId = Number(req.params.id)
  if (!Number.isInteger(customerId) || customerId < 1) {
    res.status(400).json({ message: '잘못된 고객 ID입니다.' })
    return null
  }
  return customerId
}

/**
 * raw 요청 바디를 Buffer로 읽습니다.
 * @param {import('express').Request} req
 * @param {number} maxBytes
 */
async function readRawBodyBuffer(req, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw Object.assign(new Error('용량 초과'), { httpStatus: 400 })
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

function parseOptionalCustomerId(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}

function parseFolderId(raw) {
  if (raw == null || raw === '') {
    return null
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}

async function assertFolderOwnedByUser(pool, folderId, userId, gaId) {
  const row = await safeQuery(
    pool,
    `
    SELECT id, user_id, ga_id, name, customer_id
    FROM folders
    WHERE id = $1
      AND user_id = $2
      AND ga_id = $3
    LIMIT 1
    `,
    [folderId, userId, gaId],
  )
  return row.rowCount > 0 ? row.rows[0] : null
}

/** 개인 스토리지(내 저장공간·고객 파일): team_id IS NULL 행만 users.storage_used 에 반영 */
async function fetchPersonalStorageQuota(pool, userId, gaId) {
  const row = await safeQuery(
    pool,
    `
    SELECT storage_used, storage_limit
    FROM users
    WHERE id = $1
      AND ga_id = $2
    `,
    [userId, gaId],
  )
  if (row.rowCount === 0) {
    return null
  }
  const used = Number(row.rows[0].storage_used)
  const limit = Number(row.rows[0].storage_limit)
  return {
    used: Number.isFinite(used) ? used : 0,
    limit: Number.isFinite(limit) ? limit : 0,
  }
}

async function fetchPersonalStoragePendingUploadBytes(pool, userId, gaId) {
  const row = await safeQuery(
    pool,
    `
    SELECT COALESCE(SUM(file_size), 0)::bigint AS pending_bytes
    FROM files
    WHERE user_id = $1
      AND ga_id = $2
      AND team_id IS NULL
      AND deleted_at IS NULL
      AND status = 'uploading'
    `,
    [userId, gaId],
  )
  const n = Number(row.rows[0]?.pending_bytes ?? 0)
  return Number.isFinite(n) ? n : 0
}

function requireGaTenantAdmin(req, res) {
  const userId = req.user?.id ? String(req.user.id) : ''
  if (!userId) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return null
  }
  if (!isGaTenantAdminRole(req.user?.role)) {
    res.status(403).json({ message: '권한이 없습니다.' })
    return null
  }
  return requireGaIdFromUser(req, res)
}

function parseStorageLimitBytesBody(body) {
  const raw = body?.storageLimitBytes ?? body?.storage_limit_bytes ?? body?.limitBytes
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    return null
  }
  return n
}

async function getOwnedStorageFile(pool, fileId, userId, gaId) {
  const row = await safeQuery(
    pool,
    `
    SELECT
      id,
      user_id,
      ga_id,
      customer_id,
      team_id,
      folder_id,
      original_name,
      display_name,
      file_path,
      file_size,
      mime_type,
      is_confirmed,
      created_at,
      status,
      deleted_at
    FROM files
    WHERE id = $1
      AND user_id = $2
      AND ga_id = $3
      AND status = 'active'
      AND deleted_at IS NULL
    LIMIT 1
    `,
    [fileId, userId, gaId],
  )
  return row.rowCount > 0 ? row.rows[0] : null
}

async function resolveStorageCustomerScope(req, pool, res, userId, gaId, rawCustomerId, opts = {}) {
  const required = opts.required === true
  const provided = rawCustomerId != null && String(rawCustomerId).trim() !== ''
  if (!provided) {
    if (required) {
      res.status(400).json({ message: '잘못된 고객 ID입니다.' })
      return { ok: false, customerId: null }
    }
    return { ok: true, customerId: null }
  }
  const customerId = parseOptionalCustomerId(rawCustomerId)
  if (customerId == null) {
    res.status(400).json({ message: '잘못된 고객 ID입니다.' })
    return { ok: false, customerId: null }
  }
  const ok = await assertCustomerFileAccess(pool, req, customerId, res)
  if (!ok) {
    return { ok: false, customerId: null }
  }
  return { ok: true, customerId }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.handleDbError
 */
export function registerCustomerExtraApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx
  console.log('customerExtraApi loaded')

  apiRouter.get('/customers/search/advanced', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }

      const q = String(req.query.q ?? '').trim()
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500)

      const access = req.user?.customerAccess ?? 'own'
      if (access === 'none') {
        res.json([])
        return
      }
      const vw = buildCustomerRowVisibilityWhere({
        access,
        userId,
        gaId,
        tenantDbId: req.user?.customerTenantDbId ?? null,
      })

      if (!q) {
        const result = await safeQuery(
          pool,
          `
          SELECT ${CUSTOMER_SELECT_LIST_NO_ALIAS}
          FROM customers c
          WHERE ${vw.clause}
          ORDER BY c.created_at DESC
          LIMIT $${vw.params.length + 1}
          `,
          [...vw.params, limit],
        )
        res.json(result.rows.map(mapCustomerRow))
        return
      }

      const pattern = `%${escapeIlikePattern(q)}%`
      const result = await safeQuery(
        pool,
        `
        SELECT ${CUSTOMER_SELECT_LIST}
        FROM customers c
        WHERE ${vw.clause}
          AND (c.name ILIKE $${vw.params.length + 1} ESCAPE '\\' OR c.phone ILIKE $${vw.params.length + 1} ESCAPE '\\')
        ORDER BY c.created_at DESC
        LIMIT $${vw.params.length + 2}
        `,
        [...vw.params, pattern, limit],
      )
      res.json(result.rows.map(mapCustomerRow))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customers/consultations/counts', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const r = await safeQuery(
        pool,
        `
        SELECT customer_id, COUNT(*) AS c
        FROM customer_consultations
        WHERE user_id = $1 AND ga_id = $2
        GROUP BY customer_id
        `,
        [userId, gaId],
      )
      const counts = {}
      for (const row of r.rows) {
        counts[String(row.customer_id)] = Number(row.c) || 0
      }
      res.json({ counts })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:id/consultations', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }

      const rawBody = req.body?.body ?? req.body?.content ?? ''
      const content = String(rawBody ?? '').trim()
      if (!content) {
        res.status(400).json({ message: '상담 내용을 입력해 주세요.' })
        return
      }

      const consultDateRaw = req.body?.consultationDate ?? req.body?.consultation_date
      let consultDate = String(consultDateRaw ?? '').trim()
      if (!consultDate) {
        consultDate = new Date().toISOString().slice(0, 10)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(consultDate)) {
        res.status(400).json({ message: '상담 일자는 YYYY-MM-DD 형식이어야 합니다.' })
        return
      }
      if (content.length > CONSULTATION_BODY_MAX) {
        res.status(400).json({ message: `상담 내용은 ${CONSULTATION_BODY_MAX}자 이하로 입력해 주세요.` })
        return
      }

      const ins = await safeQuery(
        pool,
        `
        INSERT INTO customer_consultations (customer_id, user_id, ga_id, body, consultation_date)
        VALUES ($1, $2, $3, $4, $5::DATE)
        RETURNING id, customer_id, user_id, ga_id, body, consultation_date, created_at
        `,
        [customerId, userId, gaId, content, consultDate],
      )
      const row = ins.rows[0]
      recordAnalyticsEvent(pool, { userId, gaId, eventType: 'team_message_created' })
      res.status(201).json({
        id: Number(row.id),
        customerId: Number(row.customer_id),
        userId: String(row.user_id),
        gaId: Number(row.ga_id),
        body: row.body ?? '',
        consultationDate: row.consultation_date ? String(row.consultation_date).slice(0, 10) : consultDate,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customers/:id/consultations', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
      const offset = Math.max(Number(req.query.offset) || 0, 0)

      const r = await safeQuery(
        pool,
        `
        SELECT id, customer_id, user_id, ga_id, body, consultation_date, created_at
        FROM customer_consultations
        WHERE customer_id = $1 AND user_id = $2 AND ga_id = $3
        ORDER BY consultation_date DESC NULLS LAST, created_at DESC, id DESC
        LIMIT $4 OFFSET $5
        `,
        [customerId, userId, gaId, limit, offset],
      )
      res.json(
        r.rows.map((row) => ({
          id: Number(row.id),
          customerId: Number(row.customer_id),
          userId: String(row.user_id),
          gaId: Number(row.ga_id),
          body: row.body ?? '',
          consultationDate: row.consultation_date ? String(row.consultation_date).slice(0, 10) : null,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        })),
      )
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/customers/:id/consultations/:consultId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      const consultId = Number(req.params.consultId)
      if (!Number.isInteger(consultId) || consultId < 1) {
        res.status(400).json({ message: '잘못된 상담 ID입니다.' })
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const del = await safeQuery(
        pool,
        `
        DELETE FROM customer_consultations
        WHERE id = $1 AND customer_id = $2 AND user_id = $3 AND ga_id = $4
        RETURNING id
        `,
        [consultId, customerId, userId, gaId],
      )
      if (del.rowCount === 0) {
        res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:id/relations', requireAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      const relatedRaw = req.body?.relatedCustomerId ?? req.body?.related_customer_id
      const relatedCustomerId = Number(relatedRaw)
      if (!Number.isInteger(relatedCustomerId) || relatedCustomerId < 1) {
        res.status(400).json({ message: '연결할 고객 ID가 올바르지 않습니다.' })
        return
      }
      if (relatedCustomerId === customerId) {
        res.status(400).json({ message: '동일 고객과는 연결할 수 없습니다.' })
        return
      }

      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, relatedCustomerId))) {
        res.status(404).json({ message: '연결 대상 고객을 찾을 수 없습니다.' })
        return
      }

      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO customer_relations (customer_id, related_customer_id, user_id, ga_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (customer_id, related_customer_id) DO NOTHING
        `,
        [customerId, relatedCustomerId, userId, gaId],
      )
      await client.query(
        `
        INSERT INTO customer_relations (customer_id, related_customer_id, user_id, ga_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (customer_id, related_customer_id) DO NOTHING
        `,
        [relatedCustomerId, customerId, userId, gaId],
      )
      await client.query('COMMIT')
      res.status(201).json({ ok: true, customerId, relatedCustomerId })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/customers/:id/relations', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }

      const r = await safeQuery(
        pool,
        `
        SELECT
          cr.related_customer_id AS related_id,
          cr.created_at,
          c.name AS related_name,
          c.phone AS related_phone
        FROM customer_relations cr
        INNER JOIN customers c
          ON c.id = cr.related_customer_id
         AND c.user_id = $2
         AND c.ga_id = $3
         AND c.deleted_at IS NULL
        WHERE cr.customer_id = $1 AND cr.user_id = $2 AND cr.ga_id = $3
        ORDER BY cr.created_at DESC, cr.id DESC
        `,
        [customerId, userId, gaId],
      )
      res.json(
        r.rows.map((row) => ({
          relatedCustomerId: Number(row.related_id),
          relatedName: row.related_name ?? '',
          relatedPhone: row.related_phone ?? '',
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        })),
      )
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/customers/:id/relations/:relatedId', requireAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const customerId = parseCustomerIdParam(req, res)
      if (customerId == null) {
        return
      }
      const relatedCustomerId = Number(req.params.relatedId)
      if (!Number.isInteger(relatedCustomerId) || relatedCustomerId < 1) {
        res.status(400).json({ message: '잘못된 연계 고객 ID입니다.' })
        return
      }
      if (relatedCustomerId === customerId) {
        res.status(400).json({ message: '유효하지 않은 요청입니다.' })
        return
      }
      if (!(await assertCustomerActiveOwned(pool, req, customerId))) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }

      await client.query('BEGIN')
      const d1 = await client.query(
        `
        DELETE FROM customer_relations
        WHERE customer_id = $1 AND related_customer_id = $2 AND user_id = $3 AND ga_id = $4
        `,
        [customerId, relatedCustomerId, userId, gaId],
      )
      const d2 = await client.query(
        `
        DELETE FROM customer_relations
        WHERE customer_id = $1 AND related_customer_id = $2 AND user_id = $3 AND ga_id = $4
        `,
        [relatedCustomerId, customerId, userId, gaId],
      )
      await client.query('COMMIT')
      if (d1.rowCount === 0 && d2.rowCount === 0) {
        res.status(404).json({ message: '연계 정보를 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  const resolveContentType = (raw) => {
    return String(raw ?? '')
      .trim()
      .split(';')[0]
      .trim()
  }

  async function handleStoragePresign(req, res, forcedCustomerId = null) {
    if (!isConsentR2Enabled()) {
      logR2EnvDiagnosticCheck()
      res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
      return
    }
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const gaIdPath = await resolveGaPathByGaId(pool, gaId, req.user?.gaCode)
    if (!gaIdPath) {
      res.status(400).json({ message: 'GA ID를 확인할 수 없습니다.' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const scope = await resolveStorageCustomerScope(
      req,
      pool,
      res,
      userId,
      gaId,
      forcedCustomerId ?? body.customerId ?? body.customer_id ?? null,
      { required: forcedCustomerId != null },
    )
    if (!scope.ok) {
      return
    }
    const customerId = scope.customerId

    const fileName = normalizeStorageFileName(body.fileName ?? body.file_name ?? '')
    const contentType = resolveContentType(body.contentType ?? body.content_type)
    const sizeBytes = Number(body.size ?? body.sizeBytes ?? 0)

    if (!isValidStorageFileName(fileName)) {
      res.status(400).json({ message: '파일 이름이 올바르지 않습니다.' })
      return
    }
    if (CUSTOMER_FILE_BLOCKED_MIME.has(contentType) || !CUSTOMER_FILE_ALLOWED_MIME.has(contentType)) {
      res.status(400).json({ message: '파일 형식 오류' })
      return
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > CUSTOMER_FILE_MAX_BYTES) {
      res.status(400).json({ message: '용량 초과' })
      return
    }

    const presignClient = await pool.connect()
    let objectKey = ''
    let presignFileId = 0
    try {
      await presignClient.query('BEGIN')
      const qrow = await safeQuery(
        presignClient,
        `
        SELECT storage_used, storage_limit
        FROM users
        WHERE id = $1
          AND ga_id = $2
        FOR UPDATE
        `,
        [userId, gaId],
      )
      if (qrow.rowCount === 0) {
        await presignClient.query('ROLLBACK')
        res.status(400).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      const pendingRow = await safeQuery(
        presignClient,
        `
        SELECT COALESCE(SUM(file_size), 0)::bigint AS pending_bytes
        FROM files
        WHERE user_id = $1
          AND ga_id = $2
          AND team_id IS NULL
          AND deleted_at IS NULL
          AND status = 'uploading'
        `,
        [userId, gaId],
      )
      const used = Number(qrow.rows[0].storage_used)
      const limit = Number(qrow.rows[0].storage_limit)
      const pendingBytes = Number(pendingRow.rows[0]?.pending_bytes ?? 0)
      if (
        !Number.isFinite(used) ||
        !Number.isFinite(limit) ||
        !Number.isFinite(pendingBytes) ||
        used + pendingBytes + sizeBytes > limit
      ) {
        await presignClient.query('ROLLBACK')
        res.status(400).json({ message: '저장 공간 한도를 초과했습니다.' })
        return
      }
      objectKey = buildStorageObjectKey(gaIdPath, userId, fileName)
      const ins = await safeQuery(
        presignClient,
        `
        INSERT INTO files (
          user_id,
          ga_id,
          customer_id,
          team_id,
          folder_id,
          original_name,
          display_name,
          file_path,
          file_size,
          mime_type,
          content,
          is_confirmed,
          status,
          created_at
        )
        VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8, '', false, 'uploading', NOW())
        RETURNING id
        `,
        [userId, gaId, customerId, fileName, fileName, objectKey, sizeBytes, contentType],
      )
      presignFileId = Number(ins.rows[0].id)
      await presignClient.query('COMMIT')
    } catch (error) {
      try {
        await presignClient.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
      return
    } finally {
      presignClient.release()
    }

    const cacheControl = getR2InsurerAttachmentsCacheControl()
    let uploadUrl = ''
    try {
      uploadUrl = (await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })) || ''
    } catch (e) {
      console.warn('[STORAGE_PRESIGN_URL_FAIL]', presignFileId, objectKey, e)
    }
    if (!uploadUrl) {
      if (presignFileId > 0) {
        await safeQuery(
          pool,
          `
          DELETE FROM files
          WHERE id = $1
            AND user_id = $2
            AND ga_id = $3
            AND status = 'uploading'
          `,
          [presignFileId, userId, gaId],
        )
      }
      res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
      return
    }
    const fileUrl = toPublicFileUrl(objectKey)
    const putHeaders = {}
    if (cacheControl) {
      putHeaders['Cache-Control'] = cacheControl
    }
    res.json({
      fileId: presignFileId,
      uploadUrl,
      fileUrl,
      objectKey,
      putHeaders,
      customerId,
      displayName: fileName,
    })
  }

  async function handleStorageUploadProxy(req, res, forcedCustomerId = null) {
    if (!isConsentR2Enabled()) {
      logR2EnvDiagnosticCheck()
      res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
      return
    }
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const gaIdPath = await resolveGaPathByGaId(pool, gaId, req.user?.gaCode)
    if (!gaIdPath) {
      res.status(400).json({ message: 'GA ID를 확인할 수 없습니다.' })
      return
    }
    const scope = await resolveStorageCustomerScope(
      req,
      pool,
      res,
      userId,
      gaId,
      forcedCustomerId ?? req.query.customerId ?? null,
      { required: forcedCustomerId != null },
    )
    if (!scope.ok) {
      return
    }
    const contentType = resolveContentType(req.query.contentType ?? req.headers['content-type'])
    if (CUSTOMER_FILE_BLOCKED_MIME.has(contentType) || !CUSTOMER_FILE_ALLOWED_MIME.has(contentType)) {
      res.status(400).json({ message: '파일 형식 오류' })
      return
    }
    const objectKey = String(req.query.objectKey ?? req.headers['x-object-key'] ?? '').trim()
    if (!objectKey) {
      res.status(400).json({ message: 'object key가 필요합니다.' })
      return
    }
    if (!assertStorageObjectKey(objectKey, [gaIdPath, String(gaId)], userId)) {
      res.status(400).json({ message: '유효하지 않은 object key입니다.' })
      return
    }
    const uploadFileIdRaw = req.query.uploadFileId ?? req.headers['x-upload-file-id']
    const uploadFileId = Number(uploadFileIdRaw)
    if (!Number.isInteger(uploadFileId) || uploadFileId < 1) {
      res.status(400).json({ message: 'uploadFileId 쿼리(또는 x-upload-file-id 헤더)가 필요합니다.' })
      return
    }
    const metaPeek = await safeQuery(
      pool,
      `
      SELECT id, customer_id, file_path, file_size, mime_type
      FROM files
      WHERE id = $1
        AND user_id = $2
        AND ga_id = $3
        AND status = 'uploading'
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [uploadFileId, userId, gaId],
    )
    if (metaPeek.rowCount === 0) {
      res.status(404).json({ message: '업로드 준비 정보를 찾을 수 없습니다.' })
      return
    }
    const meta = metaPeek.rows[0]
    if (String(meta.file_path ?? '').trim() !== objectKey) {
      res.status(400).json({ message: 'object key가 presign 정보와 일치하지 않습니다.' })
      return
    }
    const expectedCust = meta.customer_id != null ? Number(meta.customer_id) : null
    const scopeCust = scope.customerId != null ? Number(scope.customerId) : null
    if (expectedCust !== scopeCust) {
      res.status(400).json({ message: '고객 범위가 presign 시점과 일치하지 않습니다.' })
      return
    }
    const bodyBuffer = await readRawBodyBuffer(req, CUSTOMER_FILE_MAX_BYTES)
    if (!bodyBuffer.length) {
      res.status(400).json({ message: '업로드 본문이 비어 있습니다.' })
      return
    }
    const fileSize = bodyBuffer.length
    const declaredSize = Number(meta.file_size)
    if (!Number.isFinite(declaredSize) || fileSize !== declaredSize) {
      res.status(400).json({ message: '본문 크기가 presign 시 선언한 크기와 일치해야 합니다.' })
      return
    }
    const rowMime = String(meta.mime_type ?? '')
      .trim()
      .toLowerCase()
    if (rowMime !== contentType.trim().toLowerCase()) {
      res.status(400).json({ message: 'Content-Type이 presign 시점과 일치하지 않습니다.' })
      return
    }
    await consentPutInsurerAttachment(objectKey, bodyBuffer, contentType)

    const proxyClient = await pool.connect()
    try {
      await proxyClient.query('BEGIN')
      const lockF = await safeQuery(
        proxyClient,
        `
        SELECT id
        FROM files
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
          AND deleted_at IS NULL
        FOR UPDATE
        `,
        [uploadFileId, userId, gaId],
      )
      if (lockF.rowCount === 0) {
        await proxyClient.query('ROLLBACK')
        res.status(409).json({ message: '업로드 상태를 확정할 수 없습니다.' })
        return
      }
      const qrow = await safeQuery(
        proxyClient,
        `
        SELECT storage_used, storage_limit
        FROM users
        WHERE id = $1
          AND ga_id = $2
        FOR UPDATE
        `,
        [userId, gaId],
      )
      if (qrow.rowCount === 0) {
        await proxyClient.query('ROLLBACK')
        res.status(400).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      const used = Number(qrow.rows[0].storage_used)
      const limit = Number(qrow.rows[0].storage_limit)
      if (!Number.isFinite(used) || !Number.isFinite(limit) || used + fileSize > limit) {
        await proxyClient.query('ROLLBACK')
        res.status(400).json({ message: '저장 공간 한도를 초과했습니다.' })
        return
      }
      const act = await safeQuery(
        proxyClient,
        `
        UPDATE files
        SET is_confirmed = true,
            status = 'active'
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
        `,
        [uploadFileId, userId, gaId],
      )
      if (act.rowCount === 0) {
        await proxyClient.query('ROLLBACK')
        res.status(409).json({ message: '업로드 상태를 확정할 수 없습니다.' })
        return
      }
      await safeQuery(
        proxyClient,
        `
        UPDATE users
        SET storage_used = storage_used + $1
        WHERE id = $2
          AND ga_id = $3
        `,
        [fileSize, userId, gaId],
      )
      await proxyClient.query('COMMIT')
    } catch (error) {
      try {
        await proxyClient.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
      return
    } finally {
      proxyClient.release()
    }
    res.status(204).end()
  }

  async function handleStorageRevokeStaged(req, res, forcedCustomerId = null) {
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const gaIdPath = await resolveGaPathByGaId(pool, gaId, req.user?.gaCode)
    if (!gaIdPath) {
      res.status(400).json({ message: 'GA ID를 확인할 수 없습니다.' })
      return
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const scope = await resolveStorageCustomerScope(
      req,
      pool,
      res,
      userId,
      gaId,
      forcedCustomerId ?? body.customerId ?? body.customer_id ?? null,
      { required: forcedCustomerId != null },
    )
    if (!scope.ok) {
      return
    }
    const fileIdRaw = body.fileId ?? body.uploadFileId ?? body.upload_id
    const fileIdParsed =
      fileIdRaw != null && String(fileIdRaw).trim() !== '' ? Number(fileIdRaw) : NaN
    const objectKeyFromBody = String(body.objectKey ?? body.object_key ?? '').trim()

    let objectKeyRaw = objectKeyFromBody
    if (Number.isInteger(fileIdParsed) && fileIdParsed > 0) {
      const meta = await safeQuery(
        pool,
        `
        SELECT file_path
        FROM files
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [fileIdParsed, userId, gaId],
      )
      if (meta.rowCount === 0) {
        res.json({ ok: true })
        return
      }
      objectKeyRaw = String(meta.rows[0].file_path ?? '').trim()
    }

    if (!objectKeyRaw) {
      res.status(400).json({ message: '요청이 올바르지 않습니다.' })
      return
    }
    if (!assertStorageObjectKey(objectKeyRaw, [gaIdPath, String(gaId)], userId)) {
      res.status(400).json({ message: '요청이 올바르지 않습니다.' })
      return
    }
    try {
      await r2DeleteStorageObjectOrThrow(objectKeyRaw)
    } catch (e) {
      console.warn('[STORAGE_REVOKE_R2_FAIL]', objectKeyRaw, e)
      res.status(502).json({ message: '파일 저장소에서 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
      return
    }
    if (Number.isInteger(fileIdParsed) && fileIdParsed > 0) {
      await safeQuery(
        pool,
        `
        DELETE FROM files
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
        `,
        [fileIdParsed, userId, gaId],
      )
    } else {
      await safeQuery(
        pool,
        `
        DELETE FROM files
        WHERE file_path = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
        `,
        [objectKeyRaw, userId, gaId],
      )
    }
    res.json({ ok: true })
  }

  async function handleStorageSave(req, res, forcedCustomerId = null) {
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const gaIdPath = await resolveGaPathByGaId(pool, gaId, req.user?.gaCode)
    if (!gaIdPath) {
      res.status(400).json({ message: 'GA ID를 확인할 수 없습니다.' })
      return
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const scope = await resolveStorageCustomerScope(
      req,
      pool,
      res,
      userId,
      gaId,
      forcedCustomerId ?? body.customerId ?? body.customer_id ?? null,
      { required: forcedCustomerId != null },
    )
    if (!scope.ok) {
      return
    }
    const customerId = scope.customerId

    const folderIdRaw = body.folderId ?? body.folder_id
    const folderProvided = folderIdRaw != null && String(folderIdRaw).trim() !== ''
    const folderId = parseFolderId(folderIdRaw)
    if (folderProvided && folderId == null) {
      res.status(400).json({ message: '잘못된 폴더 ID입니다.' })
      return
    }
    if (folderId != null) {
      const folder = await assertFolderOwnedByUser(pool, folderId, userId, gaId)
      if (!folder) {
        res.status(404).json({ message: '폴더를 찾을 수 없습니다.' })
        return
      }
      const fCust = folder.customer_id != null ? Number(folder.customer_id) : null
      if (fCust != null && (customerId == null || fCust !== customerId)) {
        res.status(400).json({ message: '폴더와 고객 범위가 일치하지 않습니다.' })
        return
      }
      if (fCust == null && customerId != null) {
        res.status(400).json({ message: '개인 폴더에는 고객 파일을 넣을 수 없습니다.' })
        return
      }
    }

    const originalName = normalizeStorageFileName(body.fileName ?? body.file_name ?? body.originalName ?? '')
    const displayName = normalizeStorageFileName(body.displayName ?? body.display_name ?? originalName)
    const objectKeyRaw = String(body.objectKey ?? body.object_key ?? '').trim()
    const fileUrl = String(body.fileUrl ?? body.file_url ?? '').trim()
    const sizeRaw = body.size ?? body.file_size
    const fileSize = Number(sizeRaw)
    const mimeType = resolveContentType(body.mimeType ?? body.mime_type)
    const content = String(body.content ?? '').slice(0, CUSTOMER_FILE_CONTENT_MAX)

    if (!isValidStorageFileName(originalName) || !isValidStorageFileName(displayName)) {
      res.status(400).json({ message: '파일 이름이 올바르지 않습니다.' })
      return
    }
    if (!objectKeyRaw) {
      res.status(400).json({ message: 'object key가 필요합니다.' })
      return
    }
    if (!assertStorageObjectKey(objectKeyRaw, [gaIdPath, String(gaId)], userId)) {
      res.status(400).json({ message: '유효하지 않은 object key입니다.' })
      return
    }
    if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > CUSTOMER_FILE_MAX_BYTES) {
      res.status(400).json({ message: '용량 초과' })
      return
    }
    if (CUSTOMER_FILE_BLOCKED_MIME.has(mimeType) || !CUSTOMER_FILE_ALLOWED_MIME.has(mimeType)) {
      res.status(400).json({ message: '파일 형식 오류' })
      return
    }
    const expectedFileUrl = toPublicFileUrl(objectKeyRaw)
    if (fileUrl && fileUrl !== expectedFileUrl) {
      res.status(400).json({ message: '파일 URL이 object key와 일치하지 않습니다.' })
      return
    }

    const uploadFileIdRaw = body.fileId ?? body.uploadFileId ?? body.upload_id
    const uploadFileIdParsed =
      uploadFileIdRaw != null && String(uploadFileIdRaw).trim() !== ''
        ? Number(uploadFileIdRaw)
        : NaN

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      let uploadRow = null
      if (Number.isInteger(uploadFileIdParsed) && uploadFileIdParsed > 0) {
        const ur = await safeQuery(
          client,
          `
          SELECT
            id,
            customer_id,
            file_path,
            file_size,
            mime_type,
            status
          FROM files
          WHERE id = $1
            AND user_id = $2
            AND ga_id = $3
            AND status = 'uploading'
            AND deleted_at IS NULL
          FOR UPDATE
          `,
          [uploadFileIdParsed, userId, gaId],
        )
        if (ur.rowCount > 0) {
          uploadRow = ur.rows[0]
        }
      }
      if (!uploadRow) {
        const ur2 = await safeQuery(
          client,
          `
          SELECT
            id,
            customer_id,
            file_path,
            file_size,
            mime_type,
            status
          FROM files
          WHERE file_path = $1
            AND user_id = $2
            AND ga_id = $3
            AND status = 'uploading'
            AND deleted_at IS NULL
          FOR UPDATE
          `,
          [objectKeyRaw, userId, gaId],
        )
        if (ur2.rowCount > 0) {
          uploadRow = ur2.rows[0]
        }
      }
      if (!uploadRow) {
        await client.query('ROLLBACK')
        res.status(400).json({
          message: '업로드 준비(presign)가 없거나 만료되었습니다. 처음부터 다시 업로드해 주세요.',
        })
        return
      }
      if (String(uploadRow.file_path ?? '').trim() !== objectKeyRaw) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: 'object key가 presign 시점과 일치하지 않습니다.' })
        return
      }
      const rowSize = Number(uploadRow.file_size)
      if (!Number.isFinite(rowSize) || rowSize !== fileSize) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '파일 크기가 presign 시점과 일치하지 않습니다.' })
        return
      }
      const rowMime = String(uploadRow.mime_type ?? '')
        .trim()
        .toLowerCase()
      if (rowMime !== mimeType.trim().toLowerCase()) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '파일 형식이 presign 시점과 일치하지 않습니다.' })
        return
      }
      const rowCustomer = uploadRow.customer_id != null ? Number(uploadRow.customer_id) : null
      if (rowCustomer !== customerId) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '고객 범위가 presign 시점과 일치하지 않습니다.' })
        return
      }

      const qrow = await safeQuery(
        client,
        `
        SELECT storage_used, storage_limit
        FROM users
        WHERE id = $1
          AND ga_id = $2
        FOR UPDATE
        `,
        [userId, gaId],
      )
      if (qrow.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      const used = Number(qrow.rows[0].storage_used)
      const limit = Number(qrow.rows[0].storage_limit)
      if (!Number.isFinite(used) || !Number.isFinite(limit) || used + fileSize > limit) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '저장 공간 한도를 초과했습니다.' })
        return
      }

      const upd = await safeQuery(
        client,
        `
        UPDATE files
        SET
          original_name = $1,
          display_name = $2,
          folder_id = $3,
          mime_type = $4,
          content = $5,
          is_confirmed = true,
          status = 'active'
        WHERE id = $6
          AND user_id = $7
          AND ga_id = $8
          AND status = 'uploading'
          AND deleted_at IS NULL
        RETURNING
          id,
          customer_id,
          team_id,
          folder_id,
          original_name,
          display_name,
          file_path,
          file_size,
          mime_type,
          is_confirmed,
          created_at,
          status,
          deleted_at,
          content,
          NULL::TIMESTAMPTZ AS expires_at
        `,
        [
          originalName,
          displayName,
          folderId,
          mimeType,
          content,
          Number(uploadRow.id),
          userId,
          gaId,
        ],
      )
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(409).json({ message: '파일 상태를 갱신할 수 없습니다. 다시 시도해 주세요.' })
        return
      }
      await safeQuery(
        client,
        `
        UPDATE users
        SET storage_used = storage_used + $1
        WHERE id = $2
          AND ga_id = $3
        `,
        [fileSize, userId, gaId],
      )
      await client.query('COMMIT')
      const row = upd.rows[0]
      res.status(201).json(mapCustomerFileRow(row))
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  }

  async function handleStorageList(req, res, forcedCustomerId = null) {
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const scope = await resolveStorageCustomerScope(
      req,
      pool,
      res,
      userId,
      gaId,
      forcedCustomerId ?? req.query.customerId ?? null,
      { required: forcedCustomerId != null },
    )
    if (!scope.ok) {
      return
    }
    const customerId = scope.customerId
    const folderIdRaw = req.query.folderId ?? req.query.folder_id
    const folderProvided = folderIdRaw != null && String(folderIdRaw).trim() !== ''
    const folderId = parseFolderId(folderIdRaw)
    if (folderProvided && folderId == null) {
      res.status(400).json({ message: '잘못된 폴더 ID입니다.' })
      return
    }
    if (folderId != null) {
      const folder = await assertFolderOwnedByUser(pool, folderId, userId, gaId)
      if (!folder) {
        res.status(404).json({ message: '폴더를 찾을 수 없습니다.' })
        return
      }
    }

    const query = `
      SELECT
        id,
        customer_id,
        team_id,
        folder_id,
        original_name,
        display_name,
        file_path,
        file_size,
        mime_type,
        is_confirmed,
        created_at,
        ''::TEXT AS content,
        status,
        deleted_at,
        NULL::TIMESTAMPTZ AS expires_at
      FROM files
      WHERE user_id = $1
        AND ga_id = $2
        AND status = 'active'
        AND team_id IS NULL
        AND deleted_at IS NULL
        AND (
          ($3::INTEGER IS NULL AND customer_id IS NULL)
          OR customer_id = $3
        )
        AND ($4::BIGINT IS NULL OR folder_id = $4)
      ORDER BY created_at DESC, id DESC
    `
    const rows = await safeQuery(pool, query, [userId, gaId, customerId, folderId])
    res.json(rows.rows.map(mapCustomerFileRow))
  }

  async function handleStorageDelete(req, res) {
    const userId = req.user?.id ? String(req.user.id) : ''
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = requireGaIdFromUser(req, res)
    if (gaId == null) {
      return
    }
    const gaIdPath = await resolveGaPathByGaId(pool, gaId, req.user?.gaCode)
    if (!gaIdPath) {
      res.status(400).json({ message: 'GA ID를 확인할 수 없습니다.' })
      return
    }
    const fileId = Number(req.params.fileId)
    if (!Number.isInteger(fileId) || fileId < 1) {
      res.status(400).json({ message: '잘못된 파일 ID입니다.' })
      return
    }

    const peek = await safeQuery(
      pool,
      `
      SELECT id, customer_id, file_path, file_size, team_id
      FROM files
      WHERE id = $1
        AND user_id = $2
        AND ga_id = $3
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [fileId, userId, gaId],
    )
    if (peek.rowCount === 0) {
      res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
      return
    }
    const peekRow = peek.rows[0]
    if (peekRow.customer_id != null) {
      const ok = await assertCustomerFileAccess(pool, req, Number(peekRow.customer_id), res)
      if (!ok) {
        return
      }
    }
    const rawPath = String(peekRow.file_path ?? '').trim()
    const objectKey = /^https?:\/\//i.test(rawPath)
      ? parseStorageObjectKeyFromPublicUrl(rawPath)
      : rawPath
    if (objectKey && assertStorageObjectKey(objectKey, [gaIdPath, String(gaId)], userId)) {
      try {
        await r2DeleteStorageObjectOrThrow(objectKey)
      } catch (e) {
        console.warn('[STORAGE_DELETE_R2_FAIL]', fileId, objectKey, e)
        res.status(502).json({
          message: '파일 저장소에서 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
    }

    const sz = Number(peekRow.file_size) || 0
    const teamId = peekRow.team_id != null ? String(peekRow.team_id) : ''

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const upd = await safeQuery(
        client,
        `
        UPDATE files
        SET deleted_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND deleted_at IS NULL
        RETURNING id
        `,
        [fileId, userId, gaId],
      )
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (teamId) {
        await safeQuery(
          client,
          `
          UPDATE teams
          SET storage_used = GREATEST(0, storage_used - $1)
          WHERE id = $2
            AND ga_id = $3
          `,
          [sz, teamId, gaId],
        )
      } else {
        await safeQuery(
          client,
          `
          UPDATE users
          SET storage_used = GREATEST(0, storage_used - $1)
          WHERE id = $2
            AND ga_id = $3
          `,
          [sz, userId, gaId],
        )
      }
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  }

  apiRouter.get('/storage/folders', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const scope = await resolveStorageCustomerScope(
        req,
        pool,
        res,
        userId,
        gaId,
        req.query.customerId ?? req.query.customer_id ?? null,
        { required: false },
      )
      if (!scope.ok) {
        return
      }
      const customerId = scope.customerId
      const rows = await safeQuery(
        pool,
        `
        SELECT id, name, customer_id, created_at
        FROM folders
        WHERE user_id = $1
          AND ga_id = $2
          AND (
            ($3::INTEGER IS NULL AND customer_id IS NULL)
            OR customer_id = $3
          )
        ORDER BY created_at DESC, id DESC
        `,
        [userId, gaId, customerId],
      )
      res.json(rows.rows.map(mapFolderRow))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/folders', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const folderName = normalizeFolderName(body.name)
      if (!isValidFolderName(folderName)) {
        res.status(400).json({ message: '폴더 이름은 12자 이내로 입력해 주세요.' })
        return
      }
      if (folderName === '전체') {
        res.status(400).json({ message: '해당 이름은 사용할 수 없습니다.' })
        return
      }
      const scope = await resolveStorageCustomerScope(
        req,
        pool,
        res,
        userId,
        gaId,
        body.customerId ?? body.customer_id ?? null,
        { required: false },
      )
      if (!scope.ok) {
        return
      }
      const customerId = scope.customerId
      if (await folderNameExistsForScope(pool, userId, gaId, customerId, folderName, null)) {
        res.status(409).json({ message: FOLDER_DUPLICATE_NAME_MESSAGE })
        return
      }
      const ins = await safeQuery(
        pool,
        `
        INSERT INTO folders (user_id, ga_id, customer_id, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, customer_id, created_at
        `,
        [userId, gaId, customerId, folderName],
      )
      res.status(201).json(mapFolderRow(ins.rows[0]))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        res.status(409).json({ message: FOLDER_DUPLICATE_NAME_MESSAGE })
        return
      }
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/storage/folders/:folderId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const folderId = parseFolderId(req.params.folderId)
      if (folderId == null) {
        res.status(400).json({ message: '잘못된 폴더 ID입니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const folderName = normalizeFolderName(body.name)
      if (!isValidFolderName(folderName)) {
        res.status(400).json({ message: '폴더 이름은 12자 이내로 입력해 주세요.' })
        return
      }
      if (folderName === '전체') {
        res.status(400).json({ message: '해당 이름은 사용할 수 없습니다.' })
        return
      }
      const folder = await assertFolderOwnedByUser(pool, folderId, userId, gaId)
      if (!folder) {
        res.status(404).json({ message: '폴더를 찾을 수 없습니다.' })
        return
      }
      const scopeCustomerId = folder.customer_id != null ? Number(folder.customer_id) : null
      if (
        await folderNameExistsForScope(pool, userId, gaId, scopeCustomerId, folderName, folderId)
      ) {
        res.status(409).json({ message: FOLDER_DUPLICATE_NAME_MESSAGE })
        return
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE folders
        SET name = $1
        WHERE id = $2
          AND user_id = $3
          AND ga_id = $4
        RETURNING id, name, customer_id, created_at
        `,
        [folderName, folderId, userId, gaId],
      )
      res.json(mapFolderRow(upd.rows[0]))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        res.status(409).json({ message: FOLDER_DUPLICATE_NAME_MESSAGE })
        return
      }
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/storage/folders/:folderId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const folderId = parseFolderId(req.params.folderId)
      if (folderId == null) {
        res.status(400).json({ message: '잘못된 폴더 ID입니다.' })
        return
      }
      const folder = await assertFolderOwnedByUser(pool, folderId, userId, gaId)
      if (!folder) {
        res.status(404).json({ message: '폴더를 찾을 수 없습니다.' })
        return
      }
      const used = await safeQuery(
        pool,
        `
        SELECT 1
        FROM files
        WHERE user_id = $1
          AND ga_id = $2
          AND folder_id = $3
          AND status = 'active'
          AND team_id IS NULL
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [userId, gaId, folderId],
      )
      if (used.rowCount > 0) {
        res.status(409).json({ message: '파일이 있는 폴더는 삭제할 수 없습니다.' })
        return
      }
      await safeQuery(
        pool,
        `
        DELETE FROM folders
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
        `,
        [folderId, userId, gaId],
      )
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/storage/quota', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const q = await fetchPersonalStorageQuota(pool, userId, gaId)
      if (!q) {
        res.status(400).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      const pendingUploadBytes = await fetchPersonalStoragePendingUploadBytes(pool, userId, gaId)
      res.json({
        usedBytes: q.used,
        limitBytes: q.limit,
        pendingUploadBytes,
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/storage/usage-breakdown', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }

      const [storageRows, claimFileRows, customerNewsRows] = await Promise.all([
        safeQuery(
          pool,
          `
          SELECT
            f.id,
            f.customer_id,
            f.display_name,
            f.original_name,
            f.file_size,
            f.created_at,
            COALESCE(NULLIF(TRIM(c.name), ''), '') AS customer_name
          FROM files f
          LEFT JOIN customers c
            ON c.id = f.customer_id
           AND c.user_id = f.user_id
           AND c.ga_id = f.ga_id
           AND c.deleted_at IS NULL
          WHERE f.user_id = $1
            AND f.ga_id = $2
            AND f.team_id IS NULL
            AND f.status = 'active'
            AND f.deleted_at IS NULL
          `,
          [userId, gaId],
        ),
        safeQuery(
          pool,
          `
          SELECT
            f.id AS file_id,
            f.file_name,
            f.file_size,
            f.uploaded_at,
            r.id AS claim_request_id,
            r.customer_id,
            COALESCE(NULLIF(TRIM(c.name), ''), '') AS customer_name
          FROM customer_claim_request_files f
          INNER JOIN customer_claim_requests r
            ON r.id = f.request_id
           AND r.agent_id = $1
           AND r.customer_id = f.customer_id
          INNER JOIN customers c
            ON c.id = r.customer_id
           AND c.user_id = $1
           AND c.ga_id = $2
           AND c.deleted_at IS NULL
          WHERE f.agent_id = $1
          `,
          [userId, gaId],
        ),
        safeQuery(
          pool,
          `
          SELECT
            n.id,
            n.updated_at,
            n.payload
          FROM insurance_company_newsletters n
          WHERE n.ga_id = $1
            AND n.status = 'PUBLISHED'
            AND COALESCE((n.payload->>'customerVisible')::boolean, false) = true
            AND COALESCE(NULLIF(TRIM(n.payload->>'publisherId'), ''), '') = $2
          `,
          [gaId, userId],
        ),
      ])

      const items = []

      for (const row of storageRows.rows) {
        const customerId = row.customer_id != null ? Number(row.customer_id) : null
        const customerNameRaw = String(row.customer_name ?? '').trim()
        const source = customerId == null ? 'personal-storage' : 'customer-storage'
        const sourceLabel = source === 'personal-storage' ? '내 파일' : '고객 파일'
        items.push({
          id: `${source}:${Number(row.id)}`,
          source,
          sourceLabel,
          fileName: String(row.display_name ?? row.original_name ?? '').trim() || `파일 #${Number(row.id)}`,
          size: toFiniteNonNegativeNumber(row.file_size),
          createdAt: toIsoStringOrNull(row.created_at),
          locationLabel:
            source === 'personal-storage'
              ? '내 저장공간'
              : `${customerNameRaw || `고객 #${customerId}`} · 고객 파일`,
          storageFileId: Number(row.id),
          customerId,
          customerName: customerNameRaw || null,
          canDeleteDirectly: true,
        })
      }

      for (const row of claimFileRows.rows) {
        const customerId = Number(row.customer_id)
        const claimRequestId = Number(row.claim_request_id)
        const customerNameRaw = String(row.customer_name ?? '').trim()
        const fileId = Number(row.file_id)
        items.push({
          id: `claim-file:${fileId}`,
          source: 'claim-file',
          sourceLabel: '청구 첨부',
          fileName: String(row.file_name ?? '').trim() || `청구파일 #${fileId}`,
          size: toFiniteNonNegativeNumber(row.file_size),
          createdAt: toIsoStringOrNull(row.uploaded_at),
          locationLabel: `${customerNameRaw || `고객 #${customerId}`} · 청구 #${claimRequestId}`,
          customerId,
          customerName: customerNameRaw || null,
          claimRequestId,
          canDeleteDirectly: false,
        })
      }

      for (const row of customerNewsRows.rows) {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
        const attachments = Array.isArray(payload.attachments) ? payload.attachments : []
        const scope = normalizeCustomerNewsScope(payload.customerNewsScope)
        const targetCustomerId = parseOptionalCustomerId(payload.targetCustomerId)
        const targetCustomerNameRaw = String(payload.targetCustomerName ?? '').trim()
        const locationLabel =
          scope === 'all'
            ? '전체 소식지'
            : targetCustomerNameRaw
              ? `${targetCustomerNameRaw} · 개인 소식지`
              : '개인 소식지'

        for (let index = 0; index < attachments.length; index += 1) {
          const rawAttachment = attachments[index]
          if (!rawAttachment || typeof rawAttachment !== 'object') {
            continue
          }
          const fileName =
            String(rawAttachment.fileName ?? '').trim() || `첨부 #${index + 1}`
          const attachmentId = String(rawAttachment.id ?? `${index + 1}`).trim() || `${index + 1}`
          items.push({
            id: `customer-news:${String(row.id)}:${attachmentId}`,
            source: 'customer-news',
            sourceLabel: '소식지 첨부',
            fileName,
            size: toFiniteNonNegativeNumber(rawAttachment.size),
            createdAt: toIsoStringOrNull(row.updated_at),
            locationLabel,
            customerId: targetCustomerId,
            customerName: targetCustomerNameRaw || null,
            newsId: String(row.id),
            newsScope: scope,
            canDeleteDirectly: false,
          })
        }
      }

      items.sort((a, b) => {
        const sizeDiff = toFiniteNonNegativeNumber(b.size) - toFiniteNonNegativeNumber(a.size)
        if (sizeDiff !== 0) {
          return sizeDiff
        }
        return toSortTimestamp(b.createdAt) - toSortTimestamp(a.createdAt)
      })

      const summary = buildStorageUsageSummary(items)
      const totalSize = items.reduce((sum, item) => sum + toFiniteNonNegativeNumber(item.size), 0)

      res.json({
        items,
        summary,
        totalCount: items.length,
        totalSize,
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/admin/storage/users/:targetUserId/limit', requireAuth, async (req, res) => {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      const targetUserId = String(req.params.targetUserId ?? '').trim()
      if (!targetUserId) {
        res.status(400).json({ message: '잘못된 사용자 ID입니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const limitBytes = parseStorageLimitBytesBody(body)
      if (limitBytes == null) {
        res.status(400).json({ message: 'storageLimitBytes(0 이상 정수)가 필요합니다.' })
        return
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE users
        SET storage_limit = $1
        WHERE id = $2
          AND ga_id = $3
        RETURNING id, storage_limit
        `,
        [limitBytes, targetUserId, adminGa],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
      res.json({ userId: targetUserId, storageLimitBytes: limitBytes })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/admin/storage/teams/:teamId/limit', requireAuth, async (req, res) => {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      const teamId = String(req.params.teamId ?? '').trim()
      if (!teamId) {
        res.status(400).json({ message: '잘못된 팀 ID입니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const limitBytes = parseStorageLimitBytesBody(body)
      if (limitBytes == null) {
        res.status(400).json({ message: 'storageLimitBytes(0 이상 정수)가 필요합니다.' })
        return
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE teams
        SET storage_limit = $1
        WHERE id = $2
          AND ga_id = $3
        RETURNING id, storage_limit
        `,
        [limitBytes, teamId, adminGa],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      res.json({ teamId, storageLimitBytes: limitBytes })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  async function handleAdminStorageUsersBulkLimit(req, res) {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const limitBytes = parseStorageLimitBytesBody(body)
      if (limitBytes == null) {
        res.status(400).json({ message: 'storageLimitBytes(0 이상 정수)가 필요합니다.' })
        return
      }
      const r = await safeQuery(
        pool,
        `
        UPDATE users
        SET storage_limit = $1
        WHERE ga_id = $2
          AND is_deleted = false
        `,
        [limitBytes, adminGa],
      )
      res.json({ ok: true, updatedCount: r.rowCount ?? 0, storageLimitBytes: limitBytes })
    } catch (error) {
      handleDbError(error, req, res)
    }
  }

  async function handleAdminStorageTeamsBulkLimit(req, res) {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const limitBytes = parseStorageLimitBytesBody(body)
      if (limitBytes == null) {
        res.status(400).json({ message: 'storageLimitBytes(0 이상 정수)가 필요합니다.' })
        return
      }
      const r = await safeQuery(
        pool,
        `
        UPDATE teams
        SET storage_limit = $1
        WHERE ga_id = $2
        `,
        [limitBytes, adminGa],
      )
      res.json({ ok: true, updatedCount: r.rowCount ?? 0, storageLimitBytes: limitBytes })
    } catch (error) {
      handleDbError(error, req, res)
    }
  }

  apiRouter.post('/admin/storage/ga/users/bulk-limit', requireAuth, handleAdminStorageUsersBulkLimit)
  apiRouter.patch('/admin/storage/users/bulk-limit', requireAuth, handleAdminStorageUsersBulkLimit)
  apiRouter.patch('/admin/storage/teams/bulk-limit', requireAuth, handleAdminStorageTeamsBulkLimit)

  apiRouter.post('/admin/storage/recalculate', requireAuth, async (req, res) => {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      await recalculateStorageUsedForGa(pool, adminGa)
      res.json({ ok: true, gaId: adminGa })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/admin/storage/orphan-staging-cleanup', requireAuth, async (req, res) => {
    try {
      const adminGa = requireGaTenantAdmin(req, res)
      if (adminGa == null) {
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const uploadMinRaw = body.uploadingOlderThanMinutes ?? body.uploading_older_than_minutes
      const uploadHrsRaw = body.olderThanHours ?? body.older_than_hours
      const uploadingOlderThanMinutes =
        uploadMinRaw != null && String(uploadMinRaw).trim() !== '' && Number.isFinite(Number(uploadMinRaw))
          ? Math.max(1, Math.floor(Number(uploadMinRaw)))
          : uploadHrsRaw != null && String(uploadHrsRaw).trim() !== '' && Number.isFinite(Number(uploadHrsRaw))
            ? Math.max(1, Math.round(Number(uploadHrsRaw) * 60))
            : 20
      const failedOlderThanHours = Number(body.failedOlderThanHours ?? body.failed_older_than_hours ?? 168)
      const batchLimit = Number(body.batchLimit ?? body.batch_limit ?? 80)
      const out = await runStorageUploadOrphanCleanup(pool, {
        gaId: adminGa,
        uploadingOlderThanMinutes,
        failedOlderThanHours: Number.isFinite(failedOlderThanHours) ? failedOlderThanHours : 168,
        batchLimit: Number.isFinite(batchLimit) ? batchLimit : 80,
      })
      res.json({ ok: true, gaId: adminGa, ...out })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/files/presign', requireAuth, async (req, res) => {
    try {
      await handleStoragePresign(req, res, null)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put('/storage/files/upload-proxy', requireAuth, async (req, res) => {
    try {
      await handleStorageUploadProxy(req, res, null)
    } catch (error) {
      if (error && typeof error === 'object' && 'httpStatus' in error && typeof error.httpStatus === 'number') {
        res.status(error.httpStatus).json({
          message: error instanceof Error ? error.message : '요청을 처리할 수 없습니다.',
        })
        return
      }
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/files/revoke-staged', requireAuth, async (req, res) => {
    try {
      await handleStorageRevokeStaged(req, res, null)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/files/upload-fail', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const fileId = Number(body.fileId ?? body.uploadFileId ?? body.upload_id)
      if (!Number.isInteger(fileId) || fileId < 1) {
        res.status(400).json({ message: 'fileId가 필요합니다.' })
        return
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE files
        SET status = 'failed'
        WHERE id = $1
          AND user_id = $2
          AND ga_id = $3
          AND status = 'uploading'
          AND deleted_at IS NULL
        RETURNING id
        `,
        [fileId, userId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '대상 업로드를 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true, fileId })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/files', requireAuth, async (req, res) => {
    try {
      await handleStorageSave(req, res, null)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/storage/files', requireAuth, async (req, res) => {
    try {
      await handleStorageList(req, res, null)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/storage/files/:fileId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const fileId = Number(req.params.fileId)
      if (!Number.isInteger(fileId) || fileId < 1) {
        res.status(400).json({ message: '잘못된 파일 ID입니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const displayName = normalizeStorageFileName(body.displayName ?? body.display_name ?? '')
      if (!isValidStorageFileName(displayName)) {
        res.status(400).json({ message: '파일 이름이 올바르지 않습니다.' })
        return
      }
      const file = await getOwnedStorageFile(pool, fileId, userId, gaId)
      if (!file) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (file.customer_id != null) {
        const scope = await assertCustomerFileAccess(pool, req, Number(file.customer_id), res)
        if (!scope) {
          return
        }
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE files
        SET display_name = $1
        WHERE id = $2
          AND user_id = $3
          AND ga_id = $4
          AND status = 'active'
          AND deleted_at IS NULL
        RETURNING
          id,
          customer_id,
          team_id,
          folder_id,
          original_name,
          display_name,
          file_path,
          file_size,
          mime_type,
          is_confirmed,
          created_at,
          status,
          deleted_at,
          ''::TEXT AS content,
          NULL::TIMESTAMPTZ AS expires_at
        `,
        [displayName, fileId, userId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      res.json(mapCustomerFileRow(upd.rows[0]))
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/storage/files/:fileId/open-token', requireAuth, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const fileId = Number(req.params.fileId)
      if (!Number.isInteger(fileId) || fileId < 1) {
        res.status(400).json({ message: '잘못된 파일 ID입니다.' })
        return
      }
      const file = await getOwnedStorageFile(pool, fileId, userId, gaId)
      if (!file) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (file.customer_id != null) {
        const scope = await assertCustomerFileAccess(pool, req, Number(file.customer_id), res)
        if (!scope) {
          return
        }
      }
      const downloadName = String(file.display_name ?? file.original_name ?? '').trim() || 'download'
      const extHint = inferDefaultExtFromStorageFile(file)
      const pathSegment = toSinglePathFilename(downloadName, `file-${fileId}`, extHint)
      let disposition = 'inline'
      const body = req.body
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const d = String(body.disposition ?? '').trim().toLowerCase()
        if (d === 'attachment') {
          disposition = 'attachment'
        }
      }
      const token = issueStorageOpenToken({
        userId,
        gaId,
        fileId,
        pathSegment,
        customerId: file.customer_id != null ? Number(file.customer_id) : null,
        disposition,
      })
      res.json({
        openUrl: `/api/storage/files/open/${token}/${encodeURIComponent(pathSegment)}`,
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/storage/files/open/:token/:filename', async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        res.status(503).send('Service Unavailable')
        return
      }
      const token = String(req.params.token ?? '').trim()
      let decoded
      try {
        decoded = decodeURIComponent(String(req.params.filename ?? '').trim())
      } catch {
        res.status(400).send('Bad Request')
        return
      }
      const meta = getStorageOpenMeta(token)
      if (!meta) {
        res.status(410).json({ message: '만료되었거나 유효하지 않은 링크입니다.' })
        return
      }
      if (decoded !== meta.pathSegment) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const { userId, gaId, fileId, customerId } = meta
      const file = await getOwnedStorageFile(pool, fileId, userId, gaId)
      if (!file) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const fc = file.customer_id != null ? Number(file.customer_id) : null
      const mc = meta.customerId != null ? Number(meta.customerId) : null
      if (fc !== mc) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const objectKey = resolveStorageFileObjectKey(file.file_path)
      if (!objectKey) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      let buffer
      try {
        buffer = await consentGetBuffer(objectKey)
      } catch (e) {
        console.warn('[storage open] read failed', fileId, objectKey, e)
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const downloadName = String(file.display_name ?? file.original_name ?? '').trim() || 'download'
      const mimeRaw = file.mime_type != null ? String(file.mime_type).trim() : ''
      const contentType = mimeRaw || 'application/octet-stream'
      const disposition = meta.disposition === 'attachment' ? 'attachment' : 'inline'
      res.setHeader('Content-Type', contentType)
      res.setHeader(
        'Content-Disposition',
        disposition === 'attachment'
          ? buildAttachmentContentDisposition(downloadName)
          : buildInlineContentDisposition(downloadName),
      )
      res.setHeader('Content-Length', String(buffer.length))
      res.setHeader(
        'Cache-Control',
        disposition === 'attachment' ? 'private, no-store' : 'private, max-age=300',
      )
      res.end(buffer)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/storage/files/:fileId/download', requireAuth, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaIdFromUser(req, res)
      if (gaId == null) {
        return
      }
      const fileId = Number(req.params.fileId)
      if (!Number.isInteger(fileId) || fileId < 1) {
        res.status(400).json({ message: '잘못된 파일 ID입니다.' })
        return
      }
      const file = await getOwnedStorageFile(pool, fileId, userId, gaId)
      if (!file) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (file.customer_id != null) {
        const scope = await assertCustomerFileAccess(pool, req, Number(file.customer_id), res)
        if (!scope) {
          return
        }
      }
      const objectKey = resolveStorageFileObjectKey(file.file_path)
      if (!objectKey) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      let buffer
      try {
        buffer = await consentGetBuffer(objectKey)
      } catch (e) {
        console.warn('[storage download] read failed', fileId, objectKey, e)
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const downloadName = String(file.display_name ?? file.original_name ?? '').trim() || 'download'
      const mimeRaw = file.mime_type != null ? String(file.mime_type).trim() : ''
      const contentType = mimeRaw || 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(downloadName))
      res.setHeader('Content-Length', String(buffer.length))
      res.end(buffer)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/storage/files/:fileId', requireAuth, async (req, res) => {
    try {
      await handleStorageDelete(req, res)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:id/files/presign', requireAuth, async (req, res) => {
    try {
      await handleStoragePresign(req, res, req.params.id)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put('/customers/:id/files/upload-proxy', requireAuth, async (req, res) => {
    try {
      await handleStorageUploadProxy(req, res, req.params.id)
    } catch (error) {
      if (error && typeof error === 'object' && 'httpStatus' in error && typeof error.httpStatus === 'number') {
        res.status(error.httpStatus).json({
          message: error instanceof Error ? error.message : '요청을 처리할 수 없습니다.',
        })
        return
      }
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:id/files/revoke-staged', requireAuth, async (req, res) => {
    try {
      await handleStorageRevokeStaged(req, res, req.params.id)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customers/:id/files', requireAuth, async (req, res) => {
    try {
      await handleStorageSave(req, res, req.params.id)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customers/:id/files', requireAuth, async (req, res) => {
    try {
      await handleStorageList(req, res, req.params.id)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/customers/files/:fileId', requireAuth, async (req, res) => {
    try {
      await handleStorageDelete(req, res)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })
}
