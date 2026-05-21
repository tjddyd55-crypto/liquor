import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { parseGaId } from '../lib/parseGaId.js'
import { isSuperAdminRole, normalizeRbacRole } from '../lib/rbacScope.js'
import { normalizeKrMobile, validateKrMobileDigits } from '../lib/phoneNormalize.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'
import { getContractOtpPepper, isRunningInProduction } from '../lib/contractOtpConfig.js'
import { encryptContractTargetPhoneDigits } from '../lib/contractStoredPhone.js'
import {
  assertSenderFieldValuesFilled,
  insertSenderPrefillDocumentValues,
  senderValuesByContractTemplates,
} from '../services/contractSenderPrefill.js'
import {
  assertContractFieldSettingsValidForActivate,
  insertFixedPrefillDocumentValues,
  normalizeContractFieldInputRole,
  seedContractTemplateFieldSettings,
  effectiveContractFieldRole,
} from '../services/contractTemplateFieldSettings.js'
import {
  insertConfirmationItemsForSendSession,
  listConfirmationItemsWithValues,
  parseConfirmationItemsFromBody,
} from '../services/contractConfirmationItems.js'
import { listFields } from '../pdf-engine/repository/pdfTemplateRepo.js'

const CT_PREFIX = 'ct_'
const CTF_PREFIX = 'ctf_'
const CTCF_PREFIX = 'ctcf_'
const PKG_PREFIX = 'pkg_'
const CSS_PREFIX = 'css_'
const CDI_PREFIX = 'cdi_'

const ALLOWED_TEMPLATE_STATUS = new Set(['draft', 'active', 'archived'])
const TERMINAL_SESSION = new Set(['expired', 'cancelled', 'completed'])
const ALLOWED_CONFIRMATION_FIELD_INPUT_TYPES = new Set(['text', 'textarea', 'number', 'date'])
const ALLOWED_CONFIRMATION_FIELD_INPUT_ROLES = new Set(['sender', 'customer'])

/**
 * @param {unknown} row
 * @returns {{ error: string, status: number } | null}
 */
export function assertConfirmationOnlyTemplateRow(row) {
  const mode = String(row?.template_mode ?? 'coordinate_pdf')
  if (mode !== 'confirmation_only') {
    return {
      error: '무좌표 확인서(confirmation_only) 템플릿에서만 확인 항목을 관리할 수 있습니다.',
      status: 409,
    }
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {string | { error: string }}
 */
function normalizeConfirmationFieldKeyFromClient(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { error: 'fieldKey가 비어 있습니다.' }
  }
  const s = String(raw).trim()
  if (!s) {
    return { error: 'fieldKey가 비어 있습니다.' }
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,127}$/.test(s)) {
    return { error: 'fieldKey는 영문자로 시작하고 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.' }
  }
  return s
}

/** @returns {string} */
function deriveFieldKeyFromLabel(label) {
  const ascii = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  let key = ascii || 'field'
  if (/^[0-9]/.test(key)) {
    key = `f_${key}`
  }
  if (key.length > 120) {
    key = key.slice(0, 120)
  }
  if (!/^[a-zA-Z]/.test(key)) {
    key = `f_${key.replace(/^[^a-zA-Z]+/, '') || 'field'}`
  }
  return key.slice(0, 128)
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} templateId
 * @param {string} baseKey
 */
async function allocateUniqueConfirmationFieldKey(client, templateId, baseKey) {
  let k = baseKey
  for (let n = 0; n < 200; n += 1) {
    const ck = await client.query(
      `SELECT 1 FROM contract_template_confirmation_fields WHERE template_id = $1 AND field_key = $2 LIMIT 1`,
      [templateId, k],
    )
    if (ck.rowCount === 0) {
      return k
    }
    k = `${baseKey}_${n + 2}`
    if (k.length > 128) {
      k = k.slice(0, 128)
    }
  }
  return null
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} templateId
 */
async function nextConfirmationFieldSortOrder(client, templateId) {
  const r = await client.query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM contract_template_confirmation_fields WHERE template_id = $1`,
    [templateId],
  )
  return Number(r.rows[0]?.m ?? -1) + 1
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapConfirmationFieldRow(row) {
  const inputRoleRaw = row.input_role
  const inputRole =
    inputRoleRaw != null && ALLOWED_CONFIRMATION_FIELD_INPUT_ROLES.has(String(inputRoleRaw).trim())
      ? String(inputRoleRaw).trim()
      : 'sender'
  return {
    id: row.id,
    fieldKey: row.field_key,
    label: row.label,
    inputType: row.input_type,
    inputRole,
    required: Boolean(row.required),
    sortOrder: Number(row.sort_order ?? 0),
    placeholder: row.placeholder ?? null,
    helpText: row.help_text ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * @param {unknown} raw
 */
function normalizeConfirmationRequired(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
    return true
  }
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
    return false
  }
  return false
}

/**
 * @param {unknown} raw
 */
function parseConfirmationSortOrder(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return null
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { error: 'sortOrder는 정수여야 합니다.' }
  }
  return n
}

function newId(prefix) {
  return `${prefix}${randomUUID()}`
}

function hashPhoneDigits(digits) {
  const pepper = getContractOtpPepper()
  return createHash('sha256').update(`${digits}|${pepper}`, 'utf8').digest('hex')
}

export function getAuthUserId(req) {
  return String(req.user?.id ?? '').trim()
}

async function resolveEffectiveGaId(pool, req) {
  const role = normalizeRbacRole(req.user?.role)
  const userGa = parseGaId(req.user?.gaId)
  if (isSuperAdminRole(role)) {
    const qGa = parseGaId(
      req.query?.tenant_ga_id ?? req.query?.ga_id ?? req.body?.tenant_ga_id ?? req.body?.ga_id,
    )
    if (qGa != null) {
      const r = await pool.query(
        `SELECT 1 FROM ga_companies WHERE id = $1 AND is_deleted = false LIMIT 1`,
        [qGa],
      )
      if (r.rowCount > 0) {
        return qGa
      }
    }
    return userGa
  }
  return userGa
}

export async function assertCustomerForSend(client, customerId, req) {
  const role = normalizeRbacRole(req.user?.role)
  const userGa = parseGaId(req.user?.gaId)
  const uid = getAuthUserId(req)
  const params = [customerId]
  let sql = `
    SELECT id, phone, ga_id, user_id
    FROM customers
    WHERE id = $1 AND deleted_at IS NULL
  `
  if (!isSuperAdminRole(role)) {
    if (userGa == null) {
      return { error: 'GA 컨텍스트가 없습니다.', status: 400 }
    }
    params.push(userGa)
    sql += ` AND ga_id = $2`
    if (role === 'USER') {
      params.push(uid)
      sql += ` AND user_id = $3`
    }
  }
  const r = await client.query(sql, params)
  if (r.rowCount === 0) {
    return { error: '고객을 찾을 수 없습니다.', status: 404 }
  }
  const row = r.rows[0]
  const digits = normalizeKrMobile(row.phone)
  const v = validateKrMobileDigits(digits)
  if (v) {
    return { error: '고객 휴대폰 번호가 없거나 형식이 올바르지 않습니다.', status: 400 }
  }
  return { row, digits }
}

async function loadPdfTemplateRow(client, pdfTemplateId) {
  const id = Number(pdfTemplateId)
  if (!Number.isInteger(id) || id < 1) {
    return null
  }
  const r = await client.query(
    `
    SELECT id, title, storage_key, page_count, is_active, ga_id
    FROM pdf_templates
    WHERE id = $1
    LIMIT 1
    `,
    [id],
  )
  return r.rows[0] ?? null
}

function pdfTemplateGaOk(pdfRow, effectiveGaId) {
  if (pdfRow.ga_id == null) {
    return true
  }
  if (effectiveGaId == null) {
    return false
  }
  return Number(pdfRow.ga_id) === Number(effectiveGaId)
}

async function countPdfEngineFields(client, pdfTemplateId) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM pdf_template_fields WHERE template_id = $1`,
    [pdfTemplateId],
  )
  return Number(r.rows[0]?.c ?? 0)
}

