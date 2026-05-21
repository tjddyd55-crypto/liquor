import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import {
  consentPutInsurerAttachment,
  consentGetBuffer,
  getR2InsurerAttachmentsCacheControl,
  getR2PublicCdnBase,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2GetPresignedPutUrl,
} from '../lib/consentStorage.js'
import {
  assertCustomerNewsMessageObjectKey,
  buildCustomerNewsMessageObjectKey,
  customerNewsAttachmentKindFromMime,
  validateCustomerNewsMessageUpload,
} from '../lib/customerNewsMessageAttachments.js'

const CUSTOMER_APP_TOKEN_KIND = 'CUSTOMER_APP'
const CUSTOMER_APP_TOKEN_EXPIRES_IN = '180d'
const CUSTOMER_CLAIM_FILE_ACCESS_TOKEN_KIND = 'CUSTOMER_CLAIM_FILE_ACCESS'
const CUSTOMER_CLAIM_FILE_ACCESS_TOKEN_EXPIRES_IN = '15m'
const CUSTOMER_NEWS_ATTACHMENT_ACCESS_TOKEN_KIND = 'CUSTOMER_NEWS_ATTACHMENT_ACCESS'
const CUSTOMER_NEWS_ATTACHMENT_ACCESS_TOKEN_EXPIRES_IN = '15m'
const CUSTOMER_LINK_ACTIVE = 'active'
const CUSTOMER_DEVICE_ACTIVE = 'active'
const CUSTOMER_CLAIM_STATUSES = new Set(['requested', 'processing', 'done', 'rejected', 'canceled'])
const CUSTOMER_CLAIM_FILE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/**
 * 고객앱 연결용 https fallback (/customer-app/link?code=…).
 * @param {import('express').Request} req
 * @param {string} linkCode
 */
function buildCustomerAppUniversalLinkOpenUrl(req, linkCode) {
  const envPage = String(process.env.CUSTOMER_APP_LINK_PAGE_BASE ?? '').trim()
  const legacy = String(process.env.CUSTOMER_APP_UNIVERSAL_BASE ?? '')
    .trim()
    .replace(/\/customer-app\/connect\/?$/i, '/customer-app/link')
  const fallback = `${req.protocol}://${req.get('host')}/customer-app/link`
  const base = (envPage || legacy || fallback).replace(/\/+$/, '')
  return `${base}?code=${encodeURIComponent(String(linkCode))}`
}

function buildCustomerAppNativeDeepLink(linkCode) {
  return `insurancecustomer://connect?code=${encodeURIComponent(String(linkCode))}`
}

/**
 * @param {unknown} value
 */
function parsePositiveInt(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}

/**
 * @param {import('express').Request} req
 */
function readBearerToken(req) {
  const authHeader = String(req.headers.authorization ?? '')
  if (!authHeader.startsWith('Bearer ')) {
    return ''
  }
  return authHeader.slice('Bearer '.length).trim()
}

function generateLinkCode() {
  return randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()
}

function generateCustomerCode() {
  return `C${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function sanitizeUserIdForObjectKeySegment(userId) {
  const s = String(userId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
  return s || '_'
}

function normalizeGaCodePath(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

/**
 * @param {string} fileName
 */
function sanitizeFileName(fileName) {
  const raw = String(fileName ?? '').trim() || 'file'
  return raw.replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120) || 'file'
}

/**
 * @param {string} contentType
 */
function maxBytesForMime(contentType) {
  return contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function sanitizeProfileField(value, max) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/**
 * @param {unknown} raw
 */
function normalizeRequester(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const payload = /** @type {{ name?: unknown, birthDate?: unknown, phone?: unknown }} */ (raw)
  const name = sanitizeProfileField(payload.name, 120)
  const birthDate = sanitizeProfileField(payload.birthDate, 20)
  const phone = sanitizeProfileField(payload.phone, 30)
  if (!name || !birthDate || !phone) {
    return null
  }
  return { name, birthDate, phone }
}

/**
 * @param {{ ssn?: unknown, birth_date?: unknown }} row
 */
function deriveCustomerBirthDate(row) {
  const ssnDigits = String(row?.ssn ?? '').replace(/[^0-9]/g, '')
  if (ssnDigits.length >= 6) {
    return ssnDigits.slice(0, 6)
  }
  const birthDateRaw = String(row?.birth_date ?? '').trim()
  const dateDigits = birthDateRaw.replace(/[^0-9]/g, '')
  if (dateDigits.length >= 8) {
    return dateDigits.slice(2, 8)
  }
  return ''
}

/** 전용 링크·DB 기반 연결: 임시 연락처/생년월일 없이 필수값이 모두 있을 때만 요청자 정보를 반환한다. */
const CONNECT_PROFILE_INCOMPLETE_MESSAGE =
  '고객앱 연결에 필요한 고객 정보가 부족합니다. 설계사에게 이름, 생년월일, 연락처 등록을 요청해 주세요.'
const CUSTOMER_PROFILE_INCOMPLETE_CODE = 'CUSTOMER_PROFILE_INCOMPLETE'

/**
 * @param {{ name?: unknown, ssn?: unknown, birth_date?: unknown, phone?: unknown }} row
 */
function buildRequesterFromCustomerRowStrict(row) {
  if (!row || typeof row !== 'object') {
    return null
  }
  const name = sanitizeProfileField(row.name, 120)
  if (!name) {
    return null
  }
  const birthDate = deriveCustomerBirthDate(row)
  if (!birthDate) {
    return null
  }
  const phone = sanitizeProfileField(row.phone, 30)
  if (!phone) {
    return null
  }
  return { name, birthDate, phone }
}

/**
 * @param {unknown} raw
 * @returns {{
 *  id: string
 *  kind: 'image' | 'file'
 *  url: string
 *  fileName: string
 *  sortOrder: number
 *  objectKey?: string
 *  mimeType?: string
 *  size?: number
 * }[]}
 */
function normalizeCustomerNewsAttachments(raw) {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = /** @type {{ kind?: unknown, url?: unknown, objectKey?: unknown, fileName?: unknown, mimeType?: unknown, size?: unknown, sortOrder?: unknown }} */ (item)
      const kind = String(row.kind ?? '') === 'file' ? 'file' : 'image'
      const url = String(row.url ?? '').trim()
      const objectKey = String(row.objectKey ?? '').trim()
      const fileName = sanitizeFileName(row.fileName ?? `${kind}-${index + 1}`)
      const mimeType = String(row.mimeType ?? '').trim().slice(0, 120)
      const size = Number(row.size ?? 0)
      const sortOrder = Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index
      if (!url) {
        return null
      }
      return {
        id: randomUUID(),
        kind,
        url,
        fileName,
        sortOrder,
        ...(objectKey ? { objectKey } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * 다운로드용 Content-Disposition (한글 filename* 포함)
 * @param {string} fileNameRaw
 * @param {'inline'|'attachment'} mode
 */
function buildContentDisposition(fileNameRaw, mode = 'inline') {
  const name = String(fileNameRaw ?? '').trim() || 'download'
  const ascii =
    name
      .replace(/["\r\n\\]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim()
      .slice(0, 200) || 'download'
  const star = encodeURIComponent(name)
  const dispositionType = mode === 'attachment' ? 'attachment' : 'inline'
  return `${dispositionType}; filename="${ascii}"; filename*=UTF-8''${star}`
}

/**
 * @param {import('express').Request} req
 * @param {string} path
 */
function buildAbsoluteBackendUrl(req, path) {
  const host = String(req.get('host') ?? '').trim()
  if (!host) {
    return path
  }
  return `${req.protocol}://${host}${path}`
}

/**
 * @param {import('express').Request} req
 * @param {number} maxBytes
 */
async function readRawBodyBuffer(req, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bufferChunk.length
    if (total > maxBytes) {
      const error = new Error('파일 크기가 허용 범위를 벗어났습니다.')
      // @ts-expect-error custom error shape
      error.httpStatus = 413
      throw error
    }
    chunks.push(bufferChunk)
  }
  return Buffer.concat(chunks)
}

/**
 * @param {string} storageKey
 * @param {string} agentId
 * @param {number} customerId
 */
