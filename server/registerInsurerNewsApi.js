import { randomUUID } from 'node:crypto'
import { safeQuery, systemQuery } from './utils/dbSafeQuery.js'
import {
  consentPutInsurerAttachment,
  getR2InsurerAttachmentsCacheControl,
  getR2PublicCdnBase,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2DeleteObject,
  r2GetPresignedPutUrl,
} from './lib/consentStorage.js'
import {
  isGaInsurerManagerMutatorRole,
  isInsurerManagerRole,
  isLossAdjusterRole,
  isSuperAdminRole,
} from './lib/rbacScope.js'
import { INSURER_R2_ACTIVE_CATEGORY, INSURER_R2_CATEGORY } from './lib/insurerR2Layout.js'
import { insurerNewsLog } from './lib/logger.js'
import { isR2ObjectRootEnabled, stripR2ObjectRootIfPresent, withR2ObjectRoot } from './lib/r2KeyPolicy.js'

/** 프론트 `attachmentUploadPolicy.ts` 와 동기화 */
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const NEWS_CHANNEL_INSURER = 'INSURER'
const NEWS_CHANNEL_LOSS_ADJUSTER = 'LOSS_ADJUSTER'
const LOSS_ADJUSTER_R2_CATEGORY = INSURER_R2_CATEGORY.LOSS_ADJUSTER
const LEGACY_LOSS_ADJUSTER_R2_CATEGORY = 'LossAdjuster'

/** @param {unknown} role */
function newsChannelByRole(role) {
  return isLossAdjusterRole(role) ? NEWS_CHANNEL_LOSS_ADJUSTER : NEWS_CHANNEL_INSURER
}

/** @param {unknown} role */
function isNewsManagerRole(role) {
  return isInsurerManagerRole(role) || isLossAdjusterRole(role)
}

/** @param {unknown} raw */
function normalizeNewsChannel(raw) {
  const n = String(raw ?? '').trim().toUpperCase()
  return n === NEWS_CHANNEL_LOSS_ADJUSTER ? NEWS_CHANNEL_LOSS_ADJUSTER : NEWS_CHANNEL_INSURER
}

/** @param {string} channel */
function storageCategoryForChannel(channel) {
  return channel === NEWS_CHANNEL_LOSS_ADJUSTER ? LOSS_ADJUSTER_R2_CATEGORY : INSURER_R2_ACTIVE_CATEGORY
}

/** @param {unknown} gaId */
function normalizeGaIdForPath(gaId) {
  const n = Number(gaId)
  if (!Number.isInteger(n) || n < 1) {
    return ''
  }
  return String(n)
}

/** @param {string} name */
function slugifyCompanySegment(name) {
  const t = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  const stripped = t.replace(/[^\w\u3131-\u318e\uac00-\ud7a3-]/g, '')
  return stripped.slice(0, 48) || 'insurer'
}

/** @param {string} name */
function pseudoCompanyCodeForLossAdjuster(name) {
  return slugifyCompanySegment(name).replace(/-/g, '_').toUpperCase() || 'LOSS_ADJUSTER'
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} user req.user
 */