export async function assertContractTemplateAccess(client, templateId, effectiveGaId, isSuper) {
  const r = await client.query(
    `SELECT * FROM contract_templates WHERE id = $1 LIMIT 1`,
    [templateId],
  )
  const row = r.rows[0]
  if (!row) {
    return { error: '템플릿을 찾을 수 없습니다.', status: 404 }
  }
  if (!isSuper) {
    if (row.ga_id == null) {
      return { error: '템플릿에 접근할 수 없습니다.', status: 403 }
    }
    if (effectiveGaId == null) {
      return { error: 'GA 컨텍스트가 없습니다.', status: 400 }
    }
    if (Number(row.ga_id) !== Number(effectiveGaId)) {
      return { error: '템플릿에 접근할 수 없습니다.', status: 403 }
    }
  }
  return { row }
}

async function assertPackageAccess(client, packageId, effectiveGaId, isSuper) {
  const r = await client.query(`SELECT * FROM contract_packages WHERE id = $1 LIMIT 1`, [packageId])
  const row = r.rows[0]
  if (!row) {
    return { error: '패키지를 찾을 수 없습니다.', status: 404 }
  }
  if (!isSuper) {
    if (row.ga_id == null) {
      return { error: '패키지에 접근할 수 없습니다.', status: 403 }
    }
    if (effectiveGaId == null) {
      return { error: 'GA 컨텍스트가 없습니다.', status: 400 }
    }
    if (Number(row.ga_id) !== Number(effectiveGaId)) {
      return { error: '패키지에 접근할 수 없습니다.', status: 403 }
    }
  }
  return { row }
}

export function buildTargetPhoneSnapshot(digits) {
  let encrypted = null
  try {
    encrypted = encryptContractTargetPhoneDigits(digits)
  } catch (e) {
    if (isRunningInProduction()) {
      throw e
    }
    encrypted = null
  }
  if (isRunningInProduction() && !encrypted) {
    throw new Error('[contract phone] CONTRACT_TARGET_PHONE_ENCRYPTION_KEY is not set')
  }
  return {
    target_phone_encrypted: encrypted,
    target_phone_hash: hashPhoneDigits(digits),
    target_phone_masked: maskKrMobileForDisplay(digits),
  }
}

export async function generateUniqueLinkCode(client) {
  for (let i = 0; i < 8; i += 1) {
    const code = randomBytes(32).toString('base64url')
    const ck = await client.query(
      `SELECT 1 FROM contract_send_sessions WHERE link_code = $1 LIMIT 1`,
      [code],
    )
    if (ck.rowCount === 0) {
      return code
    }
  }
  throw new Error('link_code_collision')
}

export function parseTemplateIdsArray(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'templateIds가 필요합니다.' }
  }
  const out = []
  const seen = new Set()
  for (const x of raw) {
    const id = typeof x === 'string' ? x.trim() : String(x ?? '').trim()
    if (!id.startsWith(CT_PREFIX) || id.length < CT_PREFIX.length + 4) {
      return { error: 'templateIds는 계약 템플릿 id 문자열 배열이어야 합니다.' }
    }
    if (seen.has(id)) {
      return { error: 'templateIds에 중복이 있습니다.' }
    }
    seen.add(id)
    out.push(id)
  }
  return { ids: out }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{
 *   pool: import('pg').Pool,
 *   requireAuth: import('express').RequestHandler,
 *   forbidInsurerManagerApi: import('express').RequestHandler,
 *   requireContractAdminConsole: import('express').RequestHandler,
 *   handleDbError: (e: unknown, req: import('express').Request, res: import('express').Response) => void,
 * }} ctx
 */
