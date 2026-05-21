import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { consentGetBuffer, consentPutObject } from '../lib/consentStorage.js'
import { getAuthUserId, resolveGovSignatureOwnerUserId } from '../lib/governmentSignatures/access.js'
import { normalizeKrMobile, validateKrMobileDigits } from '../lib/phoneNormalize.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'
import {
  assertGovernmentSignatureTemplateAccess,
  assertGovConfirmationOnlyTemplateRow,
  mapConfirmationFieldRow,
  buildTargetPhoneSnapshot,
  generateUniqueSignToken,
  parseTemplateIdsArray,
} from './governmentSignatureTemplateApi.js'
import {
  assertSenderFieldValuesFilled,
  insertGovSenderPrefillDocumentValues,
  senderValuesByGovernmentSignatureTemplates,
} from '../services/governmentSignatureSenderPrefill.js'
import {
  insertFixedPrefillDocumentValues,
  listSenderFieldsForGovernmentSignatureTemplate,
} from '../services/governmentSignatureTemplateFieldSettings.js'
import {
  insertConfirmationItemsForSendSession,
  listConfirmationItemsWithValues,
  parseConfirmationItemsFromBody,
} from '../services/governmentSignatureConfirmationItems.js'
import {
  buildSendSessionEvidencePdf,
  encodeContractEvidenceContentDispositionFilename,
} from '../services/governmentSignatureEvidencePdfService.js'
import {
  parseAttachmentsFromBody,
  insertSendSessionAttachmentsForSend,
  listSendSessionAttachmentsPublic,
} from '../services/governmentSignatureSendAttachments.js'
import { insertSendSessionConfirmationFieldValues } from '../services/governmentSignatureSendSessionConfirmationFieldValues.js'
import multer from 'multer'

const GSS_PREFIX = 'gss_'
const GSDI_PREFIX = 'gsdi_'

/**
 * @param {unknown} raw
 * @returns {{ ok: true, map: Map<string, string> } | { ok: false, message: string }}
 */
function parseConfirmationFieldValuesFromBody(raw) {
  if (raw == null || raw === '') {
    return { ok: true, map: new Map() }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'confirmationFieldValues 형식이 올바르지 않습니다.' }
  }
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k ?? '').trim()
    if (!key) {
      continue
    }
    map.set(key, v == null ? '' : String(v))
  }
  return { ok: true, map }
}

/**
 * confirmation_only 필드 입력 주체 정규화.
 * - customer면 customer
 * - 그 외/null/이상값은 sender
 * @param {unknown} raw
 * @returns {'sender' | 'customer'}
 */
function normalizeConfirmationFieldInputRole(raw) {
  return String(raw ?? '').trim() === 'customer' ? 'customer' : 'sender'
}

function newId(prefix) {
  return `${prefix}${randomUUID()}`
}

function safeContractAttachmentBaseName(name) {
  const b = path.basename(String(name ?? 'file')).replace(/[\\/]/g, '')
  const cleaned = b.replace(/[^\w.\-가-힣 ()[\]]+/g, '_').trim()
  return cleaned.slice(0, 180) || 'file'
}

const uploadContractAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const CONTRACT_ATTACHMENT_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

function escapeIlikePattern(raw) {
  return String(raw ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * 전자서명 발송 고객 검색 — 빈·짧은 q에서는 DB 전체 스캔 없이 빈 결과만 반환한다.
 * - 한글/영문 등(숫자만이 아님): 2글자 이상
 * - 숫자만: 4자리 이상(전화 끝 4자리·고객번호 일부)
 */
function isContractCustomerSearchQuerySufficient(raw) {
  const q = String(raw ?? '').trim()
  if (!q) {
    return false
  }
  if (/^\d+$/.test(q)) {
    return q.length >= 4
  }
  return q.length >= 2
}

const VERBOSE_CONTRACT_SEND_LOGS =
  process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT

/**
 * @param {Record<string, unknown>} ctx
 * @param {unknown} err
 */
function logGovernmentSignatureSendSessionFailure(ctx, err) {
  const e = err instanceof Error ? err : new Error(String(err))
  if (VERBOSE_CONTRACT_SEND_LOGS) {
    console.error('[government/signatures/sessions/send-sessions]', {
      route: ctx.route,
      userId: ctx.userId,
      ownerUserId: ctx.ownerUserId,
      profileId: ctx.profileId,
      templateIds: ctx.templateIds,
      selectedTemplateCount: ctx.selectedTemplateCount,
      customerFound: ctx.customerFound,
      customerHasPhone: ctx.customerHasPhone,
      activeTemplateCheckPassed: ctx.activeTemplateCheckPassed,
      errorName: e.name,
      errorMessage: e.message,
      errorCode: /** @type {{ code?: string }} */ (err)?.code,
      stack: e.stack,
    })
    return
  }
  console.error('[government/signatures/sessions/send-sessions]', {
    route: ctx.route,
    userId: ctx.userId,
    ownerUserId: ctx.ownerUserId,
    profileId: ctx.profileId,
    templateIds: ctx.templateIds,
    selectedTemplateCount: ctx.selectedTemplateCount,
    customerFound: ctx.customerFound,
    customerHasPhone: ctx.customerHasPhone,
    activeTemplateCheckPassed: ctx.activeTemplateCheckPassed,
    pgCode: /** @type {{ code?: string }} */ (err)?.code,
    errorName: e.name,
    errorMessage: e.message,
  })
}

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string } | null}
 */