function assertClaimStorageKeyScope(storageKey, agentId, customerId) {
  const key = String(storageKey ?? '').trim()
  if (!key || key.includes('..')) {
    return false
  }
  const userSeg = sanitizeUserIdForObjectKeySegment(agentId)
  return key.startsWith(`insurer/`) && key.includes(`/${userSeg}/customer-app-claims/`)
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 */
async function findActiveLink(pool, agentId, customerId) {
  const result = await pool.query(
    `
    SELECT id, link_code, status, created_at, expires_at, last_connected_at
    FROM customer_app_links
    WHERE agent_id = $1
      AND customer_id = $2
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [agentId, customerId],
  )
  if (result.rowCount === 0) {
    return null
  }
  return result.rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 */
async function findLatestLink(pool, agentId, customerId) {
  const result = await pool.query(
    `
    SELECT id, link_code, status, created_at, expires_at, last_connected_at
    FROM customer_app_links
    WHERE agent_id = $1
      AND customer_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [agentId, customerId],
  )
  if (result.rowCount === 0) {
    return null
  }
  return result.rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 */
async function findActiveLinkByAgent(pool, agentId) {
  const result = await pool.query(
    `
    SELECT id, customer_id, link_code, status, created_at, expires_at, last_connected_at
    FROM customer_app_links
    WHERE agent_id = $1
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [agentId],
  )
  if (result.rowCount === 0) {
    return null
  }
  return result.rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 */
async function countActiveDevices(pool, agentId, customerId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c
    FROM customer_app_devices
    WHERE agent_id = $1
      AND customer_id = $2
      AND status = 'active'
    `,
    [agentId, customerId],
  )
  return Number(r.rows[0]?.c ?? 0)
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *  agentId: string | null
 *  customerId: number | null
 *  deviceId: string | null
 *  linkCode: string | null
 *  action: string
 *  result: string
 *  reason?: string
 *  meta?: Record<string, unknown> | null
 * }} payload
 */
async function writeLinkAudit(pool, payload) {
  await pool.query(
    `
    INSERT INTO customer_link_audit_logs
      (agent_id, customer_id, device_id, link_code, action, result, reason, meta_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
    `,
    [
      payload.agentId,
      payload.customerId,
      payload.deviceId,
      payload.linkCode,
      payload.action,
      payload.result,
      payload.reason ?? null,
      payload.meta ? JSON.stringify(payload.meta) : null,
    ],
  )
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 */
async function loadAgentAndCustomerDisplay(pool, agentId, customerId) {
  const r = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), '담당 설계사') AS agent_name,
      NULLIF(TRIM(u.phone_number), '') AS agent_phone,
      COALESCE(NULLIF(TRIM(c.name), ''), '고객') AS customer_name,
      c.id AS customer_id,
      u.id AS agent_id,
      u.ga_id
    FROM customers c
    INNER JOIN users u ON u.id = $2
    WHERE c.id = $1
    LIMIT 1
    `,
    [customerId, agentId],
  )
  if (r.rowCount === 0) {
    return null
  }
  return r.rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 * @param {import('express').Request['user']} user
 */
async function assertAgentCanAccessCustomer(pool, agentId, customerId, user) {
  const role = String(user?.role ?? '')
  if (role === 'INSURER_MANAGER' || role === 'LOSS_ADJUSTER') {
    return { ok: false, status: 403, message: '해당 계정은 고객 앱 링크를 생성할 수 없습니다.' }
  }
  const gaId = parsePositiveInt(user?.gaId)
  if (gaId == null) {
    return { ok: false, status: 400, message: 'GA 컨텍스트를 확인할 수 없습니다.' }
  }
  if (role === 'SUPER_ADMIN' || role === 'GA_ADMIN' || role === 'GA_STAFF') {
    const r = await pool.query(
      `
      SELECT id
      FROM customers
      WHERE id = $1
        AND ga_id = $2
      LIMIT 1
      `,
      [customerId, gaId],
    )
    return r.rowCount > 0
      ? { ok: true }
      : { ok: false, status: 404, message: '고객을 찾을 수 없습니다.' }
  }
  if (String(user?.id ?? '').trim() !== agentId) {
    return { ok: false, status: 403, message: '고객 접근 권한이 없습니다.' }
  }
  const r = await pool.query(
    `
    SELECT id
    FROM customers
    WHERE id = $1
      AND user_id = $2
      AND ga_id = $3
    LIMIT 1
    `,
    [customerId, agentId, gaId],
  )
  return r.rowCount > 0
    ? { ok: true }
    : { ok: false, status: 404, message: '고객을 찾을 수 없습니다.' }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 */
async function resolveAgentGaId(pool, agentId) {
  const r = await pool.query(`SELECT ga_id FROM users WHERE id = $1 LIMIT 1`, [agentId])
  const gaId = parsePositiveInt(r.rows[0]?.ga_id)
  return gaId
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 */
async function resolveGaPathByGaId(pool, gaId) {
  if (!Number.isInteger(gaId) || gaId < 1) {
    return null
  }
  const row = await pool.query(
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

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} gaId
 */
async function loadAgentStorageQuota(pool, agentId, gaId) {
  const row = await pool.query(
    `
    SELECT storage_used, storage_limit
    FROM users
    WHERE id = $1
      AND ga_id = $2
    LIMIT 1
    `,
    [agentId, gaId],
  )
  if (row.rowCount === 0) {
    return null
  }
  const used = Number(row.rows[0]?.storage_used ?? 0)
  const limit = Number(row.rows[0]?.storage_limit ?? 0)
  return {
    used: Number.isFinite(used) ? used : 0,
    limit: Number.isFinite(limit) ? limit : 0,
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} gaId
 */
async function createCustomerForLink(pool, agentId, gaId) {
  let tries = 0
  while (tries < 10) {
    tries += 1
    const customerCode = generateCustomerCode()
    try {
      const created = await pool.query(
        `
        INSERT INTO customers (user_id, ga_id, name, notes, customer_code)
        VALUES ($1, $2, $3, CAST($4 AS jsonb), $5)
        RETURNING id, customer_code, name
        `,
        [agentId, gaId, '앱 사용자', JSON.stringify([]), customerCode],
      )
      if (created.rowCount > 0) {
        return created.rows[0]
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        continue
      }
      throw error
    }
  }
  return null
}

/**
 * 설계사 1코드 정책:
 * - 설계사(agent_id)마다 앱 연결 전용 customer_id를 1개 유지
 * - 다수 앱 설치자는 해당 설계사 코드로 같은 연결 타깃(customer_id)에 묶임
 *
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} gaId
 */
async function ensureAgentLinkCustomer(pool, agentId, gaId) {
  const mapped = await pool.query(
    `
    SELECT t.customer_id, c.customer_code
    FROM agent_app_link_targets t
    INNER JOIN customers c ON c.id = t.customer_id
    WHERE t.agent_id = $1
    LIMIT 1
    `,
    [agentId],
  )
  if (mapped.rowCount > 0) {
    return {
      customerId: Number(mapped.rows[0].customer_id),
      customerCode: String(mapped.rows[0].customer_code ?? ''),
    }
  }

  const created = await createCustomerForLink(pool, agentId, gaId)
  if (!created) {
    return null
  }

  const inserted = await pool.query(
    `
    INSERT INTO agent_app_link_targets (agent_id, ga_id, customer_id, created_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (agent_id)
    DO UPDATE SET ga_id = EXCLUDED.ga_id, updated_at = NOW()
    RETURNING customer_id
    `,
    [agentId, gaId, Number(created.id)],
  )
  return {
    customerId: Number(inserted.rows[0]?.customer_id ?? created.id),
    customerCode: String(created.customer_code ?? ''),
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} agentId
 * @param {number} customerId
 * @param {string} deviceId
 */
async function ensureCustomerAppActiveContext(pool, agentId, customerId, deviceId) {
  const r = await pool.query(
    `
    SELECT
      d.id AS device_row_id,
      d.status AS device_status,
      d.link_id,
      l.status AS link_status,
      l.expires_at
    FROM customer_app_devices d
    INNER JOIN customer_app_links l ON l.id = d.link_id
    WHERE d.agent_id = $1
      AND d.customer_id = $2
      AND d.device_id = $3
    LIMIT 1
    `,
    [agentId, customerId, deviceId],
  )
  if (r.rowCount === 0) {
    return { ok: false, status: 401, message: '연결 정보가 없습니다. 다시 연결해 주세요.' }
  }
  const row = r.rows[0]
  const expired =
    row.expires_at != null &&
    Number.isFinite(new Date(String(row.expires_at)).getTime()) &&
    new Date(String(row.expires_at)).getTime() <= Date.now()
  if (row.device_status !== CUSTOMER_DEVICE_ACTIVE || row.link_status !== CUSTOMER_LINK_ACTIVE || expired) {
    return { ok: false, status: 403, message: '연결이 비활성화되었습니다. 설계사 링크로 다시 연결해 주세요.' }
  }
  return { ok: true, row }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {{ agentId: string, customerId: number, deviceId: string }} context
 */
async function loadCustomerAppProfile(executor, context) {
  const row = await executor.query(
    `
    SELECT name, birth_date, phone, updated_at
    FROM customer_app_profiles
    WHERE agent_id = $1
      AND customer_id = $2
      AND device_id = $3
    LIMIT 1
    `,
    [context.agentId, context.customerId, context.deviceId],
  )
  if (row.rowCount === 0) {
    return null
  }
  return {
    name: String(row.rows[0].name ?? ''),
    birthDate: String(row.rows[0].birth_date ?? ''),
    phone: String(row.rows[0].phone ?? ''),
    savedAt: row.rows[0].updated_at ? new Date(row.rows[0].updated_at).toISOString() : null,
  }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {{ agentId: string, customerId: number, deviceId: string }} context
 * @param {{ name: string, birthDate: string, phone: string }} requester
 */
async function upsertCustomerAppProfile(executor, context, requester) {
  await executor.query(
    `
    INSERT INTO customer_app_profiles
      (agent_id, customer_id, device_id, name, birth_date, phone, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (agent_id, customer_id, device_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      birth_date = EXCLUDED.birth_date,
      phone = EXCLUDED.phone,
      updated_at = NOW()
    `,
    [context.agentId, context.customerId, context.deviceId, requester.name, requester.birthDate, requester.phone],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {{ agentId: string, customerId: number }} context
 * @param {{ name: string, phone: string }} requester
 */
async function syncProfileToLinkedCustomer(executor, context, requester) {
  await executor.query(
    `
    UPDATE customers
    SET
      name = $1,
      phone = CASE WHEN $2 <> '' THEN $2 ELSE phone END
    WHERE id = $3
      AND user_id = $4
    `,
    [requester.name, requester.phone, context.customerId, context.agentId],
  )
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{
 *  pool: import('pg').Pool
 *  requireAuth: import('express').RequestHandler
 *  handleDbError: (error: unknown, req: import('express').Request, res: import('express').Response) => void
 *  jwtSecret: string
 * }} ctx
 */
export function registerCustomerClaimAppApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError, jwtSecret } = ctx

  /**
   * @param {{
   *  scope: 'agent' | 'customer'
   *  fileId: number
   *  agentId: string
   *  customerId: number
   *  deviceId?: string
   * }} payload
   */
  function signClaimFileAccessToken(payload) {
    return jwt.sign(
      {
        kind: CUSTOMER_CLAIM_FILE_ACCESS_TOKEN_KIND,
        scope: payload.scope,
        fileId: payload.fileId,
        agentId: payload.agentId,
        customerId: payload.customerId,
        ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
      },
      jwtSecret,
      { expiresIn: CUSTOMER_CLAIM_FILE_ACCESS_TOKEN_EXPIRES_IN },
    )
  }

  /**
   * @param {import('express').Request} req
   * @param {{
   *  scope: 'agent' | 'customer'
   *  fileId: number
   *  agentId: string
   *  customerId: number
   *  deviceId?: string
   *  download?: boolean
   * }} payload
   */
  function buildClaimFileAccessUrl(req, payload) {
    const token = signClaimFileAccessToken({
      scope: payload.scope,
      fileId: payload.fileId,
      agentId: payload.agentId,
      customerId: payload.customerId,
      ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
    })
    const qs = new URLSearchParams({ accessToken: token })
    if (payload.download) {
      qs.set('download', '1')
    }
    const routePath =
      payload.scope === 'agent'
        ? `/backend/agent/customer-claim-files/${payload.fileId}/download`
        : `/backend/customer-app/claim-files/${payload.fileId}/download`
    return buildAbsoluteBackendUrl(req, `${routePath}?${qs.toString()}`)
  }

  /**
   * 개인파일 UX와 동일하게 "열기"는 CDN 직링크를 우선한다.
   * 단, R2 미구성 환경에서는 서버 다운로드 URL로 자동 fallback.
   * @param {import('express').Request} req
   * @param {{
   *  scope: 'agent' | 'customer'
   *  fileId: number
   *  agentId: string
   *  customerId: number
   *  deviceId?: string
   *  storageKey: string
   * }} payload
   */
  function buildClaimFileOpenUrl(req, payload) {
    const storageKey = String(payload.storageKey ?? '').trim().replace(/^\//, '')
    if (storageKey && isConsentR2Enabled()) {
      const cdnBase = getR2PublicCdnBase().replace(/\/$/, '')
      return `${cdnBase}/${storageKey}`
    }
    return buildClaimFileAccessUrl(req, {
      scope: payload.scope,
      fileId: payload.fileId,
      agentId: payload.agentId,
      customerId: payload.customerId,
      ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
    })
  }

  /**
   * @param {string} rawToken
   */
  function verifyClaimFileAccessToken(rawToken) {
    try {
      const decoded = jwt.verify(rawToken, jwtSecret)
      if (!decoded || typeof decoded !== 'object') {
        return null
      }
      const payload = /** @type {{
       *  kind?: unknown
       *  scope?: unknown
       *  fileId?: unknown
       *  agentId?: unknown
       *  customerId?: unknown
       *  deviceId?: unknown
       * }} */ (decoded)
      if (String(payload.kind ?? '') !== CUSTOMER_CLAIM_FILE_ACCESS_TOKEN_KIND) {
        return null
      }
      const scope = String(payload.scope ?? '') === 'customer' ? 'customer' : String(payload.scope ?? '') === 'agent' ? 'agent' : null
      const fileId = parsePositiveInt(payload.fileId)
      const agentId = String(payload.agentId ?? '').trim()
      const customerId = parsePositiveInt(payload.customerId)
      const deviceId = String(payload.deviceId ?? '').trim()
      if (!scope || fileId == null || !agentId || customerId == null) {
        return null
      }
      if (scope === 'customer' && !deviceId) {
        return null
      }
      return { scope, fileId, agentId, customerId, deviceId: deviceId || null }
    } catch {
      return null
    }
  }

  /**
   * @param {import('express').Request} req
   */
  function resolveDownloadMode(req) {
    const raw = String(req.query.download ?? req.query.disposition ?? '').trim().toLowerCase()
    if (raw === '1' || raw === 'true' || raw === 'attachment') {
      return 'attachment'
    }
    return 'inline'
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async function requireCustomerAppAuth(req, res, next) {
    const token = readBearerToken(req)
    if (!token) {
      res.status(401).json({ message: '고객 앱 토큰이 필요합니다.' })
      return
    }
    try {
      const decoded = jwt.verify(token, jwtSecret)
      if (!decoded || typeof decoded !== 'object') {
        res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
        return
      }
      const payload = /** @type {{ kind?: unknown, agentId?: unknown, customerId?: unknown, deviceId?: unknown, linkId?: unknown }} */ (decoded)
      if (String(payload.kind ?? '') !== CUSTOMER_APP_TOKEN_KIND) {
        res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
        return
      }
      const agentId = String(payload.agentId ?? '').trim()
      const customerId = parsePositiveInt(payload.customerId)
      const deviceId = String(payload.deviceId ?? '').trim()
      const linkId = parsePositiveInt(payload.linkId)
      if (!agentId || customerId == null || !deviceId || linkId == null) {
        res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
        return
      }
      const contextCheck = await ensureCustomerAppActiveContext(pool, agentId, customerId, deviceId)
      if (!contextCheck.ok) {
        res.status(contextCheck.status).json({ message: contextCheck.message })
        return
      }
      req.customerApp = { agentId, customerId, deviceId, linkId }
      await pool.query(
        `
        UPDATE customer_app_devices
        SET last_active_at = NOW(),
            updated_at = NOW()
        WHERE agent_id = $1
          AND customer_id = $2
          AND device_id = $3
        `,
        [agentId, customerId, deviceId],
      )
      next()
    } catch {
      res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
    }
  }

  apiRouter.get('/agent/customer-app-links', requireAuth, async (_req, res) => {
    res.status(405).json({ message: 'GET이 아니라 POST /agent/customer-app-links 를 사용해 주세요.' })
  })

  apiRouter.post('/agent/customer-app-links', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const requestedGaId = parsePositiveInt(req.user?.gaId)
      const gaId = requestedGaId ?? (await resolveAgentGaId(pool, agentId))
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const requestedCustomerId = parsePositiveInt(req.body?.customerId)
      let finalCustomerId = null
      let customerCode = ''
      if (requestedCustomerId != null) {
        const permission = await assertAgentCanAccessCustomer(pool, agentId, requestedCustomerId, req.user)
        if (!permission.ok) {
          res.status(permission.status).json({ message: permission.message })
          return
        }
        const customerRow = await pool.query(
          `
          SELECT customer_code
          FROM customers
          WHERE id = $1
          LIMIT 1
          `,
          [requestedCustomerId],
        )
        if (customerRow.rowCount === 0) {
          res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
          return
        }
        finalCustomerId = requestedCustomerId
        customerCode = String(customerRow.rows[0]?.customer_code ?? '')
      } else {
        const linkedCustomer = await ensureAgentLinkCustomer(pool, agentId, gaId)
        if (!linkedCustomer) {
          res.status(500).json({ message: '설계사 연결코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
          return
        }
        finalCustomerId = linkedCustomer.customerId
        customerCode = linkedCustomer.customerCode
      }

      const existing = await findActiveLink(pool, agentId, finalCustomerId)
      if (existing) {
        const deviceCount = await countActiveDevices(pool, agentId, finalCustomerId)
        const lc = String(existing.link_code)
        res.json({
          success: true,
          data: {
            linkId: Number(existing.id),
            linkCode: lc,
            agentCode: lc,
            connectUrl: buildCustomerAppNativeDeepLink(lc),
            universalUrl: buildCustomerAppUniversalLinkOpenUrl(req, lc),
            customerId: finalCustomerId,
            customerCode,
            status: String(existing.status),
            lastConnectedAt: existing.last_connected_at ? new Date(existing.last_connected_at).toISOString() : null,
            deviceCount,
          },
        })
        return
      }
      let created = null
      let tries = 0
      while (tries < 5 && !created) {
        tries += 1
        const code = generateLinkCode()
        try {
          const insert = await pool.query(
            `
            INSERT INTO customer_app_links
              (agent_id, customer_id, link_code, status, created_by_user_id, created_at, updated_at)
            VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())
            RETURNING id, link_code, status, created_at, expires_at, last_connected_at
            `,
            [agentId, finalCustomerId, code, agentId],
          )
          created = insert.rows[0]
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
            continue
          }
          throw error
        }
      }
      if (!created) {
        res.status(500).json({ message: '링크 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
        return
      }
      await writeLinkAudit(pool, {
        agentId,
        customerId: finalCustomerId,
        deviceId: null,
        linkCode: String(created.link_code),
        action: 'create_link',
        result: 'success',
      })
      res.status(201).json({
        success: true,
        data: {
          linkId: Number(created.id),
          linkCode: String(created.link_code),
          agentCode: String(created.link_code),
          connectUrl: buildCustomerAppNativeDeepLink(String(created.link_code)),
          universalUrl: buildCustomerAppUniversalLinkOpenUrl(req, String(created.link_code)),
          customerId: finalCustomerId,
          customerCode,
          status: String(created.status),
          createdAt: created.created_at ? new Date(created.created_at).toISOString() : new Date().toISOString(),
          deviceCount: 0,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customers/:customerId/customer-app-link', requireAuth, async (req, res) => {
    try {
      const customerId = parsePositiveInt(req.params.customerId)
      if (customerId == null) {
        res.json({ success: true, data: null })
        return
      }
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const permission = await assertAgentCanAccessCustomer(pool, agentId, customerId, req.user)
      if (!permission.ok) {
        res.status(permission.status).json({ message: permission.message })
        return
      }
      const link = await findLatestLink(pool, agentId, customerId)
      if (!link) {
        res.json({
          success: true,
          data: {
            connectionState: 'not_created',
          },
        })
        return
      }
      const status = String(link.status ?? '')
      const expiresAtMs = link.expires_at ? new Date(link.expires_at).getTime() : null
      const expired = expiresAtMs != null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()
      const isUsable = status === CUSTOMER_LINK_ACTIVE && !expired
      const deviceCount = isUsable ? await countActiveDevices(pool, agentId, customerId) : 0
      const connected = Boolean(link.last_connected_at) || deviceCount > 0
      const connectionState = !isUsable ? 'expired' : connected ? 'connected' : 'link_created'
      const lc = String(link.link_code)
      res.json({
        success: true,
        data: {
          linkId: Number(link.id),
          linkCode: lc,
          connectUrl: buildCustomerAppNativeDeepLink(lc),
          universalUrl: buildCustomerAppUniversalLinkOpenUrl(req, lc),
          status,
          connectionState,
          createdAt: link.created_at ? new Date(link.created_at).toISOString() : null,
          expiresAt: link.expires_at ? new Date(link.expires_at).toISOString() : null,
          lastConnectedAt: link.last_connected_at ? new Date(link.last_connected_at).toISOString() : null,
          deviceCount,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customer-claim-requests', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const statusFilter = String(req.query.status ?? '').trim()
      const customerId = parsePositiveInt(req.query.customerId)
      const page = Math.max(1, parsePositiveInt(req.query.page) ?? 1)
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parsePositiveInt(req.query.pageSize) ?? DEFAULT_PAGE_SIZE))
      const offset = (page - 1) * pageSize
      const where = ['r.agent_id = $1']
      const params = [agentId]
      if (statusFilter) {
        if (!CUSTOMER_CLAIM_STATUSES.has(statusFilter)) {
          res.status(400).json({ message: '유효하지 않은 상태값입니다.' })
          return
        }
        where.push(`r.status = $${params.length + 1}`)
        params.push(statusFilter)
      }
      if (customerId != null) {
        where.push(`r.customer_id = $${params.length + 1}`)
        params.push(customerId)
      }
      const whereSql = where.join(' AND ')
      const listSql = `
        SELECT
          r.id,
          r.customer_id,
          r.device_id,
          COALESCE(NULLIF(TRIM(c.name), ''), '고객') AS customer_name,
          r.requester_name,
          r.requester_birth_date,
          r.requester_phone,
          r.status,
          r.title,
          r.memo,
          r.submitted_at,
          (
            SELECT COUNT(*)::int
            FROM customer_claim_request_files f
            WHERE f.request_id = r.id
          ) AS file_count
        FROM customer_claim_requests r
        INNER JOIN customers c ON c.id = r.customer_id
        WHERE ${whereSql}
        ORDER BY r.submitted_at DESC, r.id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `
      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM customer_claim_requests r
        WHERE ${whereSql}
      `
      const [listResult, countResult] = await Promise.all([
        pool.query(listSql, [...params, pageSize, offset]),
        pool.query(countSql, params),
      ])
      const total = Number(countResult.rows[0]?.total ?? 0)
      res.json({
        success: true,
        data: {
          page,
          pageSize,
          total,
          rows: listResult.rows.map((row) => ({
            id: Number(row.id),
            customerId: Number(row.customer_id),
            deviceId: String(row.device_id ?? ''),
            customerName: String(row.customer_name ?? ''),
            requesterName: String(row.requester_name ?? ''),
            requesterBirthDate: String(row.requester_birth_date ?? ''),
            requesterPhone: String(row.requester_phone ?? ''),
            status: String(row.status ?? ''),
            title: String(row.title ?? ''),
            memo: String(row.memo ?? ''),
            submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
            fileCount: Number(row.file_count ?? 0),
          })),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customer-claim-requests/:requestId', requireAuth, async (req, res) => {
    try {
      const requestId = parsePositiveInt(req.params.requestId)
      if (requestId == null) {
        res.status(400).json({ message: '유효한 requestId가 필요합니다.' })
        return
      }
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const requestResult = await pool.query(
        `
        SELECT
          r.*,
          COALESCE(NULLIF(TRIM(c.name), ''), '고객') AS customer_name
        FROM customer_claim_requests r
        INNER JOIN customers c ON c.id = r.customer_id
        WHERE r.id = $1
          AND r.agent_id = $2
        LIMIT 1
        `,
        [requestId, agentId],
      )
      if (requestResult.rowCount === 0) {
        res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
        return
      }
      const requestRow = requestResult.rows[0]
      const [filesResult, logsResult] = await Promise.all([
        pool.query(
          `
          SELECT
            id,
            storage_key,
            file_name,
            content_type,
            file_size,
            sort_order,
            uploaded_at
          FROM customer_claim_request_files
          WHERE request_id = $1
          ORDER BY sort_order ASC, id ASC
          `,
          [requestId],
        ),
        pool.query(
          `
          SELECT
            id,
            from_status,
            to_status,
            changed_by_user_id,
            changed_at,
            memo
          FROM customer_claim_status_logs
          WHERE request_id = $1
          ORDER BY changed_at DESC, id DESC
          `,
          [requestId],
        ),
      ])
      res.json({
        success: true,
        data: {
          id: Number(requestRow.id),
          agentId: String(requestRow.agent_id),
          customerId: Number(requestRow.customer_id),
          customerName: String(requestRow.customer_name ?? ''),
          requesterName: String(requestRow.requester_name ?? ''),
          requesterBirthDate: String(requestRow.requester_birth_date ?? ''),
          requesterPhone: String(requestRow.requester_phone ?? ''),
          deviceId: String(requestRow.device_id ?? ''),
          status: String(requestRow.status ?? ''),
          title: String(requestRow.title ?? ''),
          memo: String(requestRow.memo ?? ''),
          requestType: String(requestRow.request_type ?? 'claim'),
          submittedAt: requestRow.submitted_at ? new Date(requestRow.submitted_at).toISOString() : null,
          processedAt: requestRow.processed_at ? new Date(requestRow.processed_at).toISOString() : null,
          files: filesResult.rows.map((file) => {
            const fileId = Number(file.id)
            const storageKey = String(file.storage_key ?? '')
            return {
              id: fileId,
              storageKey,
              fileName: String(file.file_name ?? ''),
              contentType: String(file.content_type ?? ''),
              fileSize: Number(file.file_size ?? 0),
              sortOrder: Number(file.sort_order ?? 0),
              uploadedAt: file.uploaded_at ? new Date(file.uploaded_at).toISOString() : null,
              url: buildClaimFileOpenUrl(req, {
                scope: 'agent',
                fileId,
                agentId: String(requestRow.agent_id ?? ''),
                customerId: Number(requestRow.customer_id ?? 0),
                storageKey,
              }),
              downloadUrl: buildClaimFileAccessUrl(req, {
                scope: 'agent',
                fileId,
                agentId: String(requestRow.agent_id ?? ''),
                customerId: Number(requestRow.customer_id ?? 0),
                download: true,
              }),
            }
          }),
          statusLogs: logsResult.rows.map((log) => ({
            id: Number(log.id),
            fromStatus: log.from_status ? String(log.from_status) : null,
            toStatus: String(log.to_status ?? ''),
            changedByUserId: log.changed_by_user_id ? String(log.changed_by_user_id) : null,
            changedAt: log.changed_at ? new Date(log.changed_at).toISOString() : null,
            memo: String(log.memo ?? ''),
          })),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/agent/customer-claim-requests/:requestId/status', requireAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const requestId = parsePositiveInt(req.params.requestId)
      const nextStatus = String(req.body?.status ?? '').trim()
      const memo = String(req.body?.memo ?? '').trim().slice(0, 255)
      if (requestId == null) {
        res.status(400).json({ message: '유효한 requestId가 필요합니다.' })
        return
      }
      if (!CUSTOMER_CLAIM_STATUSES.has(nextStatus)) {
        res.status(422).json({ message: '유효하지 않은 상태값입니다.' })
        return
      }
      const actorId = String(req.user?.id ?? '').trim()
      if (!actorId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      await client.query('BEGIN')
      const existingResult = await client.query(
        `
        SELECT id, status, agent_id, customer_id, device_id
        FROM customer_claim_requests
        WHERE id = $1
          AND agent_id = $2
        LIMIT 1
        `,
        [requestId, actorId],
      )
      if (existingResult.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
        return
      }
      const existing = existingResult.rows[0]
      const fromStatus = String(existing.status ?? '')
      if (fromStatus === nextStatus) {
        await client.query('ROLLBACK')
        res.status(200).json({ success: true, data: { requestId, status: nextStatus } })
        return
      }
      await client.query(
        `
        UPDATE customer_claim_requests
        SET status = $1::varchar,
            processed_at = CASE
              WHEN $1::varchar IN ('done'::varchar, 'rejected'::varchar, 'canceled'::varchar) THEN NOW()
              ELSE processed_at
            END,
            processed_by_user_id = $2,
            updated_at = NOW()
        WHERE id = $3
        `,
        [nextStatus, actorId, requestId],
      )
      await client.query(
        `
        INSERT INTO customer_claim_status_logs
          (request_id, from_status, to_status, changed_by_user_id, changed_at, memo)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        `,
        [requestId, fromStatus, nextStatus, actorId, memo || null],
      )
      await writeLinkAudit(client, {
        agentId: String(existing.agent_id ?? ''),
        customerId: Number(existing.customer_id),
        deviceId: String(existing.device_id ?? ''),
        linkCode: null,
        action: 'status_change',
        result: 'success',
        meta: { requestId, fromStatus, toStatus: nextStatus },
      })
      await client.query('COMMIT')
      res.json({
        success: true,
        data: {
          requestId,
          status: nextStatus,
          fromStatus,
          memo,
        },
      })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* noop */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/agent/customer-claim-files/:fileId/download', async (req, res) => {
    try {
      const accessToken = String(req.query.accessToken ?? '').trim()
      if (!accessToken) {
        res.status(401).json({ message: '파일 접근 토큰이 필요합니다.' })
        return
      }
      const tokenPayload = verifyClaimFileAccessToken(accessToken)
      if (!tokenPayload || tokenPayload.scope !== 'agent') {
        res.status(401).json({ message: '파일 접근 토큰이 유효하지 않습니다.' })
        return
      }
      const fileId = parsePositiveInt(req.params.fileId)
      if (fileId == null || fileId !== tokenPayload.fileId) {
        res.status(400).json({ message: '유효한 fileId가 필요합니다.' })
        return
      }
      const row = await pool.query(
        `
        SELECT id, storage_key, file_name, content_type, file_size
        FROM customer_claim_request_files
        WHERE id = $1
          AND agent_id = $2
          AND customer_id = $3
        LIMIT 1
        `,
        [fileId, tokenPayload.agentId, tokenPayload.customerId],
      )
      if (row.rowCount === 0) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const file = row.rows[0]
      const storageKey = String(file.storage_key ?? '').trim()
      if (!storageKey || !assertClaimStorageKeyScope(storageKey, tokenPayload.agentId, tokenPayload.customerId)) {
        res.status(403).json({ message: '허용되지 않은 파일 경로입니다.' })
        return
      }
      let buffer
      try {
        buffer = await consentGetBuffer(storageKey)
      } catch {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const mode = resolveDownloadMode(req)
      const fileName = String(file.file_name ?? '').trim() || 'download'
      const contentType = String(file.content_type ?? '').trim() || 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildContentDisposition(fileName, mode))
      res.setHeader('Content-Length', String(buffer.length))
      res.end(buffer)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customer-claim-files/:fileId/download-auth', requireAuth, async (req, res) => {
    try {
      const fileId = parsePositiveInt(req.params.fileId)
      if (fileId == null) {
        res.status(400).json({ message: '유효한 fileId가 필요합니다.' })
        return
      }
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const row = await pool.query(
        `
        SELECT id, storage_key, file_name, content_type, file_size, customer_id
        FROM customer_claim_request_files
        WHERE id = $1
          AND agent_id = $2
        LIMIT 1
        `,
        [fileId, agentId],
      )
      if (row.rowCount === 0) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const file = row.rows[0]
      const customerId = Number(file.customer_id ?? 0)
      const storageKey = String(file.storage_key ?? '').trim()
      if (!storageKey || !assertClaimStorageKeyScope(storageKey, agentId, customerId)) {
        res.status(403).json({ message: '허용되지 않은 파일 경로입니다.' })
        return
      }
      let buffer
      try {
        buffer = await consentGetBuffer(storageKey)
      } catch {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const mode = resolveDownloadMode(req)
      const fileName = String(file.file_name ?? '').trim() || 'download'
      const contentType = String(file.content_type ?? '').trim() || 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildContentDisposition(fileName, mode))
      res.setHeader('Content-Length', String(buffer.length))
      res.end(buffer)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/agent/customer-news', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const title = String(req.body?.title ?? '').trim()
      const content = String(req.body?.content ?? '').trim()
      const sendPush = Boolean(req.body?.sendPush)
      const isPinned = Boolean(req.body?.isPinned)
      const attachments = normalizeCustomerNewsAttachments(req.body?.attachments)
      const scopeRaw = String(req.body?.scope ?? 'all')
        .trim()
        .toLowerCase()
      const scope = scopeRaw === 'personal' ? 'personal' : 'all'
      const targetCustomerId = parsePositiveInt(req.body?.targetCustomerId)
      if (!title) {
        res.status(400).json({ message: '제목을 입력해 주세요.' })
        return
      }
      if (!content && attachments.length === 0) {
        res.status(400).json({ message: '메시지 내용 또는 첨부파일을 추가해 주세요.' })
        return
      }
      const bodyText = content || '(첨부파일)'
      if (scope === 'personal' && targetCustomerId == null) {
        res.status(422).json({ message: '개별 소식지는 대상 고객을 선택해 주세요.' })
        return
      }
      const gaId = await resolveAgentGaId(pool, agentId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      let targetCustomerName = ''
      if (scope === 'personal' && targetCustomerId != null) {
        const customerRow = await pool.query(
          `
          SELECT id, name
          FROM customers
          WHERE id = $1
            AND user_id = $2
          LIMIT 1
          `,
          [targetCustomerId, agentId],
        )
        if (customerRow.rowCount === 0) {
          res.status(404).json({ message: '대상 고객을 찾을 수 없습니다.' })
          return
        }
        targetCustomerName = String(customerRow.rows[0].name ?? '')
      }
      const id = randomUUID()
      const payload = {
        gaCode: '',
        insurerCode: 'CUSTOMER_NEWS',
        insurerName: '고객 소식지',
        insurerSlug: 'customer-news',
        newsChannel: 'INSURER',
        summary: bodyText.slice(0, 300),
        publishedAt: new Date().toISOString(),
        publisherId: agentId,
        customerVisible: true,
        pinned: isPinned,
        heroImageUrl: attachments.find((item) => item.kind === 'image')?.url ?? null,
        attachments,
        customerNewsScope: scope,
        targetCustomerId: scope === 'personal' ? targetCustomerId : null,
        targetCustomerName: scope === 'personal' ? targetCustomerName : '',
      }
      await pool.query(
        `
        INSERT INTO insurance_company_newsletters
          (id, ga_id, company_id, company_name_snapshot, title, status, body_text, payload, created_at, updated_at)
        VALUES ($1, $2, NULL, $3, $4, 'PUBLISHED', $5, $6::jsonb, NOW(), NOW())
        `,
        [id, gaId, '고객 소식지', title, bodyText, JSON.stringify(payload)],
      )
      await writeLinkAudit(pool, {
        agentId,
        customerId: null,
        deviceId: null,
        linkCode: null,
        action: 'customer_news_created',
        result: sendPush ? 'push_queued' : 'success',
        meta: {
          newsletterId: id,
          sendPush,
          isPinned,
          heroImageUrl: payload.heroImageUrl,
          attachments,
          scope,
          targetCustomerId: scope === 'personal' ? targetCustomerId : null,
        },
      })
      res.status(201).json({
        success: true,
        data: {
          id,
          title,
          content: bodyText,
          sendPush,
          isPinned,
          scope,
          targetCustomerId: scope === 'personal' ? targetCustomerId : null,
          attachments,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/agent/customer-news/attachments/presign', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const fileName = sanitizeFileName(body.fileName)
      const contentType = String(body.contentType ?? '').trim().split(';')[0].trim()
      const sizeBytes = Number(body.sizeBytes ?? body.size ?? 0)
      const validated = validateCustomerNewsMessageUpload(contentType, sizeBytes)
      if (!validated.ok) {
        res.status(400).json({ message: validated.message })
        return
      }
      const gaId = await resolveAgentGaId(pool, agentId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const gaPath = await resolveGaPathByGaId(pool, gaId)
      if (!gaPath) {
        res.status(400).json({ message: '저장 경로를 구성할 수 없습니다.' })
        return
      }
      const quota = await loadAgentStorageQuota(pool, agentId, gaId)
      if (quota && quota.limit > 0 && quota.used + sizeBytes > quota.limit) {
        res.status(413).json({ message: '저장 공간이 부족합니다.' })
        return
      }
      const objectKey = buildCustomerNewsMessageObjectKey(gaPath, agentId, fileName)
      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
      if (!uploadUrl) {
        res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
        return
      }
      const putHeaders = {}
      if (cacheControl) {
        putHeaders['Cache-Control'] = cacheControl
      }
      const cdnBase = getR2PublicCdnBase().replace(/\/$/, '')
      res.json({
        uploadUrl,
        objectKey,
        fileUrl: `${cdnBase}/${objectKey.replace(/^\//, '')}`,
        putHeaders,
        kind: customerNewsAttachmentKindFromMime(contentType),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put('/agent/customer-news/attachments/upload-proxy', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const objectKey = String(req.query.objectKey ?? req.headers['x-object-key'] ?? '').trim()
      const contentType = String(req.query.contentType ?? req.headers['content-type'] ?? '')
        .trim()
        .split(';')[0]
        .trim()
      const sizeBytes = Number(req.headers['x-file-size'] ?? req.query.fileSize ?? 0)
      const gaId = await resolveAgentGaId(pool, agentId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const gaPath = await resolveGaPathByGaId(pool, gaId)
      if (!gaPath || !objectKey || !assertCustomerNewsMessageObjectKey(objectKey, agentId, gaPath)) {
        res.status(403).json({ message: '허용되지 않은 업로드 경로입니다.' })
        return
      }
      const validated = validateCustomerNewsMessageUpload(contentType, sizeBytes)
      if (!validated.ok) {
        res.status(400).json({ message: validated.message })
        return
      }
      const buffer = await readRawBodyBuffer(req, sizeBytes || MAX_IMAGE_BYTES + 1)
      await consentPutInsurerAttachment(objectKey, buffer, contentType)
      res.status(204).end()
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

  apiRouter.patch('/agent/customer-news/:newsId', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const newsId = String(req.params.newsId ?? '').trim()
      if (!newsId) {
        res.status(400).json({ message: '소식지 ID가 필요합니다.' })
        return
      }
      const bodyObj = req.body && typeof req.body === 'object' ? req.body : {}
      const sendPush = Boolean(bodyObj.sendPush)
      const gaId = await resolveAgentGaId(pool, agentId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const existing = await pool.query(
        `
        SELECT id, title, payload
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND status = 'PUBLISHED'
        LIMIT 1
        `,
        [newsId, gaId],
      )
      if (existing.rowCount === 0) {
        res.status(404).json({ message: '소식지를 찾을 수 없습니다.' })
        return
      }
      const prevPayload = existing.rows[0].payload || {}
      const prevRowTitle = String(existing.rows[0].title ?? '').trim()
      const publisherId = String(prevPayload?.publisherId ?? '').trim()
      if (publisherId && publisherId !== agentId) {
        res.status(403).json({ message: '이 소식지를 수정할 권한이 없습니다.' })
        return
      }
      const prevScope = String(prevPayload?.customerNewsScope ?? 'all') === 'personal' ? 'personal' : 'all'
      const hasAttachmentsField = Object.prototype.hasOwnProperty.call(bodyObj, 'attachments')
      const attachmentsNext = hasAttachmentsField
        ? normalizeCustomerNewsAttachments(bodyObj.attachments)
        : Array.isArray(prevPayload.attachments)
          ? prevPayload.attachments
          : []

      const contentTrim = String(bodyObj.content ?? '').trim()
      if (!contentTrim && attachmentsNext.length === 0) {
        res.status(400).json({ message: '내용을 입력해 주세요.' })
        return
      }
      const bodyText = contentTrim || '(첨부파일)'

      const titleInput = String(bodyObj.title ?? '').trim()
      const titleForRow = titleInput || prevRowTitle || '고객 메시지'

      let targetCustomerName = String(prevPayload?.targetCustomerName ?? '')
      if (prevScope === 'personal') {
        const tgtRaw = prevPayload?.targetCustomerId
        const tgtId = tgtRaw != null && Number.isFinite(Number(tgtRaw)) ? Number(tgtRaw) : null
        const bodyTarget = parsePositiveInt(bodyObj.targetCustomerId)
        if (tgtId != null && bodyTarget != null && bodyTarget !== tgtId) {
          res.status(400).json({ message: '대상 고객을 바꿀 수 없습니다.' })
          return
        }
        if (tgtId != null && tgtId > 0) {
          const customerRow = await pool.query(
            `
            SELECT name
            FROM customers
            WHERE id = $1
              AND user_id = $2
            LIMIT 1
            `,
            [tgtId, agentId],
          )
          if (customerRow.rowCount > 0) {
            targetCustomerName = String(customerRow.rows[0].name ?? targetCustomerName)
          }
        }
      }

      const heroCandidate = attachmentsNext.find((item) => item.kind === 'image')?.url
      const heroImageUrl =
        heroCandidate != null && String(heroCandidate).trim()
          ? String(heroCandidate).trim()
          : prevPayload.heroImageUrl ?? null

      const nextPayload = {
        ...prevPayload,
        summary: bodyText.slice(0, 300),
        heroImageUrl,
        attachments: attachmentsNext,
        ...(prevScope === 'personal' ? { targetCustomerName } : {}),
      }

      await pool.query(
        `
        UPDATE insurance_company_newsletters
        SET title = $1,
            body_text = $2,
            payload = $3::jsonb,
            updated_at = NOW()
        WHERE id = $4
          AND ga_id = $5
        `,
        [titleForRow, bodyText, JSON.stringify(nextPayload), newsId, gaId],
      )
      await writeLinkAudit(pool, {
        agentId,
        customerId: null,
        deviceId: null,
        linkCode: null,
        action: 'customer_news_updated',
        result: sendPush ? 'push_queued' : 'success',
        meta: {
          newsletterId: newsId,
          sendPush,
          heroImageUrl: nextPayload.heroImageUrl,
          attachments: attachmentsNext,
          scope: prevScope,
        },
      })
      res.json({
        success: true,
        data: {
          id: newsId,
          title: titleForRow,
          content: bodyText,
          sendPush,
          scope: prevScope,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customer-news', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const scopeRaw = String(req.query.scope ?? '')
        .trim()
        .toLowerCase()
      const scope = scopeRaw === 'personal' ? 'personal' : scopeRaw === 'all' ? 'all' : ''
      const targetCustomerId = parsePositiveInt(req.query.targetCustomerId)
      const where = [
        `n.status = 'PUBLISHED'`,
        `COALESCE((n.payload->>'customerVisible')::boolean, false) = true`,
        `COALESCE(NULLIF(TRIM(n.payload->>'publisherId'), ''), '') = $1`,
      ]
      const params = [agentId]
      if (scope === 'personal') {
        where.push(`COALESCE(NULLIF(TRIM(n.payload->>'customerNewsScope'), ''), 'all') = 'personal'`)
      } else if (scope === 'all') {
        where.push(`COALESCE(NULLIF(TRIM(n.payload->>'customerNewsScope'), ''), 'all') = 'all'`)
      }
      if (targetCustomerId != null) {
        where.push(
          `COALESCE(NULLIF(TRIM(n.payload->>'targetCustomerId'), '')::int, 0) = $${params.length + 1}`,
        )
        params.push(targetCustomerId)
      }
      const rows = await pool.query(
        `
        SELECT
          n.id,
          n.title,
          n.body_text,
          n.updated_at,
          n.payload
        FROM insurance_company_newsletters n
        WHERE ${where.join(' AND ')}
        ORDER BY n.updated_at DESC, n.id DESC
        LIMIT 100
        `,
        params,
      )
      res.json({
        success: true,
        data: rows.rows.map((row) => ({
          id: String(row.id ?? ''),
          title: String(row.title ?? ''),
          content: String(row.body_text ?? ''),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
          isPinned: Boolean(row.payload?.pinned),
          heroImageUrl: String(row.payload?.heroImageUrl ?? '').trim() || null,
          attachments: Array.isArray(row.payload?.attachments) ? row.payload.attachments : [],
          scope: String(row.payload?.customerNewsScope ?? 'all') === 'personal' ? 'personal' : 'all',
          targetCustomerId:
            row.payload?.targetCustomerId != null && Number.isFinite(Number(row.payload.targetCustomerId))
              ? Number(row.payload.targetCustomerId)
              : null,
          targetCustomerName: String(row.payload?.targetCustomerName ?? ''),
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/agent/customer-app-linked-customers', requireAuth, async (req, res) => {
    try {
      const agentId = String(req.user?.id ?? '').trim()
      if (!agentId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const rows = await pool.query(
        `
        SELECT
          l.customer_id,
          COALESCE(NULLIF(TRIM(c.name), ''), '고객') AS customer_name,
          l.last_connected_at,
          (
            SELECT COUNT(*)::int
            FROM customer_app_devices d
            WHERE d.agent_id = l.agent_id
              AND d.customer_id = l.customer_id
              AND d.status = 'active'
          ) AS device_count
        FROM customer_app_links l
        INNER JOIN customers c ON c.id = l.customer_id
        WHERE l.agent_id = $1
          AND l.status = 'active'
          AND (l.expires_at IS NULL OR l.expires_at > NOW())
        ORDER BY COALESCE(l.last_connected_at, l.created_at) DESC, l.id DESC
        `,
        [agentId],
      )
      res.json({
        success: true,
        data: rows.rows.map((row) => ({
          customerId: Number(row.customer_id),
          customerName: String(row.customer_name ?? ''),
          lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at).toISOString() : null,
          deviceCount: Number(row.device_count ?? 0),
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customer-app/connect/:linkCode/prefill', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim().toUpperCase()
      if (!linkCode) {
        res.status(400).json({ message: '링크 코드가 필요합니다.' })
        return
      }
      const rowResult = await pool.query(
        `
        SELECT
          c.name,
          c.ssn,
          c.birth_date,
          c.phone,
          l.customer_id,
          l.agent_id,
          l.status,
          l.expires_at,
          t.customer_id AS generic_target_customer_id,
          COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), '') AS agent_display_name,
          COALESCE(NULLIF(TRIM(g.name), ''), '') AS ga_company_name
        FROM customer_app_links l
        INNER JOIN customers c ON c.id = l.customer_id
        LEFT JOIN users u ON u.id = l.agent_id
        LEFT JOIN ga_companies g ON g.id = u.ga_id
        LEFT JOIN agent_app_link_targets t ON t.agent_id = l.agent_id
        WHERE l.link_code = $1
        ORDER BY l.created_at DESC
        LIMIT 1
        `,
        [linkCode],
      )
      if (rowResult.rowCount === 0) {
        res.status(404).json({ message: '유효한 링크 정보를 찾지 못했습니다.' })
        return
      }
      const row = rowResult.rows[0]
      const status = String(row?.status ?? '')
      const expiresAtMs = row?.expires_at ? new Date(row.expires_at).getTime() : null
      const expired = expiresAtMs != null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()
      const isActive = status === CUSTOMER_LINK_ACTIVE && !expired
      const mode = Number(row?.generic_target_customer_id ?? 0) === Number(row?.customer_id ?? -1) ? 'general' : 'designated'
      res.json({
        success: true,
        data: {
          mode,
          status,
          isActive,
          expiresAt: row?.expires_at ? new Date(row.expires_at).toISOString() : null,
          customerName: String(row?.name ?? '').trim(),
          name: String(row?.name ?? '').trim(),
          birthDate: deriveCustomerBirthDate(row),
          phone: String(row?.phone ?? '').trim(),
          agentName: String(row?.agent_display_name ?? '').trim(),
          gaCompanyName: String(row?.ga_company_name ?? '').trim(),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customer-app/connect', async (req, res) => {
    const client = await pool.connect()
    try {
      const linkCode = String(req.body?.linkCode ?? '').trim().toUpperCase()
      const deviceId = String(req.body?.deviceId ?? '').trim()
      const devicePlatform = String(req.body?.devicePlatform ?? '').trim().slice(0, 20)
      const appVersion = String(req.body?.appVersion ?? '').trim().slice(0, 30)
      if (!linkCode || !deviceId) {
        res.status(400).json({ message: 'linkCode와 deviceId가 필요합니다.' })
        return
      }
      await client.query('BEGIN')
      const linkResult = await client.query(
        `
        SELECT id, agent_id, customer_id, status, expires_at
        FROM customer_app_links
        WHERE link_code = $1
        LIMIT 1
        `,
        [linkCode],
      )
      if (linkResult.rowCount === 0) {
        await writeLinkAudit(client, {
          agentId: null,
          customerId: null,
          deviceId,
          linkCode,
          action: 'connect_device',
          result: 'fail',
          reason: 'invalid_link',
        })
        await client.query('COMMIT')
        res.status(400).json({ message: '유효하지 않은 링크입니다.' })
        return
      }
      const link = linkResult.rows[0]
      const isExpired =
        link.expires_at != null &&
        Number.isFinite(new Date(String(link.expires_at)).getTime()) &&
        new Date(String(link.expires_at)).getTime() <= Date.now()
      if (String(link.status) !== CUSTOMER_LINK_ACTIVE || isExpired) {
        await writeLinkAudit(client, {
          agentId: String(link.agent_id ?? ''),
          customerId: Number(link.customer_id),
          deviceId,
          linkCode,
          action: 'connect_device',
          result: 'fail',
          reason: isExpired ? 'expired_link' : 'inactive_link',
        })
        await client.query('COMMIT')
        res.status(400).json({ message: '만료되었거나 비활성화된 링크입니다.' })
        return
      }
      const agentId = String(link.agent_id ?? '').trim()
      const customerId = Number(link.customer_id)

      const targetRow = await client.query(
        `
        SELECT customer_id
        FROM agent_app_link_targets
        WHERE agent_id = $1
        LIMIT 1
        `,
        [agentId],
      )
      const genericTargetId = targetRow.rowCount > 0 ? Number(targetRow.rows[0].customer_id) : null
      const isGeneralLink =
        genericTargetId != null && Number.isFinite(genericTargetId) && genericTargetId === Number(customerId)

      const customerRowResult = await client.query(
        `
        SELECT name, ssn, birth_date, phone
        FROM customers
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [customerId, agentId],
      )
      if (customerRowResult.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '고객 정보를 찾을 수 없습니다.' })
        return
      }
      const customerRow = customerRowResult.rows[0]

      let requester = null
      if (isGeneralLink) {
        requester = normalizeRequester(req.body?.requester)
        if (!requester) {
          requester = buildRequesterFromCustomerRowStrict(customerRow)
        }
        if (!requester) {
          await client.query('ROLLBACK')
          res.status(422).json({
            success: false,
            message: '이름, 생년월일, 연락처를 모두 입력해 주세요.',
          })
          return
        }
      } else {
        requester = buildRequesterFromCustomerRowStrict(customerRow)
        if (!requester) {
          await client.query('ROLLBACK')
          res.status(422).json({
            success: false,
            code: CUSTOMER_PROFILE_INCOMPLETE_CODE,
            message: CONNECT_PROFILE_INCOMPLETE_MESSAGE,
          })
          return
        }
      }
      await client.query(
        `
        INSERT INTO customer_app_devices
          (link_id, agent_id, customer_id, device_id, device_platform, app_version, status, connected_at, last_active_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW(), NOW(), NOW())
        ON CONFLICT (device_id, agent_id, customer_id)
        DO UPDATE SET
          link_id = EXCLUDED.link_id,
          device_platform = EXCLUDED.device_platform,
          app_version = EXCLUDED.app_version,
          status = 'active',
          connected_at = NOW(),
          last_active_at = NOW(),
          disconnected_at = NULL,
          updated_at = NOW()
        `,
        [Number(link.id), agentId, customerId, deviceId, devicePlatform || null, appVersion || null],
      )
      await client.query(
        `
        UPDATE customer_app_links
        SET last_connected_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [Number(link.id)],
      )
      const display = await loadAgentAndCustomerDisplay(client, agentId, customerId)
      if (!display) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '고객 연결 정보를 찾을 수 없습니다.' })
        return
      }
      const appToken = jwt.sign(
        {
          kind: CUSTOMER_APP_TOKEN_KIND,
          linkId: Number(link.id),
          agentId,
          customerId,
          deviceId,
        },
        jwtSecret,
        { expiresIn: CUSTOMER_APP_TOKEN_EXPIRES_IN },
      )
      await upsertCustomerAppProfile(
        client,
        {
          agentId,
          customerId,
          deviceId,
        },
        requester,
      )
      await syncProfileToLinkedCustomer(
        client,
        {
          agentId,
          customerId,
        },
        requester,
      )
      await writeLinkAudit(client, {
        agentId,
        customerId,
        deviceId,
        linkCode,
        action: 'connect_device',
        result: 'success',
        meta: {
          requesterName: requester.name,
        },
      })
      await client.query('COMMIT')
      res.json({
        success: true,
        data: {
          agentId,
          customerId,
          agentName: String(display.agent_name ?? '담당 설계사'),
          customerName: requester.name || String(display.customer_name ?? '고객'),
          appToken,
          profile: {
            name: requester.name,
            birthDate: requester.birthDate,
            phone: requester.phone,
          },
        },
      })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* noop */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/customer-app/me', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const display = await loadAgentAndCustomerDisplay(pool, context.agentId, context.customerId)
      if (!display) {
        res.status(404).json({ message: '연결 정보를 찾을 수 없습니다.' })
        return
      }
      const link = await pool.query(
        `
        SELECT status, last_connected_at
        FROM customer_app_links
        WHERE id = $1
          AND agent_id = $2
          AND customer_id = $3
        LIMIT 1
        `,
        [context.linkId, context.agentId, context.customerId],
      )
      res.json({
        success: true,
        data: {
          agentId: context.agentId,
          customerId: context.customerId,
          deviceId: context.deviceId,
          agentName: String(display.agent_name ?? ''),
          agentPhone: display.agent_phone ? String(display.agent_phone) : null,
          customerName: String(display.customer_name ?? ''),
          status: String(link.rows[0]?.status ?? CUSTOMER_LINK_ACTIVE),
          lastConnectedAt: link.rows[0]?.last_connected_at ? new Date(link.rows[0].last_connected_at).toISOString() : null,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customer-app/profile', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const profile = await loadCustomerAppProfile(pool, context)
      res.json({
        success: true,
        data: profile,
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put('/customer-app/profile', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const requester = normalizeRequester(req.body)
      if (!requester) {
        res.status(422).json({ message: '이름, 생년월일, 연락처를 모두 입력해 주세요.' })
        return
      }
      await upsertCustomerAppProfile(pool, context, requester)
      await syncProfileToLinkedCustomer(pool, context, requester)
      res.json({
        success: true,
        data: {
          ...requester,
          savedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.all('/customer-app/claim-files/presign', requireCustomerAppAuth, async (req, res) => {
    try {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ message: '지원하지 않는 요청 방식입니다.' })
        return
      }
      const context = req.customerApp
      const source = req.method === 'GET' ? req.query : req.body
      const fileName = sanitizeFileName(source?.fileName)
      const contentType = String(source?.contentType ?? '').trim()
      const fileSize = Number(source?.fileSize ?? 0)
      if (!CUSTOMER_CLAIM_FILE_ALLOWED_MIME.has(contentType)) {
        res.status(422).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      const maxBytes = maxBytesForMime(contentType)
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > maxBytes) {
        res.status(422).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }
      const gaId = await resolveAgentGaId(pool, context.agentId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const quota = await loadAgentStorageQuota(pool, context.agentId, gaId)
      if (!quota) {
        res.status(404).json({ message: '설계사 저장공간 정보를 찾을 수 없습니다.' })
        return
      }
      if (quota.limit > 0 && quota.used + fileSize > quota.limit) {
        res.status(413).json({ message: '설계사 개인 저장공간이 부족합니다.' })
        return
      }
      const gaPath = await resolveGaPathByGaId(pool, gaId)
      if (!gaPath) {
        res.status(400).json({ message: '저장 경로를 구성할 수 없습니다.' })
        return
      }
      const userSeg = sanitizeUserIdForObjectKeySegment(context.agentId)
      const objectKey = `insurer/${gaPath}/${userSeg}/customer-app-claims/${Date.now()}-${randomUUID()}-${fileName}`
      const useR2DirectUpload = isConsentR2Enabled()
      if (!useR2DirectUpload) {
        logR2EnvDiagnosticCheck()
      }
      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = useR2DirectUpload
        ? await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
        : null
      const putHeaders = {}
      if (cacheControl) {
        putHeaders['Cache-Control'] = cacheControl
      }
      res.json({
        success: true,
        data: {
          storageKey: objectKey,
          uploadUrl,
          uploadMethod: uploadUrl ? 'direct' : 'proxy',
          uploadProxyPath: '/api/customer-app/claim-files/upload-proxy',
          publicUrl: null,
          putHeaders,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put('/customer-app/claim-files/upload-proxy', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const storageKey = String(req.query.storageKey ?? req.headers['x-storage-key'] ?? '').trim()
      if (!storageKey || !assertClaimStorageKeyScope(storageKey, context.agentId, context.customerId)) {
        res.status(422).json({ message: '허용되지 않은 파일 경로입니다.' })
        return
      }
      const contentTypeRaw = String(req.query.contentType ?? req.headers['content-type'] ?? '').trim()
      const contentType = contentTypeRaw.split(';')[0].trim()
      if (!CUSTOMER_CLAIM_FILE_ALLOWED_MIME.has(contentType)) {
        res.status(422).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      const declaredFileSize = Number(req.query.fileSize ?? req.headers['x-file-size'] ?? 0)
      const maxBytes = maxBytesForMime(contentType)
      if (!Number.isFinite(declaredFileSize) || declaredFileSize < 1 || declaredFileSize > maxBytes) {
        res.status(422).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }
      const bodyBuffer = await readRawBodyBuffer(req, maxBytes)
      if (!bodyBuffer.length) {
        res.status(400).json({ message: '업로드 본문이 비어 있습니다.' })
        return
      }
      if (bodyBuffer.length !== declaredFileSize) {
        res.status(400).json({ message: '본문 크기가 presign 시점과 일치해야 합니다.' })
        return
      }
      await consentPutInsurerAttachment(storageKey, bodyBuffer, contentType)
      res.status(204).end()
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

  apiRouter.post('/customer-app/claim-requests', requireCustomerAppAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const context = req.customerApp
      const title = String(req.body?.title ?? '').trim().slice(0, 150)
      const memo = String(req.body?.memo ?? '').trim().slice(0, 5000)
      const filesRaw = Array.isArray(req.body?.files) ? req.body.files : []
      const requesterFromBody = normalizeRequester(req.body?.requester)
      if (!title && !memo) {
        res.status(400).json({ message: '제목 또는 메모를 입력해 주세요.' })
        return
      }
      const files = filesRaw.map((file, index) => ({
        storageKey: String(file?.storageKey ?? '').trim(),
        fileName: sanitizeFileName(file?.fileName ?? `file-${index + 1}`),
        contentType: String(file?.contentType ?? '').trim().slice(0, 100),
        fileSize: Number(file?.fileSize ?? 0),
        sortOrder: index,
      }))
      for (const file of files) {
        if (!file.storageKey || !assertClaimStorageKeyScope(file.storageKey, context.agentId, context.customerId)) {
          res.status(422).json({ message: '허용되지 않은 파일 경로입니다.' })
          return
        }
      }
      await client.query('BEGIN')
      const requester = requesterFromBody ?? (await loadCustomerAppProfile(client, context))
      if (!requester) {
        await client.query('ROLLBACK')
        res.status(422).json({ message: '내정보를 먼저 저장해 주세요.' })
        return
      }
      if (requesterFromBody) {
        await upsertCustomerAppProfile(client, context, requesterFromBody)
        await syncProfileToLinkedCustomer(
          client,
          {
            agentId: context.agentId,
            customerId: context.customerId,
          },
          requesterFromBody,
        )
      }
      const requestInsert = await client.query(
        `
        INSERT INTO customer_claim_requests
          (
            agent_id,
            customer_id,
            link_id,
            device_id,
            request_type,
            status,
            title,
            memo,
            requester_name,
            requester_birth_date,
            requester_phone,
            submitted_at,
            created_at,
            updated_at
          )
        VALUES ($1, $2, $3, $4, 'claim', 'requested', $5, $6, $7, $8, $9, NOW(), NOW(), NOW())
        RETURNING id, status, submitted_at
        `,
        [
          context.agentId,
          context.customerId,
          context.linkId,
          context.deviceId,
          title || null,
          memo || null,
          requester.name,
          requester.birthDate,
          requester.phone,
        ],
      )
      const requestId = Number(requestInsert.rows[0].id)
      let order = 0
      for (const file of files) {
        await client.query(
          `
          INSERT INTO customer_claim_request_files
            (request_id, agent_id, customer_id, storage_key, file_name, content_type, file_size, sort_order, uploaded_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
          `,
          [
            requestId,
            context.agentId,
            context.customerId,
            file.storageKey,
            file.fileName,
            file.contentType || null,
            Number.isFinite(file.fileSize) && file.fileSize > 0 ? file.fileSize : null,
            order,
          ],
        )
        order += 1
      }
      const totalFileBytes = files.reduce((acc, file) => {
        const n = Number(file.fileSize)
        return Number.isFinite(n) && n > 0 ? acc + n : acc
      }, 0)
      if (totalFileBytes > 0) {
        await client.query(
          `
          UPDATE users
          SET storage_used = storage_used + $1
          WHERE id = $2
          `,
          [totalFileBytes, context.agentId],
        )
      }
      await client.query(
        `
        INSERT INTO customer_claim_status_logs
          (request_id, from_status, to_status, changed_by_user_id, changed_at, memo)
        VALUES ($1, NULL, 'requested', NULL, NOW(), NULL)
        `,
        [requestId],
      )
      await writeLinkAudit(client, {
        agentId: context.agentId,
        customerId: context.customerId,
        deviceId: context.deviceId,
        linkCode: null,
        action: 'create_claim_request',
        result: 'success',
        meta: { requestId, fileCount: files.length },
      })
      await client.query('COMMIT')
      res.status(201).json({
        success: true,
        data: {
          requestId,
          status: String(requestInsert.rows[0].status ?? 'requested'),
          submittedAt: requestInsert.rows[0].submitted_at ? new Date(requestInsert.rows[0].submitted_at).toISOString() : new Date().toISOString(),
          fileCount: files.length,
        },
      })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* noop */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/customer-app/claim-requests', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const r = await pool.query(
        `
        SELECT
          r.id,
          r.status,
          r.title,
          r.memo,
          r.submitted_at,
          (
            SELECT COUNT(*)::int
            FROM customer_claim_request_files f
            WHERE f.request_id = r.id
          ) AS file_count
        FROM customer_claim_requests r
        WHERE r.agent_id = $1
          AND r.customer_id = $2
          AND r.device_id = $3
        ORDER BY r.submitted_at DESC, r.id DESC
        `,
        [context.agentId, context.customerId, context.deviceId],
      )
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: Number(row.id),
          status: String(row.status ?? ''),
          title: String(row.title ?? ''),
          memo: String(row.memo ?? ''),
          submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
          fileCount: Number(row.file_count ?? 0),
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customer-app/claim-requests/:requestId', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const requestId = parsePositiveInt(req.params.requestId)
      if (requestId == null) {
        res.status(400).json({ message: '유효한 requestId가 필요합니다.' })
        return
      }
      const requestResult = await pool.query(
        `
        SELECT id, status, title, memo, submitted_at, processed_at
        FROM customer_claim_requests
        WHERE id = $1
          AND agent_id = $2
          AND customer_id = $3
          AND device_id = $4
        LIMIT 1
        `,
        [requestId, context.agentId, context.customerId, context.deviceId],
      )
      if (requestResult.rowCount === 0) {
        res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
        return
      }
      const [filesResult, logsResult] = await Promise.all([
        pool.query(
          `
          SELECT id, storage_key, file_name, content_type, file_size, sort_order, uploaded_at
          FROM customer_claim_request_files
          WHERE request_id = $1
          ORDER BY sort_order ASC, id ASC
          `,
          [requestId],
        ),
        pool.query(
          `
          SELECT id, from_status, to_status, changed_at, memo
          FROM customer_claim_status_logs
          WHERE request_id = $1
          ORDER BY changed_at DESC, id DESC
          `,
          [requestId],
        ),
      ])
      const row = requestResult.rows[0]
      res.json({
        success: true,
        data: {
          id: Number(row.id),
          status: String(row.status ?? ''),
          title: String(row.title ?? ''),
          memo: String(row.memo ?? ''),
          submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
          processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
          files: filesResult.rows.map((file) => {
            const fileId = Number(file.id)
            const storageKey = String(file.storage_key ?? '')
            return {
              id: fileId,
              storageKey,
              fileName: String(file.file_name ?? ''),
              contentType: String(file.content_type ?? ''),
              fileSize: Number(file.file_size ?? 0),
              sortOrder: Number(file.sort_order ?? 0),
              uploadedAt: file.uploaded_at ? new Date(file.uploaded_at).toISOString() : null,
              url: buildClaimFileOpenUrl(req, {
                scope: 'customer',
                fileId,
                agentId: context.agentId,
                customerId: context.customerId,
                deviceId: context.deviceId,
                storageKey,
              }),
              downloadUrl: buildClaimFileAccessUrl(req, {
                scope: 'customer',
                fileId,
                agentId: context.agentId,
                customerId: context.customerId,
                deviceId: context.deviceId,
                download: true,
              }),
            }
          }),
          statusLogs: logsResult.rows.map((log) => ({
            id: Number(log.id),
            fromStatus: log.from_status ? String(log.from_status) : null,
            toStatus: String(log.to_status ?? ''),
            changedAt: log.changed_at ? new Date(log.changed_at).toISOString() : null,
            memo: String(log.memo ?? ''),
          })),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customer-app/claim-files/:fileId/download', async (req, res) => {
    try {
      const accessToken = String(req.query.accessToken ?? '').trim()
      if (!accessToken) {
        res.status(401).json({ message: '파일 접근 토큰이 필요합니다.' })
        return
      }
      const tokenPayload = verifyClaimFileAccessToken(accessToken)
      if (!tokenPayload || tokenPayload.scope !== 'customer' || !tokenPayload.deviceId) {
        res.status(401).json({ message: '파일 접근 토큰이 유효하지 않습니다.' })
        return
      }
      const fileId = parsePositiveInt(req.params.fileId)
      if (fileId == null || fileId !== tokenPayload.fileId) {
        res.status(400).json({ message: '유효한 fileId가 필요합니다.' })
        return
      }
      const row = await pool.query(
        `
        SELECT
          f.id,
          f.storage_key,
          f.file_name,
          f.content_type,
          f.file_size
        FROM customer_claim_request_files f
        INNER JOIN customer_claim_requests r ON r.id = f.request_id
        WHERE f.id = $1
          AND f.agent_id = $2
          AND f.customer_id = $3
          AND r.agent_id = $2
          AND r.customer_id = $3
          AND r.device_id = $4
        LIMIT 1
        `,
        [fileId, tokenPayload.agentId, tokenPayload.customerId, tokenPayload.deviceId],
      )
      if (row.rowCount === 0) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const file = row.rows[0]
      const storageKey = String(file.storage_key ?? '').trim()
      if (!storageKey || !assertClaimStorageKeyScope(storageKey, tokenPayload.agentId, tokenPayload.customerId)) {
        res.status(403).json({ message: '허용되지 않은 파일 경로입니다.' })
        return
      }
      let buffer
      try {
        buffer = await consentGetBuffer(storageKey)
      } catch {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      const mode = resolveDownloadMode(req)
      const fileName = String(file.file_name ?? '').trim() || 'download'
      const contentType = String(file.content_type ?? '').trim() || 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildContentDisposition(fileName, mode))
      res.setHeader('Content-Length', String(buffer.length))
      res.end(buffer)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  /**
   * @param {string} url
   */
  function objectKeyFromCdnUrl(url) {
    const raw = String(url ?? '').trim()
    if (!raw) {
      return ''
    }
    const cdnBase = getR2PublicCdnBase().replace(/\/$/, '')
    if (raw.startsWith(`${cdnBase}/`)) {
      return raw.slice(cdnBase.length + 1)
    }
    try {
      const parsed = new URL(raw)
      return parsed.pathname.replace(/^\//, '')
    } catch {
      return ''
    }
  }

  /**
   * @param {string} objectKey
   * @param {string} agentId
   * @param {string} gaPath
   */
  function assertCustomerNewsAttachmentReadable(objectKey, agentId, gaPath) {
    const key = String(objectKey ?? '').trim().replace(/^\//, '')
    if (!key) {
      return false
    }
    if (assertCustomerNewsMessageObjectKey(key, agentId, gaPath)) {
      return true
    }
    const userSeg = sanitizeUserIdForObjectKeySegment(agentId)
    return key.includes(`/${userSeg}/`) && (key.includes('/insurer-news/') || key.includes('/customer-news'))
  }

  /**
   * @param {{
   *  newsId: string
   *  attachmentId: string
   *  agentId: string
   *  customerId: number
   *  deviceId: string
   * }} payload
   */
  function signCustomerNewsAttachmentAccessToken(payload) {
    return jwt.sign(
      {
        kind: CUSTOMER_NEWS_ATTACHMENT_ACCESS_TOKEN_KIND,
        newsId: payload.newsId,
        attachmentId: payload.attachmentId,
        agentId: payload.agentId,
        customerId: payload.customerId,
        deviceId: payload.deviceId,
      },
      jwtSecret,
      { expiresIn: CUSTOMER_NEWS_ATTACHMENT_ACCESS_TOKEN_EXPIRES_IN },
    )
  }

  /**
   * @param {string} rawToken
   */
  function verifyCustomerNewsAttachmentAccessToken(rawToken) {
    try {
      const decoded = jwt.verify(rawToken, jwtSecret)
      if (!decoded || typeof decoded !== 'object') {
        return null
      }
      const payload = /** @type {{
       *  kind?: unknown
       *  newsId?: unknown
       *  attachmentId?: unknown
       *  agentId?: unknown
       *  customerId?: unknown
       *  deviceId?: unknown
       * }} */ (decoded)
      if (String(payload.kind ?? '') !== CUSTOMER_NEWS_ATTACHMENT_ACCESS_TOKEN_KIND) {
        return null
      }
      const newsId = String(payload.newsId ?? '').trim()
      const attachmentId = String(payload.attachmentId ?? '').trim()
      const agentId = String(payload.agentId ?? '').trim()
      const customerId = parsePositiveInt(payload.customerId)
      const deviceId = String(payload.deviceId ?? '').trim()
      if (!newsId || !attachmentId || !agentId || customerId == null || !deviceId) {
        return null
      }
      return { newsId, attachmentId, agentId, customerId, deviceId }
    } catch {
      return null
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveCustomerAppContextForNewsAttachment(req, res) {
    const bearer = readBearerToken(req)
    if (bearer) {
      try {
        const decoded = jwt.verify(bearer, jwtSecret)
        if (!decoded || typeof decoded !== 'object') {
          res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
          return null
        }
        const payload = /** @type {{ kind?: unknown, agentId?: unknown, customerId?: unknown, deviceId?: unknown, linkId?: unknown }} */ (decoded)
        if (String(payload.kind ?? '') !== CUSTOMER_APP_TOKEN_KIND) {
          res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
          return null
        }
        const agentId = String(payload.agentId ?? '').trim()
        const customerId = parsePositiveInt(payload.customerId)
        const deviceId = String(payload.deviceId ?? '').trim()
        const linkId = parsePositiveInt(payload.linkId)
        if (!agentId || customerId == null || !deviceId || linkId == null) {
          res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
          return null
        }
        const contextCheck = await ensureCustomerAppActiveContext(pool, agentId, customerId, deviceId)
        if (!contextCheck.ok) {
          res.status(contextCheck.status).json({ message: contextCheck.message })
          return null
        }
        return { agentId, customerId, deviceId, linkId }
      } catch {
        res.status(401).json({ message: '고객 앱 토큰이 유효하지 않습니다.' })
        return null
      }
    }
    const accessToken = String(req.query.accessToken ?? '').trim()
    const tokenPayload = verifyCustomerNewsAttachmentAccessToken(accessToken)
    if (!tokenPayload) {
      res.status(401).json({ message: '첨부파일 접근 권한이 없습니다.' })
      return null
    }
    const contextCheck = await ensureCustomerAppActiveContext(
      pool,
      tokenPayload.agentId,
      tokenPayload.customerId,
      tokenPayload.deviceId,
    )
    if (!contextCheck.ok) {
      res.status(contextCheck.status).json({ message: contextCheck.message })
      return null
    }
    return {
      agentId: tokenPayload.agentId,
      customerId: tokenPayload.customerId,
      deviceId: tokenPayload.deviceId,
      linkId: null,
      newsId: tokenPayload.newsId,
      attachmentId: tokenPayload.attachmentId,
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {string} newsId
   * @param {string} attachmentId
   * @param {{ agentId: string, customerId: number, deviceId: string }} context
   * @param {boolean} download
   */
  function buildCustomerNewsAttachmentAccessUrl(req, newsId, attachmentId, context, download = false) {
    const token = signCustomerNewsAttachmentAccessToken({
      newsId,
      attachmentId,
      agentId: context.agentId,
      customerId: context.customerId,
      deviceId: context.deviceId,
    })
    const qs = new URLSearchParams({ accessToken: token })
    if (download) {
      qs.set('download', '1')
    }
    return buildAbsoluteBackendUrl(
      req,
      `/api/customer-app/news/${encodeURIComponent(newsId)}/attachments/${encodeURIComponent(attachmentId)}/download?${qs.toString()}`,
    )
  }

  /**
   * @param {import('express').Request} req
   * @param {string} newsId
   * @param {{ agentId: string, customerId: number, deviceId: string }} context
   * @param {Array<{ id: string, kind: string, url: string, fileName: string, sortOrder: number, objectKey?: string, mimeType?: string, size?: number }>} attachments
   */
  function mapCustomerNewsAttachmentsForApp(req, newsId, context, attachments) {
    return attachments.map((row) => {
      const id = String(row.id ?? '').trim()
      return {
        id,
        kind: row.kind === 'file' ? 'file' : 'image',
        fileName: row.fileName,
        sortOrder: row.sortOrder,
        mimeType: row.mimeType ?? null,
        size: row.size ?? null,
        url: buildCustomerNewsAttachmentAccessUrl(req, newsId, id, context, false),
        openUrl: buildCustomerNewsAttachmentAccessUrl(req, newsId, id, context, false),
        downloadUrl: buildCustomerNewsAttachmentAccessUrl(req, newsId, id, context, true),
      }
    })
  }

  /**
   * @param {import('pg').Pool} dbPool
   * @param {string} newsId
   * @param {number} gaId
   * @param {string} agentId
   * @param {number} customerId
   */
  async function loadCustomerNewsRowForCustomerApp(dbPool, newsId, gaId, agentId, customerId) {
    const row = await dbPool.query(
      `
      SELECT id, title, body_text, updated_at, payload
      FROM insurance_company_newsletters
      WHERE id = $1
        AND ga_id = $2
        AND status = 'PUBLISHED'
        AND COALESCE((payload->>'customerVisible')::boolean, false) = true
        AND COALESCE(NULLIF(TRIM(payload->>'publisherId'), ''), '') = $3
        AND (
          COALESCE(NULLIF(TRIM(payload->>'customerNewsScope'), ''), 'all') = 'all'
          OR (
            COALESCE(NULLIF(TRIM(payload->>'customerNewsScope'), ''), 'all') = 'personal'
            AND COALESCE(NULLIF(TRIM(payload->>'targetCustomerId'), '')::int, 0) = $4
          )
        )
      LIMIT 1
      `,
      [newsId, gaId, agentId, customerId],
    )
    if (row.rowCount === 0) {
      return null
    }
    return row.rows[0]
  }

  /**
   * @param {object} payload
   * @param {string} attachmentId
   */
  function findCustomerNewsAttachmentInPayload(payload, attachmentId) {
    const list = Array.isArray(payload?.attachments) ? payload.attachments : []
    const target = String(attachmentId ?? '').trim()
    return (
      list.find((item) => item && String(item.id ?? '').trim() === target) ??
      null
    )
  }

  apiRouter.get('/customer-app/news/:newsId/attachments/:attachmentId/download', async (req, res) => {
      try {
        const context = await resolveCustomerAppContextForNewsAttachment(req, res)
        if (!context) {
          return
        }
        const newsId = String(req.params.newsId ?? '').trim()
        const attachmentId = String(req.params.attachmentId ?? '').trim()
        if (!newsId || !attachmentId) {
          res.status(400).json({ message: '유효한 newsId와 attachmentId가 필요합니다.' })
          return
        }
        if (context.newsId && context.newsId !== newsId) {
          res.status(403).json({ message: '첨부파일 접근 권한이 없습니다.' })
          return
        }
        if (context.attachmentId && context.attachmentId !== attachmentId) {
          res.status(403).json({ message: '첨부파일 접근 권한이 없습니다.' })
          return
        }
        const gaId = await resolveAgentGaId(pool, context.agentId)
        if (gaId == null) {
          res.status(404).json({ message: '연결된 설계사 정보를 찾을 수 없습니다.' })
          return
        }
        const gaPath = await resolveGaPathByGaId(pool, gaId)
        if (!gaPath) {
          res.status(400).json({ message: '저장 경로를 확인할 수 없습니다.' })
          return
        }
        const newsRow = await loadCustomerNewsRowForCustomerApp(
          pool,
          newsId,
          gaId,
          context.agentId,
          context.customerId,
        )
        if (!newsRow) {
          res.status(404).json({ message: '소식지를 찾을 수 없습니다.' })
          return
        }
        const payload = newsRow.payload && typeof newsRow.payload === 'object' ? newsRow.payload : {}
        const attachment = findCustomerNewsAttachmentInPayload(payload, attachmentId)
        if (!attachment) {
          res.status(404).json({ message: '첨부파일을 찾을 수 없습니다.' })
          return
        }
        const objectKey =
          String(attachment.objectKey ?? '').trim() ||
          objectKeyFromCdnUrl(String(attachment.url ?? ''))
        if (!objectKey || !assertCustomerNewsAttachmentReadable(objectKey, context.agentId, gaPath)) {
          res.status(403).json({ message: '허용되지 않은 첨부파일입니다.' })
          return
        }
        let buffer
        try {
          buffer = await consentGetBuffer(objectKey)
        } catch {
          res.status(404).json({ message: '첨부파일을 불러오지 못했습니다.' })
          return
        }
        const mode = resolveDownloadMode(req)
        const fileName = String(attachment.fileName ?? '').trim() || 'download'
        const contentType = String(attachment.mimeType ?? '').trim() || 'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Disposition', buildContentDisposition(fileName, mode))
        res.setHeader('Content-Length', String(buffer.length))
        res.end(buffer)
      } catch (error) {
        handleDbError(error, req, res)
      }
    })

  apiRouter.get('/customer-app/news', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const gaId = await resolveAgentGaId(pool, context.agentId)
      if (gaId == null) {
        res.status(404).json({ message: '연결된 설계사 정보를 찾을 수 없습니다.' })
        return
      }
      const profile = await loadCustomerAppProfile(pool, context)
      const scopeRaw = String(req.query.scope ?? '')
        .trim()
        .toLowerCase()
      const scope = scopeRaw === 'personal' ? 'personal' : scopeRaw === 'all' ? 'all' : ''
      const params = [context.agentId, context.customerId, gaId]
      const scopeWhere =
        scope === 'personal'
          ? `AND COALESCE(NULLIF(TRIM(n.payload->>'customerNewsScope'), ''), 'all') = 'personal'
             AND COALESCE(NULLIF(TRIM(n.payload->>'targetCustomerId'), '')::int, 0) = $${params.length + 1}`
          : scope === 'all'
            ? `AND COALESCE(NULLIF(TRIM(n.payload->>'customerNewsScope'), ''), 'all') = 'all'`
            : ``
      if (scope === 'personal') {
        params.push(context.customerId)
      }
      const rows = await pool.query(
        `
        SELECT
          n.id,
          n.title,
          n.body_text,
          n.updated_at,
          n.payload,
          r.id AS read_id
        FROM insurance_company_newsletters n
        LEFT JOIN customer_news_reads r
          ON r.news_id = hashtextextended(CAST(n.id AS text), 0)
          AND r.agent_id = $1
          AND r.customer_id = $2
        WHERE n.ga_id = $3
          AND n.status = 'PUBLISHED'
          AND COALESCE((n.payload->>'customerVisible')::boolean, false) = true
          AND COALESCE(NULLIF(TRIM(n.payload->>'publisherId'), ''), '') = $1
          ${scopeWhere}
        ORDER BY n.updated_at DESC, n.id DESC
        `,
        params,
      )
      res.json({
        success: true,
        data: rows.rows.map((row) => {
          const rowScope =
            String(row.payload?.customerNewsScope ?? 'all') === 'personal' ? 'personal' : 'all'
          const isPersonalForMe =
            rowScope === 'personal' &&
            Number.isFinite(Number(row.payload?.targetCustomerId)) &&
            Number(row.payload?.targetCustomerId) === context.customerId
          const fallbackTitle = '개인소식지'
          const displayTitle = isPersonalForMe
            ? `${profile?.name || '고객'} 고객님께`
            : String(row.title ?? '')
          return {
            id: String(row.id),
            title: displayTitle || fallbackTitle,
            summary: String(row.body_text ?? '').slice(0, 140),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
            isRead: row.read_id != null,
            isPinned: Boolean(row.payload?.pinned),
            heroImageUrl: String(row.payload?.heroImageUrl ?? '').trim() || null,
            scope: rowScope,
            targetCustomerId:
              row.payload?.targetCustomerId != null && Number.isFinite(Number(row.payload.targetCustomerId))
                ? Number(row.payload.targetCustomerId)
                : null,
          }
        }),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/customer-app/news/:newsId', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const newsId = String(req.params.newsId ?? '').trim()
      if (!newsId) {
        res.status(400).json({ message: '유효한 newsId가 필요합니다.' })
        return
      }
      const gaId = await resolveAgentGaId(pool, context.agentId)
      if (gaId == null) {
        res.status(404).json({ message: '연결된 설계사 정보를 찾을 수 없습니다.' })
        return
      }
      const row = await loadCustomerNewsRowForCustomerApp(
        pool,
        newsId,
        gaId,
        context.agentId,
        context.customerId,
      )
      if (!row) {
        res.status(404).json({ message: '소식지를 찾을 수 없습니다.' })
        return
      }
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      const rawAttachments = normalizeCustomerNewsAttachments(payload.attachments)
      const attachments = mapCustomerNewsAttachmentsForApp(req, newsId, context, rawAttachments)
      const firstImage = attachments.find((a) => a.kind === 'image')
      const heroImageUrl = firstImage?.openUrl ?? attachments[0]?.openUrl ?? null
      res.json({
        success: true,
        data: {
          id: String(row.id),
          title:
            String(payload.customerNewsScope ?? 'all') === 'personal'
              ? `${(await loadCustomerAppProfile(pool, context))?.name || '고객'} 고객님께`
              : String(row.title ?? ''),
          content: String(row.body_text ?? ''),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
          isPinned: Boolean(payload.pinned),
          heroImageUrl,
          attachments,
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customer-app/news/:newsId/read', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const newsIdRaw = String(req.params.newsId ?? '').trim()
      if (!newsIdRaw) {
        res.status(400).json({ message: '유효한 newsId가 필요합니다.' })
        return
      }
      await pool.query(
        `
        INSERT INTO customer_news_reads
          (news_id, agent_id, customer_id, read_at)
        VALUES (hashtextextended($1::text, 0), $2, $3, NOW())
        ON CONFLICT (news_id, customer_id)
        DO UPDATE SET read_at = NOW()
        `,
        [newsIdRaw, context.agentId, context.customerId],
      )
      res.status(204).end()
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/customer-app/push-token', requireCustomerAppAuth, async (req, res) => {
    try {
      const context = req.customerApp
      const provider = String(req.body?.provider ?? '').trim().slice(0, 30)
      const pushToken = String(req.body?.pushToken ?? '').trim().slice(0, 255)
      if (!provider || !pushToken) {
        res.status(400).json({ message: 'provider와 pushToken이 필요합니다.' })
        return
      }
      await pool.query(
        `
        INSERT INTO customer_app_push_tokens
          (agent_id, customer_id, device_id, push_provider, push_token, status, last_registered_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW(), NOW())
        ON CONFLICT (push_token)
        DO UPDATE SET
          agent_id = EXCLUDED.agent_id,
          customer_id = EXCLUDED.customer_id,
          device_id = EXCLUDED.device_id,
          push_provider = EXCLUDED.push_provider,
          status = 'active',
          last_registered_at = NOW(),
          updated_at = NOW()
        `,
        [context.agentId, context.customerId, context.deviceId, provider, pushToken],
      )
      res.status(204).end()
    } catch (error) {
      handleDbError(error, req, res)
    }
  })
}