export function registerContractAdminApi(apiRouter, ctx) {
  const { pool, requireAuth, forbidInsurerManagerApi, requireContractAdminConsole, handleDbError } = ctx

  const chain = [requireAuth, forbidInsurerManagerApi, requireContractAdminConsole]

  apiRouter.get('/admin/contracts/templates', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const status = String(req.query?.status ?? '').trim()
      const category = String(req.query?.category ?? '').trim()
      const params = /** @type {unknown[]} */ ([])
      let where = 'WHERE 1=1'
      if (!(isSuper && effectiveGa == null)) {
        if (effectiveGa == null) {
          res.status(400).json({ ok: false, message: 'GA 컨텍스트가 없습니다.' })
          return
        }
        params.push(effectiveGa)
        where += ` AND t.ga_id = $${params.length}`
      }
      if (status && ALLOWED_TEMPLATE_STATUS.has(status)) {
        params.push(status)
        where += ` AND t.status = $${params.length}`
      }
      if (category) {
        params.push(category)
        where += ` AND t.category = $${params.length}`
      }
      const r = await pool.query(
        `
        SELECT
          t.*,
          p.title AS pdf_engine_title,
          p.storage_key AS pdf_engine_storage_key,
          COALESCE(di.document_instance_count, 0)::int AS document_instance_count,
          COALESCE(pi.package_item_count, 0)::int AS package_item_count
        FROM contract_templates t
        LEFT JOIN pdf_templates p ON p.id = t.pdf_template_id
        LEFT JOIN (
          SELECT template_id, COUNT(*)::int AS document_instance_count
          FROM contract_document_instances
          GROUP BY template_id
        ) di ON di.template_id = t.id
        LEFT JOIN (
          SELECT template_id, COUNT(*)::int AS package_item_count
          FROM contract_package_items
          GROUP BY template_id
        ) pi ON pi.template_id = t.id
        ${where}
        ORDER BY t.updated_at DESC
        LIMIT 500
        `,
        params,
      )
      res.json({
        ok: true,
        templates: r.rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          category: row.category,
          status: row.status,
          version: row.version,
          templateMode: row.template_mode ?? 'coordinate_pdf',
          pdfTemplateId: row.pdf_template_id,
          pdfEngineTitle: row.pdf_engine_title,
          pageCount: row.page_count,
          gaId: row.ga_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          documentInstanceCount: Number(row.document_instance_count ?? 0),
          packageItemCount: Number(row.package_item_count ?? 0),
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/contracts/templates/:id', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const { row, error, status } = await assertContractTemplateAccess(
        pool,
        req.params.id,
        effectiveGa,
        isSuper,
      )
      if (error) {
        res.status(status ?? 400).json({ ok: false, message: error })
        return
      }
      const fieldsR = await pool.query(
        `SELECT COUNT(*)::int AS c FROM contract_template_fields WHERE template_id = $1`,
        [row.id],
      )
      const pdfR = row.pdf_template_id
        ? await pool.query(
            `SELECT id, title, storage_key, page_count, is_active FROM pdf_templates WHERE id = $1 LIMIT 1`,
            [row.pdf_template_id],
          )
        : { rows: [] }
      const pr = pdfR.rows[0]
      /** @type {Array<{ fieldKey: string, label: string, fieldType: string, required: boolean, placementCount: number, inputRole: string, fixedValue: string | null }>} */
      let fieldInputSettings = []
      if (row.pdf_template_id != null) {
        const pdfFields = await listFields(pool, Number(row.pdf_template_id))
        const stR = await pool.query(
          `SELECT field_key, input_role, fixed_value FROM contract_template_field_settings WHERE template_id = $1`,
          [row.id],
        )
        const sm = new Map()
        for (const s of stR.rows) {
          sm.set(String(s.field_key), { inputRole: s.input_role, fixedValue: s.fixed_value })
        }
        for (const pf of pdfFields) {
          const fk = String(pf.field_key)
          const st = sm.get(fk)
          const role = effectiveContractFieldRole(pf, st)
          const placements = Array.isArray(pf.placements) ? pf.placements : []
          fieldInputSettings.push({
            fieldKey: fk,
            label: String(pf.label ?? ''),
            fieldType: String(pf.field_type ?? ''),
            required: Boolean(pf.required),
            placementCount: placements.length,
            inputRole: role,
            fixedValue: role === 'fixed' ? (st?.fixedValue != null ? String(st.fixedValue) : '') : null,
          })
        }
      }
      res.json({
        ok: true,
        template: {
          id: row.id,
          title: row.title,
          description: row.description,
          category: row.category,
          status: row.status,
          version: row.version,
          templateMode: row.template_mode ?? 'coordinate_pdf',
          pdfTemplateId: row.pdf_template_id,
          pdfFileId: row.pdf_file_id,
          pdfFilePath: row.pdf_file_path,
          pdfHash: row.pdf_hash,
          pageCount: row.page_count,
          gaId: row.ga_id,
          contractTemplateFieldsCount: fieldsR.rows[0]?.c ?? 0,
          fieldInputSettings,
          pdfEngine: pr
            ? {
                id: pr.id,
                title: pr.title,
                storageKey: pr.storage_key,
                pageCount: pr.page_count,
                isActive: pr.is_active,
              }
            : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/admin/contracts/templates', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      if (effectiveGa == null) {
        res.status(400).json({ ok: false, message: 'GA가 필요합니다. tenant_ga_id(슈퍼관리자) 또는 소속 GA를 확인하세요.' })
        return
      }
      const title = String(req.body?.title ?? '').trim()
      if (!title) {
        res.status(400).json({ ok: false, message: 'title은 필수입니다.' })
        return
      }
      const pdfTemplateIdRaw = req.body?.pdfTemplateId ?? req.body?.pdf_template_id
      const pdfTemplateId =
        pdfTemplateIdRaw === undefined || pdfTemplateIdRaw === null || pdfTemplateIdRaw === ''
          ? null
          : Number(pdfTemplateIdRaw)
      if (pdfTemplateId != null && (!Number.isInteger(pdfTemplateId) || pdfTemplateId < 1)) {
        res.status(400).json({ ok: false, message: 'pdfTemplateId가 올바르지 않습니다.' })
        return
      }
      let pdfRow = null
      if (pdfTemplateId != null) {
        pdfRow = await loadPdfTemplateRow(client, pdfTemplateId)
        if (!pdfRow) {
          res.status(400).json({ ok: false, message: 'pdfTemplateId에 해당하는 PDF 템플릿이 없습니다.' })
          return
        }
        if (!pdfRow.is_active) {
          res.status(400).json({ ok: false, message: '비활성 PDF 템플릿은 연결할 수 없습니다.' })
          return
        }
        if (!pdfTemplateGaOk(pdfRow, effectiveGa)) {
          res.status(403).json({ ok: false, message: '해당 GA에서 사용할 수 없는 PDF 템플릿입니다.' })
          return
        }
      }
      const statusRaw = String(req.body?.status ?? 'draft').trim() || 'draft'
      if (!ALLOWED_TEMPLATE_STATUS.has(statusRaw)) {
        res.status(400).json({ ok: false, message: 'status 값이 올바르지 않습니다.' })
        return
      }
      const id = newId(CT_PREFIX)
      const uid = getAuthUserId(req)
      const description = req.body?.description != null ? String(req.body.description) : null
      const category = req.body?.category != null ? String(req.body.category).trim() : null
      const templateModeRaw = req.body?.templateMode ?? req.body?.template_mode ?? 'coordinate_pdf'
      const templateMode = String(templateModeRaw).trim()
      if (templateMode !== 'coordinate_pdf' && templateMode !== 'confirmation_only') {
        res.status(400).json({ ok: false, message: 'templateMode 값이 올바르지 않습니다.' })
        return
      }
      if (templateMode === 'confirmation_only' && pdfTemplateId != null) {
        res
          .status(400)
          .json({ ok: false, message: '무좌표 확인서 템플릿(confirmation_only)에는 PDF 템플릿을 연결할 수 없습니다.' })
        return
      }

      await client.query(
        `
        INSERT INTO contract_templates (
          id, title, description, category, pdf_template_id, pdf_file_path, page_count,
          template_mode, status, version, created_by_user_id, ga_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, NOW(), NOW())
        `,
        [
          id,
          title,
          description,
          category,
          pdfTemplateId,
          pdfRow ? String(pdfRow.storage_key) : null,
          pdfRow ? pdfRow.page_count : null,
          templateMode,
          statusRaw,
          uid || null,
          effectiveGa,
        ],
      )
      if (pdfTemplateId != null && Number.isInteger(pdfTemplateId)) {
        await seedContractTemplateFieldSettings(client, id, pdfTemplateId)
      }
      res.status(201).json({ ok: true, success: true, data: { id } })
    } catch (e) {
      if (e instanceof Error && e.message.includes('CONTRACT_OTP_PEPPER')) {
        res.status(500).json({ ok: false, message: '서버 설정 오류(CONTRACT_OTP_PEPPER)입니다.' })
        return
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.patch('/admin/contracts/templates/:id', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const sets = /** @type {string[]} */ ([])
      const params = /** @type {unknown[]} */ ([])
      /** @type {number | null | 'clear'} */
      let pdfSettingsResync = null

      if (req.body?.title != null) {
        const t = String(req.body.title).trim()
        if (!t) {
          res.status(400).json({ ok: false, message: 'title이 비어 있습니다.' })
          return
        }
        params.push(t)
        sets.push(`title = $${params.length}`)
      }
      if (req.body?.description !== undefined) {
        params.push(req.body.description == null ? null : String(req.body.description))
        sets.push(`description = $${params.length}`)
      }
      if (req.body?.category !== undefined) {
        params.push(req.body.category == null ? null : String(req.body.category).trim())
        sets.push(`category = $${params.length}`)
      }
      if (req.body?.pdfTemplateId !== undefined || req.body?.pdf_template_id !== undefined) {
        const raw = req.body?.pdfTemplateId ?? req.body?.pdf_template_id
        if (raw === null || raw === '') {
          pdfSettingsResync = 'clear'
          params.push(null)
          const i1 = params.length
          sets.push(`pdf_template_id = $${i1}`)
          params.push(null)
          const i2 = params.length
          sets.push(`pdf_file_path = $${i2}`)
          params.push(null)
          const i3 = params.length
          sets.push(`page_count = $${i3}`)
        } else {
          const pid = Number(raw)
          if (!Number.isInteger(pid) || pid < 1) {
            res.status(400).json({ ok: false, message: 'pdfTemplateId가 올바르지 않습니다.' })
            return
          }
          const pdfRow = await loadPdfTemplateRow(client, pid)
          if (!pdfRow) {
            res.status(400).json({ ok: false, message: 'pdfTemplateId에 해당하는 PDF 템플릿이 없습니다.' })
            return
          }
          if (!pdfRow.is_active) {
            res.status(400).json({ ok: false, message: '비활성 PDF 템플릿은 연결할 수 없습니다.' })
            return
          }
          if (!pdfTemplateGaOk(pdfRow, row.ga_id != null ? Number(row.ga_id) : effectiveGa)) {
            res.status(403).json({ ok: false, message: '해당 GA에서 사용할 수 없는 PDF 템플릿입니다.' })
            return
          }
          params.push(pid)
          sets.push(`pdf_template_id = $${params.length}`)
          params.push(String(pdfRow.storage_key))
          sets.push(`pdf_file_path = $${params.length}`)
          params.push(pdfRow.page_count)
          sets.push(`page_count = $${params.length}`)
          pdfSettingsResync = pid
        }
      }
      if (sets.length === 0) {
        res.status(400).json({ ok: false, message: '변경할 필드가 없습니다.' })
        return
      }
      params.push(row.id)
      await client.query(
        `UPDATE contract_templates SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params,
      )
      if (pdfSettingsResync === 'clear') {
        await client.query(`DELETE FROM contract_template_field_settings WHERE template_id = $1`, [row.id])
      } else if (pdfSettingsResync != null && typeof pdfSettingsResync === 'number') {
        await client.query(`DELETE FROM contract_template_field_settings WHERE template_id = $1`, [row.id])
        await seedContractTemplateFieldSettings(client, row.id, pdfSettingsResync)
      }
      res.json({ ok: true, success: true })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.patch('/admin/contracts/templates/:id/status', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const status = String(req.body?.status ?? '').trim()
      if (!ALLOWED_TEMPLATE_STATUS.has(status)) {
        res.status(400).json({ ok: false, message: 'status 값이 올바르지 않습니다.' })
        return
      }
      if (status === 'active') {
        const mode = String(row.template_mode ?? 'coordinate_pdf')
        if (mode === 'confirmation_only') {
          const cntR = await client.query(
            `SELECT COUNT(*)::int AS c FROM contract_template_confirmation_fields WHERE template_id = $1`,
            [row.id],
          )
          if (Number(cntR.rows[0]?.c ?? 0) < 1) {
            res.status(400).json({
              ok: false,
              message: '확인서 항목을 1개 이상 등록한 뒤 active로 전환할 수 있습니다.',
            })
            return
          }
        } else {
          const pid = row.pdf_template_id
          if (pid == null) {
            res.status(400).json({ ok: false, message: 'active 전환에는 pdfTemplateId 연결이 필요합니다.' })
            return
          }
          const fc = await countPdfEngineFields(client, pid)
          if (fc < 1) {
            res.status(400).json({ ok: false, message: 'PDF 템플릿에 좌표 필드가 없어 active로 전환할 수 없습니다.' })
            return
          }
          const settingsOk = await assertContractFieldSettingsValidForActivate(client, row.id, Number(pid))
          if (!settingsOk.ok) {
            res.status(400).json({ ok: false, message: settingsOk.message ?? '필드 입력 방식 설정을 확인해 주세요.' })
            return
          }
        }
      }
      await client.query(`UPDATE contract_templates SET status = $2, updated_at = NOW() WHERE id = $1`, [
        row.id,
        status,
      ])
      res.json({ ok: true, success: true })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.post('/admin/contracts/templates/:id/duplicate', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        await client.query('ROLLBACK')
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const src = acc.row
      const newTid = newId(CT_PREFIX)
      const uid = getAuthUserId(req)
      const baseTitle = String(src.title ?? '').trim() || '계약서 템플릿'
      const copyTitle = `${baseTitle} (복사)`
      await client.query(
        `
        INSERT INTO contract_templates (
          id, title, description, category, pdf_file_id, pdf_file_path, pdf_hash, page_count,
          pdf_template_id, template_mode, status, version, created_by_user_id, ga_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', 1, $11, $12, NOW(), NOW())
        `,
        [
          newTid,
          copyTitle,
          src.description,
          src.category,
          src.pdf_file_id ?? null,
          src.pdf_file_path ?? null,
          src.pdf_hash ?? null,
          src.page_count ?? null,
          src.pdf_template_id ?? null,
          src.template_mode != null && String(src.template_mode).trim() !== ''
            ? String(src.template_mode).trim()
            : 'coordinate_pdf',
          uid || null,
          src.ga_id ?? null,
        ],
      )
      const fieldsR = await client.query(`SELECT * FROM contract_template_fields WHERE template_id = $1`, [
        src.id,
      ])
      for (const f of fieldsR.rows) {
        const nf = newId(CTF_PREFIX)
        await client.query(
          `
          INSERT INTO contract_template_fields (
            id, template_id, field_key, field_label, field_type, page_no, x, y, width, height, font_size,
            required, default_value, data_binding_key, sort_order, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
          `,
          [
            nf,
            newTid,
            f.field_key,
            f.field_label,
            f.field_type,
            f.page_no,
            f.x,
            f.y,
            f.width ?? null,
            f.height ?? null,
            f.font_size ?? null,
            f.required,
            f.default_value ?? null,
            f.data_binding_key ?? null,
            f.sort_order ?? 0,
          ],
        )
      }
      const settingsDup = await client.query(
        `SELECT field_key, input_role, fixed_value FROM contract_template_field_settings WHERE template_id = $1`,
        [src.id],
      )
      for (const s of settingsDup.rows) {
        await client.query(
          `
          INSERT INTO contract_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          `,
          [newTid, String(s.field_key), String(s.input_role), s.fixed_value],
        )
      }
      if (settingsDup.rowCount === 0 && src.pdf_template_id != null) {
        await seedContractTemplateFieldSettings(client, newTid, Number(src.pdf_template_id))
      }
      const confDup = await client.query(
        `
        SELECT field_key, label, input_type, required, sort_order, placeholder, help_text
        FROM contract_template_confirmation_fields
        WHERE template_id = $1
        ORDER BY sort_order, field_key
        `,
        [src.id],
      )
      for (const cf of confDup.rows) {
        const ncf = newId(CTCF_PREFIX)
        await client.query(
          `
          INSERT INTO contract_template_confirmation_fields (
            id, template_id, field_key, label, input_type, required, sort_order, placeholder, help_text,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          `,
          [
            ncf,
            newTid,
            String(cf.field_key),
            String(cf.label),
            String(cf.input_type),
            Boolean(cf.required),
            Number(cf.sort_order ?? 0),
            cf.placeholder ?? null,
            cf.help_text ?? null,
          ],
        )
      }
      await client.query('COMMIT')
      res.status(201).json({ ok: true, success: true, data: { id: newTid } })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* noop */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.patch('/admin/contracts/templates/:id/field-input-settings', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const pdfPid = row.pdf_template_id
      if (pdfPid == null) {
        res.status(400).json({ ok: false, message: '연결된 PDF 템플릿이 없습니다.' })
        return
      }
      const items = req.body?.fieldSettings ?? req.body?.field_settings
      if (!Array.isArray(items)) {
        res.status(400).json({ ok: false, message: 'fieldSettings 배열이 필요합니다.' })
        return
      }
      const pdfFields = await listFields(client, Number(pdfPid))
      const keySet = new Map(pdfFields.map((f) => [String(f.field_key), f]))
      await client.query('BEGIN')
      for (const it of items) {
        const fk = String(it?.fieldKey ?? it?.field_key ?? '').trim()
        const pf = keySet.get(fk)
        if (!pf) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: `알 수 없는 fieldKey: ${fk}` })
          return
        }
        let role = normalizeContractFieldInputRole(it?.inputRole ?? it?.input_role)
        const ft = String(pf.field_type ?? '')
        if (ft === 'signature') {
          role = 'customer'
        }
        if (role !== 'customer' && role !== 'sender' && role !== 'fixed') {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'inputRole 값이 올바르지 않습니다.' })
          return
        }
        let fixedValue = null
        if (role === 'fixed') {
          const rawFv = it?.fixedValue ?? it?.fixed_value
          fixedValue = rawFv == null ? '' : String(rawFv)
          if (fixedValue.trim() === '') {
            await client.query('ROLLBACK')
            res.status(400).json({
              ok: false,
              message: `고정 출력 필드「${pf.label ?? fk}」에는 고정 출력값이 필요합니다.`,
            })
            return
          }
        }
        await client.query(
          `
          INSERT INTO contract_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (template_id, field_key) DO UPDATE SET
            input_role = EXCLUDED.input_role,
            fixed_value = EXCLUDED.fixed_value,
            updated_at = NOW()
          `,
          [row.id, fk, role, fixedValue],
        )
      }
      await client.query('COMMIT')
      res.json({ ok: true, success: true })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* noop */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/admin/contracts/templates/:id/confirmation-fields', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const { row, error, status } = await assertContractTemplateAccess(
        pool,
        req.params.id,
        effectiveGa,
        isSuper,
      )
      if (error) {
        res.status(status ?? 400).json({ ok: false, message: error })
        return
      }
      const modeErr = assertConfirmationOnlyTemplateRow(row)
      if (modeErr) {
        res.status(modeErr.status).json({ ok: false, message: modeErr.error })
        return
      }
      const r = await pool.query(
        `
        SELECT *
        FROM contract_template_confirmation_fields
        WHERE template_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [row.id],
      )
      res.json({ ok: true, fields: r.rows.map((f) => mapConfirmationFieldRow(f)) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/admin/contracts/templates/:id/confirmation-fields', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const tpl = acc.row
      const modeErr = assertConfirmationOnlyTemplateRow(tpl)
      if (modeErr) {
        res.status(modeErr.status).json({ ok: false, message: modeErr.error })
        return
      }
      const label = String(req.body?.label ?? '').trim()
      if (!label) {
        res.status(400).json({ ok: false, message: 'label은 필수입니다.' })
        return
      }
      const inputTypeRaw = req.body?.inputType ?? req.body?.input_type
      const inputType =
        inputTypeRaw === undefined || inputTypeRaw === null || inputTypeRaw === ''
          ? 'text'
          : String(inputTypeRaw).trim()
      if (!ALLOWED_CONFIRMATION_FIELD_INPUT_TYPES.has(inputType)) {
        res.status(400).json({
          ok: false,
          message: 'inputType은 text, textarea, number, date 중 하나여야 합니다.',
        })
        return
      }
      const inputRoleRaw = req.body?.inputRole ?? req.body?.input_role
      const inputRole =
        inputRoleRaw === undefined || inputRoleRaw === null || inputRoleRaw === ''
          ? 'sender'
          : String(inputRoleRaw).trim()
      if (!ALLOWED_CONFIRMATION_FIELD_INPUT_ROLES.has(inputRole)) {
        res.status(400).json({
          ok: false,
          message: 'inputRole은 sender, customer 중 하나여야 합니다.',
        })
        return
      }
      const required = normalizeConfirmationRequired(req.body?.required)
      let ph = null
      if (req.body?.placeholder !== undefined) {
        ph = req.body.placeholder == null ? null : String(req.body.placeholder)
      }
      let ht = null
      if (req.body?.helpText !== undefined) {
        ht = req.body.helpText == null ? null : String(req.body.helpText)
      } else if (req.body?.help_text !== undefined) {
        ht = req.body.help_text == null ? null : String(req.body.help_text)
      }

      const sortOrderParsed = parseConfirmationSortOrder(req.body?.sortOrder ?? req.body?.sort_order)
      if (sortOrderParsed && typeof sortOrderParsed === 'object' && 'error' in sortOrderParsed) {
        res.status(400).json({ ok: false, message: sortOrderParsed.error })
        return
      }
      const sortOrder =
        sortOrderParsed === null ? await nextConfirmationFieldSortOrder(client, tpl.id) : sortOrderParsed

      const rawKey = req.body?.fieldKey ?? req.body?.field_key
      let fieldKey
      if (rawKey === undefined || rawKey === null || rawKey === '') {
        const base = deriveFieldKeyFromLabel(label)
        fieldKey = await allocateUniqueConfirmationFieldKey(client, tpl.id, base)
        if (!fieldKey) {
          res.status(500).json({ ok: false, message: 'fieldKey를 자동 할당할 수 없습니다.' })
          return
        }
      } else {
        const nk = normalizeConfirmationFieldKeyFromClient(rawKey)
        if (typeof nk === 'object' && 'error' in nk) {
          res.status(400).json({ ok: false, message: nk.error })
          return
        }
        const ck = await client.query(
          `SELECT 1 FROM contract_template_confirmation_fields WHERE template_id = $1 AND field_key = $2 LIMIT 1`,
          [tpl.id, nk],
        )
        if (ck.rowCount > 0) {
          res.status(409).json({
            ok: false,
            message: `이 템플릿에 같은 fieldKey「${nk}」가 이미 있습니다.`,
          })
          return
        }
        fieldKey = nk
      }

      const id = newId(CTCF_PREFIX)
      try {
        await client.query(
          `
          INSERT INTO contract_template_confirmation_fields (
            id, template_id, field_key, label, input_type, input_role, required, sort_order, placeholder, help_text,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          `,
          [id, tpl.id, fieldKey, label, inputType, inputRole, required, sortOrder, ph, ht],
        )
      } catch (e) {
        if (/** @type {{ code?: string }} */ (e)?.code === '23505') {
          res.status(409).json({
            ok: false,
            message: '같은 템플릿에 중복된 fieldKey가 있습니다.',
          })
          return
        }
        throw e
      }
      const ins = await client.query(
        `SELECT * FROM contract_template_confirmation_fields WHERE id = $1 LIMIT 1`,
        [id],
      )
      const fr = ins.rows[0]
      res.status(201).json({ ok: true, field: mapConfirmationFieldRow(fr) })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.put('/admin/contracts/templates/:id/confirmation-fields/:fieldId', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      if (
        Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fieldKey') ||
        Object.prototype.hasOwnProperty.call(req.body ?? {}, 'field_key')
      ) {
        res.status(400).json({ ok: false, message: 'fieldKey는 변경할 수 없습니다.' })
        return
      }
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const tpl = acc.row
      const modeErr = assertConfirmationOnlyTemplateRow(tpl)
      if (modeErr) {
        res.status(modeErr.status).json({ ok: false, message: modeErr.error })
        return
      }
      const fieldId = String(req.params.fieldId ?? '').trim()
      if (!fieldId.startsWith(CTCF_PREFIX)) {
        res.status(400).json({ ok: false, message: 'fieldId가 올바르지 않습니다.' })
        return
      }
      const cur = await client.query(
        `SELECT * FROM contract_template_confirmation_fields WHERE id = $1 AND template_id = $2 LIMIT 1`,
        [fieldId, tpl.id],
      )
      if (cur.rowCount === 0) {
        res.status(404).json({ ok: false, message: '확인 항목을 찾을 수 없습니다.' })
        return
      }
      const sets = /** @type {string[]} */ ([])
      const params = /** @type {unknown[]} */ ([])

      if (req.body?.label !== undefined) {
        const t = String(req.body.label).trim()
        if (!t) {
          res.status(400).json({ ok: false, message: 'label이 비어 있습니다.' })
          return
        }
        params.push(t)
        sets.push(`label = $${params.length}`)
      }
      if (req.body?.inputType !== undefined || req.body?.input_type !== undefined) {
        const it = String(req.body?.inputType ?? req.body?.input_type ?? '').trim()
        if (!ALLOWED_CONFIRMATION_FIELD_INPUT_TYPES.has(it)) {
          res.status(400).json({
            ok: false,
            message: 'inputType은 text, textarea, number, date 중 하나여야 합니다.',
          })
          return
        }
        params.push(it)
        sets.push(`input_type = $${params.length}`)
      }
      if (req.body?.inputRole !== undefined || req.body?.input_role !== undefined) {
        const ir = String(req.body?.inputRole ?? req.body?.input_role ?? '').trim()
        if (!ALLOWED_CONFIRMATION_FIELD_INPUT_ROLES.has(ir)) {
          res.status(400).json({
            ok: false,
            message: 'inputRole은 sender, customer 중 하나여야 합니다.',
          })
          return
        }
        params.push(ir)
        sets.push(`input_role = $${params.length}`)
      }
      if (req.body?.required !== undefined) {
        params.push(normalizeConfirmationRequired(req.body?.required))
        sets.push(`required = $${params.length}`)
      }
      if (req.body?.sortOrder !== undefined || req.body?.sort_order !== undefined) {
        const so = parseConfirmationSortOrder(req.body?.sortOrder ?? req.body?.sort_order)
        if (so && typeof so === 'object' && 'error' in so) {
          res.status(400).json({ ok: false, message: so.error })
          return
        }
        if (so === null) {
          res.status(400).json({ ok: false, message: 'sortOrder가 필요합니다.' })
          return
        }
        params.push(so)
        sets.push(`sort_order = $${params.length}`)
      }
      if (req.body?.placeholder !== undefined) {
        params.push(req.body.placeholder == null ? null : String(req.body.placeholder))
        sets.push(`placeholder = $${params.length}`)
      }
      if (req.body?.helpText !== undefined || req.body?.help_text !== undefined) {
        const hv = req.body?.helpText ?? req.body?.help_text
        params.push(hv == null ? null : String(hv))
        sets.push(`help_text = $${params.length}`)
      }

      if (sets.length === 0) {
        res.status(400).json({ ok: false, message: '변경할 필드가 없습니다.' })
        return
      }
      params.push(fieldId)
      await client.query(
        `
        UPDATE contract_template_confirmation_fields
        SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length} AND template_id = $${params.length + 1}
        `,
        [...params, tpl.id],
      )
      const upd = await client.query(
        `SELECT * FROM contract_template_confirmation_fields WHERE id = $1 LIMIT 1`,
        [fieldId],
      )
      res.json({ ok: true, field: mapConfirmationFieldRow(upd.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.delete('/admin/contracts/templates/:id/confirmation-fields/:fieldId', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const tpl = acc.row
      const modeErr = assertConfirmationOnlyTemplateRow(tpl)
      if (modeErr) {
        res.status(modeErr.status).json({ ok: false, message: modeErr.error })
        return
      }
      const fieldId = String(req.params.fieldId ?? '').trim()
      if (!fieldId.startsWith(CTCF_PREFIX)) {
        res.status(400).json({ ok: false, message: 'fieldId가 올바르지 않습니다.' })
        return
      }
      const del = await client.query(
        `DELETE FROM contract_template_confirmation_fields WHERE id = $1 AND template_id = $2`,
        [fieldId, tpl.id],
      )
      if (del.rowCount === 0) {
        res.status(404).json({ ok: false, message: '확인 항목을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true, success: true })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.delete('/admin/contracts/templates/:id', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertContractTemplateAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const cntR = await client.query(
        `SELECT COUNT(*)::int AS c FROM contract_document_instances WHERE template_id = $1`,
        [row.id],
      )
      if (Number(cntR.rows[0]?.c ?? 0) > 0) {
        res.status(409).json({
          ok: false,
          message: '이미 발송 이력이 있어 삭제할 수 없습니다. 사용중지로 변경하세요.',
        })
        return
      }
      const pkgR = await client.query(
        `SELECT COUNT(*)::int AS c FROM contract_package_items WHERE template_id = $1`,
        [row.id],
      )
      if (Number(pkgR.rows[0]?.c ?? 0) > 0) {
        res.status(400).json({
          ok: false,
          message: '패키지에 포함된 템플릿은 삭제할 수 없습니다. 패키지에서 제거한 뒤 다시 시도하세요.',
        })
        return
      }
      await client.query(`DELETE FROM contract_templates WHERE id = $1`, [row.id])
      res.json({ ok: true, success: true })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/admin/contracts/packages', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const params = /** @type {unknown[]} */ ([])
      let where = 'WHERE 1=1'
      if (!(isSuper && effectiveGa == null)) {
        if (effectiveGa == null) {
          res.status(400).json({ ok: false, message: 'GA 컨텍스트가 없습니다.' })
          return
        }
        params.push(effectiveGa)
        where += ` AND ga_id = $${params.length}`
      }
      const st = String(req.query?.status ?? '').trim()
      if (st && ALLOWED_TEMPLATE_STATUS.has(st)) {
        params.push(st)
        where += ` AND status = $${params.length}`
      }
      const r = await pool.query(
        `SELECT * FROM contract_packages ${where} ORDER BY updated_at DESC LIMIT 300`,
        params,
      )
      res.json({ ok: true, packages: r.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        gaId: row.ga_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/contracts/packages/:id', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertPackageAccess(pool, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const pkg = acc.row
      const items = await pool.query(
        `
        SELECT i.*, t.title AS template_title, t.status AS template_status
        FROM contract_package_items i
        JOIN contract_templates t ON t.id = i.template_id
        WHERE i.package_id = $1
        ORDER BY i.sort_order ASC, i.created_at ASC
        `,
        [pkg.id],
      )
      res.json({
        ok: true,
        package: {
          id: pkg.id,
          title: pkg.title,
          description: pkg.description,
          status: pkg.status,
          gaId: pkg.ga_id,
          items: items.rows.map((it) => ({
            id: it.id,
            templateId: it.template_id,
            templateTitle: it.template_title,
            templateStatus: it.template_status,
            sortOrder: it.sort_order,
            required: it.required === 1 || it.required === true,
          })),
          createdAt: pkg.created_at,
          updatedAt: pkg.updated_at,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/admin/contracts/packages', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      if (effectiveGa == null) {
        res.status(400).json({ ok: false, message: 'GA가 필요합니다.' })
        return
      }
      const title = String(req.body?.title ?? '').trim()
      if (!title) {
        res.status(400).json({ ok: false, message: 'title은 필수입니다.' })
        return
      }
      const itemsRaw = req.body?.items
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        res.status(400).json({ ok: false, message: 'items는 1개 이상이어야 합니다.' })
        return
      }
      const isSuper = isSuperAdminRole(req.user?.role)
      await client.query('BEGIN')
      const pkgId = newId(PKG_PREFIX)
      const uid = getAuthUserId(req)
      const description = req.body?.description != null ? String(req.body.description) : null
      const st = String(req.body?.status ?? 'draft').trim() || 'draft'
      if (!ALLOWED_TEMPLATE_STATUS.has(st)) {
        await client.query('ROLLBACK')
        res.status(400).json({ ok: false, message: 'status 값이 올바르지 않습니다.' })
        return
      }

      await client.query(
        `
        INSERT INTO contract_packages (id, title, description, status, ga_id, created_by_user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `,
        [pkgId, title, description, st, effectiveGa, uid || null],
      )

      for (let idx = 0; idx < itemsRaw.length; idx += 1) {
        const it = itemsRaw[idx]
        const tid = typeof it?.templateId === 'string' ? it.templateId.trim() : String(it?.templateId ?? '').trim()
        if (!tid.startsWith(CT_PREFIX)) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'items[].templateId가 올바르지 않습니다.' })
          return
        }
        const tacc = await assertContractTemplateAccess(client, tid, effectiveGa, isSuper)
        if (tacc.error) {
          await client.query('ROLLBACK')
          res.status(tacc.status ?? 400).json({ ok: false, message: tacc.error })
          return
        }
        const reqd = it?.required === false ? 0 : 1
        const itemId = newId('cpi_')
        await client.query(
          `
          INSERT INTO contract_package_items (id, package_id, template_id, sort_order, required, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          `,
          [itemId, pkgId, tid, idx, reqd],
        )
      }

      await client.query('COMMIT')
      res.status(201).json({ ok: true, success: true, data: { id: pkgId } })
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
  })

  apiRouter.patch('/admin/contracts/packages/:id', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertPackageAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const sets = /** @type {string[]} */ ([])
      const params = /** @type {unknown[]} */ ([])

      if (req.body?.title != null) {
        const t = String(req.body.title).trim()
        if (!t) {
          res.status(400).json({ ok: false, message: 'title이 비어 있습니다.' })
          return
        }
        params.push(t)
        sets.push(`title = $${params.length}`)
      }
      if (req.body?.description !== undefined) {
        params.push(req.body.description == null ? null : String(req.body.description))
        sets.push(`description = $${params.length}`)
      }

      if (Array.isArray(req.body?.items)) {
        await client.query('BEGIN')
        if (req.body.items.length === 0) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'items는 1개 이상이어야 합니다.' })
          return
        }
        await client.query(`DELETE FROM contract_package_items WHERE package_id = $1`, [row.id])
        for (let idx = 0; idx < req.body.items.length; idx += 1) {
          const it = req.body.items[idx]
          const tid = typeof it?.templateId === 'string' ? it.templateId.trim() : String(it?.templateId ?? '').trim()
          if (!tid.startsWith(CT_PREFIX)) {
            await client.query('ROLLBACK')
            res.status(400).json({ ok: false, message: 'items[].templateId가 올바르지 않습니다.' })
            return
          }
          const tacc = await assertContractTemplateAccess(client, tid, effectiveGa, isSuper)
          if (tacc.error) {
            await client.query('ROLLBACK')
            res.status(tacc.status ?? 400).json({ ok: false, message: tacc.error })
            return
          }
          const reqd = it?.required === false ? 0 : 1
          const itemId = newId('cpi_')
          await client.query(
            `
            INSERT INTO contract_package_items (id, package_id, template_id, sort_order, required, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            `,
            [itemId, row.id, tid, idx, reqd],
          )
        }
        await client.query('COMMIT')
      }

      if (sets.length > 0) {
        params.push(row.id)
        await client.query(
          `UPDATE contract_packages SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
          params,
        )
      }

      res.json({ ok: true, success: true })
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
  })

  apiRouter.patch('/admin/contracts/packages/:id/status', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const acc = await assertPackageAccess(client, req.params.id, effectiveGa, isSuper)
      if (acc.error) {
        res.status(acc.status ?? 400).json({ ok: false, message: acc.error })
        return
      }
      const row = acc.row
      const status = String(req.body?.status ?? '').trim()
      if (!ALLOWED_TEMPLATE_STATUS.has(status)) {
        res.status(400).json({ ok: false, message: 'status 값이 올바르지 않습니다.' })
        return
      }
      if (status === 'active') {
        const items = await client.query(
          `
          SELECT t.status AS template_status
          FROM contract_package_items i
          JOIN contract_templates t ON t.id = i.template_id
          WHERE i.package_id = $1
          `,
          [row.id],
        )
        if (items.rowCount === 0) {
          res.status(400).json({ ok: false, message: '패키지에 템플릿이 없습니다.' })
          return
        }
        const bad = items.rows.some((x) => String(x.template_status) !== 'active')
        if (bad) {
          res.status(400).json({ ok: false, message: '포함 템플릿이 모두 active일 때만 패키지를 active로 전환할 수 있습니다.' })
          return
        }
      }
      await client.query(`UPDATE contract_packages SET status = $2, updated_at = NOW() WHERE id = $1`, [row.id, status])
      res.json({ ok: true, success: true })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.post('/admin/contracts/send-sessions', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const customerId = Number(req.body?.customerId ?? req.body?.customer_id)
      if (!Number.isInteger(customerId) || customerId < 1) {
        res.status(400).json({ ok: false, message: 'customerId가 올바르지 않습니다.' })
        return
      }
      const pPkg = req.body?.packageId ?? req.body?.package_id
      const tplIdsRaw = req.body?.templateIds ?? req.body?.template_ids
      const hasPkg = pPkg !== undefined && pPkg !== null && String(pPkg).trim() !== ''
      const hasTpl = tplIdsRaw !== undefined && tplIdsRaw !== null
      if (hasPkg && hasTpl) {
        res.status(400).json({ ok: false, message: 'packageId와 templateIds는 동시에 보낼 수 없습니다.' })
        return
      }
      if (!hasPkg && !hasTpl) {
        res.status(400).json({ ok: false, message: 'packageId 또는 templateIds 중 하나는 필수입니다.' })
        return
      }

      const cust = await assertCustomerForSend(client, customerId, req)
      if (cust.error) {
        res.status(cust.status ?? 400).json({ ok: false, message: cust.error })
        return
      }
      const snapshot = buildTargetPhoneSnapshot(cust.digits)

      let contractTemplatesOrdered = /** @type {{ id: string, title: string, version: number, required: number, pdfHash: string | null, pdfTemplateId: number | null }[]} */ ([])

      await client.query('BEGIN')

      if (hasPkg) {
        const pid = String(pPkg).trim()
        if (!pid.startsWith(PKG_PREFIX)) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'packageId 형식이 올바르지 않습니다.' })
          return
        }
        const pacc = await assertPackageAccess(client, pid, effectiveGa, isSuper)
        if (pacc.error) {
          await client.query('ROLLBACK')
          res.status(pacc.status ?? 400).json({ ok: false, message: pacc.error })
          return
        }
        const pkg = pacc.row
        if (String(pkg.status) !== 'active') {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: 'active 패키지만 발송할 수 있습니다.' })
          return
        }
        const items = await client.query(
          `
          SELECT i.template_id, i.sort_order, i.required, t.id, t.title, t.status, t.version, t.pdf_template_id
          FROM contract_package_items i
          JOIN contract_templates t ON t.id = i.template_id
          WHERE i.package_id = $1
          ORDER BY i.sort_order ASC, i.created_at ASC
          `,
          [pkg.id],
        )
        if (items.rowCount === 0) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '패키지에 템플릿이 없습니다.' })
          return
        }
        const inactive = items.rows.filter((x) => String(x.status) !== 'active')
        if (inactive.length > 0) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: '포함 템플릿이 모두 active일 때만 발송할 수 있습니다.' })
          return
        }
        contractTemplatesOrdered = items.rows.map((x) => ({
          id: x.id,
          title: x.title,
          version: x.version,
          required: x.required === 1 || x.required === true ? 1 : 0,
          pdfHash: x.pdf_template_id
            ? createHash('sha256')
                .update(`pdf_tmpl:${x.pdf_template_id}`, 'utf8')
                .digest('hex')
            : null,
          pdfTemplateId: x.pdf_template_id,
        }))
      }

      if (hasTpl) {
        const parsed = parseTemplateIdsArray(tplIdsRaw)
        if (parsed.error) {
          await client.query('ROLLBACK')
          res.status(400).json({ ok: false, message: parsed.error })
          return
        }
        contractTemplatesOrdered = []
        for (const tid of parsed.ids) {
          const tacc = await assertContractTemplateAccess(client, tid, effectiveGa, isSuper)
          if (tacc.error) {
            await client.query('ROLLBACK')
            res.status(tacc.status ?? 400).json({ ok: false, message: tacc.error })
            return
          }
          const t = tacc.row
          if (String(t.status) !== 'active') {
            await client.query('ROLLBACK')
            res.status(400).json({ ok: false, message: `템플릿 ${tid}은(는) active 상태가 아닙니다.` })
            return
          }
          contractTemplatesOrdered.push({
            id: t.id,
            title: t.title,
            version: t.version,
            required: 1,
            pdfHash: t.pdf_template_id
              ? createHash('sha256')
                  .update(`pdf_tmpl:${t.pdf_template_id}`, 'utf8')
                  .digest('hex')
              : null,
            pdfTemplateId: t.pdf_template_id,
          })
        }
      }

      const senderRoot =
        req.body?.senderInputValues ??
        req.body?.sender_input_values ??
        req.body?.senderFieldValues ??
        req.body?.sender_field_values
      const senderMaps = senderValuesByContractTemplates(
        senderRoot,
        contractTemplatesOrdered.map((x) => String(x.id)),
      )

      const confRaw = req.body?.confirmationItems ?? req.body?.confirmation_items
      const confParsed = parseConfirmationItemsFromBody(confRaw)
      if (!confParsed.ok) {
        await client.query('ROLLBACK')
        res.status(400).json({ ok: false, message: confParsed.message })
        return
      }

      for (const ct of contractTemplatesOrdered) {
        if (ct.pdfTemplateId == null) {
          await client.query('ROLLBACK')
          res.status(400).json({
            ok: false,
            message: 'PDF 엔진이 연결된 계약 템플릿만 전자서명 발송할 수 있습니다.',
          })
          return
        }
        const senderCheck = await assertSenderFieldValuesFilled(
          client,
          String(ct.id),
          Number(ct.pdfTemplateId),
          senderMaps.get(String(ct.id)) ?? {},
        )
        if (!senderCheck.ok) {
          await client.query('ROLLBACK')
          res.status(senderCheck.status ?? 400).json({
            ok: false,
            message: senderCheck.message ?? '발송 전 입력이 올바르지 않습니다.',
          })
          return
        }
      }

      const sendId = newId(CSS_PREFIX)
      const linkCode = await generateUniqueLinkCode(client)
      const uid = getAuthUserId(req)
      const nowSql = `NOW()`

      await client.query(
        `
        INSERT INTO contract_send_sessions (
          id, package_id, customer_id, link_code, status,
          target_phone_encrypted, target_phone_hash, target_phone_masked,
          sent_by_user_id, sent_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'pending',
          $5, $6, $7,
          $8, ${nowSql}, ${nowSql}, ${nowSql}
        )
        `,
        [
          sendId,
          hasPkg ? String(pPkg).trim() : null,
          customerId,
          linkCode,
          snapshot.target_phone_encrypted,
          snapshot.target_phone_hash,
          snapshot.target_phone_masked,
          uid || null,
        ],
      )

      /** @type {{ id: string, label: string, required: boolean }[]} */
      let insertedConfirmations = []
      if (confParsed.items.length > 0) {
        insertedConfirmations = await insertConfirmationItemsForSendSession(client, sendId, confParsed.items)
      }

      for (let i = 0; i < contractTemplatesOrdered.length; i += 1) {
        const ct = contractTemplatesOrdered[i]
        const docId = newId(CDI_PREFIX)
        await client.query(
          `
          INSERT INTO contract_document_instances (
            id, send_session_id, template_id, template_version, title_snapshot,
            required, sort_order, status, original_pdf_hash, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())
          `,
          [docId, sendId, ct.id, ct.version, ct.title, ct.required, i, ct.pdfHash],
        )
        const pdfTm = ct.pdfTemplateId != null ? Number(ct.pdfTemplateId) : NaN
        if (Number.isFinite(pdfTm)) {
          await insertSenderPrefillDocumentValues(
            client,
            docId,
            ct.id,
            pdfTm,
            senderMaps.get(String(ct.id)) ?? {},
          )
          await insertFixedPrefillDocumentValues(client, docId, ct.id, pdfTm)
        }
      }

      await client.query('COMMIT')
      res.status(201).json({
        ok: true,
        sendSession: {
          id: sendId,
          linkCode,
          customerId,
          status: 'pending',
          maskedPhone: snapshot.target_phone_masked,
          documentCount: contractTemplatesOrdered.length,
          createdAt: new Date().toISOString(),
        },
        confirmationItems: insertedConfirmations,
      })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      if (e instanceof Error && e.message.includes('CONTRACT_OTP_PEPPER')) {
        res.status(500).json({ ok: false, message: '서버 설정 오류입니다.' })
        return
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/admin/contracts/send-sessions', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const params = /** @type {unknown[]} */ ([])
      let where = `
        FROM contract_send_sessions s
        JOIN customers c ON c.id = s.customer_id
        WHERE 1=1
      `
      if (!isSuper) {
        if (effectiveGa == null) {
          res.status(400).json({ ok: false, message: 'GA 컨텍스트가 없습니다.' })
          return
        }
        params.push(effectiveGa)
        where += ` AND c.ga_id = $${params.length}`
        if (normalizeRbacRole(req.user?.role) === 'USER') {
          params.push(getAuthUserId(req))
          where += ` AND c.user_id = $${params.length}`
        }
      }
      const r = await pool.query(
        `
        SELECT s.id, s.link_code, s.customer_id, s.status, s.target_phone_masked, s.sent_at, s.created_at, s.package_id
        ${where}
        ORDER BY s.created_at DESC
        LIMIT 200
        `,
        params,
      )
      res.json({
        ok: true,
        sendSessions: r.rows.map((row) => ({
          id: row.id,
          linkCode: row.link_code,
          customerId: row.customer_id,
          status: row.status,
          maskedPhone: row.target_phone_masked,
          packageId: row.package_id,
          sentAt: row.sent_at,
          createdAt: row.created_at,
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/contracts/send-sessions/:id', ...chain, async (req, res) => {
    try {
      const effectiveGa = await resolveEffectiveGaId(pool, req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const params = [req.params.id]
      let where = `
        FROM contract_send_sessions s
        JOIN customers c ON c.id = s.customer_id
        WHERE s.id = $1
      `
      if (!isSuper) {
        if (effectiveGa == null) {
          res.status(400).json({ ok: false, message: 'GA 컨텍스트가 없습니다.' })
          return
        }
        params.push(effectiveGa)
        where += ` AND c.ga_id = $${params.length}`
        if (normalizeRbacRole(req.user?.role) === 'USER') {
          params.push(getAuthUserId(req))
          where += ` AND c.user_id = $${params.length}`
        }
      }
      const r = await pool.query(
        `
        SELECT s.*
        ${where}
        LIMIT 1
        `,
        params,
      )
      if (r.rowCount === 0) {
        res.status(404).json({ ok: false, message: '발송 세션을 찾을 수 없습니다.' })
        return
      }
      const row = r.rows[0]
      const docs = await pool.query(
        `
        SELECT id, template_id, template_version, title_snapshot, status, sort_order, original_pdf_hash, created_at, completed_at
        FROM contract_document_instances
        WHERE send_session_id = $1
        ORDER BY sort_order ASC, created_at ASC
        `,
        [row.id],
      )
      const docIds = docs.rows.map((d) => d.id)
      /** @type {Map<string, Record<string, unknown>>} */
      const evidenceByDoc = new Map()
      if (docIds.length > 0) {
        const evRows = await pool.query(
          `
          SELECT DISTINCT ON (document_instance_id)
            document_instance_id,
            evidence_hash,
            signed_at,
            otp_verified_at,
            provider,
            level,
            signature_file_id,
            signed_pdf_file_id,
            signed_pdf_hash
          FROM signature_evidences
          WHERE send_session_id = $1
            AND document_instance_id = ANY($2::text[])
          ORDER BY document_instance_id, created_at DESC
          `,
          [row.id, docIds],
        )
        for (const er of evRows.rows) {
          evidenceByDoc.set(String(er.document_instance_id), er)
        }
      }
      const confirmationItems = await listConfirmationItemsWithValues(pool, row.id)
      res.json({
        ok: true,
        sendSession: {
          id: row.id,
          linkCode: row.link_code,
          customerId: row.customer_id,
          packageId: row.package_id,
          status: row.status,
          maskedPhone: row.target_phone_masked,
          identitySessionId: row.identity_session_id,
          sentByUserId: row.sent_by_user_id,
          sentAt: row.sent_at,
          createdAt: row.created_at,
          completedAt: row.completed_at ?? null,
          confirmationItems,
          documents: docs.rows.map((d) => {
            const ev = evidenceByDoc.get(String(d.id))
            return {
              id: d.id,
              templateId: d.template_id,
              templateVersion: d.template_version,
              titleSnapshot: d.title_snapshot,
              status: d.status,
              sortOrder: d.sort_order,
              originalPdfHash: d.original_pdf_hash,
              createdAt: d.created_at,
              completedAt: d.completed_at ?? null,
              evidence: ev
                ? {
                    documentInstanceId: d.id,
                    documentTitle: d.title_snapshot,
                    status: d.status,
                    completedAt: d.completed_at ?? null,
                    evidenceHash: ev.evidence_hash ? String(ev.evidence_hash) : null,
                    evidenceHashPrefix: ev.evidence_hash ? String(ev.evidence_hash).slice(0, 12) : null,
                    identityProvider: ev.provider != null ? String(ev.provider) : 'self_sms',
                    identityLevel: ev.level != null ? String(ev.level) : 'phone_possession',
                    otpVerifiedAt: ev.otp_verified_at ?? null,
                    signedAt: ev.signed_at ?? null,
                    hasSignatureFile: Boolean(ev.signature_file_id),
                    hasSignedPdfFile: Boolean(ev.signed_pdf_file_id),
                    hasSignedPdfHash: Boolean(ev.signed_pdf_hash),
                  }
                : null,
            }
          }),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