function mapSendSessionCreateError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('GOV_SIGNATURE_OTP_PEPPER') || msg.includes('[contract OTP]')) {
    return {
      status: 503,
      code: 'missing_contract_otp_pepper',
      message:
        '전자서명 OTP를 위해 서버에 GOV_SIGNATURE_OTP_PEPPER(16자 이상) 환경 변수가 필요합니다. Railway 등 배포 환경 변수를 확인해 주세요.',
    }
  }
  if (
    msg.includes('GOV_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY') ||
    (msg.includes('[contract phone]') && msg.includes('ENCRYPTION'))
  ) {
    return {
      status: 503,
      code: 'missing_contract_target_phone_key',
      message:
        '전화번호 저장을 위해 서버에 GOV_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY(64자 hex 또는 아무 문자열)가 필요합니다. Railway 환경 변수를 확인해 주세요.',
    }
  }
  if (msg.includes('sign_token_collision')) {
    return {
      status: 503,
      code: 'sign_token_collision',
      message: '발송 링크 코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    }
  }
  const attachCode = /** @type {{ code?: string }} */ (err)?.code
  if (attachCode === 'attachment_file_invalid' || attachCode === 'attachment_file_unreadable') {
    return {
      status: 400,
      code: attachCode,
      message: msg,
    }
  }
  return null
}

async function assertCustomerForUserSend(client, profileId, req) {
  const ownerUserId = getAuthUserId(req)
  const uid = getAuthUserId(req)
  if (!uid) {
    return { error: '로그인이 필요합니다.', status: 401 }
  }
  if (ownerUserId == null) {
    return { error: '프로그램 이용자 권한이 필요합니다.', status: 403 }
  }
  const r = await client.query(
    `
    SELECT id, phone, owner_user_id, tenant_id
    FROM gov_support_profiles
    WHERE id = $1 AND owner_user_id = $2
    `,
    [profileId, ownerUserId],
  )
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

function mapSendSessionDetailRow(row, docs, evidenceByDoc) {
  const ivsStatus = row.ivs_status != null ? String(row.ivs_status) : null
  const ivsVerifiedAt = row.ivs_otp_verified_at ?? null
  const firstModeRaw = docs.rows[0]?.contract_template_mode
  const templateMode =
    firstModeRaw != null && String(firstModeRaw).trim() === 'confirmation_only'
      ? 'confirmation_only'
      : 'coordinate_pdf'
  return {
    id: row.id,
    signToken: row.sign_token,
    profileId: row.profile_id,
    profileDisplayName: row.profile_display_name != null ? String(row.profile_display_name) : null,
    customerCode: row.customer_code != null ? String(row.customer_code) : null,
    packageId: row.package_id,
    status: row.status,
    templateMode,
    maskedPhone: row.target_phone_masked,
    identitySessionId: row.identity_session_id,
    identityStatus: ivsStatus,
    identityVerifiedAt: ivsVerifiedAt ? new Date(ivsVerifiedAt).toISOString() : null,
    openedAt: row.opened_at ? new Date(row.opened_at).toISOString() : null,
    expiredAt: row.expired_at ? new Date(row.expired_at).toISOString() : null,
    sentByUserId: row.sent_by_user_id,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
    documents: docs.rows.map((d) => {
      const ev = evidenceByDoc.get(String(d.id))
      const docSignedId = d.signed_pdf_file_id
      const hasDocSigned = docSignedId != null && String(docSignedId).trim() !== ''
      const evidenceOut = ev
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
            hasSignedPdfFile: Boolean(ev.signed_pdf_file_id || d.signed_pdf_file_id),
            hasSignedPdfHash: Boolean(ev.signed_pdf_hash || d.signed_pdf_hash),
          }
        : hasDocSigned
          ? {
              documentInstanceId: d.id,
              documentTitle: d.title_snapshot,
              status: d.status,
              completedAt: d.completed_at ?? null,
              evidenceHash: null,
              evidenceHashPrefix: null,
              identityProvider: 'self_sms',
              identityLevel: 'phone_possession',
              otpVerifiedAt: null,
              signedAt: d.completed_at ?? null,
              hasSignatureFile: false,
              hasSignedPdfFile: true,
              hasSignedPdfHash: Boolean(d.signed_pdf_hash),
            }
          : null
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
        evidence: evidenceOut,
      }
    }),
  }
}

function safeContractDownloadSegment(s) {
  const t = String(s ?? '').trim()
  return (t ? t.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 72) : '문서') || '문서'
}

/**
 * @param {Record<string, unknown>} row
 */
function mapSendSessionListRow(row) {
  const st = String(row.session_status ?? '')
  const hasCompletedDocument = Boolean(row.has_completed_document)
  const canCancel =
    !['completed', 'cancelled', 'expired'].includes(st) && !hasCompletedDocument
  const rawTitles = String(row.template_names ?? '').trim()
  const templateNames = rawTitles ? rawTitles.split(' · ').filter(Boolean) : []
  return {
    id: row.id,
    signToken: row.sign_token,
    profileId: row.profile_id,
    profileDisplayName: row.profile_display_name != null ? String(row.profile_display_name) : '',
    customerCode: row.customer_code != null ? String(row.customer_code) : null,
    maskedPhone: row.target_phone_masked != null ? String(row.target_phone_masked) : '',
    templateNames,
    documentCount: Number(row.document_count) || 0,
    requiredDocumentCount: Number(row.required_document_count) || 0,
    completedDocumentCount: Number(row.completed_document_count) || 0,
    status: st,
    identityStatus: row.identity_session_status != null ? String(row.identity_session_status) : null,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    identityVerifiedAt: row.identity_verified_at,
    completedAt: row.completed_at,
    expiresAt: row.expired_at,
    evidenceHashPrefix: row.evidence_hash_prefix ? String(row.evidence_hash_prefix) : null,
    hasSignedPdfFile: Boolean(row.has_signed_pdf_file),
    hasSignedNotCompleted: Boolean(row.has_signed_not_completed),
    canCancel,
    canDelete: false,
    canCopyLink: Boolean(row.sign_token),
    canOpenLink: Boolean(row.sign_token),
    canResend: false,
  }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{
 *   pool: import('pg').Pool,
 *   requireAuth: import('express').RequestHandler,
 *   *   requireGovernmentProgramUserSignature: import('express').RequestHandler,
 *   handleDbError: (e: unknown, req: import('express').Request, res: import('express').Response) => void,
 * }} ctx
 */