async function loadInsurerManagerNewsScope(pool, user) {
  const r = await safeQuery(
    pool,
    `
    SELECT
      g.code AS ga_code,
      g.id AS ga_id,
      m.id AS company_id,
      m.name AS company_name,
      m.company_code
    FROM insurer_managers im
    INNER JOIN ga_companies g ON g.id = im.ga_id
    INNER JOIN insurance_company_master m ON m.id = im.company_id AND m.ga_id = im.ga_id
    WHERE im.id = $1 AND im.is_deleted = false
      AND im.company_id = $2
      AND im.ga_id = $3
    `,
    [String(user.id), Number(user.companyId), Number(user.gaId)],
  )
  if (r.rowCount === 0) {
    return null
  }
  const row = r.rows[0]
  const gaIdPath = normalizeGaIdForPath(row.ga_id)
  const companySlug = slugifyCompanySegment(row.company_name)
  return {
    gaId: Number(row.ga_id),
    gaCodeRaw: String(row.ga_code ?? '').trim(),
    gaIdPath,
    companyId: Number(row.company_id),
    companyName: String(row.company_name ?? '').trim(),
    companySlug,
    companyCodeRaw: String(row.company_code ?? '').trim(),
    newsChannel: NEWS_CHANNEL_INSURER,
    storageCategory: storageCategoryForChannel(NEWS_CHANNEL_INSURER),
    publisherId: String(user.id),
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} user req.user
 */
async function loadLossAdjusterNewsScope(pool, user) {
  const r = await safeQuery(
    pool,
    `
    SELECT
      g.code AS ga_code,
      g.id AS ga_id,
      la.company_name AS company_name,
      la.adjuster_name AS adjuster_name
    FROM loss_adjusters la
    INNER JOIN ga_companies g ON g.id = la.ga_id
    WHERE la.id = $1 AND la.is_deleted = false
      AND la.ga_id = $2
    `,
    [String(user.id), Number(user.gaId)],
  )
  if (r.rowCount === 0) {
    return null
  }
  const row = r.rows[0]
  const companyNameRaw = String(row.company_name ?? '').trim() || String(row.adjuster_name ?? '').trim()
  const gaIdPath = normalizeGaIdForPath(row.ga_id)
  const companySlug = slugifyCompanySegment(companyNameRaw)
  return {
    gaId: Number(row.ga_id),
    gaCodeRaw: String(row.ga_code ?? '').trim(),
    gaIdPath,
    companyId: null,
    companyName: companyNameRaw,
    companySlug,
    companyCodeRaw: pseudoCompanyCodeForLossAdjuster(companyNameRaw),
    newsChannel: NEWS_CHANNEL_LOSS_ADJUSTER,
    storageCategory: storageCategoryForChannel(NEWS_CHANNEL_LOSS_ADJUSTER),
    publisherId: String(user.id),
  }
}

/**
 * GA 관리·스태프: 마스터 보험사 행으로 소식 스코프
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 * @param {number} companyMasterId
 * @param {string} channel
 */
async function loadMasterCompanyNewsScope(pool, gaId, companyMasterId, channel = NEWS_CHANNEL_INSURER) {
  if (!Number.isInteger(gaId) || gaId < 1 || !Number.isInteger(companyMasterId) || companyMasterId < 1) {
    return null
  }
  const r = await safeQuery(
    pool,
    `
    SELECT m.id, m.name, m.company_code, m.ga_id, g.code AS ga_code
    FROM insurance_company_master m
    INNER JOIN ga_companies g ON g.id = m.ga_id
    WHERE m.id = $1 AND m.ga_id = $2
    `,
    [companyMasterId, gaId],
  )
  if (r.rowCount === 0) {
    return null
  }
  const row = r.rows[0]
  return {
    gaId: Number(row.ga_id),
    gaCodeRaw: String(row.ga_code ?? '').trim(),
    gaIdPath: normalizeGaIdForPath(row.ga_id),
    companyId: Number(row.id),
    companyName: String(row.name ?? '').trim(),
    companySlug: slugifyCompanySegment(row.name),
    companyCodeRaw: String(row.company_code ?? '').trim(),
    newsChannel: normalizeNewsChannel(channel),
    storageCategory: storageCategoryForChannel(normalizeNewsChannel(channel)),
    publisherId: null,
  }
}

/** @param {string} contentType */
function maxBytesForMime(contentType) {
  if (contentType === 'application/pdf') {
    return MAX_PDF_BYTES
  }
  return MAX_IMAGE_BYTES
}

/**
 * @param {string} objectKey
 * @param {string} gaIdPath
 * @param {string} storageCategory
 * @param {string} companySlug
 * @param {boolean} [allowLegacyLossAdjusterCategory]
 */
function assertNewsObjectKeyScoped(objectKey, gaIdPath, storageCategory, companySlug, allowLegacyLossAdjusterCategory = false) {
  const k = stripR2ObjectRootIfPresent(String(objectKey ?? '').trim().replace(/^\//, ''))
  const parts = k.split('/')

  if (parts[0] === 'insurer-news' && parts.length === 6) {
    const catSeg = parts[1]
    const yyyy = parts[2]
    const mm = parts[3]
    const slugSeg = parts[4]
    const fileSeg = parts[5]
    const isLossAdjusterCategory = storageCategory === LOSS_ADJUSTER_R2_CATEGORY
    const isLegacyLossAdjusterCategory =
      catSeg === LEGACY_LOSS_ADJUSTER_R2_CATEGORY || catSeg === INSURER_R2_ACTIVE_CATEGORY
    const categoryMatches =
      catSeg === storageCategory ||
      (allowLegacyLossAdjusterCategory &&
        isLossAdjusterCategory &&
        isLegacyLossAdjusterCategory)
    if (!categoryMatches) {
      return false
    }
    if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm)) {
      return false
    }
    if (slugSeg !== companySlug) {
      return false
    }
    if (!fileSeg || !String(fileSeg).trim()) {
      return false
    }
    return true
  }

  if (parts.length < 6) {
    return false
  }
  const isLossAdjusterCategory = storageCategory === LOSS_ADJUSTER_R2_CATEGORY
  const isLegacyLossAdjusterCategory =
    parts[2] === LEGACY_LOSS_ADJUSTER_R2_CATEGORY || parts[2] === INSURER_R2_ACTIVE_CATEGORY
  const categoryMatches =
    parts[2] === storageCategory ||
    (allowLegacyLossAdjusterCategory &&
      isLossAdjusterCategory &&
      isLegacyLossAdjusterCategory)
  if (parts[0] !== 'insurer' || parts[1] !== gaIdPath || !categoryMatches) {
    return false
  }
  let companyIndex = 4
  if (/^\d{4}$/.test(parts[3]) && /^\d{2}$/.test(parts[4])) {
    companyIndex = 5
  } else if (/^\d{4}-\d{2}$/.test(parts[3])) {
    companyIndex = 4
  } else {
    return false
  }
  if (parts[companyIndex] !== companySlug) {
    return false
  }
  if (parts.length !== companyIndex + 2) {
    return false
  }
  if (!parts[companyIndex + 1] || !String(parts[companyIndex + 1]).trim()) {
    return false
  }
  return true
}

/**
 * @param {string} url
 * @param {string} objectKey
 */
function assertCdnUrlMatchesKey(url, objectKey) {
  const base = getR2PublicCdnBase()
  const expected = `${base}/${objectKey}`
  return String(url) === expected
}

/** @param {unknown[]} attachments */
function collectAttachmentObjectKeys(attachments) {
  const keys = []
  if (!Array.isArray(attachments)) {
    return keys
  }
  for (const a of attachments) {
    const k = String(a?.objectKey ?? '').trim()
    if (k) {
      keys.push(k)
    }
  }
  return keys
}

async function rollbackUploadedOrphans(objectKeys) {
  for (const k of objectKeys) {
    insurerNewsLog.warn({ event: 'orphan', objectKey: k, phase: 'db-failed-cleanup' })
    try {
      await r2DeleteObject(k)
      insurerNewsLog.info({ event: 'orphan-deleted', objectKey: k })
    } catch (err) {
      insurerNewsLog.error({
        event: 'orphan-delete-failed',
        objectKey: k,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 * @param {string} gaCodeUpper
 */
async function buildInsurersListMerged(pool, gaId, gaCodeUpper) {
  const masters = await safeQuery(
    pool,
    `
    SELECT id, name, company_code
    FROM insurance_company_master
    WHERE ga_id = $1
    ORDER BY name ASC
    `,
    [gaId],
  )
  const stats = await safeQuery(
    pool,
    `
    SELECT company_id,
      COUNT(*) FILTER (WHERE status = 'PUBLISHED') AS pub_cnt,
      MAX(updated_at) AS last_u
    FROM insurance_company_newsletters
    WHERE ga_id = $1 AND company_id IS NOT NULL
    GROUP BY company_id
    `,
    [gaId],
  )
  const statMap = new Map()
  for (const s of stats.rows) {
    statMap.set(Number(s.company_id), s)
  }
  return masters.rows.map((row) => {
    const id = Number(row.id)
    const st = statMap.get(id)
    const name = String(row.name ?? '').trim()
    const slug = slugifyCompanySegment(name)
    const code = String(row.company_code ?? '').trim()
    return {
      gaCode: gaCodeUpper,
      insurerCode: code || `INS${id}`,
      insurerName: name,
      insurerSlug: slug,
      newsletterCount: st ? Number(st.pub_cnt ?? 0) : 0,
      lastPublishedAt: st?.last_u ? toIso(st.last_u) : null,
    }
  })
}

/**
 * @param {string} gaCodeUpper
 * @param {Array<{ insurerCode?: string, insurerName?: string, insurerSlug?: string, publishedAt?: string }>} newsletters
 */
function buildInsurerListFromNewsletters(gaCodeUpper, newsletters) {
  /** @type {Map<string, { gaCode: string, insurerCode: string, insurerName: string, insurerSlug: string, newsletterCount: number, lastPublishedAt: string | null }>} */
  const bySlug = new Map()
  for (const item of newsletters) {
    const insurerName = String(item.insurerName ?? '').trim()
    const insurerSlugRaw = String(item.insurerSlug ?? '').trim()
    const insurerSlug = insurerSlugRaw || slugifyCompanySegment(insurerName)
    if (!insurerSlug) {
      continue
    }
    const key = insurerSlug.toLowerCase()
    const publishedAt = String(item.publishedAt ?? '').trim()
    const existing = bySlug.get(key)
    if (!existing) {
      bySlug.set(key, {
        gaCode: gaCodeUpper,
        insurerCode: String(item.insurerCode ?? '').trim() || insurerSlug.replace(/-/g, '_').toUpperCase(),
        insurerName: insurerName || insurerSlugRaw,
        insurerSlug,
        newsletterCount: 1,
        lastPublishedAt: publishedAt || null,
      })
      continue
    }
    existing.newsletterCount += 1
    if (!existing.lastPublishedAt || (publishedAt && new Date(publishedAt).getTime() > new Date(existing.lastPublishedAt).getTime())) {
      existing.lastPublishedAt = publishedAt || existing.lastPublishedAt
    }
  }
  return [...bySlug.values()].sort((a, b) => a.insurerName.localeCompare(b.insurerName, 'ko'))
}

function toIso(v) {
  if (v instanceof Date) {
    return v.toISOString()
  }
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString()
  }
  return d.toISOString()
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.handleDbError
 * @param {Function} ctx.withTransaction
 * @param {Function} ctx.effectiveTenantGaId
 * @param {Function} ctx.parseGaId
 * @param {Function} ctx.resolveTenantGaIdForRequest
 */
export function registerInsurerNewsApi(apiRouter, ctx) {
  const {
    pool,
    requireAuth,
    handleDbError,
    withTransaction,
    effectiveTenantGaId,
    parseGaId,
    resolveTenantGaIdForRequest,
  } = ctx

  async function loadNewsManagerScopeByUser(user) {
    if (isLossAdjusterRole(user?.role)) {
      return loadLossAdjusterNewsScope(pool, user)
    }
    return loadInsurerManagerNewsScope(pool, user)
  }

  function requireNewsletterWriter(req, res, next) {
    if (!req.user) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    if (isNewsManagerRole(req.user.role) || isGaInsurerManagerMutatorRole(req.user.role)) {
      next()
      return
    }
    res.status(403).json({ message: '소식 작성 권한이 없습니다.' })
  }

  function requireGaStaffOrAdminDelete(req, res, next) {
    if (!req.user) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    if (isNewsManagerRole(req.user.role) || isSuperAdminRole(req.user.role)) {
      res.status(403).json({ message: '소식 삭제 권한이 없습니다.' })
      return
    }
    if (!isGaInsurerManagerMutatorRole(req.user.role)) {
      res.status(403).json({ message: '소식 삭제 권한이 없습니다.' })
      return
    }
    next()
  }

  function forbidInsurerOnFeed(req, res, next) {
    if (isNewsManagerRole(req.user?.role)) {
      res.status(403).json({ message: '채널 담당자 계정은 이 목록을 볼 수 없습니다.' })
      return
    }
    next()
  }

  /**
   * @param {string} gaCodeParam
   * @returns {Promise<number|null>}
   */
  async function resolveGaIdFromCodeParam(gaCodeParam) {
    const code = String(gaCodeParam ?? '').trim()
    if (!code) {
      return null
    }
    const r = await systemQuery(
      pool,
      `
      SELECT id FROM ga_companies
      WHERE UPPER(TRIM(code)) = UPPER($1)
        AND is_deleted = false
        AND status = 'active'
      LIMIT 1
      `,
      [code],
    )
    if (r.rowCount === 0) {
      return null
    }
    return Number(r.rows[0].id)
  }

  /**
   * @param {import('express').Request} req
   * @param {string} gaCodeQuery
   */
  async function resolveFeedGaId(req, gaCodeQuery) {
    if (isSuperAdminRole(req.user?.role)) {
      const fromQuery = await resolveGaIdFromCodeParam(gaCodeQuery)
      if (fromQuery != null) {
        return fromQuery
      }
      return parseGaId(req.user?.gaId)
    }
    return effectiveTenantGaId(req)
  }

  /** 피드 조회 채널(기본: 원수사) */
  function resolveFeedChannel(req) {
    return normalizeNewsChannel(req.query?.channel)
  }

  /** 매니저·스태프 조회 채널 */
  function resolveManagerChannel(req) {
    if (isNewsManagerRole(req.user?.role)) {
      return newsChannelByRole(req.user.role)
    }
    return normalizeNewsChannel(req.query?.channel ?? req.body?.channel)
  }

  /**
   * @param {object} row newsletter row
   * @param {object[]} attRows
   */
  function mapNewsletterDetail(row, attRows) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
    const attachments = [...attRows]
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((a) => {
        const mime = String(a.mime_type ?? '')
        const dbKind = String(a.kind ?? '')
        const isFile =
          mime === 'application/pdf' || dbKind === 'file' || dbKind === 'pdf'
        return {
          id: String(a.id),
          kind: isFile ? 'file' : 'image',
          url: String(a.url),
          fileName: String(a.file_name),
          sortOrder: Number(a.sort_order),
          objectKey: String(a.object_key),
          mimeType: mime,
          size: Number(a.size_bytes),
        }
      })
    const images = attachments.filter((x) => x.kind === 'image')
    const insurerCode = String(payload.insurerCode ?? '').trim()
    const insurerSlug = String(payload.insurerSlug ?? '').trim()
    const insurerName = String(payload.insurerName ?? row.company_name_snapshot ?? '').trim()
    const newsChannel = normalizeNewsChannel(payload.newsChannel)
    const publishedAt = payload.publishedAt ? String(payload.publishedAt) : toIso(row.updated_at)
    const summary =
      String(row.body_text ?? '').trim() ||
      String(payload.summary ?? '').trim() ||
      '요약 없음'

    const fileAttachments = attachments.filter((x) => x.kind === 'file')

    return {
      id: String(row.id),
      gaCode: String(payload.gaCode ?? '').trim().toUpperCase(),
      insurerCode: insurerCode || '—',
      insurerName: insurerName || String(row.company_name_snapshot ?? ''),
      insurerSlug: insurerSlug || 'insurer',
      newsChannel,
      publisherId: String(payload.publisherId ?? '').trim() || undefined,
      title: '',
      summary,
      heroImageUrl: images[0]?.url ?? null,
      publishedAt,
      status: String(row.status ?? 'DRAFT'),
      hasImages: images.length > 0,
      hasPdf: fileAttachments.length > 0,
      hasTextBody: String(row.body_text ?? '').trim().length > 0,
      bodyText: String(row.body_text ?? ''),
      attachments,
    }
  }

  /**
   * @param {object} att
   * @param {{ gaIdPath: string, companySlug: string, storageCategory: string }} scope
   */
  function assertAttachmentInput(att, scope) {
    const kind = String(att.kind ?? '')
    const url = String(att.url ?? '').trim()
    const objectKey = String(att.objectKey ?? '').trim()
    const fileName = String(att.fileName ?? 'file').trim() || 'file'
    const mimeType = String(att.mimeType ?? '').trim() || 'application/octet-stream'
    const size = Number(att.size ?? att.sizeBytes ?? 0)

    if (!ALLOWED_UPLOAD_MIME.has(mimeType)) {
      throw Object.assign(new Error('허용되지 않은 첨부 형식입니다.'), { httpStatus: 400 })
    }
    if (kind !== 'image' && kind !== 'pdf' && kind !== 'file') {
      throw Object.assign(new Error('첨부 kind가 올바르지 않습니다.'), { httpStatus: 400 })
    }
    if (!objectKey || !url) {
      throw Object.assign(new Error('첨부 objectKey와 url이 필요합니다.'), { httpStatus: 400 })
    }
    if (!assertNewsObjectKeyScoped(objectKey, scope.gaIdPath, scope.storageCategory, scope.companySlug, true)) {
      throw Object.assign(new Error('허용되지 않은 저장 경로입니다.'), { httpStatus: 400 })
    }
    if (!assertCdnUrlMatchesKey(url, objectKey)) {
      throw Object.assign(new Error('첨부 URL이 objectKey와 일치하지 않습니다.'), { httpStatus: 400 })
    }
    if ((kind === 'pdf' || kind === 'file') && mimeType !== 'application/pdf') {
      throw Object.assign(new Error('PDF 첨부의 MIME이 올바르지 않습니다.'), { httpStatus: 400 })
    }
    if (kind === 'image' && mimeType === 'application/pdf') {
      throw Object.assign(new Error('이미지 첨부의 MIME이 올바르지 않습니다.'), { httpStatus: 400 })
    }

    const maxB = maxBytesForMime(mimeType)
    if (!Number.isFinite(size) || size < 1 || size > maxB) {
      throw Object.assign(new Error('첨부 크기가 허용 범위를 벗어났습니다.'), { httpStatus: 400 })
    }

    return {
      id: randomUUID(),
      kind: mimeType === 'application/pdf' ? 'file' : 'image',
      url,
      objectKey,
      fileName,
      mimeType,
      size,
    }
  }

  /**
   * @param {import('express').Request} req
   */
  async function resolvePresignScope(req, bodyOverride = null) {
    const body =
      bodyOverride && typeof bodyOverride === 'object'
        ? bodyOverride
        : req.body && typeof req.body === 'object'
          ? req.body
          : {}
    const channel = normalizeNewsChannel(body.channel)
    if (isNewsManagerRole(req.user.role)) {
      const expected = newsChannelByRole(req.user.role)
      if (channel !== expected) {
        throw Object.assign(new Error('업로드 채널이 계정 권한과 일치하지 않습니다.'), { httpStatus: 403 })
      }
      return loadNewsManagerScopeByUser(req.user)
    }
    if (!isGaInsurerManagerMutatorRole(req.user.role)) {
      return null
    }
    const tenantGa = await resolveTenantGaIdForRequest(pool, req)
    if (tenantGa == null) {
      return null
    }
    const insurerCode = String(body.insurerCode ?? '').trim()
    if (!insurerCode) {
      throw Object.assign(new Error('insurerCode가 필요합니다.'), { httpStatus: 400 })
    }
    const r = await safeQuery(
      pool,
      `
      SELECT id FROM insurance_company_master
      WHERE ga_id = $1 AND UPPER(TRIM(company_code)) = UPPER(TRIM($2))
      LIMIT 1
      `,
      [tenantGa, insurerCode],
    )
    if (r.rowCount === 0) {
      throw Object.assign(new Error('보험사를 찾을 수 없습니다.'), { httpStatus: 400 })
    }
    return loadMasterCompanyNewsScope(pool, tenantGa, Number(r.rows[0].id), channel)
  }

  /**
   * @param {object} body
   * @returns {Promise<NonNullable<Awaited<ReturnType<typeof loadInsurerManagerNewsScope>>> | Awaited<ReturnType<typeof loadMasterCompanyNewsScope>> | null>}
   */
  async function resolveNewsWriteScope(req, body, channel) {
    const normalizedChannel = normalizeNewsChannel(channel)
    if (isNewsManagerRole(req.user.role)) {
      const managerScope = await loadNewsManagerScopeByUser(req.user)
      if (!managerScope) {
        throw Object.assign(new Error('소식 작성 범위를 확인할 수 없습니다.'), { httpStatus: 403 })
      }
      if (normalizedChannel !== newsChannelByRole(req.user.role)) {
        throw Object.assign(new Error('소식 작성 채널이 계정 권한과 일치하지 않습니다.'), { httpStatus: 403 })
      }
      const gaCodeFromBody = String(body.gaCode ?? '').trim().toUpperCase()
      if (gaCodeFromBody && gaCodeFromBody !== String(managerScope.gaCodeRaw ?? '').trim().toUpperCase()) {
        throw Object.assign(new Error('소식 작성 범위를 벗어났습니다.'), { httpStatus: 403 })
      }
      if (!isLossAdjusterRole(req.user.role)) {
        const insurerCode = String(body.insurerCode ?? '').trim().toUpperCase()
        const expectedCode = String(managerScope.companyCodeRaw ?? '').trim().toUpperCase()
        if (!insurerCode || !expectedCode || insurerCode !== expectedCode) {
          throw Object.assign(new Error('소식 작성 범위를 벗어났습니다.'), { httpStatus: 403 })
        }
      }
      return managerScope
    }

    const gaCode = String(body.gaCode ?? '').trim()
    const insurerCode = String(body.insurerCode ?? '').trim()
    if (!gaCode || !insurerCode) {
      throw Object.assign(new Error('gaCode와 insurerCode가 필요합니다.'), { httpStatus: 400 })
    }
    const gaId = await resolveGaIdFromCodeParam(gaCode)
    if (gaId == null) {
      throw Object.assign(new Error('GA를 찾을 수 없습니다.'), { httpStatus: 400 })
    }
    const companyR = await safeQuery(
      pool,
      `
      SELECT id, name, company_code, ga_id FROM insurance_company_master
      WHERE ga_id = $1 AND UPPER(TRIM(company_code)) = UPPER(TRIM($2))
      LIMIT 1
      `,
      [gaId, insurerCode],
    )
    if (companyR.rowCount === 0) {
      throw Object.assign(new Error('보험사를 찾을 수 없습니다.'), { httpStatus: 400 })
    }
    const masterId = Number(companyR.rows[0].id)
    if (isGaInsurerManagerMutatorRole(req.user.role)) {
      const tenantGa = await resolveTenantGaIdForRequest(pool, req)
      if (tenantGa == null || tenantGa !== gaId) {
        throw Object.assign(new Error('소식 작성 범위를 벗어났습니다.'), { httpStatus: 403 })
      }
      return loadMasterCompanyNewsScope(pool, gaId, masterId, normalizedChannel)
    }
    throw Object.assign(new Error('소식 작성 권한이 없습니다.'), { httpStatus: 403 })
  }

  /**
   * @param {object} row
   * @param {string} gaCodeUpper
   */
  function mapNewsletterListRow(row, gaCodeUpper) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
    const newsChannel = normalizeNewsChannel(payload.newsChannel)
    const insurerCode = String(payload.insurerCode ?? '').trim()
    const insurerSlug = String(payload.insurerSlug ?? '').trim()
    const insurerName = String(payload.insurerName ?? row.company_name_snapshot ?? '').trim()
    const publishedAt = payload.publishedAt ? String(payload.publishedAt) : toIso(row.updated_at)
    const summary =
      String(row.body_text ?? '').trim() ||
      String(payload.summary ?? '').trim() ||
      '요약 없음'

    return {
      id: String(row.id),
      gaCode: gaCodeUpper,
      insurerCode: insurerCode || '—',
      insurerName: insurerName || String(row.company_name_snapshot ?? ''),
      insurerSlug: insurerSlug || 'insurer',
      newsChannel,
      publisherId: String(payload.publisherId ?? '').trim() || undefined,
      title: '',
      summary,
      heroImageUrl: row.hero_url ? String(row.hero_url) : null,
      publishedAt,
      status: String(row.status ?? 'DRAFT'),
      hasImages: Number(row.img_cnt ?? 0) > 0,
      hasPdf: Number(row.pdf_cnt ?? 0) > 0,
      hasTextBody: String(row.body_text ?? '').trim().length > 0,
    }
  }

  function buildPayloadFromBody(body, scope, newsChannel) {
    const resolvedChannel = normalizeNewsChannel(newsChannel)
    const payload = {
      gaCode: String(body.gaCode ?? scope.gaCodeRaw ?? '').trim().toUpperCase(),
      insurerCode: String(body.insurerCode ?? scope.companyCodeRaw ?? '').trim(),
      insurerSlug: String(body.insurerSlug ?? scope.companySlug ?? '').trim(),
      insurerName: String(body.insurerName ?? scope.companyName ?? '').trim(),
      newsChannel: resolvedChannel,
      summary: String(body.summary ?? '').trim(),
      publishedAt: body.publishedAt ? String(body.publishedAt) : null,
    }
    if (scope.publisherId) {
      payload.publisherId = String(scope.publisherId)
    }
    return payload
  }

  /** 첨부 목록 — newsletter_id 와 소속 GA 로 한정 (멀티테넌트 조회 정책과 일치) */
  const SQL_ATTACHMENTS_BY_NEWSLETTER_GA = `
    SELECT a.*
    FROM insurance_company_newsletter_attachments a
    INNER JOIN insurance_company_newsletters n ON n.id = a.newsletter_id AND n.ga_id = $2
    WHERE a.newsletter_id = $1
    ORDER BY a.sort_order ASC
  `

  /**
   * @param {import('pg').PoolClient} client
   * @param {string} newsletterId
   * @param {number} gaId
   */
  async function deleteAttachmentsForNewsletter(client, newsletterId, gaId) {
    await client.query(
      `
      DELETE FROM insurance_company_newsletter_attachments a
      USING insurance_company_newsletters n
      WHERE a.newsletter_id = $1 AND n.id = a.newsletter_id AND n.ga_id = $2
      `,
      [newsletterId, gaId],
    )
  }

  /**
   * 이미지·PDF 를 업로드 그대로 저장합니다 (PDF 를 이미지로 변환하지 않음).
   * @param {unknown[]} attIn
   * @param {{ gaIdPath: string, companySlug: string }} scope
   * @returns {ReturnType<typeof assertAttachmentInput>[]}
   */
  function prepareAttachmentsForWrite(attIn, scope) {
    return attIn.map((a) =>
      assertAttachmentInput(a, {
        gaIdPath: scope.gaIdPath,
        companySlug: scope.companySlug,
        storageCategory: scope.storageCategory,
      }),
    )
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
        throw Object.assign(new Error('파일 크기가 허용 범위를 벗어났습니다.'), { httpStatus: 400 })
      }
      chunks.push(buf)
    }
    return Buffer.concat(chunks)
  }

  async function insertAttachments(client, newsletterId, normalized) {
    let order = 0
    for (const a of normalized) {
      await client.query(
        `
        INSERT INTO insurance_company_newsletter_attachments
          (id, newsletter_id, kind, url, object_key, file_name, mime_type, size_bytes, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          a.id,
          newsletterId,
          a.kind,
          a.url,
          a.objectKey,
          a.fileName,
          a.mimeType,
          a.size,
          order,
        ],
      )
      order += 1
    }
  }

  /**
   * @param {object} row
   * @param {import('express').Request} req
   */
  async function assertCanAccessNewsletterRow(row, req, expectedChannel = null) {
    if (!row) {
      throw Object.assign(new Error('소식을 찾을 수 없습니다.'), { httpStatus: 404 })
    }
    const rowPayload = row.payload && typeof row.payload === 'object' ? row.payload : {}
    const rowChannel = normalizeNewsChannel(rowPayload.newsChannel)
    if (expectedChannel && rowChannel !== normalizeNewsChannel(expectedChannel)) {
      throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
    }
    if (isNewsManagerRole(req.user.role)) {
      const managerScope = await loadNewsManagerScopeByUser(req.user)
      if (!managerScope || Number(row.ga_id) !== managerScope.gaId || rowChannel !== newsChannelByRole(req.user.role)) {
        throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
      }
      if (isLossAdjusterRole(req.user.role)) {
        const publisherId = String(rowPayload.publisherId ?? '').trim()
        if (publisherId) {
          if (publisherId !== String(req.user.id)) {
            throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
          }
          return
        }
        if (managerScope.companyId != null && Number(row.company_id) === Number(managerScope.companyId)) {
          return
        }
        throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
      }
      if (Number(row.company_id) !== Number(managerScope.companyId)) {
        throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
      }
      return
    }
    if (isGaInsurerManagerMutatorRole(req.user.role)) {
      const tenantGa = await resolveTenantGaIdForRequest(pool, req)
      if (tenantGa == null || Number(row.ga_id) !== tenantGa) {
        throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
      }
      return
    }
    throw Object.assign(new Error('접근할 수 없습니다.'), { httpStatus: 403 })
  }

  /**
   * 삭제 권한: 작성자(채널 매니저) 또는 GA_ADMIN/GA_STAFF
   * @param {object} row
   * @param {import('express').Request} req
   * @param {string|null} expectedChannel
   */
  async function assertCanDeleteNewsletterRow(row, req, expectedChannel = null) {
    await assertCanAccessNewsletterRow(row, req, expectedChannel)
    if (isGaInsurerManagerMutatorRole(req.user.role)) {
      return
    }
    if (isNewsManagerRole(req.user.role)) {
      const rowPayload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      const publisherId = String(rowPayload.publisherId ?? '').trim()
      if (!publisherId || publisherId !== String(req.user.id)) {
        throw Object.assign(new Error('작성자 본인만 삭제할 수 있습니다.'), { httpStatus: 403 })
      }
      return
    }
    throw Object.assign(new Error('소식 삭제 권한이 없습니다.'), { httpStatus: 403 })
  }

  /**
   * insurance_company_newsletters 단건 SELECT·RLS용 ga_id
   * (원수사 담당자: 매니저 스코프, GA 스태프: resolveTenantGaIdForRequest).
   * @param {import('express').Request} req
   * @returns {Promise<number|null>}
   */
  async function resolveNewsletterSelectGaId(req) {
    if (isNewsManagerRole(req.user.role)) {
      const managerScope = await loadNewsManagerScopeByUser(req.user)
      return managerScope != null ? Number(managerScope.gaId) : null
    }
    if (isGaInsurerManagerMutatorRole(req.user.role)) {
      const tenantGa = await resolveTenantGaIdForRequest(pool, req)
      return tenantGa == null ? null : Number(tenantGa)
    }
    return null
  }

  apiRouter.get('/insurer-news/feed', requireAuth, forbidInsurerOnFeed, async (req, res) => {
    try {
      const gaCodeQuery = String(req.query.gaCode ?? '').trim()
      const limitRaw = Number(req.query.limit ?? 50)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 50
      const insurerSlugFilter = String(req.query.insurerSlug ?? '')
        .trim()
        .toLowerCase()
      const channel = resolveFeedChannel(req)

      const gaId = await resolveFeedGaId(req, gaCodeQuery)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }

      const userId = String(req.user?.id ?? '')
      const gaRow = isSuperAdminRole(req.user?.role)
        ? await safeQuery(
            pool,
            `
            SELECT UPPER(TRIM(g.code)) AS c
            FROM ga_companies g
            WHERE g.id = $1
              AND g.is_deleted = false
              AND g.status = 'active'
            `,
            [gaId],
          )
        : await safeQuery(
            pool,
            `
            SELECT UPPER(TRIM(g.code)) AS c
            FROM ga_companies g
            INNER JOIN users u ON u.id = $2 AND u.ga_id = g.id
            WHERE g.id = $1
              AND g.is_deleted = false
            `,
            [gaId, userId],
          )
      const gaCodeUpper = gaRow.rowCount ? String(gaRow.rows[0].c ?? '') : gaCodeQuery.toUpperCase()

      let listSql = `
        SELECT n.*, g.code AS ga_code_join,
          (SELECT COUNT(*) FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type <> 'application/pdf') AS img_cnt,
          (SELECT COUNT(*) FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type = 'application/pdf') AS pdf_cnt,
          (SELECT a.url FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type <> 'application/pdf'
            ORDER BY a.sort_order ASC LIMIT 1) AS hero_url
        FROM insurance_company_newsletters n
        INNER JOIN ga_companies g ON g.id = n.ga_id
        WHERE n.ga_id = $1
          AND n.status = 'PUBLISHED'
          AND COALESCE(NULLIF(TRIM(n.payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $2
          AND COALESCE((n.payload->>'customerVisible')::boolean, false) = false
          AND COALESCE(NULLIF(TRIM(n.payload->>'insurerSlug'), ''), '') <> 'customer-news'
          AND UPPER(COALESCE(NULLIF(TRIM(n.payload->>'insurerCode'), ''), '')) <> 'CUSTOMER_NEWS'
      `
      const params = [gaId, channel]
      if (insurerSlugFilter) {
        listSql += ` AND LOWER(TRIM(n.payload->>'insurerSlug')) = $3`
        params.push(insurerSlugFilter)
      }
      listSql += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const nRes = await safeQuery(pool, listSql, params)
      const newsletters = nRes.rows.map((row) => mapNewsletterListRow(row, gaCodeUpper))
      const insurers =
        channel === NEWS_CHANNEL_LOSS_ADJUSTER
          ? buildInsurerListFromNewsletters(gaCodeUpper, newsletters)
          : await buildInsurersListMerged(pool, gaId, gaCodeUpper)

      res.json({ newsletters, insurers })
    } catch (e86) {
      handleDbError(e86, req, res)
    }
  })

  apiRouter.get('/insurer-news/feed/:newsletterId', requireAuth, forbidInsurerOnFeed, async (req, res) => {
    try {
      const newsletterId = String(req.params.newsletterId ?? '')
      const gaCodeQuery = String(req.query.gaCode ?? '').trim()
      const channel = resolveFeedChannel(req)
      const gaId = await resolveFeedGaId(req, gaCodeQuery)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }

      const nRes = await safeQuery(
        pool,
        `
        SELECT *
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND status = 'PUBLISHED'
          AND COALESCE(NULLIF(TRIM(payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $3
          AND COALESCE((payload->>'customerVisible')::boolean, false) = false
          AND COALESCE(NULLIF(TRIM(payload->>'insurerSlug'), ''), '') <> 'customer-news'
          AND UPPER(COALESCE(NULLIF(TRIM(payload->>'insurerCode'), ''), '')) <> 'CUSTOMER_NEWS'
        `,
        [newsletterId, gaId, channel],
      )
      if (nRes.rowCount === 0) {
        res.status(404).json({ message: '소식을 찾을 수 없습니다.' })
        return
      }
      const attRes = await safeQuery(pool, SQL_ATTACHMENTS_BY_NEWSLETTER_GA, [newsletterId, gaId])
      res.json(mapNewsletterDetail(nRes.rows[0], attRes.rows))
    } catch (e87) {
      handleDbError(e87, req, res)
    }
  })

  apiRouter.get('/insurer-news/manager/publish-context', requireAuth, async (req, res) => {
    try {
      if (!isNewsManagerRole(req.user.role)) {
        res.status(403).json({ message: '채널 담당자만 이용할 수 있습니다.' })
        return
      }
      const scope = await loadNewsManagerScopeByUser(req.user)
      if (!scope) {
        res.status(403).json({ message: '소식 발행 컨텍스트를 찾을 수 없습니다.' })
        return
      }
      res.json({
        gaCode: scope.gaCodeRaw.toUpperCase(),
        insurerCode: String(scope.companyCodeRaw ?? '').trim(),
        insurerName: scope.companyName,
        insurerSlug: scope.companySlug,
        newsChannel: newsChannelByRole(req.user.role),
      })
    } catch (e88) {
      handleDbError(e88, req, res)
    }
  })

  apiRouter.post('/insurer-news/attachments/presign', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const fileNameRaw = String(body.fileName ?? 'file').trim() || 'file'
      const contentType = String(body.contentType ?? 'application/octet-stream').trim()
      const sizeBytes = Number(body.sizeBytes ?? body.size ?? 0)

      if (!ALLOWED_UPLOAD_MIME.has(contentType)) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'presign',
          reason: 'mime-not-allowed',
          contentType,
          userId: req.user?.id ?? null,
        })
        res.status(400).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      const maxB = maxBytesForMime(contentType)
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > maxB) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'presign',
          reason: 'size-out-of-range',
          contentType,
          sizeBytes,
          maxBytes: maxB,
          userId: req.user?.id ?? null,
        })
        res.status(400).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }

      const scope = await resolvePresignScope(req)
      if (!scope) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'presign',
          reason: 'no-scope',
          userId: req.user?.id ?? null,
        })
        res.status(403).json({ message: '업로드 범위를 확인할 수 없습니다.' })
        return
      }

      const safeSeg = fileNameRaw.replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120)
      const now = new Date()
      const yyyy = String(now.getUTCFullYear())
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
      const relativeKey = isR2ObjectRootEnabled()
        ? `insurer-news/${scope.storageCategory}/${yyyy}/${mm}/${scope.companySlug}/${randomUUID()}_${safeSeg}`
        : `insurer/${scope.gaIdPath}/${scope.storageCategory}/${yyyy}/${mm}/${scope.companySlug}/${randomUUID()}_${safeSeg}`
      const objectKey = withR2ObjectRoot(relativeKey)

      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
      if (!uploadUrl) {
        insurerNewsLog.error({ event: 'upload-fail', stage: 'presign', reason: 'presign-null', objectKey })
        res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
        return
      }
      insurerNewsLog.info({
        event: 'presign',
        objectKey,
        contentType,
        sizeBytes,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
      })
      const putHeaders = {}
      if (cacheControl) {
        putHeaders['Cache-Control'] = cacheControl
      }
      res.json({ uploadUrl, objectKey, putHeaders })
    } catch (e89) {
      if (e89 && typeof e89 === 'object' && 'httpStatus' in e89 && typeof e89.httpStatus === 'number') {
        res.status(e89.httpStatus).json({ message: e89 instanceof Error ? e89.message : '요청을 처리할 수 없습니다.' })
        return
      }
      insurerNewsLog.error({
        event: 'upload-fail',
        stage: 'presign',
        reason: 'exception',
        message: e89 instanceof Error ? e89.message : String(e89),
      })
      handleDbError(e89, req, res)
    }
  })

  /**
   * 브라우저-R2 CORS 차단 시 서버 경유 업로드 fallback.
   * 클라이언트는 presign으로 받은 objectKey를 사용하고, 여기서 권한/경로를 다시 검증한다.
   */
  apiRouter.put('/insurer-news/attachments/upload-proxy', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const contentTypeRaw = String(req.query.contentType ?? req.headers['content-type'] ?? '').trim()
      const contentType = contentTypeRaw.split(';')[0].trim()
      if (!ALLOWED_UPLOAD_MIME.has(contentType)) {
        res.status(400).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      const objectKey = String(req.query.objectKey ?? req.headers['x-object-key'] ?? '').trim()
      if (!objectKey) {
        res.status(400).json({ message: 'objectKey가 필요합니다.' })
        return
      }
      const scope = await resolvePresignScope(req, {
        channel: String(req.query.channel ?? req.headers['x-upload-channel'] ?? '').trim(),
        insurerCode: String(req.query.insurerCode ?? req.headers['x-insurer-code'] ?? '').trim(),
      })
      if (!scope) {
        res.status(403).json({ message: '업로드 범위를 확인할 수 없습니다.' })
        return
      }
      if (!assertNewsObjectKeyScoped(objectKey, scope.gaIdPath, scope.storageCategory, scope.companySlug)) {
        res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
        return
      }
      const maxB = maxBytesForMime(contentType)
      const bodyBuffer = await readRawBodyBuffer(req, maxB)
      if (!bodyBuffer.length) {
        res.status(400).json({ message: '업로드 본문이 비어 있습니다.' })
        return
      }
      await consentPutInsurerAttachment(objectKey, bodyBuffer, contentType)
      insurerNewsLog.info({
        event: 'upload-complete',
        stage: 'upload-proxy',
        objectKey,
        byteSize: bodyBuffer.length,
        contentType,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
      })
      res.status(204).end()
    } catch (eProxy) {
      if (eProxy && typeof eProxy === 'object' && 'httpStatus' in eProxy && typeof eProxy.httpStatus === 'number') {
        res.status(eProxy.httpStatus).json({
          message: eProxy instanceof Error ? eProxy.message : '요청을 처리할 수 없습니다.',
        })
        return
      }
      insurerNewsLog.error({
        event: 'upload-fail',
        stage: 'upload-proxy',
        reason: 'exception',
        message: eProxy instanceof Error ? eProxy.message : String(eProxy),
      })
      handleDbError(eProxy, req, res)
    }
  })

  /**
   * 클라이언트가 R2 PUT 직후 호출 — 업로드 성공률·presign 대비 완료율·orphan 후보 추적용.
   * (DB 반영은 여전히 newsletter 저장 시점; 본 이벤트는 스토리지 단계 확정)
   */
  apiRouter.post('/insurer-news/attachments/upload-complete', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const objectKey = String(body.objectKey ?? '').trim()
      const byteSize = Number(body.byteSize ?? body.sizeBytes ?? 0)
      const contentType = String(body.contentType ?? '').trim()

      if (!objectKey) {
        insurerNewsLog.error({ event: 'upload-fail', stage: 'upload-complete', reason: 'missing-object-key' })
        res.status(400).json({ message: 'objectKey가 필요합니다.' })
        return
      }

      const scope = await resolvePresignScope(req)
      if (!scope) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'upload-complete',
          reason: 'no-scope',
          objectKey,
        })
        res.status(403).json({ message: '업로드 범위를 확인할 수 없습니다.' })
        return
      }
      if (!assertNewsObjectKeyScoped(objectKey, scope.gaIdPath, scope.storageCategory, scope.companySlug)) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'upload-complete',
          reason: 'key-out-of-scope',
          objectKey,
        })
        res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
        return
      }
      if (contentType && !ALLOWED_UPLOAD_MIME.has(contentType)) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'upload-complete',
          reason: 'mime-not-allowed',
          objectKey,
          contentType,
        })
        res.status(400).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      if (contentType && Number.isFinite(byteSize) && byteSize > 0) {
        const maxB = maxBytesForMime(contentType)
        if (byteSize > maxB) {
          insurerNewsLog.error({
            event: 'upload-fail',
            stage: 'upload-complete',
            reason: 'size-out-of-range',
            objectKey,
            byteSize,
            maxBytes: maxB,
          })
          res.status(400).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
          return
        }
      }

      insurerNewsLog.info({
        event: 'upload-complete',
        stage: 'r2-put',
        objectKey,
        byteSize: Number.isFinite(byteSize) && byteSize > 0 ? byteSize : undefined,
        contentType: contentType || undefined,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
      })
      res.status(204).end()
    } catch (eComplete) {
      if (eComplete && typeof eComplete === 'object' && 'httpStatus' in eComplete && typeof eComplete.httpStatus === 'number') {
        res.status(eComplete.httpStatus).json({
          message: eComplete instanceof Error ? eComplete.message : '요청을 처리할 수 없습니다.',
        })
        return
      }
      insurerNewsLog.error({
        event: 'upload-fail',
        stage: 'upload-complete',
        reason: 'exception',
        message: eComplete instanceof Error ? eComplete.message : String(eComplete),
      })
      handleDbError(eComplete, req, res)
    }
  })

  apiRouter.get('/insurer-news/manager/newsletters', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      /** @type {number} */
      let gaId
      /** @type {number | null} */
      let companyIdFilter = null
      /** @type {string | null} */
      let publisherIdFilter = null
      /** @type {string} */
      let gaCodeUpper
      const channel = resolveManagerChannel(req)

      if (isNewsManagerRole(req.user.role)) {
        const managerScope = await loadNewsManagerScopeByUser(req.user)
        if (!managerScope) {
          res.status(403).json({ message: '소식 목록을 불러올 수 없습니다.' })
          return
        }
        gaId = managerScope.gaId
        if (isLossAdjusterRole(req.user.role)) {
          publisherIdFilter = String(req.user.id)
        } else {
          companyIdFilter = managerScope.companyId
        }
        gaCodeUpper = managerScope.gaCodeRaw.toUpperCase()
      } else {
        const tenantGa = await resolveTenantGaIdForRequest(pool, req)
        if (tenantGa == null) {
          res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
          return
        }
        gaId = tenantGa
        const gaRow = await safeQuery(
          pool,
          `
          SELECT UPPER(TRIM(g.code)) AS c
          FROM ga_companies g
          WHERE g.id = $1
            AND g.id = (SELECT u.ga_id FROM users u WHERE u.id = $2 LIMIT 1)
          `,
          [tenantGa, String(req.user?.id ?? '')],
        )
        gaCodeUpper = gaRow.rowCount ? String(gaRow.rows[0].c ?? '') : ''
      }

      let q = `
        SELECT n.*, g.code AS ga_code_join,
          (SELECT COUNT(*) FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type <> 'application/pdf') AS img_cnt,
          (SELECT COUNT(*) FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type = 'application/pdf') AS pdf_cnt,
          (SELECT a.url FROM insurance_company_newsletter_attachments a
            WHERE a.newsletter_id = n.id AND a.mime_type <> 'application/pdf'
            ORDER BY a.sort_order ASC LIMIT 1) AS hero_url
        FROM insurance_company_newsletters n
        INNER JOIN ga_companies g ON g.id = n.ga_id
        WHERE n.ga_id = $1
          AND COALESCE(NULLIF(TRIM(n.payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $2
          AND COALESCE((n.payload->>'customerVisible')::boolean, false) = false
          AND COALESCE(NULLIF(TRIM(n.payload->>'insurerSlug'), ''), '') <> 'customer-news'
          AND UPPER(COALESCE(NULLIF(TRIM(n.payload->>'insurerCode'), ''), '')) <> 'CUSTOMER_NEWS'
      `
      const params = [gaId, channel]
      if (companyIdFilter != null) {
        q += ` AND n.company_id = $${params.length + 1}`
        params.push(companyIdFilter)
      }
      if (publisherIdFilter) {
        q += ` AND TRIM(COALESCE(n.payload->>'publisherId', '')) = $${params.length + 1}`
        params.push(publisherIdFilter)
      }
      q += ` ORDER BY n.created_at DESC`

      const nRes = await safeQuery(pool, q, params)
      const newsletters = nRes.rows.map((row) => mapNewsletterListRow(row, gaCodeUpper))
      res.json(newsletters)
    } catch (e90) {
      handleDbError(e90, req, res)
    }
  })

  apiRouter.get('/insurer-news/manager/newsletters/:newsletterId', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      const newsletterId = String(req.params.newsletterId ?? '')
      const channel = resolveManagerChannel(req)
      const gaIdForSelect = await resolveNewsletterSelectGaId(req)
      if (gaIdForSelect == null || !Number.isInteger(gaIdForSelect) || gaIdForSelect < 1) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const nRes = await safeQuery(
        pool,
        `
        SELECT *
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND COALESCE(NULLIF(TRIM(payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $3
          AND COALESCE((payload->>'customerVisible')::boolean, false) = false
          AND COALESCE(NULLIF(TRIM(payload->>'insurerSlug'), ''), '') <> 'customer-news'
          AND UPPER(COALESCE(NULLIF(TRIM(payload->>'insurerCode'), ''), '')) <> 'CUSTOMER_NEWS'
        `,
        [newsletterId, gaIdForSelect, channel],
      )
      if (nRes.rowCount === 0) {
        res.status(404).json({ message: '소식을 찾을 수 없습니다.' })
        return
      }
      await assertCanAccessNewsletterRow(nRes.rows[0], req, channel)
      const attRes = await safeQuery(pool, SQL_ATTACHMENTS_BY_NEWSLETTER_GA, [newsletterId, gaIdForSelect])
      res.json(mapNewsletterDetail(nRes.rows[0], attRes.rows))
    } catch (e91) {
      handleDbError(e91, req, res)
    }
  })

  apiRouter.post('/insurer-news/manager/newsletters', requireAuth, requireNewsletterWriter, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    try {
      const channel = resolveManagerChannel(req)
      const normalizedScope = await resolveNewsWriteScope(req, body, channel)
      const payload = buildPayloadFromBody(body, normalizedScope, channel)
      const attachmentScope = {
        ...normalizedScope,
        companySlug: String(payload.insurerSlug ?? normalizedScope.companySlug ?? '').trim() || normalizedScope.companySlug,
      }
      const title = ''
      const bodyText = String(body.bodyText ?? '')
      const statusRaw = String(body.status ?? 'DRAFT').toUpperCase()
      const status = statusRaw === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'

      const attIn = Array.isArray(body.attachments) ? body.attachments : []
      let rowsToInsert
      try {
        rowsToInsert = prepareAttachmentsForWrite(attIn, attachmentScope)
      } catch (prepErr) {
        if (prepErr && typeof prepErr === 'object' && 'httpStatus' in prepErr) {
          const st = Number(prepErr.httpStatus) || 400
          insurerNewsLog.error({
            event: 'attachment-prep-failed',
            op: 'newsletter-create',
            status: st,
            detail: prepErr instanceof Error ? prepErr.message : String(prepErr),
          })
          res
            .status(st)
            .json({
              message:
                prepErr instanceof Error ? prepErr.message : '요청을 처리할 수 없습니다.',
            })
          return
        }
        throw prepErr
      }

      const orphanKeys = collectAttachmentObjectKeys(rowsToInsert)

      const id = randomUUID()
      /** @type {Record<string, unknown> | null} */
      let insertedNewsletterRow = null
      try {
        await withTransaction(async (client) => {
          const insRes = await client.query(
            `
            INSERT INTO insurance_company_newsletters
              (id, ga_id, company_id, company_name_snapshot, title, status, body_text, payload, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS jsonb), NOW(), NOW())
            RETURNING *
            `,
            [
              id,
              normalizedScope.gaId,
              normalizedScope.companyId,
              normalizedScope.companyName,
              title,
              status,
              bodyText,
              JSON.stringify(payload),
            ],
          )
          insertedNewsletterRow = insRes.rows[0] ?? null
          if (!insertedNewsletterRow) {
            throw Object.assign(new Error('소식 저장에 실패했습니다.'), { httpStatus: 500 })
          }
          await insertAttachments(client, id, rowsToInsert)
        })
      } catch (err) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'db-commit',
          op: 'newsletter-create',
          newsletterId: id,
          objectKeys: orphanKeys,
          message: err instanceof Error ? err.message : String(err),
        })
        await rollbackUploadedOrphans(orphanKeys)
        throw err
      }

      insurerNewsLog.info({
        event: 'upload-success',
        stage: 'db-commit',
        op: 'newsletter-create',
        newsletterId: id,
        attachmentCount: rowsToInsert.length,
        objectKeys: orphanKeys,
      })

      const attRes = await safeQuery(pool, SQL_ATTACHMENTS_BY_NEWSLETTER_GA, [id, normalizedScope.gaId])
      res.status(201).json(mapNewsletterDetail(insertedNewsletterRow, attRes.rows))
    } catch (e92) {
      if (e92 && typeof e92 === 'object' && 'httpStatus' in e92 && typeof e92.httpStatus === 'number') {
        res.status(e92.httpStatus).json({ message: e92 instanceof Error ? e92.message : '요청을 처리할 수 없습니다.' })
        return
      }
      handleDbError(e92, req, res)
    }
  })

  apiRouter.patch('/insurer-news/manager/newsletters/:newsletterId', requireAuth, requireNewsletterWriter, async (req, res) => {
    const newsletterId = String(req.params.newsletterId ?? '')
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    try {
      const channel = resolveManagerChannel(req)
      const gaIdForSelect = await resolveNewsletterSelectGaId(req)
      if (gaIdForSelect == null || !Number.isInteger(gaIdForSelect) || gaIdForSelect < 1) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const nRes = await safeQuery(
        pool,
        `
        SELECT *
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND COALESCE(NULLIF(TRIM(payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $3
        `,
        [newsletterId, gaIdForSelect, channel],
      )
      if (nRes.rowCount === 0) {
        res.status(404).json({ message: '소식을 찾을 수 없습니다.' })
        return
      }
      await assertCanAccessNewsletterRow(nRes.rows[0], req, channel)

      const scope = await resolveNewsWriteScope(req, body, channel)
      const existingCompanyId =
        nRes.rows[0].company_id != null && nRes.rows[0].company_id !== ''
          ? Number(nRes.rows[0].company_id)
          : null
      if (scope.companyId != null && existingCompanyId != null && existingCompanyId !== scope.companyId) {
        res.status(400).json({ message: '소식의 보험사와 요청 정보가 일치하지 않습니다.' })
        return
      }
      const payload = buildPayloadFromBody(body, scope, channel)
      const attachmentScope = {
        ...scope,
        companySlug: String(payload.insurerSlug ?? scope.companySlug ?? '').trim() || scope.companySlug,
      }
      const title = ''
      const bodyText = String(body.bodyText ?? '')
      const statusRaw = String(body.status ?? 'DRAFT').toUpperCase()
      const status = statusRaw === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'

      const attIn = Array.isArray(body.attachments) ? body.attachments : []
      let rowsToInsert
      try {
        rowsToInsert = prepareAttachmentsForWrite(attIn, attachmentScope)
      } catch (prepErr) {
        if (prepErr && typeof prepErr === 'object' && 'httpStatus' in prepErr) {
          const st = Number(prepErr.httpStatus) || 400
          insurerNewsLog.error({
            event: 'attachment-prep-failed',
            op: 'newsletter-patch',
            newsletterId,
            status: st,
            detail: prepErr instanceof Error ? prepErr.message : String(prepErr),
          })
          res
            .status(st)
            .json({
              message:
                prepErr instanceof Error ? prepErr.message : '요청을 처리할 수 없습니다.',
            })
          return
        }
        throw prepErr
      }

      const orphanKeys = collectAttachmentObjectKeys(rowsToInsert)

      // TODO: diff 기반 첨부 업데이트로 개선 예정 (현재는 전체 삭제 후 재삽입)

      try {
        await withTransaction(async (client) => {
          await client.query(
            `
            UPDATE insurance_company_newsletters
            SET company_name_snapshot = $3, title = $4, status = $5, body_text = $6, payload = CAST($7 AS jsonb), updated_at = NOW()
            WHERE id = $1 AND ga_id = $2
            `,
            [newsletterId, scope.gaId, scope.companyName, title, status, bodyText, JSON.stringify(payload)],
          )
          await deleteAttachmentsForNewsletter(client, newsletterId, scope.gaId)
          await insertAttachments(client, newsletterId, rowsToInsert)
        })
      } catch (err) {
        insurerNewsLog.error({
          event: 'upload-fail',
          stage: 'db-commit',
          op: 'newsletter-patch',
          newsletterId,
          objectKeys: orphanKeys,
          message: err instanceof Error ? err.message : String(err),
        })
        await rollbackUploadedOrphans(orphanKeys)
        throw err
      }

      insurerNewsLog.info({
        event: 'upload-success',
        stage: 'db-commit',
        op: 'newsletter-patch',
        newsletterId,
        attachmentCount: rowsToInsert.length,
        objectKeys: orphanKeys,
      })

      const fresh = await safeQuery(
        pool,
        `
        SELECT *
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND COALESCE(NULLIF(TRIM(payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $3
        `,
        [newsletterId, scope.gaId, channel],
      )
      const attRes = await safeQuery(pool, SQL_ATTACHMENTS_BY_NEWSLETTER_GA, [newsletterId, scope.gaId])
      res.json(mapNewsletterDetail(fresh.rows[0], attRes.rows))
    } catch (e93) {
      if (e93 && typeof e93 === 'object' && 'httpStatus' in e93 && typeof e93.httpStatus === 'number') {
        res.status(e93.httpStatus).json({ message: e93 instanceof Error ? e93.message : '요청을 처리할 수 없습니다.' })
        return
      }
      handleDbError(e93, req, res)
    }
  })

  apiRouter.delete('/insurer-news/manager/newsletters/:newsletterId', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      const newsletterId = String(req.params.newsletterId ?? '').trim()
      const channel = resolveManagerChannel(req)
      if (!newsletterId) {
        res.status(400).json({ message: '잘못된 소식지 ID입니다.' })
        return
      }
      const gaId = await resolveTenantGaIdForRequest(pool, req)
      if (gaId == null || !Number.isInteger(gaId) || gaId < 1) {
        res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
        return
      }
      const nRes = await safeQuery(
        pool,
        `
        SELECT id, ga_id, company_id, payload
        FROM insurance_company_newsletters
        WHERE id = $1
          AND ga_id = $2
          AND COALESCE(NULLIF(TRIM(payload->>'newsChannel'), ''), '${NEWS_CHANNEL_INSURER}') = $3
        `,
        [newsletterId, gaId, channel],
      )
      if (nRes.rowCount === 0) {
        res.status(404).json({ message: '소식을 찾을 수 없습니다.' })
        return
      }
      await assertCanDeleteNewsletterRow(nRes.rows[0], req, channel)

      const attRes = await safeQuery(
        pool,
        `
        SELECT a.object_key
        FROM insurance_company_newsletter_attachments a
        INNER JOIN insurance_company_newsletters n ON n.id = a.newsletter_id AND n.ga_id = $2
        WHERE a.newsletter_id = $1
        `,
        [newsletterId, gaId],
      )

      if (isConsentR2Enabled()) {
        for (const row of attRes.rows) {
          const objectKey = String(row.object_key ?? '').trim()
          if (!objectKey) {
            continue
          }
          try {
            await r2DeleteObject(objectKey)
          } catch (errDel) {
            insurerNewsLog.error({
              event: 'newsletter-delete-r2-fail',
              newsletterId,
              objectKey,
              err: errDel instanceof Error ? errDel.message : String(errDel),
            })
            res.status(502).json({ message: '스토리지에서 첨부 파일을 삭제하지 못했습니다.' })
            return
          }
        }
      }

      await withTransaction(async (client) => {
        await deleteAttachmentsForNewsletter(client, newsletterId, gaId)
        await client.query(`DELETE FROM insurance_company_newsletters WHERE id = $1 AND ga_id = $2`, [
          newsletterId,
          gaId,
        ])
      })

      insurerNewsLog.info({
        event: 'newsletter-delete',
        newsletterId,
        actorUserId: req.user?.id ?? null,
        actorRole: req.user?.role ?? null,
      })
      res.json({ ok: true })
    } catch (e94) {
      if (e94 && typeof e94 === 'object' && 'httpStatus' in e94 && typeof e94.httpStatus === 'number') {
        res.status(e94.httpStatus).json({ message: e94 instanceof Error ? e94.message : '요청을 처리할 수 없습니다.' })
        return
      }
      handleDbError(e94, req, res)
    }
  })

  apiRouter.delete('/insurer-news/attachments/:attachmentId', requireAuth, requireNewsletterWriter, async (req, res) => {
    try {
      const attachmentId = String(req.params.attachmentId ?? '')
      const row = await safeQuery(
        pool,
        `
        SELECT a.id, a.object_key, a.newsletter_id, n.ga_id, n.company_id, n.payload
        FROM insurance_company_newsletter_attachments a
        INNER JOIN insurance_company_newsletters n ON n.id = a.newsletter_id
        WHERE a.id = $1
        `,
        [attachmentId],
      )
      if (row.rowCount === 0) {
        res.status(404).json({ message: '첨부를 찾을 수 없습니다.' })
        return
      }
      await assertCanAccessNewsletterRow(
        { ga_id: row.rows[0].ga_id, company_id: row.rows[0].company_id, payload: row.rows[0].payload },
        req,
      )

      const objectKey = String(row.rows[0].object_key ?? '')
      if (isConsentR2Enabled() && objectKey) {
        try {
          await r2DeleteObject(objectKey)
        } catch (errDel) {
          insurerNewsLog.error({
            event: 'attachment-delete-r2-fail',
            objectKey,
            err: errDel instanceof Error ? errDel.message : String(errDel),
          })
          res.status(502).json({ message: '스토리지에서 파일을 삭제하지 못했습니다.' })
          return
        }
      }

      await safeQuery(pool, `DELETE FROM insurance_company_newsletter_attachments WHERE id = $1`, [attachmentId])
      res.status(204).end()
    } catch (e95) {
      handleDbError(e95, req, res)
    }
  })
}