export function registerGovernmentSignatureUserApi(apiRouter, ctx) {
  const {
    pool,
    requireAuth,
    attachPlatformContext,
    requireGovernmentProgramUserSignature,
    attachGovernmentSignatureContext,
    handleDbError,
  } = ctx
  const chain = [
    requireAuth,
    attachPlatformContext,
    requireGovernmentProgramUserSignature,
    attachGovernmentSignatureContext,
  ]

  apiRouter.get('/government-support/signatures/send/templates', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const r = await pool.query(
        `
        SELECT
          t.id,
          t.title,
          t.description,
          t.category,
          t.status,
          t.version,
          t.template_mode,
          t.pdf_template_id,
          p.title AS pdf_engine_title,
          COALESCE(
            (SELECT COUNT(*)::int FROM pdf_template_fields f WHERE f.template_id = t.pdf_template_id),
            0
          ) AS pdf_field_count,
          COALESCE(
            (SELECT COUNT(*)::int FROM pdf_template_fields f
             WHERE f.template_id = t.pdf_template_id AND f.field_type = 'signature'),
            0
          ) AS signature_field_count,
          t.updated_at
        FROM gov_signature_templates t
        LEFT JOIN pdf_templates p ON p.id = t.pdf_template_id
        WHERE t.owner_user_id = $1 AND t.status = 'active'
        ORDER BY t.updated_at DESC
        LIMIT 200
        `,
        [ownerUserId],
      )
      const pdfIds = [
        ...new Set(
          r.rows
            .map((row) => row.pdf_template_id)
            .filter((pid) => pid != null)
            .map((pid) => Number(pid)),
        ),
      ]
      const ctIdsForSettings = [...new Set(r.rows.map((row) => String(row.id)).filter(Boolean))]
      const settingsByTemplateId = new Map()
      if (ctIdsForSettings.length > 0) {
        const sr = await pool.query(
          `
          SELECT template_id, field_key, input_role, fixed_value
          FROM gov_signature_template_field_settings
          WHERE template_id = ANY($1::text[])
          `,
          [ctIdsForSettings],
        )
        for (const row of sr.rows) {
          const tid = String(row.template_id)
          if (!settingsByTemplateId.has(tid)) {
            settingsByTemplateId.set(tid, new Map())
          }
          settingsByTemplateId.get(tid).set(String(row.field_key), {
            inputRole: row.input_role,
            fixedValue: row.fixed_value,
          })
        }
      }
      /** @type {Map<number, object[]>} */
      const pdfFieldsByTemplateNum = new Map()
      if (pdfIds.length > 0) {
        const fr = await pool.query(
          `
          SELECT template_id, field_key, label, required, field_type, order_index, input_role, options, placements
          FROM pdf_template_fields
          WHERE template_id = ANY($1::int[])
          ORDER BY template_id, order_index
          `,
          [pdfIds],
        )
        for (const row of fr.rows) {
          const pid = Number(row.template_id)
          if (!pdfFieldsByTemplateNum.has(pid)) {
            pdfFieldsByTemplateNum.set(pid, [])
          }
          pdfFieldsByTemplateNum.get(pid).push(row)
        }
      }
      res.json({
        ok: true,
        templates: r.rows.map((row) => {
          const pid = row.pdf_template_id != null ? Number(row.pdf_template_id) : NaN
          const pdfRows = Number.isFinite(pid) ? pdfFieldsByTemplateNum.get(pid) ?? [] : []
          const sm = settingsByTemplateId.get(String(row.id)) ?? new Map()
          const senderList = listSenderFieldsForGovernmentSignatureTemplate(pdfRows, sm)
          return {
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category,
            status: row.status,
            version: row.version,
            templateMode: row.template_mode ?? 'coordinate_pdf',
            pdfTemplateId: row.pdf_template_id,
            pdfEngineTitle: row.pdf_engine_title,
            pdfFieldCount: row.pdf_field_count,
            signatureFieldCount: row.signature_field_count,
            senderFieldsForSend: senderList,
            sendable: Boolean(row.pdf_template_id && Number(row.pdf_field_count) > 0),
          }
        }),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  /** 발송 화면용: confirmation_only 템플릿의 확인서 항목 정의 조회(읽기 전용). coordinate_pdf이면 409. */
  apiRouter.get('/government-support/signature-templates/:templateId/confirmation-fields', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const templateId = String(req.params.templateId ?? '').trim()
      if (!templateId) {
        res.status(404).json({ ok: false, message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const { row, error, status } = await assertGovernmentSignatureTemplateAccess(pool, templateId, ownerUserId, false)
      if (error) {
        res.status(status ?? 400).json({ ok: false, message: error })
        return
      }
      if (String(row.status) !== 'active') {
        res.status(403).json({ ok: false, message: '활성 템플릿만 확인 항목을 조회할 수 있습니다.' })
        return
      }
      const modeErr = assertGovConfirmationOnlyTemplateRow(row)
      if (modeErr) {
        res
          .status(modeErr.status)
          .json({ ok: false, code: 'gov_signature_template_not_confirmation_only', message: modeErr.error })
        return
      }
      const r = await pool.query(
        `
        SELECT *
        FROM gov_signature_template_confirmation_fields
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

  apiRouter.get('/government-support/signatures/profiles/search', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const uid = getAuthUserId(req)
      if (!uid) {
        res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
        return
      }
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const q = String(req.query.q ?? '').trim()
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)

      if (!isContractCustomerSearchQuerySufficient(q)) {
        res.json({ ok: true, customers: [] })
        return
      }

      const pattern = `%${escapeIlikePattern(q)}%`
      const rawId = /^\d+$/.test(q) ? Number(q) : null
      const idParam = rawId != null && Number.isInteger(rawId) && rawId > 0 ? rawId : null
      const r = await pool.query(
        `
        SELECT
          p.id,
          COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.customer_name), ''), '사업장') AS name,
          p.phone
        FROM gov_support_profiles p
        WHERE p.owner_user_id = $1
          AND (
            p.customer_name ILIKE $2 ESCAPE '\\'
            OR p.business_name ILIKE $2 ESCAPE '\\'
            OR p.phone ILIKE $2 ESCAPE '\\'
            OR ($3::bigint IS NOT NULL AND p.id = $3::bigint)
          )
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT $4
        `,
        [ownerUserId, pattern, idParam, limit],
      )

      const customers = r.rows.map((row) => {
        const digits = normalizeKrMobile(row.phone)
        const phoneErr = validateKrMobileDigits(digits)
        const hasPhone = phoneErr == null
        const maskedPhone = hasPhone ? maskKrMobileForDisplay(digits) : ''
        return {
          id: row.id,
          name: row.name,
          customerCode: null,
          maskedPhone,
          hasPhone,
        }
      })

      res.json({ ok: true, customers })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/government-support/signatures/send', ...chain, async (req, res) => {
    const client = await pool.connect()
    /** @type {Record<string, unknown>} */
    const debugCtx = {
      route: 'government/signatures/sessions/send-sessions',
      userId: getAuthUserId(req) || null,
      ownerUserId: null,
      profileId: null,
      templateIds: null,
      selectedTemplateCount: null,
      customerFound: null,
      customerHasPhone: null,
      activeTemplateCheckPassed: null,
    }
    try {
      const ownerUserId = getAuthUserId(req)
      debugCtx.ownerUserId = ownerUserId
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      if (
        req.body?.phone != null ||
        req.body?.targetPhone != null ||
        req.body?.target_phone != null
      ) {
        res.status(400).json({ ok: false, message: 'phone은 요청 본문으로 받을 수 없습니다.' })
        return
      }
      const profileId = Number(req.body?.profileId ?? req.body?.profile_id)
      if (!Number.isInteger(profileId) || profileId < 1) {
        res.status(400).json({ ok: false, message: 'profileId가 올바르지 않습니다.' })
        return
      }
      debugCtx.profileId = profileId
      const tplIdsRaw = req.body?.templateIds ?? req.body?.template_ids
      const parsed = parseTemplateIdsArray(tplIdsRaw)
      if (parsed.error) {
        res.status(400).json({ ok: false, message: parsed.error })
        return
      }
      debugCtx.templateIds = parsed.ids
      debugCtx.selectedTemplateCount = parsed.ids.length

      const cust = await assertCustomerForUserSend(client, profileId, req)
      debugCtx.customerFound = !cust.error
      debugCtx.customerHasPhone = Boolean(cust.row && !cust.error)
      if (cust.error) {
        res.status(cust.status ?? 400).json({ ok: false, message: cust.error })
        return
      }
      const snapshot = buildTargetPhoneSnapshot(cust.digits)

      const senderRoot =
        req.body?.senderInputValues ??
        req.body?.sender_input_values ??
        req.body?.senderFieldValues ??
        req.body?.sender_field_values
      const senderMaps = senderValuesByGovernmentSignatureTemplates(senderRoot, parsed.ids)

      const confRaw = req.body?.confirmationItems ?? req.body?.confirmation_items
      const confParsed = parseConfirmationItemsFromBody(confRaw)
      if (!confParsed.ok) {
        res.status(400).json({ ok: false, message: confParsed.message })
        return
      }

      const attRaw = req.body?.attachments ?? req.body?.sessionAttachments ?? req.body?.session_attachments
      const attParsed = parseAttachmentsFromBody(attRaw)
      if (!attParsed.ok) {
        res.status(400).json({ ok: false, message: attParsed.message })
        return
      }

      /** @type {{ id: string, title: string, version: number, required: number, pdfHash: string | null, pdfTemplateId: number | null }[]} */
      let governmentSignatureTemplatesOrdered = []
      /** @type {{ rows: { fieldKey: string, valueText: string }[] }[]} */
      let confirmationFieldInsertPlans = []

      await client.query('BEGIN')

      /** @type {{ row: Record<string, unknown>, id: string }[]} */
      const templateAccs = []
      for (const tid of parsed.ids) {
        const tacc = await assertGovernmentSignatureTemplateAccess(client, tid, ownerUserId, false)
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
        templateAccs.push({ row: t, id: tid })
      }

      const modes = new Set(
        templateAccs.map(({ row: t }) => String(t.template_mode ?? 'coordinate_pdf')),
      )
      if (modes.size > 1) {
        await client.query('ROLLBACK')
        res.status(400).json({
          ok: false,
          message: '한 번의 발송에 좌표형 PDF 템플릿과 무좌표 확인서 템플릿을 함께 넣을 수 없습니다.',
        })
        return
      }
      const sessionTemplateMode = [...modes][0]

      const confFieldBody =
        req.body?.confirmationFieldValues ?? req.body?.confirmation_field_values
      const confFieldParsed = parseConfirmationFieldValuesFromBody(confFieldBody)
      if (!confFieldParsed.ok) {
        await client.query('ROLLBACK')
        res.status(400).json({ ok: false, message: confFieldParsed.message })
        return
      }

      if (sessionTemplateMode === 'confirmation_only') {
        for (const { row: t, id: tid } of templateAccs) {
          if (t.pdf_template_id != null) {
            await client.query('ROLLBACK')
            res.status(400).json({
              ok: false,
              message: `무좌표 확인서 템플릿 ${tid}에 PDF 엔진이 연결되어 있어 발송할 수 없습니다.`,
            })
            return
          }
          const fr = await client.query(
            `
            SELECT field_key, required, sort_order, id, input_role
            FROM gov_signature_template_confirmation_fields
            WHERE template_id = $1
            ORDER BY sort_order ASC, id ASC
            `,
            [t.id],
          )
          if (fr.rowCount === 0) {
            await client.query('ROLLBACK')
            res.status(400).json({
              ok: false,
              message: `확인서 항목이 없는 템플릿은 발송할 수 없습니다. (${tid})`,
            })
            return
          }
          const defs = fr.rows
          /** @type {Map<string, 'sender' | 'customer'>} */
          const roleByFieldKey = new Map()
          for (const def of defs) {
            const fk = String(def.field_key)
            roleByFieldKey.set(fk, normalizeConfirmationFieldInputRole(def.input_role))
          }
          const allowed = new Set(roleByFieldKey.keys())
          for (const k of confFieldParsed.map.keys()) {
            if (!allowed.has(k)) {
              await client.query('ROLLBACK')
              res.status(400).json({
                ok: false,
                message: `확인서 항목에 없는 fieldKey입니다: ${k}`,
              })
              return
            }
            if (roleByFieldKey.get(k) === 'customer') {
              await client.query('ROLLBACK')
              res.status(400).json({
                ok: false,
                message: '고객 입력 항목은 발송 시 값을 입력할 수 없습니다.',
              })
              return
            }
          }
          const rowsToInsert = []
          for (const def of defs) {
            const fk = String(def.field_key)
            const inputRole = normalizeConfirmationFieldInputRole(def.input_role)
            if (inputRole === 'customer') {
              continue
            }
            const rawVal = confFieldParsed.map.has(fk) ? confFieldParsed.map.get(fk) : ''
            const text = rawVal == null ? '' : String(rawVal)
            if (def.required && text.trim() === '') {
              await client.query('ROLLBACK')
              res.status(400).json({
                ok: false,
                message: `필수 확인서 항목「${fk}」값을 입력해 주세요.`,
              })
              return
            }
            rowsToInsert.push({ fieldKey: fk, valueText: text })
          }
          confirmationFieldInsertPlans.push({ rows: rowsToInsert })
          governmentSignatureTemplatesOrdered.push({
            id: t.id,
            title: t.title,
            version: t.version,
            required: 1,
            pdfHash: null,
            pdfTemplateId: null,
          })
        }
      } else {
        for (const { row: t, id: tid } of templateAccs) {
          if (t.pdf_template_id == null) {
            await client.query('ROLLBACK')
            res.status(400).json({
              ok: false,
              message: `템플릿 ${tid}에 PDF 엔진이 연결되어 있지 않아 발송할 수 없습니다.`,
            })
            return
          }
          const senderCheck = await assertSenderFieldValuesFilled(
            client,
            String(t.id),
            Number(t.pdf_template_id),
            senderMaps.get(String(t.id)) ?? {},
          )
          if (!senderCheck.ok) {
            await client.query('ROLLBACK')
            res.status(senderCheck.status ?? 400).json({
              ok: false,
              message: senderCheck.message ?? '발송 전 입력이 올바르지 않습니다.',
            })
            return
          }
          governmentSignatureTemplatesOrdered.push({
            id: t.id,
            title: t.title,
            version: t.version,
            required: 1,
            pdfHash: t.pdf_template_id
              ? createHash('sha256').update(`pdf_tmpl:${t.pdf_template_id}`, 'utf8').digest('hex')
              : null,
            pdfTemplateId: t.pdf_template_id,
          })
        }
      }

      debugCtx.activeTemplateCheckPassed = true

      const sendId = newId(GSS_PREFIX)
      const signToken = await generateUniqueSignToken(client)
      const uid = getAuthUserId(req)
      const nowSql = `NOW()`

      await client.query(
        `
        INSERT INTO gov_signature_send_sessions (
          id, package_id, profile_id, owner_user_id, tenant_id, sign_token, status,
          target_phone_encrypted, target_phone_hash, target_phone_masked,
          sent_by_user_id, sent_at, created_at, updated_at
        )
        VALUES (
          $1, NULL, $2, $3, $4, $5, 'pending',
          $6, $7, $8,
          $9, ${nowSql}, ${nowSql}, ${nowSql}
        )
        `,
        [
          sendId,
          profileId,
          ownerUserId,
          cust.row.tenant_id ?? null,
          signToken,
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

      for (let i = 0; i < governmentSignatureTemplatesOrdered.length; i += 1) {
        const ct = governmentSignatureTemplatesOrdered[i]
        const docId = newId(GSDI_PREFIX)
        await client.query(
          `
          INSERT INTO gov_signature_document_instances (
            id, send_session_id, template_id, template_version, title_snapshot,
            required, sort_order, status, original_pdf_hash, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())
          `,
          [docId, sendId, ct.id, ct.version, ct.title, ct.required, i, ct.pdfHash],
        )
        if (sessionTemplateMode === 'coordinate_pdf') {
          const pdfTm = ct.pdfTemplateId != null ? Number(ct.pdfTemplateId) : NaN
          if (Number.isFinite(pdfTm)) {
            await insertGovSenderPrefillDocumentValues(
              client,
              docId,
              ct.id,
              pdfTm,
              senderMaps.get(String(ct.id)) ?? {},
            )
            await insertFixedPrefillDocumentValues(client, docId, ct.id, pdfTm)
          }
        } else {
          const plan = confirmationFieldInsertPlans[i]
          if (plan?.rows?.length) {
            await insertSendSessionConfirmationFieldValues(client, sendId, String(ct.id), plan.rows)
          }
        }
      }

      if (attParsed.items.length > 0) {
        if (!uid) {
          await client.query('ROLLBACK')
          res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
          return
        }
        await insertSendSessionAttachmentsForSend(client, sendId, profileId, uid, ownerUserId, attParsed.items)
      }

      await client.query('COMMIT')
      res.status(201).json({
        ok: true,
        sendSession: {
          id: sendId,
          signToken,
          profileId,
          status: 'pending',
          maskedPhone: snapshot.target_phone_masked,
          documentCount: governmentSignatureTemplatesOrdered.length,
          createdAt: new Date().toISOString(),
        },
      })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      logGovernmentSignatureSendSessionFailure(debugCtx, e)
      const mapped = mapSendSessionCreateError(e)
      if (mapped) {
        res.status(mapped.status).json({
          ok: false,
          error: 'send_session_create_failed',
          code: mapped.code,
          message: mapped.message,
        })
        return
      }
      if (/** @type {{ code?: string }} */ (e)?.code === '23505') {
        res.status(409).json({
          ok: false,
          error: 'send_session_create_failed',
          code: 'unique_violation',
          message: '이미 존재하는 발송 세션 정보와 충돌했습니다.',
        })
        return
      }
      res.status(500).json({
        ok: false,
        error: 'send_session_create_failed',
        code: 'internal_error',
        message: '발송 세션 생성 중 오류가 발생했습니다.',
      })
    } finally {
      client.release()
    }
  })

  apiRouter.post(
    '/government-support/signatures/attachment-upload',
    ...chain,
    (req, res, next) => {
      uploadContractAttachment.single('file')(req, res, (err) => {
        if (err) {
          const code = /** @type {{ code?: string }} */ (err)?.code
          if (code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ ok: false, message: '첨부 파일이 너무 큽니다. (최대 20MB)' })
            return
          }
          res.status(400).json({ ok: false, message: '파일 업로드 처리 중 오류가 발생했습니다.' })
          return
        }
        next()
      })
    },
    async (req, res) => {
      try {
        const ownerUserId = getAuthUserId(req)
        const uid = getAuthUserId(req)
        if (!uid) {
          res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
          return
        }
        if (ownerUserId == null) {
          res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
          return
        }
        const f = req.file
        if (!f || !f.buffer || f.buffer.length === 0) {
          res.status(400).json({ ok: false, message: '업로드할 파일이 없습니다.' })
          return
        }
        const profileId = Number(req.body?.profileId ?? req.body?.profile_id)
        if (!Number.isInteger(profileId) || profileId < 1) {
          res.status(400).json({ ok: false, message: 'profileId가 올바르지 않습니다.' })
          return
        }
        const cust = await assertCustomerForUserSend(pool, profileId, req)
        if (cust.error) {
          res.status(cust.status ?? 400).json({ ok: false, message: cust.error })
          return
        }
        const mime = String(f.mimetype || '')
          .toLowerCase()
          .split(';')[0]
          .trim()
        if (!CONTRACT_ATTACHMENT_UPLOAD_MIMES.has(mime)) {
          res.status(400).json({
            ok: false,
            message:
              '허용되지 않는 파일 형식입니다. PDF 또는 이미지(jpeg, png, gif, webp)만 올릴 수 있습니다.',
          })
          return
        }
        const displayBase = safeContractAttachmentBaseName(f.originalname || 'attachment')
        const storageKey = `government/signatures/send-attachments/${uid}/${randomUUID()}/${displayBase}`
        try {
          await consentPutObject(storageKey, f.buffer, mime)
        } catch {
          res.status(503).json({ ok: false, message: '파일을 저장소에 올리지 못했습니다.' })
          return
        }
        const contentHash = createHash('sha256').update(f.buffer).digest('hex')
        const gaRow = await pool.query(`SELECT ga_id FROM users WHERE id = $1 LIMIT 1`, [String(uid)])
        const gaId = gaRow.rows[0]?.ga_id
        if (gaId == null) {
          res.status(503).json({ ok: false, message: '파일 저장에 필요한 GA 정보가 없습니다.' })
          return
        }
        const ins = await pool.query(
          `
          INSERT INTO files (
            user_id,
            ga_id,
            owner_user_id,
            profile_id,
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
            status
          )
          VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5, $5, $6, $7, $8, '', true, 'active')
          RETURNING id
          `,
          [String(uid), gaId, ownerUserId, profileId, displayBase, storageKey, f.buffer.length, mime],
        )
        const fileId = String(ins.rows[0].id)
        res.status(201).json({
          ok: true,
          fileId,
          contentHash,
          displayFilename: displayBase,
          mimeType: mime,
          sizeBytes: f.buffer.length,
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get('/government-support/signatures', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const uid = getAuthUserId(req)
      if (!uid) {
        res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
        return
      }
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }

      const qSearch = String(req.query.q ?? '').trim()
      const filterRaw = String(req.query.filter ?? 'all').trim().toLowerCase()
      const sortRaw = String(req.query.sort ?? 'sent_desc').trim().toLowerCase()
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)
      const offset = Math.max(Number(req.query.offset) || 0, 0)

      const baseParams = [uid]
      let searchClause = ''
      if (qSearch) {
        const pattern = `%${escapeIlikePattern(qSearch)}%`
        baseParams.push(pattern)
        const pPat = 2
        searchClause = `
          AND (
            p.customer_name ILIKE $${pPat} ESCAPE '\\'
            OR p.business_name ILIKE $${pPat} ESCAPE '\\'
            OR p.phone ILIKE $${pPat} ESCAPE '\\'
            OR EXISTS (
              SELECT 1 FROM gov_signature_document_instances cdi2
              WHERE cdi2.send_session_id = s.id
                AND cdi2.title_snapshot ILIKE $${pPat} ESCAPE '\\'
            )
          )
        `
      }

      let filterClause = ''
      if (filterRaw === 'in_progress') {
        filterClause = ` AND s.status NOT IN ('completed', 'expired', 'cancelled') `
      } else if (filterRaw === 'completed') {
        filterClause = ` AND s.status = 'completed' `
      } else if (filterRaw === 'expired') {
        filterClause = ` AND s.status = 'expired' `
      } else if (filterRaw === 'cancelled') {
        filterClause = ` AND s.status = 'cancelled' `
      }

      const orderSql =
        sortRaw === 'completed_desc'
          ? 's.completed_at DESC NULLS LAST, s.created_at DESC'
          : 's.created_at DESC'

      const whereRest = `${searchClause}${filterClause}`

      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM gov_signature_send_sessions s
        INNER JOIN gov_support_profiles p ON p.id = s.profile_id
        WHERE s.sent_by_user_id = $1
          AND p.owner_user_id = $1
          ${whereRest}
      `
      const countR = await pool.query(countSql, baseParams)

      const dataParams = [...baseParams, limit, offset]
      const li = baseParams.length + 1
      const oi = baseParams.length + 2

      const dataSql = `
        SELECT
          s.id,
          s.sign_token,
          s.profile_id,
          s.status AS session_status,
          s.target_phone_masked,
          s.sent_at,
          s.created_at,
          s.opened_at,
          s.completed_at,
          s.expired_at,
          COALESCE(NULLIF(TRIM(p.business_name), ''), p.customer_name) AS profile_display_name,
          NULL::text AS customer_code,
          ivs.status AS identity_session_status,
          ivs.otp_verified_at AS identity_verified_at,
          COALESCE(doc_agg.document_count, 0)::int AS document_count,
          COALESCE(doc_agg.required_document_count, 0)::int AS required_document_count,
          COALESCE(doc_agg.completed_document_count, 0)::int AS completed_document_count,
          COALESCE(doc_agg.template_names, '') AS template_names,
          COALESCE(doc_agg.has_signed_pdf_file, false) AS has_signed_pdf_file,
          COALESCE(doc_agg.has_signed_not_completed, false) AS has_signed_not_completed,
          evpfx.evidence_hash_prefix
        FROM gov_signature_send_sessions s
        INNER JOIN gov_support_profiles p ON p.id = s.profile_id
        LEFT JOIN gov_signature_identity_sessions ivs ON ivs.id = s.identity_session_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS document_count,
            COUNT(*) FILTER (WHERE required = 1)::int AS required_document_count,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_document_count,
            BOOL_OR(status = 'completed') AS has_completed_document,
            string_agg(title_snapshot, ' · ' ORDER BY sort_order ASC, created_at ASC) AS template_names,
            BOOL_OR(
              status = 'completed' AND signed_pdf_file_id IS NOT NULL
            ) AS has_signed_pdf_file,
            BOOL_OR(status = 'signed') AS has_signed_not_completed
          FROM gov_signature_document_instances
          WHERE send_session_id = s.id
        ) doc_agg ON true
        LEFT JOIN LATERAL (
          SELECT SUBSTRING(evidence_hash::text FROM 1 FOR 12) AS evidence_hash_prefix
          FROM gov_signature_evidences
          WHERE send_session_id = s.id
            AND evidence_hash IS NOT NULL
            AND TRIM(evidence_hash::text) <> ''
          ORDER BY created_at DESC
          LIMIT 1
        ) evpfx ON true
        WHERE s.sent_by_user_id = $1
          AND p.owner_user_id = $1
          ${whereRest}
        ORDER BY ${orderSql}
        LIMIT $${li} OFFSET $${oi}
      `
      const r = await pool.query(dataSql, dataParams)
      res.json({
        ok: true,
        total: countR.rows[0]?.total ?? 0,
        limit,
        offset,
        sendSessions: r.rows.map((row) => mapSendSessionListRow(row)),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/government-support/signatures/:id/cancel', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const ownerUserId = getAuthUserId(req)
      const uid = getAuthUserId(req)
      if (!uid) {
        res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
        return
      }
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const sid = String(req.params.id ?? '').trim()
      if (!sid) {
        res.status(400).json({ ok: false, message: '발송 세션 id가 필요합니다.' })
        return
      }
      await client.query('BEGIN')
      const lock = await client.query(
        `
        SELECT s.id, s.status
        FROM gov_signature_send_sessions s
        JOIN gov_support_profiles p ON p.id = s.profile_id
        WHERE s.id = $1
          AND s.sent_by_user_id = $2
          AND p.owner_user_id = $2
        FOR UPDATE OF s
        LIMIT 1
        `,
        [sid, uid],
      )
      if (lock.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ ok: false, message: '발송 세션을 찾을 수 없습니다.' })
        return
      }
      const st = String(lock.rows[0].status ?? '')
      if (st === 'cancelled') {
        await client.query('ROLLBACK')
        res.status(409).json({
          ok: false,
          error: 'already_cancelled',
          message: '이미 취소된 전자서명 발송입니다.',
        })
        return
      }
      if (st === 'completed') {
        await client.query('ROLLBACK')
        res.status(409).json({
          ok: false,
          error: 'cannot_cancel_completed_session',
          message: '완료된 전자서명 문서는 취소할 수 없습니다.',
        })
        return
      }
      if (st === 'expired') {
        await client.query('ROLLBACK')
        res.status(409).json({
          ok: false,
          error: 'cannot_cancel_expired_session',
          message: '만료된 전자서명 발송은 취소할 수 없습니다.',
        })
        return
      }
      const docCk = await client.query(
        `
        SELECT EXISTS (
          SELECT 1 FROM gov_signature_document_instances
          WHERE send_session_id = $1 AND status = 'completed'
        ) AS ex
        `,
        [sid],
      )
      if (docCk.rows[0]?.ex) {
        await client.query('ROLLBACK')
        res.status(409).json({
          ok: false,
          error: 'cannot_cancel_completed_session',
          message: '완료된 전자서명 문서는 취소할 수 없습니다.',
        })
        return
      }
      await client.query(
        `
        UPDATE gov_signature_send_sessions
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        `,
        [sid],
      )
      await client.query('COMMIT')
      res.json({
        ok: true,
        status: 'cancelled',
        message: '전자서명 발송이 취소되었습니다.',
      })
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

  apiRouter.get('/government-support/signatures/:id', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const uid = getAuthUserId(req)
      if (!uid) {
        res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
        return
      }
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const r = await pool.query(
        `
        SELECT
          s.*,
          COALESCE(NULLIF(TRIM(p.business_name), ''), p.customer_name) AS profile_display_name,
          NULL::text AS customer_code,
          ivs.status AS ivs_status,
          ivs.otp_verified_at AS ivs_otp_verified_at
        FROM gov_signature_send_sessions s
        JOIN gov_support_profiles p ON p.id = s.profile_id
        LEFT JOIN gov_signature_identity_sessions ivs ON ivs.id = s.identity_session_id
        WHERE s.id = $1
          AND s.sent_by_user_id = $2
          AND p.owner_user_id = $2
        LIMIT 1
        `,
        [req.params.id, uid],
      )
      if (r.rowCount === 0) {
        res.status(404).json({ ok: false, message: '발송 세션을 찾을 수 없습니다.' })
        return
      }
      const row = r.rows[0]
      const docs = await pool.query(
        `
        SELECT
          cdi.id,
          cdi.template_id,
          cdi.template_version,
          cdi.title_snapshot,
          cdi.status,
          cdi.sort_order,
          cdi.original_pdf_hash,
          cdi.signed_pdf_file_id,
          cdi.signed_pdf_hash,
          cdi.created_at,
          cdi.completed_at,
          COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM gov_signature_document_instances cdi
        INNER JOIN gov_signature_templates ct ON ct.id = cdi.template_id
        WHERE cdi.send_session_id = $1
        ORDER BY cdi.sort_order ASC, cdi.created_at ASC
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
          FROM gov_signature_evidences
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
      const sendSessionAttachments = await listSendSessionAttachmentsPublic(pool, row.id)
      res.json({
        ok: true,
        sendSession: {
          ...mapSendSessionDetailRow(row, docs, evidenceByDoc),
          confirmationItems,
          sendSessionAttachments,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get(
    '/government-support/signatures/:sendSessionId/documents/:documentInstanceId/signed-pdf',
    ...chain,
    async (req, res) => {
      try {
        const ownerUserId = getAuthUserId(req)
        const uid = getAuthUserId(req)
        if (!uid) {
          res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
          return
        }
        if (ownerUserId == null) {
          res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
          return
        }
        const sid = String(req.params.sendSessionId ?? '').trim()
        const docId = String(req.params.documentInstanceId ?? '').trim()
        const r = await pool.query(
          `
          SELECT s.id
          FROM gov_signature_send_sessions s
          JOIN gov_support_profiles p ON p.id = s.profile_id
          WHERE s.id = $1
            AND s.sent_by_user_id = $2
            AND p.owner_user_id = $2
          LIMIT 1
          `,
          [sid, uid],
        )
        if (r.rowCount === 0) {
          res.status(404).json({ ok: false, message: '발송 세션을 찾을 수 없습니다.' })
          return
        }
        const d = await pool.query(
          `
          SELECT
            cdi.status,
            cdi.signed_pdf_file_id,
            cdi.title_snapshot,
            COALESCE(NULLIF(TRIM(p.business_name), ''), p.customer_name) AS profile_display_name
          FROM gov_signature_document_instances cdi
          INNER JOIN gov_signature_send_sessions s2 ON s2.id = cdi.send_session_id
          INNER JOIN gov_support_profiles p ON p.id = s2.profile_id
          WHERE cdi.id = $1 AND cdi.send_session_id = $2
          LIMIT 1
          `,
          [docId, sid],
        )
        if (d.rowCount === 0) {
          res.status(404).json({ ok: false, message: '문서를 찾을 수 없습니다.' })
          return
        }
        if (String(d.rows[0].status ?? '') !== 'completed') {
          res.status(403).json({ ok: false, message: '완료된 문서만 다운로드할 수 있습니다.' })
          return
        }
        const fid = d.rows[0].signed_pdf_file_id
        if (fid == null || String(fid).trim() === '') {
          res.status(404).json({ ok: false, message: '최종 PDF 가 아직 준비되지 않았습니다.' })
          return
        }
        const fk = await pool.query(`SELECT file_path FROM files WHERE id = $1 LIMIT 1`, [String(fid).trim()])
        const storageKey = fk.rows[0]?.file_path
        if (!storageKey) {
          res.status(404).json({ ok: false, message: '파일을 찾을 수 없습니다.' })
          return
        }
        let buf
        try {
          buf = await consentGetBuffer(String(storageKey))
        } catch {
          res.status(502).json({ ok: false, message: '파일을 불러오지 못했습니다.' })
          return
        }
        if (!buf || buf.length === 0) {
          res.status(404).json({ ok: false, message: '파일을 찾을 수 없습니다.' })
          return
        }
        const titleSnap = String(d.rows[0].title_snapshot ?? '').trim()
        const custNm = String(d.rows[0].profile_display_name ?? '').trim()
        const dlName = `${safeContractDownloadSegment(titleSnap)}_${safeContractDownloadSegment(custNm)}_완료계약서.pdf`
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', encodeContractEvidenceContentDispositionFilename(dlName))
        res.setHeader('Cache-Control', 'private, no-store')
        res.status(200).send(Buffer.from(buf))
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get('/government-support/signatures/:sendSessionId/evidence.pdf', ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const uid = getAuthUserId(req)
      if (!uid) {
        res.status(401).json({ ok: false, message: '로그인이 필요합니다.' })
        return
      }
      if (ownerUserId == null) {
        res.status(403).json({ ok: false, message: '프로그램 이용자 권한이 필요합니다.' })
        return
      }
      const sid = String(req.params.sendSessionId ?? '').trim()
      const own = await pool.query(
        `
        SELECT s.id
        FROM gov_signature_send_sessions s
        JOIN gov_support_profiles p ON p.id = s.profile_id
        WHERE s.id = $1
          AND s.sent_by_user_id = $2
          AND p.owner_user_id = $2
        LIMIT 1
        `,
        [sid, uid],
      )
      if (own.rowCount === 0) {
        res.status(404).json({ ok: false, message: '발송 세션을 찾을 수 없습니다.' })
        return
      }
      const { buffer, downloadFilename } = await buildSendSessionEvidencePdf({ pool, sendSessionId: sid })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', encodeContractEvidenceContentDispositionFilename(downloadFilename))
      res.setHeader('Cache-Control', 'private, no-store')
      res.status(200).send(buffer)
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'statusCode' in e ? Number(/** @type {{ statusCode?: unknown }} */ (e).statusCode) : NaN
      if (code === 403) {
        res.status(403).json({ ok: false, message: e instanceof Error ? e.message : '완료된 문서만 다운로드할 수 있습니다.' })
        return
      }
      if (code === 404) {
        res.status(404).json({ ok: false, message: e instanceof Error ? e.message : '발송 세션을 찾을 수 없습니다.' })
        return
      }
      if (code === 400) {
        const errCode =
          e && typeof e === 'object' && 'code' in e
            ? String(/** @type {{ code?: unknown }} */ (e).code ?? '')
            : ''
        if (errCode === 'confirmation_only_evidence_not_ready') {
          res.status(400).json({
            ok: false,
            code: 'confirmation_only_evidence_not_ready',
            message: e instanceof Error ? e.message : '증빙 PDF를 아직 제공하지 않습니다.',
          })
          return
        }
        res.status(400).json({ ok: false, message: e instanceof Error ? e.message : '요청이 올바르지 않습니다.' })
        return
      }
      handleDbError(e, req, res)
    }
  })
}
