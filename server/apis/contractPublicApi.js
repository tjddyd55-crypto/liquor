import { createHash, randomUUID } from 'node:crypto'
import { decryptContractTargetPhoneBlob } from '../lib/contractStoredPhone.js'
import { consentGetBuffer, consentPutObject } from '../lib/consentStorage.js'
import { normalizeKrMobile, validateKrMobileDigits } from '../lib/phoneNormalize.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'
import { getTemplateById, listFields } from '../pdf-engine/repository/pdfTemplateRepo.js'
import { getTemplateObject } from '../pdf-engine/storage/pdfTemplateStorage.js'
import { insertSignatureEvidenceRow, loadVerifiedIdentitySession } from '../services/contractEvidenceService.js'
import { normalizeContractFieldStoredValue } from '../services/contractFieldValueNormalize.js'
import { insertConfirmationOnlySignatureEvidenceRow } from '../services/contractConfirmationOnlyEvidence.js'
import { buildConfirmationCertificatePdfBuffer } from '../services/contractConfirmationPdfFromInstance.js'
import { buildStampedPdfBufferFromInstance } from '../services/contractStampedPdfFromInstance.js'
import {
  customerMayPostValuesForField,
  effectiveContractFieldRole,
  loadContractFieldSettingsMap,
} from '../services/contractTemplateFieldSettings.js'
import {
  listConfirmationItemsWithValues,
  upsertConfirmationValuesForComplete,
  validateConfirmationCheckedForComplete,
} from '../services/contractConfirmationItems.js'
import {
  listSendSessionAttachmentsPublic,
  loadSendSessionAttachmentRow,
} from '../services/contractSendAttachments.js'
import { listSendSessionConfirmationFieldValuesForPublic } from '../services/contractSendSessionConfirmationFieldValues.js'

const TERMINAL_SESSION = new Set(['expired', 'cancelled'])
const COMPLETED_SESSION = new Set(['completed'])
const DOC_ACCESS_STATUSES = new Set(['identity_verified', 'signing', 'completed'])

function maskCustomerDisplayName(name) {
  const s = String(name ?? '').trim()
  if (!s) {
    return '고객'
  }
  if (s.length === 1) {
    return `${s}*`
  }
  if (s.length === 2) {
    return `${s[0]}*`
  }
  const mid = Math.min(4, s.length - 2)
  return `${s[0]}${'*'.repeat(mid)}${s[s.length - 1]}`
}

function computeMaskedPhone(row) {
  const enc = String(row.target_phone_encrypted ?? '').trim()
  let digits = null
  if (enc) {
    const d = decryptContractTargetPhoneBlob(enc)
    if (d && validateKrMobileDigits(d) === null) {
      digits = d
    }
  }
  if (!digits) {
    const d = normalizeKrMobile(row.customer_phone_raw)
    if (validateKrMobileDigits(d) === null) {
      digits = d
    }
  }
  const m = String(row.target_phone_masked ?? '').trim()
  if (m) {
    return m
  }
  if (digits) {
    return maskKrMobileForDisplay(digits)
  }
  return null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} sendSessionId
 */
async function loadLatestIdentityStatus(pool, sendSessionId) {
  const r = await pool.query(
    `
    SELECT status
    FROM identity_verification_sessions
    WHERE send_session_id = $1
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `,
    [sendSessionId],
  )
  return r.rows[0] ? String(r.rows[0].status ?? '') : null
}

/**
 * @param {string} sendStatus
 * @param {string | null} identityStatus
 */
function isIdentityVerified(sendStatus, identityStatus) {
  if (DOC_ACCESS_STATUSES.has(sendStatus)) {
    return true
  }
  return identityStatus === 'verified'
}

/**
 * @param {string} sendStatus
 * @param {string | null} identityStatus
 */
function allowsDocumentDetail(sendStatus, identityStatus) {
  if (TERMINAL_SESSION.has(sendStatus)) {
    return false
  }
  if (COMPLETED_SESSION.has(sendStatus)) {
    return true
  }
  return isIdentityVerified(sendStatus, identityStatus)
}

function allowsDocumentMutation(sendStatus, identityStatus) {
  if (TERMINAL_SESSION.has(sendStatus)) {
    return false
  }
  if (sendStatus === 'completed') {
    return false
  }
  return isIdentityVerified(sendStatus, identityStatus)
}

/**
 * @param {{ evidence_hash?: string, signed_at?: Date | string } | null | undefined} ev
 * @param {{ completedAt?: string | null }} [opts]
 */
function buildPublicEvidenceFromRow(ev, opts = {}) {
  if (!ev || ev.evidence_hash == null || String(ev.evidence_hash).trim() === '') {
    return null
  }
  const out = {
    authenticationLabel: '지정 휴대폰 인증',
    evidenceHashPrefix: String(ev.evidence_hash).slice(0, 12),
    signedAt: ev.signed_at ? new Date(ev.signed_at).toISOString() : null,
  }
  if (opts.completedAt) {
    out.completedAt = opts.completedAt
  }
  return out
}

/** @param {import('express').Response} res @param {{ status: number, message: string, evidence?: unknown, code?: string }} err */
function respondPublicMutationError(res, err) {
  const body = { success: false, message: err.message }
  if (typeof err.code === 'string' && err.code.trim()) {
    body.code = err.code.trim()
  }
  if ('evidence' in err) {
    body.data = { evidence: err.evidence }
  }
  res.status(err.status).json(body)
}

const MAX_PUBLIC_TEXT_LEN = 8000
const MAX_PUBLIC_SIGNATURE_BYTES = 2 * 1024 * 1024

function parsePublicSignatureDataUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return null
  }
  const trimmed = input.trim()
  if (!/^data:image\/png/i.test(trimmed)) {
    return null
  }
  const marker = 'base64,'
  const index = trimmed.indexOf(marker)
  if (index < 0) {
    return null
  }
  try {
    const buf = Buffer.from(trimmed.slice(index + marker.length), 'base64')
    if (!buf || buf.length < 32) {
      return null
    }
    return buf
  } catch {
    return null
  }
}

const VERBOSE_PUBLIC_SIGN_LOG =
  process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT

/**
 * @param {Record<string, unknown>} ctx
 * @param {unknown} err
 */
function logPublicSignFailure(ctx, err) {
  const e = err instanceof Error ? err : new Error(String(err))
  const pg = /** @type {{ code?: string, detail?: string, constraint?: string }} */ (err)
  if (VERBOSE_PUBLIC_SIGN_LOG) {
    console.error('[contract public sign]', {
      ...ctx,
      errorName: e.name,
      errorMessage: e.message,
      pgCode: pg.code,
      detail: pg.detail,
      constraint: pg.constraint,
      stack: e.stack,
    })
    return
  }
  console.error('[contract public sign]', {
    ...ctx,
    errorName: e.name,
    errorMessage: e.message,
    pgCode: pg.code,
  })
}

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string } | null}
 */
function mapPublicSignDatabaseError(err) {
  const pg = /** @type {{ code?: string }} */ (err)
  const c = pg?.code
  if (c === '23503') {
    return {
      status: 400,
      code: 'signature_reference_violation',
      message: '서명 저장에 필요한 연관 데이터가 없습니다. 담당자에게 문의해 주세요.',
    }
  }
  if (c === '23502') {
    return {
      status: 500,
      code: 'signature_file_insert_failed',
      message: '전자서명 파일 정보를 저장하지 못했습니다. 관리자에게 문의해 주세요.',
    }
  }
  if (c === '23514') {
    return {
      status: 500,
      code: 'signature_file_constraint_failed',
      message: '전자서명 파일이 서버 정책과 맞지 않습니다. 관리자에게 문의해 주세요.',
    }
  }
  return null
}


function buildSuggestedDefault() {
  return null
}

function publicValueShape(fieldRow, valueRow) {
  if (!valueRow) {
    return null
  }
  const ft = fieldRow.field_type
  if (ft === 'signature') {
    return {
      kind: 'signature',
      signed: rowHasSignatureEvidence(valueRow),
    }
  }
  if (ft === 'checkbox') {
    const t = valueRow.value_text ?? ''
    try {
      const p = JSON.parse(t)
      return { kind: 'checkbox', checked: Array.isArray(p) && p.length > 0 }
    } catch {
      return { kind: 'checkbox', checked: t === 'true' }
    }
  }
  if (ft === 'radio') {
    return { kind: 'radio', value: valueRow.value_text ?? '' }
  }
  const raw = valueRow.value_text ?? ''
  if (raw) {
    const d = normalizeKrMobile(raw)
    if (validateKrMobileDigits(d) === null && d.length >= 10) {
      return { kind: 'text', value: maskKrMobileForDisplay(d) }
    }
  }
  return { kind: 'text', value: raw }
}

function requiredFieldSatisfied(fieldRow, valueRow) {
  if (!fieldRow.required) {
    return true
  }
  const ft = fieldRow.field_type
  if (ft === 'signature') {
    return rowHasSignatureEvidence(valueRow)
  }
  if (!valueRow) {
    return false
  }
  if (ft === 'checkbox') {
    const t = valueRow.value_text ?? ''
    try {
      const p = JSON.parse(t)
      return Array.isArray(p) && p.length > 0
    } catch {
      return t === 'true'
    }
  }
  if (ft === 'radio') {
    return String(valueRow.value_text ?? '').trim().length > 0
  }
  return String(valueRow.value_text ?? '').trim().length > 0
}

async function loadValueRows(db, documentInstanceId) {
  const r = await db.query(
    `
    SELECT field_id, field_key, field_type, value_text, value_file_id, value_hash
    FROM contract_document_values
    WHERE document_instance_id = $1
    `,
    [documentInstanceId],
  )
  return r.rows
}

/**
 * 템플릿 필드와 값 행을 매칭한다. field_id 우선(동일 field_key 중복 시 안전), 다음 field_key.
 * @param {object} templateField
 * @param {Array<object>} valRows
 */
function findValueRowForTemplateField(templateField, valRows) {
  const fid = String(templateField.id)
  const fk = String(templateField.field_key)
  for (const r of valRows) {
    if (String(r.field_id) === fid) {
      return r
    }
  }
  for (const r of valRows) {
    if (String(r.field_key) === fk) {
      return r
    }
  }
  return null
}

function rowHasSignatureEvidence(valueRow) {
  if (!valueRow) {
    return false
  }
  const vf = valueRow.value_file_id
  if (vf != null && String(vf).trim() !== '') {
    return true
  }
  const h = valueRow.value_hash
  if (h != null && String(h).trim() !== '') {
    return true
  }
  return false
}

/**
 * @param {Array<object>} rawFields
 * @param {Array<object>} valRows
 */
function collectMissingRequiredFields(rawFields, valRows, settingsMap) {
  const out = []
  for (const f of rawFields) {
    const fk = String(f.field_key)
    const role = effectiveContractFieldRole(f, settingsMap?.get(fk))
    if (String(f.field_type) === 'signature' && role === 'customer') {
      continue
    }
    if (!f.required) {
      continue
    }
    const vr = findValueRowForTemplateField(f, valRows)
    if (!requiredFieldSatisfied(f, vr)) {
      out.push({
        fieldId: String(f.id),
        fieldKey: fk,
        fieldLabel: String(f.label ?? '').trim() || fk,
        fieldType: String(f.field_type ?? ''),
      })
    }
  }
  return out
}

function fieldMapsFromRows(rawFields) {
  const byId = new Map()
  const byKey = new Map()
  for (const row of rawFields) {
    byId.set(String(row.id), row)
    byKey.set(String(row.field_key), row)
  }
  return { byId, byKey }
}

/**
 * @param {'values' | 'sign' | 'complete'} mutationKind
 */
async function resolveMutationBase(pool, linkCode, documentInstanceId, mutationKind = 'values') {
  const row = await loadSendSessionRow(pool, linkCode)
  if (!row) {
    return { error: { status: 404, message: '유효하지 않은 링크입니다.' } }
  }
  const sendStatus = String(row.status ?? '')
  const idStatus = await loadLatestIdentityStatus(pool, row.id)
  if (TERMINAL_SESSION.has(sendStatus)) {
    const message =
      sendStatus === 'cancelled'
        ? '취소된 전자서명 요청입니다. 담당자에게 문의해주세요.'
        : '만료된 전자서명 링크입니다. 담당자에게 문의해주세요.'
    return {
      error: {
        status: 403,
        message,
        code: sendStatus === 'cancelled' ? 'send_session_cancelled' : 'send_session_expired',
      },
    }
  }
  if (!allowsDocumentMutation(sendStatus, idStatus)) {
    return { error: { status: 403, message: '계약서 수신번호 인증이 필요합니다.' } }
  }
  const docR = await pool.query(
    `SELECT * FROM contract_document_instances WHERE id = $1 AND send_session_id = $2 LIMIT 1`,
    [documentInstanceId, row.id],
  )
  if (!docR.rowCount) {
    return { error: { status: 404, message: '문서를 찾을 수 없습니다.' } }
  }
  const doc = docR.rows[0]
  const tmR = await pool.query(
    `SELECT COALESCE(template_mode, 'coordinate_pdf') AS template_mode FROM contract_templates WHERE id = $1 LIMIT 1`,
    [doc.template_id],
  )
  if (String(tmR.rows[0]?.template_mode ?? 'coordinate_pdf') === 'confirmation_only') {
    /** confirmation_only: complete 는 전용 처리(아래 POST complete). sign 은 전용 경로로 허용. */
  }
  if (String(doc.status ?? '') === 'completed') {
    const evR = await pool.query(
      `
      SELECT evidence_hash, signed_at
      FROM signature_evidences
      WHERE document_instance_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [documentInstanceId],
    )
    return {
      error: {
        status: 409,
        message: '이미 완료된 문서입니다.',
        evidence: buildPublicEvidenceFromRow(evR.rows[0]),
      },
    }
  }
  return { session: row, sendStatus, idStatus, doc }
}

async function upsertDocumentValue(client, documentInstanceId, fieldRow, valueText, valueFileId, valueHash) {
  const fk = String(fieldRow.field_key)
  const ex = await client.query(
    `SELECT id FROM contract_document_values WHERE document_instance_id = $1 AND field_key = $2 LIMIT 1`,
    [documentInstanceId, fk],
  )
  if (ex.rowCount > 0) {
    await client.query(
      `
      UPDATE contract_document_values
      SET
        field_id = $1,
        field_type = $2,
        value_text = $3,
        value_file_id = $4,
        value_hash = $5,
        updated_at = NOW()
      WHERE id = $6
      `,
      [
        String(fieldRow.id),
        String(fieldRow.field_type),
        valueText,
        valueFileId ?? null,
        valueHash ?? null,
        ex.rows[0].id,
      ],
    )
  } else {
    const id = `cdv_${randomUUID()}`
    await client.query(
      `
      INSERT INTO contract_document_values (
        id, document_instance_id, field_id, field_key, field_type,
        value_text, value_file_id, value_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        documentInstanceId,
        String(fieldRow.id),
        fk,
        String(fieldRow.field_type),
        valueText,
        valueFileId ?? null,
        valueHash ?? null,
      ],
    )
  }
}

async function syncDocStatusAfterSign(client, pdfTemplateId, documentInstanceId, contractTemplateId) {
  if (pdfTemplateId == null) {
    return
  }
  const fields = await listFields(client, Number(pdfTemplateId))
  const settingsMap = contractTemplateId
    ? await loadContractFieldSettingsMap(client, String(contractTemplateId))
    : new Map()
  const sigFields = fields.filter(
    (f) =>
      String(f.field_type) === 'signature' &&
      effectiveContractFieldRole(f, settingsMap.get(String(f.field_key))) === 'customer',
  )
  if (sigFields.length === 0) {
    await client.query(`UPDATE contract_document_instances SET status = 'signing', updated_at = NOW() WHERE id = $1`, [
      documentInstanceId,
    ])
    return
  }
  const vals = await client.query(
    `SELECT field_id, value_file_id FROM contract_document_values WHERE document_instance_id = $1`,
    [documentInstanceId],
  )
  const byFid = new Map(vals.rows.map((r) => [String(r.field_id), r]))
  const allSigned = sigFields.every((f) => {
    const v = byFid.get(String(f.id))
    return rowHasSignatureEvidence(v)
  })
  await client.query(
    `UPDATE contract_document_instances SET status = $1, updated_at = NOW() WHERE id = $2`,
    [allSigned ? 'signed' : 'signing', documentInstanceId],
  )
}

async function maybeCompleteSendSession(client, sendSessionId) {
  const q = await client.query(
    `SELECT required, status FROM contract_document_instances WHERE send_session_id = $1`,
    [sendSessionId],
  )
  const requiredRows = q.rows.filter((r) => r.required === 1 || r.required === true)
  const ok =
    requiredRows.length === 0 || requiredRows.every((r) => String(r.status ?? '') === 'completed')
  if (ok) {
    await client.query(
      `
      UPDATE contract_send_sessions
      SET
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND status <> 'expired'
        AND status <> 'cancelled'
      `,
      [sendSessionId],
    )
  }
}

async function loadFileStorageKeyForId(pool, fileId) {
  if (fileId == null || String(fileId).trim() === '') {
    return null
  }
  const r = await pool.query(`SELECT file_path FROM files WHERE id = $1 LIMIT 1`, [String(fileId).trim()])
  const p = r.rows[0]?.file_path
  return p ? String(p) : null
}

async function respondWithPdfFromFileId(pool, res, fileId, opts = {}) {
  const attachmentName =
    opts.attachmentFilename && String(opts.attachmentFilename).trim()
      ? String(opts.attachmentFilename).trim().replace(/[\r\n"]/g, '_').slice(0, 180)
      : null
  const key = await loadFileStorageKeyForId(pool, fileId)
  if (!key) {
    res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' })
    return
  }
  let buf
  try {
    buf = await consentGetBuffer(key)
  } catch {
    res.status(502).json({ success: false, message: '파일을 불러오지 못했습니다.' })
    return
  }
  if (!buf || buf.length === 0) {
    res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' })
    return
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'private, no-store')
  if (attachmentName) {
    const ascii =
      attachmentName
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/"/g, '_')
        .trim()
        .slice(0, 180) || 'document.pdf'
    const star = encodeURIComponent(attachmentName)
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${star}`)
  }
  res.status(200).send(Buffer.from(buf))
}

/**
 * 첨부자료 열람용 — MIME 에 맞춰 inline 스트리밍(storage 키 비노출).
 * @param {import('pg').Pool} pool
 * @param {import('express').Response} res
 * @param {string | number} fileId
 * @param {string} displayFilename
 */
async function streamConsentFileInlineForPublic(pool, res, fileId, displayFilename) {
  const r = await pool.query(
    `
    SELECT file_path, mime_type, original_name, display_name
    FROM files
    WHERE id = $1::bigint
    LIMIT 1
    `,
    [String(fileId).trim()],
  )
  if (!r.rowCount) {
    res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' })
    return
  }
  const row = r.rows[0]
  const key = String(row.file_path ?? '').trim()
  if (!key) {
    res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' })
    return
  }
  let buf
  try {
    buf = await consentGetBuffer(key)
  } catch {
    res.status(502).json({ success: false, message: '파일을 불러오지 못했습니다.' })
    return
  }
  if (!buf || buf.length === 0) {
    res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' })
    return
  }
  const mime = row.mime_type ? String(row.mime_type) : 'application/octet-stream'
  const asciiName = String(displayFilename || row.display_name || row.original_name || 'file')
    .replace(/[\r\n"]/g, '_')
    .slice(0, 180)
  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Disposition', `inline; filename="${asciiName}"`)
  res.status(200).send(Buffer.from(buf))
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   gaId: number,
 *   customerId: number,
 *   docId: string,
 *   sessionId: string,
 *   buf: Buffer,
 * }} p
 */
async function insertFinalSignedPdfFileRow(client, p) {
  const fileSuffix =
    p.storageFileName && String(p.storageFileName).trim()
      ? String(p.storageFileName).trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
      : 'final-signed.pdf'
  const storageKey = `contracts/${p.sessionId}/documents/${p.docId}/${fileSuffix}`
  await consentPutObject(storageKey, p.buf, 'application/pdf')
  const hashHex = createHash('sha256').update(p.buf).digest('hex')
  const display =
    p.displayName && String(p.displayName).trim() ? String(p.displayName).trim() : `contract-final-${p.docId}.pdf`
  const ins = await client.query(
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
      status
    )
    VALUES ($1, $2, $3, NULL, NULL, $4, $4, $5, $6, 'application/pdf', '', true, 'active')
    RETURNING id
    `,
    [p.userId, p.gaId, p.customerId, display, storageKey, p.buf.length],
  )
  return { fileId: String(ins.rows[0].id), hashHex }
}

function fieldRowToPublicDto(row, settingsMap) {
  const fk = String(row.field_key)
  const st = settingsMap?.get(fk)
  const role = effectiveContractFieldRole(row, st)
  const hideFromCustomerInput =
    String(row.field_type) !== 'signature' && (role === 'sender' || role === 'fixed')
  return {
    id: String(row.id),
    fieldKey: fk,
    label: row.label ?? '',
    fieldType: row.field_type,
    required: Boolean(row.required),
    orderIndex: row.order_index,
    placements: row.placements ?? [],
    options: row.options ?? null,
    customerMapping: null,
    inputRole: role,
    hideFromCustomerInput,
    readOnlyCustomerUi: hideFromCustomerInput,
  }
}

const CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY = 'confirmation_signature'
const CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY = '__confirmation_content_ack__'

/**
 * @param {unknown} raw
 * @returns {'sender' | 'customer'}
 */
function normalizeConfirmationOnlyInputRole(raw) {
  return String(raw ?? '').trim() === 'customer' ? 'customer' : 'sender'
}

/**
 * confirmation_only 1단계(내용 확인/입력) 완료 여부 계산.
 * sender 필드가 하나라도 있으면 content ack 필요, customer required는 값 필요.
 * @param {Array<Record<string, unknown>>} rows
 * @param {boolean} contentAck
 */
function computeConfirmationOnlyContentCompletion(rows, contentAck) {
  const hasSenderFields = rows.some((r) => normalizeConfirmationOnlyInputRole(r.input_role) === 'sender')
  const customerRequiredComplete = rows.every((r) => {
    if (normalizeConfirmationOnlyInputRole(r.input_role) !== 'customer') {
      return true
    }
    if (!Boolean(r.required)) {
      return true
    }
    return String(r.value_text ?? '').trim().length > 0
  })
  const senderAckComplete = !hasSenderFields || contentAck
  return {
    hasSenderFields,
    senderAckComplete,
    customerRequiredComplete,
    complete: senderAckComplete && customerRequiredComplete,
  }
}

/**
 * confirmation_only 필드값 + 템플릿 정의(input_role) 결합.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} sendSessionId
 * @param {string} templateId
 */
async function listConfirmationOnlyFieldRowsWithRole(db, sendSessionId, templateId) {
  const rows = await listSendSessionConfirmationFieldValuesForPublic(db, sendSessionId, templateId)
  const roleR = await db.query(
    `
    SELECT field_key, input_role
    FROM contract_template_confirmation_fields
    WHERE template_id = $1
    `,
    [templateId],
  )
  const roleByFieldKey = new Map(
    roleR.rows.map((r) => [String(r.field_key ?? ''), normalizeConfirmationOnlyInputRole(r.input_role)]),
  )
  return rows.map((r) => ({
    ...r,
    input_role: roleByFieldKey.get(String(r.field_key)) ?? 'sender',
  }))
}

/**
 * confirmation_only 서명 전: 필수 고객 확인 체크·필수 첨부 확인.
 * @param {import('pg').Pool} pool
 * @param {string} sendSessionId
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
async function assertConfirmationOnlySignPreconditions(pool, sendSessionId) {
  const items = await listConfirmationItemsWithValues(pool, sendSessionId)
  for (const it of items) {
    if (it.required && !it.checked) {
      return {
        ok: false,
        code: 'required_confirmations_missing',
        message: '필수 확인 항목을 모두 체크한 뒤 서명할 수 있습니다.',
      }
    }
  }
  const attachments = await listSendSessionAttachmentsPublic(pool, sendSessionId)
  for (const a of attachments) {
    if (a.required && !a.confirmed) {
      return {
        ok: false,
        code: 'required_attachments_incomplete',
        message: '필수 첨부자료를 모두 확인한 뒤 서명할 수 있습니다.',
      }
    }
  }
  return { ok: true }
}

/**
 * confirmation_only 전용: sender 내용 확인 체크 + customer required 값 입력 완료 확인.
 * @param {import('pg').Pool} pool
 * @param {string} sendSessionId
 * @param {string} documentInstanceId
 * @param {string} templateId
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
async function assertConfirmationOnlyContentPreconditions(pool, sendSessionId, documentInstanceId, templateId) {
  const rows = await listConfirmationOnlyFieldRowsWithRole(pool, sendSessionId, templateId)
  const ackR = await pool.query(
    `
    SELECT value_text
    FROM contract_document_values
    WHERE document_instance_id = $1 AND field_key = $2
    LIMIT 1
    `,
    [documentInstanceId, CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY],
  )
  const contentAck = String(ackR.rows[0]?.value_text ?? '').trim() === 'true'
  const content = computeConfirmationOnlyContentCompletion(rows, contentAck)
  if (!content.senderAckComplete) {
    return {
      ok: false,
      code: 'confirmation_content_ack_required',
      message: '발송자가 입력한 내용을 확인해야 다음 단계로 진행할 수 있습니다.',
    }
  }
  if (!content.customerRequiredComplete) {
    return {
      ok: false,
      code: 'confirmation_customer_fields_required',
      message: '필수 입력 항목을 모두 작성하고 저장한 뒤 다음 단계로 진행할 수 있습니다.',
    }
  }
  return { ok: true }
}

/**
 * confirmation_only 서명 전 공통 게이트:
 * - sender 내용 확인
 * - customer 필수 입력 저장
 * - 필수 고객 확인 체크
 * - 필수 첨부 확인
 * @param {import('pg').Pool} pool
 * @param {{ sendSessionId: string, documentInstanceId: string, templateId: string }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
async function assertConfirmationOnlyPublicReadyForSign(pool, p) {
  const contentGate = await assertConfirmationOnlyContentPreconditions(
    pool,
    p.sendSessionId,
    p.documentInstanceId,
    p.templateId,
  )
  if (!contentGate.ok) {
    return contentGate
  }
  return assertConfirmationOnlySignPreconditions(pool, p.sendSessionId)
}

/**
 * confirmation_only 최종 완료 전 공통 게이트:
 * sign 게이트 + confirmation_signature 존재.
 * @param {import('pg').Pool} pool
 * @param {{ sendSessionId: string, documentInstanceId: string, templateId: string }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
async function assertConfirmationOnlyPublicReadyForComplete(pool, p) {
  const signGate = await assertConfirmationOnlyPublicReadyForSign(pool, p)
  if (!signGate.ok) {
    return signGate
  }
  const sigPre = await pool.query(
    `
    SELECT value_file_id
    FROM contract_document_values
    WHERE document_instance_id = $1 AND field_key = $2
    LIMIT 1
    `,
    [p.documentInstanceId, CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY],
  )
  if (sigPre.rows[0]?.value_file_id == null || String(sigPre.rows[0].value_file_id).trim() === '') {
    return {
      ok: false,
      code: 'confirmation_only_signature_missing',
      message: '전자서명을 저장한 뒤 최종 완료할 수 있습니다.',
    }
  }
  return { ok: true }
}

const CONFIRMATION_ONLY_VALUES_NOT_APPLICABLE_MESSAGE =
  '전자확인서는 담당자가 입력한 내용을 확인만 하면 됩니다.'
const CONFIRMATION_ONLY_COMPLETE_NOT_READY_MESSAGE =
  '전자확인서 최종 완료는 아직 지원하지 않습니다. 담당자에게 문의해 주세요.'
const CONFIRMATION_ONLY_PDF_NOT_AVAILABLE_MESSAGE = '전자확인서에는 PDF 원본이 없습니다.'

function respondConfirmationOnlyPdfNotAvailable(res) {
  res.status(404).json({
    success: false,
    code: 'confirmation_only_pdf_not_available',
    message: CONFIRMATION_ONLY_PDF_NOT_AVAILABLE_MESSAGE,
  })
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} linkCode
 */
async function loadSendSessionRow(pool, linkCode) {
  const lc = String(linkCode ?? '').trim()
  if (!lc) {
    return null
  }
  const r = await pool.query(
    `
    SELECT
      css.*,
      c.name AS customer_name,
      c.phone AS customer_phone_raw,
      c.user_id AS customer_user_id,
      c.ga_id AS customer_ga_id,
      c.birth_date AS customer_birth_date,
      c.address AS customer_address
    FROM contract_send_sessions css
    INNER JOIN customers c ON c.id = css.customer_id
    WHERE css.link_code = $1
    LIMIT 1
    `,
    [lc],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, handleDbError: Function }} ctx
 */
export function registerContractPublicApi(apiRouter, ctx) {
  const { pool, handleDbError } = ctx

  apiRouter.post('/contracts/public/:linkCode/documents/:documentInstanceId/complete', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const base = await resolveMutationBase(pool, linkCode, docId, 'complete')
      if (base.error) {
        respondPublicMutationError(res, base.error)
        return
      }
      if (req.body?.acknowledgeElectronicContract !== true) {
        res.status(400).json({ success: false, message: '전자계약 확인 진술에 동의해야 합니다.' })
        return
      }
      const rawChecked =
        req.body?.confirmationCheckedItemIds ?? req.body?.confirmation_checked_item_ids
      /** @type {Set<string>} */
      let confirmationCheckedSet = new Set()
      if (rawChecked != null) {
        if (!Array.isArray(rawChecked)) {
          res.status(400).json({
            success: false,
            code: 'invalid_confirmation_payload',
            error: 'invalid_confirmation_payload',
            message: '확인 항목 정보 형식이 올바르지 않습니다.',
          })
          return
        }
        confirmationCheckedSet = new Set(rawChecked.map((x) => String(x).trim()).filter(Boolean))
      }
      const { session } = base
      const docMeta = await pool.query(
        `
        SELECT
          cdi.*,
          ct.pdf_template_id,
          ct.pdf_hash AS contract_template_pdf_hash,
          COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode,
          ct.title AS contract_template_title
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, session.id],
      )
      if (!docMeta.rowCount) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      const dm0 = docMeta.rows[0]
      const templateMode = String(dm0.contract_template_mode ?? 'coordinate_pdf')
      if (templateMode === 'confirmation_only') {
        if (req.body?.finalSubmitAcknowledged !== true) {
          res.status(400).json({
            success: false,
            code: 'final_submit_ack_required',
            error: 'final_submit_ack_required',
            message: '최종 완료에 동의해야 합니다.',
          })
          return
        }
      } else {
        if (req.body?.finalPreviewConfirmed !== true) {
          res.status(400).json({
            success: false,
            code: 'final_preview_required',
            error: 'final_preview_required',
            message: '최종 문서 확인 단계를 완료해야 합니다.',
          })
          return
        }
        if (req.body?.finalSubmitAcknowledged !== true) {
          res.status(400).json({
            success: false,
            code: 'final_submit_ack_required',
            error: 'final_submit_ack_required',
            message: '최종 전송 확인에 동의해야 합니다.',
          })
          return
        }
      }
      const pdfTid = dm0.pdf_template_id
      const contractTemplatePdfHash = dm0.contract_template_pdf_hash ?? null
      const contractTemplateIdStr = String(dm0.template_id)
      const contractTemplateTitle = String(dm0.contract_template_title ?? '').trim() || '—'

      let rawFields = []
      if (templateMode !== 'confirmation_only') {
        if (pdfTid == null) {
          res.status(400).json({ success: false, message: 'PDF 템플릿이 연결되어 있지 않습니다.' })
          return
        }
        rawFields = await listFields(pool, Number(pdfTid))
        const settingsMapPre = await loadContractFieldSettingsMap(pool, contractTemplateIdStr)
        const valRowsPre = await loadValueRows(pool, docId)
        const missingPre = collectMissingRequiredFields(rawFields, valRowsPre, settingsMapPre)
        if (missingPre.length > 0) {
          res.status(400).json({
            success: false,
            code: 'required_fields_missing',
            error: 'required_fields_missing',
            message: '필수 항목을 모두 입력·서명해야 합니다.',
            data: { missingFields: missingPre },
          })
          return
        }
      } else {
        const confirmationOnlyCompleteGate = await assertConfirmationOnlyPublicReadyForComplete(pool, {
          sendSessionId: String(session.id),
          documentInstanceId: docId,
          templateId: contractTemplateIdStr,
        })
        if (!confirmationOnlyCompleteGate.ok) {
          res.status(400).json({
            success: false,
            code: confirmationOnlyCompleteGate.code,
            message: confirmationOnlyCompleteGate.message,
          })
          return
        }
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const lockR = await client.query(
          `SELECT * FROM contract_document_instances WHERE id = $1 AND send_session_id = $2 FOR UPDATE`,
          [docId, session.id],
        )
        if (!lockR.rowCount) {
          await client.query('ROLLBACK')
          res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
          return
        }
        const docLocked = lockR.rows[0]
        if (String(docLocked.status ?? '') === 'completed') {
          if (templateMode === 'confirmation_only' && docLocked.signed_pdf_file_id) {
            await client.query('ROLLBACK')
            const completedAtIsoDup = docLocked.completed_at
              ? new Date(docLocked.completed_at).toISOString()
              : null
            const signedPdfPathDup = `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/signed-pdf`
            res.status(200).json({
              success: true,
              data: {
                status: 'completed',
                completed: true,
                signedPdfDownloadAvailable: true,
                signedPdfDownloadPath: signedPdfPathDup,
                completedAt: completedAtIsoDup ?? undefined,
              },
            })
            return
          }
          const evR0 = await client.query(
            `
            SELECT evidence_hash, signed_at
            FROM signature_evidences
            WHERE document_instance_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [docId],
          )
          await client.query('ROLLBACK')
          respondPublicMutationError(res, {
            status: 409,
            message: '이미 완료된 문서입니다.',
            evidence: buildPublicEvidenceFromRow(evR0.rows[0]),
          })
          return
        }
        const identityRow = await loadVerifiedIdentitySession(client, String(session.id), session.identity_session_id ?? null)
        if (!identityRow) {
          await client.query('ROLLBACK')
          res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
          return
        }
        const confQ = await client.query(
          `
          SELECT id, label, required, sort_order
          FROM contract_confirmation_items
          WHERE send_session_id = $1
          ORDER BY sort_order ASC, id ASC
          `,
          [session.id],
        )
        if (confQ.rows.length > 0) {
          const confVal = validateConfirmationCheckedForComplete(confQ.rows, confirmationCheckedSet)
          if (!confVal.ok) {
            await client.query('ROLLBACK')
            res.status(400).json({
              success: false,
              code: confVal.code,
              error: confVal.code,
              message: confVal.message,
              data:
                confVal.missing && confVal.missing.length > 0
                  ? { missingConfirmations: confVal.missing }
                  : undefined,
            })
            return
          }
        }
        const attMissR = await client.query(
          `
          SELECT id, display_filename
          FROM contract_send_session_attachments
          WHERE send_session_id = $1
            AND required = true
            AND confirmed IS NOT TRUE
          ORDER BY sort_order ASC, id ASC
          `,
          [session.id],
        )
        if (attMissR.rows.length > 0) {
          await client.query('ROLLBACK')
          res.status(400).json({
            success: false,
            code: 'required_attachments_missing',
            error: 'required_attachments_missing',
            message: '필수 첨부자료를 모두 확인해주세요.',
            data: {
              missingAttachments: attMissR.rows.map((r) => ({
                id: String(r.id),
                filename: String(r.display_filename ?? ''),
              })),
            },
          })
          return
        }
        let signedPdfFileId = null
        let signedPdfHashHex = null
        const fileUserId = session.sent_by_user_id || session.customer_user_id
        const gaIdForFile = session.customer_ga_id

        if (templateMode === 'confirmation_only') {
          if (!fileUserId || gaIdForFile == null) {
            await client.query('ROLLBACK')
            res.status(500).json({
              success: false,
              message: '완료 PDF 저장에 필요한 발송/고객 사용자 정보가 없습니다. 담당자에게 문의해 주세요.',
            })
            return
          }
          if (confQ.rows.length > 0) {
            await upsertConfirmationValuesForComplete(
              client,
              String(session.id),
              confirmationCheckedSet,
              confQ.rows,
            )
          }
          const enrichR = await client.query(
            `
            SELECT
              u.display_name AS sender_display_name,
              u.username AS sender_username,
              g.name AS ga_name
            FROM contract_send_sessions s
            LEFT JOIN users u ON u.id = s.sent_by_user_id
            INNER JOIN customers c ON c.id = s.customer_id
            LEFT JOIN ga_companies g ON g.id = c.ga_id
            WHERE s.id = $1
            LIMIT 1
            `,
            [session.id],
          )
          const en = enrichR.rows[0] ?? {}
          const senderLine =
            String(en.sender_display_name ?? '').trim() ||
            String(en.sender_username ?? '').trim() ||
            String(session.sent_by_user_id ?? '').trim() ||
            '—'
          const gaName = String(en.ga_name ?? '').trim() || '—'
          const cfPdfRows = await listConfirmationOnlyFieldRowsWithRole(
            client,
            String(session.id),
            contractTemplateIdStr,
          )
          const coItems = await listConfirmationItemsWithValues(client, String(session.id))
          const coAtts = await listSendSessionAttachmentsPublic(client, String(session.id))
          const sigRowTx = await client.query(
            `
            SELECT value_file_id
            FROM contract_document_values
            WHERE document_instance_id = $1 AND field_key = $2
            LIMIT 1
            `,
            [docId, CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY],
          )
          const sigFid = sigRowTx.rows[0]?.value_file_id
          if (sigFid == null || String(sigFid).trim() === '') {
            await client.query('ROLLBACK')
            res.status(400).json({
              success: false,
              code: 'confirmation_only_signature_missing',
              message: '전자서명을 저장한 뒤 최종 완료할 수 있습니다.',
            })
            return
          }
          const fp = await client.query(`SELECT file_path FROM files WHERE id = $1 LIMIT 1`, [String(sigFid).trim()])
          const sk = fp.rows[0]?.file_path
          if (!sk || String(sk).trim() === '') {
            await client.query('ROLLBACK')
            res.status(400).json({ success: false, message: '서명 파일 정보를 찾을 수 없습니다.' })
            return
          }
          let sigBytes
          try {
            sigBytes = await consentGetBuffer(String(sk))
          } catch {
            await client.query('ROLLBACK')
            res.status(502).json({ success: false, message: '서명 이미지를 불러오지 못했습니다.' })
            return
          }
          const completedAtForPdf = new Date().toISOString()
          let pdfBuf
          try {
            pdfBuf = await buildConfirmationCertificatePdfBuffer({
              documentTitle: String(docLocked.title_snapshot ?? ''),
              contractTemplateTitle,
              completedAtIso: completedAtForPdf,
              linkCode,
              documentInstanceId: docId,
              sendSessionId: String(session.id),
              customerNameMasked: maskCustomerDisplayName(session.customer_name),
              customerPhoneMasked: computeMaskedPhone(session),
              customerAddress: session.customer_address != null ? String(session.customer_address) : null,
              sentAtIso: session.sent_at != null ? new Date(session.sent_at).toISOString() : null,
              openedAtIso: session.opened_at != null ? new Date(session.opened_at).toISOString() : null,
              sessionCreatedAtIso: session.created_at != null ? new Date(session.created_at).toISOString() : null,
              senderLine,
              gaName,
              confirmationFields: cfPdfRows.map((r) => ({
                label: String(r.label ?? ''),
                required: Boolean(r.required),
                valueText: String(r.value_text ?? ''),
              })),
              confirmationItems: coItems.map((c) => ({
                label: String(c.label ?? ''),
                required: Boolean(c.required),
                checked: Boolean(c.checked),
              })),
              attachments: coAtts.map((a) => ({
                displayFilename: String(a.displayFilename ?? a.id ?? ''),
                required: Boolean(a.required),
                confirmed: Boolean(a.confirmed),
              })),
              signaturePngBytes: Buffer.from(sigBytes),
            })
          } catch (pdfErr) {
            await client.query('ROLLBACK')
            if (process.env.NODE_ENV !== 'production') {
              console.error('[contract public complete] confirmation certificate pdf', {
                documentInstanceId: docId,
                err: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
              })
            } else {
              console.error('[contract public complete] confirmation certificate pdf failed')
            }
            res.status(502).json({
              success: false,
              message: '완료 확인서 PDF를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            })
            return
          }
          try {
            const insPdf = await insertFinalSignedPdfFileRow(client, {
              userId: fileUserId,
              gaId: Number(gaIdForFile),
              customerId: Number(session.customer_id),
              docId,
              sessionId: String(session.id),
              buf: pdfBuf,
              storageFileName: 'confirmation-certificate.pdf',
              displayName: `electronic-confirmation-complete-${docId}.pdf`,
            })
            signedPdfFileId = insPdf.fileId
            signedPdfHashHex = insPdf.hashHex
          } catch (fileErr) {
            await client.query('ROLLBACK')
            if (process.env.NODE_ENV !== 'production') {
              console.error('[contract public complete] confirmation pdf file insert', {
                documentInstanceId: docId,
                err: fileErr instanceof Error ? fileErr.message : String(fileErr),
              })
            } else {
              console.error('[contract public complete] confirmation pdf file insert failed')
            }
            res.status(502).json({
              success: false,
              message: '완료 확인서 PDF를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            })
            return
          }
          if (signedPdfFileId == null) {
            await client.query('ROLLBACK')
            res.status(502).json({
              success: false,
              message: '완료 확인서 PDF 저장에 실패했습니다.',
            })
            return
          }
          const valRowsConfirmation = await loadValueRows(client, docId)
          try {
            await insertConfirmationOnlySignatureEvidenceRow(client, req, {
              sendSession: session,
              documentInstance: docLocked,
              identityRow,
              contractTemplateTitle,
              confirmationFieldRows: cfPdfRows,
              documentValueRows: valRowsConfirmation,
              signedPdfFileId,
              signedPdfHash: signedPdfHashHex,
            })
          } catch (insErr) {
            if (insErr && insErr.code === '23505') {
              const evDup = await client.query(
                `
                SELECT evidence_hash, signed_at
                FROM signature_evidences
                WHERE document_instance_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [docId],
              )
              await client.query('ROLLBACK')
              respondPublicMutationError(res, {
                status: 409,
                message: '이미 완료된 문서입니다.',
                evidence: buildPublicEvidenceFromRow(evDup.rows[0]),
              })
              return
            }
            throw insErr
          }
        } else {
          const valRows = await loadValueRows(client, docId)
          const settingsMapTx = await loadContractFieldSettingsMap(client, contractTemplateIdStr)
          const missing = collectMissingRequiredFields(rawFields, valRows, settingsMapTx)
          if (missing.length > 0) {
            await client.query('ROLLBACK')
            res.status(400).json({
              success: false,
              code: 'required_fields_missing',
              error: 'required_fields_missing',
              message: '필수 항목을 모두 입력·서명해야 합니다.',
              data: { missingFields: missing },
            })
            return
          }
          if (fileUserId && gaIdForFile != null) {
            try {
              const stamped = await buildStampedPdfBufferFromInstance(client, pdfTid, valRows, {
                contractTemplateId: contractTemplateIdStr,
              })
              const insPdf = await insertFinalSignedPdfFileRow(client, {
                userId: fileUserId,
                gaId: Number(gaIdForFile),
                customerId: Number(session.customer_id),
                docId,
                sessionId: String(session.id),
                buf: stamped,
              })
              signedPdfFileId = insPdf.fileId
              signedPdfHashHex = insPdf.hashHex
            } catch (pdfErr) {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[contract public complete] final pdf error', {
                  documentInstanceId: docId,
                  err: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
                })
              } else {
                console.error('[contract public complete] final pdf error')
              }
            }
          }
          if (confQ.rows.length > 0) {
            await upsertConfirmationValuesForComplete(
              client,
              String(session.id),
              confirmationCheckedSet,
              confQ.rows,
            )
          }
          try {
            await insertSignatureEvidenceRow(client, req, {
              sendSession: session,
              documentInstance: docLocked,
              contractTemplate: { pdf_hash: contractTemplatePdfHash },
              pdfTemplateId: Number(pdfTid),
              valueRows: valRows,
              identityRow,
              signedPdfFileId,
              signedPdfHash: signedPdfHashHex,
            })
          } catch (insErr) {
            if (insErr && insErr.code === '23505') {
              const evDup = await client.query(
                `
                SELECT evidence_hash, signed_at
                FROM signature_evidences
                WHERE document_instance_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [docId],
              )
              await client.query('ROLLBACK')
              respondPublicMutationError(res, {
                status: 409,
                message: '이미 완료된 문서입니다.',
                evidence: buildPublicEvidenceFromRow(evDup.rows[0]),
              })
              return
            }
            throw insErr
          }
        }
        const completedRes = await client.query(
          `
          UPDATE contract_document_instances
          SET
            status = 'completed',
            completed_at = NOW(),
            signed_pdf_file_id = COALESCE($2, signed_pdf_file_id),
            signed_pdf_hash = COALESCE($3, signed_pdf_hash),
            updated_at = NOW()
          WHERE id = $1
          RETURNING completed_at
          `,
          [docId, signedPdfFileId, signedPdfHashHex],
        )
        const completedAtIso = completedRes.rows[0]?.completed_at
          ? new Date(completedRes.rows[0].completed_at).toISOString()
          : null
        await client.query(
          `
          UPDATE contract_send_sessions
          SET
            status = CASE WHEN status = 'identity_verified' THEN 'signing' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [session.id],
        )
        await maybeCompleteSendSession(client, session.id)
        const evRow = await client.query(
          `
          SELECT evidence_hash, signed_at
          FROM signature_evidences
          WHERE document_instance_id = $1
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [docId],
        )
        const evidenceSummary = buildPublicEvidenceFromRow(evRow.rows[0], {
          completedAt: completedAtIso,
        })
        const signedPdfPath =
          signedPdfFileId != null
            ? `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/signed-pdf`
            : null
        await client.query('COMMIT')
        res.status(200).json({
          success: true,
          data: {
            status: 'completed',
            completed: true,
            evidenceSummary: evidenceSummary ?? undefined,
            signedPdfDownloadAvailable: Boolean(signedPdfFileId),
            signedPdfDownloadPath: signedPdfPath ?? undefined,
            completedAt: completedAtIso ?? undefined,
          },
        })
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        const sc =
          e && typeof e === 'object' && 'statusCode' in e ? Number(/** @type {{ statusCode?: unknown }} */ (e).statusCode) : NaN
        if (Number.isFinite(sc) && sc >= 400 && sc < 500) {
          const msg = e instanceof Error ? e.message : '요청을 처리할 수 없습니다.'
          const codeRaw =
            e && typeof e === 'object' && 'code' in e ? /** @type {{ code?: unknown }} */ (e).code : undefined
          const code = typeof codeRaw === 'string' && codeRaw.trim() ? codeRaw.trim() : undefined
          res.status(sc).json({
            success: false,
            message: msg,
            ...(code ? { code } : {}),
          })
          return
        }
        handleDbError(e, req, res)
        return
      } finally {
        client.release()
      }
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents/:documentInstanceId/confirmation-signature', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docR = await pool.query(
        `
        SELECT cdi.id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, row.id],
      )
      if (!docR.rowCount) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      if (String(docR.rows[0].contract_template_mode ?? 'coordinate_pdf') !== 'confirmation_only') {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      const valR = await pool.query(
        `
        SELECT value_file_id
        FROM contract_document_values
        WHERE document_instance_id = $1 AND field_key = $2
        LIMIT 1
        `,
        [docId, CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY],
      )
      const fid = valR.rows[0]?.value_file_id
      if (fid == null || String(fid).trim() === '') {
        res.status(404).json({ success: false, message: '저장된 서명이 없습니다.' })
        return
      }
      await streamConsentFileInlineForPublic(pool, res, fid, 'confirmation-signature.png')
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/contracts/public/:linkCode/documents/:documentInstanceId/sign', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const base = await resolveMutationBase(pool, linkCode, docId, 'sign')
      if (base.error) {
        respondPublicMutationError(res, base.error)
        return
      }
      if (req.body?.electronicSignAcknowledged !== true) {
        res.status(400).json({
          success: false,
          code: 'missing_signature_acknowledgement',
          message: '전자서명 진술에 동의해야 합니다.',
        })
        return
      }
      const buf = parsePublicSignatureDataUrl(req.body?.signatureImageData ?? req.body?.signatureDataUrl)
      if (!buf) {
        res.status(400).json({
          success: false,
          code: 'invalid_signature_payload',
          message: '유효한 PNG 서명 이미지가 필요합니다.',
        })
        return
      }
      if (buf.length > MAX_PUBLIC_SIGNATURE_BYTES) {
        res.status(400).json({ success: false, message: '서명 이미지 용량이 너무 큽니다.' })
        return
      }
      const { session } = base
      const docMeta = await pool.query(
        `
        SELECT cdi.*, ct.pdf_template_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, session.id],
      )
      if (!docMeta.rowCount) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      const contractTemplateModeSign = String(docMeta.rows[0].contract_template_mode ?? 'coordinate_pdf')

      if (contractTemplateModeSign === 'confirmation_only') {
        const signGate = await assertConfirmationOnlyPublicReadyForSign(pool, {
          sendSessionId: String(session.id),
          documentInstanceId: docId,
          templateId: String(docMeta.rows[0].template_id),
        })
        if (!signGate.ok) {
          res.status(400).json({ success: false, code: signGate.code, message: signGate.message })
          return
        }
        const rawFid = req.body?.fieldId
        if (
          rawFid != null &&
          String(rawFid).trim() !== '' &&
          String(rawFid).trim() !== CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY
        ) {
          res.status(400).json({
            success: false,
            code: 'invalid_signature_field',
            message: '유효하지 않은 서명 필드입니다.',
          })
          return
        }
        const fileUserIdCo = session.sent_by_user_id || session.customer_user_id
        const gaIdCo = session.customer_ga_id
        if (!fileUserIdCo || gaIdCo == null) {
          res.status(503).json({
            success: false,
            code: 'signature_file_owner_missing',
            message: '파일 저장에 필요한 담당·GA 정보가 없습니다.',
          })
          return
        }
        const storageKeyCo = `contracts/${session.id}/documents/${docId}/signature/${CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY}.png`
        const hashHexCo = createHash('sha256').update(buf).digest('hex')
        const syntheticField = {
          id: CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY,
          field_key: CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY,
          field_type: 'signature',
        }
        const signLogCtxCo = {
          route: 'contract public sign confirmation_only',
          linkCodePrefix: linkCode.length > 8 ? `${linkCode.slice(0, 8)}…` : linkCode,
          documentInstanceId: docId,
          sendSessionId: session.id,
          customerId: session.customer_id,
          gaId: gaIdCo,
          fieldKey: CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY,
          hasSignatureImageData: true,
          signatureByteLength: buf.length,
        }
        try {
          await consentPutObject(storageKeyCo, buf, 'image/png')
        } catch (e) {
          logPublicSignFailure({ ...signLogCtxCo, uploadStage: 'object_storage' }, e)
          res.status(503).json({
            success: false,
            code: 'signature_upload_failed',
            message: '서명 이미지를 저장소에 올리지 못했습니다. 잠시 후 다시 시도해 주세요.',
          })
          return
        }
        let outFileIdCo = ''
        const clientCo = await pool.connect()
        try {
          await clientCo.query('BEGIN')
          const insCo = await clientCo.query(
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
            status
          )
          VALUES ($1, $2, $3, NULL, NULL, $4, $4, $5, $6, 'image/png', '', true, 'active')
          RETURNING id
          `,
            [
              fileUserIdCo,
              gaIdCo,
              session.customer_id,
              `contract-signature-${CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY}.png`,
              storageKeyCo,
              buf.length,
            ],
          )
          outFileIdCo = String(insCo.rows[0].id)
          await upsertDocumentValue(clientCo, docId, syntheticField, null, outFileIdCo, hashHexCo)
          await clientCo.query(
            `UPDATE contract_document_instances SET status = 'signed', updated_at = NOW() WHERE id = $1`,
            [docId],
          )
          await clientCo.query(
            `
          UPDATE contract_send_sessions
          SET
            status = CASE WHEN status = 'identity_verified' THEN 'signing' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'identity_verified'
          `,
            [session.id],
          )
          await clientCo.query('COMMIT')
        } catch (e) {
          await clientCo.query('ROLLBACK').catch(() => {})
          logPublicSignFailure({ ...signLogCtxCo, uploadStage: 'database' }, e)
          const mapped = mapPublicSignDatabaseError(e)
          if (mapped) {
            res.status(mapped.status).json({
              success: false,
              code: mapped.code,
              message: mapped.message,
            })
            return
          }
          res.status(500).json({
            success: false,
            code: 'signature_save_failed',
            message: '전자서명 저장 중 오류가 발생했습니다. 다시 시도해 주세요.',
          })
          return
        } finally {
          clientCo.release()
        }
        res.status(200).json({
          success: true,
          data: {
            fieldId: CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY,
            valueHash: hashHexCo,
            fileId: outFileIdCo,
          },
        })
        return
      }

      const contractTemplateIdSign = String(docMeta.rows[0].template_id)
      const settingsMapSign = await loadContractFieldSettingsMap(pool, contractTemplateIdSign)
      const pdfTid = docMeta.rows[0]?.pdf_template_id
      if (pdfTid == null) {
        res.status(400).json({ success: false, message: 'PDF 템플릿이 연결되어 있지 않습니다.' })
        return
      }
      const rawFields = await listFields(pool, Number(pdfTid))
      const sigFields = rawFields.filter(
        (f) =>
          String(f.field_type) === 'signature' &&
          effectiveContractFieldRole(f, settingsMapSign.get(String(f.field_key))) === 'customer',
      )
      if (sigFields.length === 0) {
        res.status(400).json({ success: false, message: '이 문서에 서명 필드가 없습니다.' })
        return
      }
      let targetField = null
      const rawFid = req.body?.fieldId
      if (rawFid != null && String(rawFid).trim() !== '') {
        targetField = sigFields.find((f) => String(f.id) === String(rawFid))
        if (!targetField) {
          res.status(400).json({
            success: false,
            code: 'invalid_signature_field',
            message: '유효하지 않은 서명 필드입니다.',
          })
          return
        }
      } else if (sigFields.length === 1) {
        targetField = sigFields[0]
      } else {
        res.status(400).json({ success: false, message: '서명 필드가 여러 개일 때 fieldId 가 필요합니다.' })
        return
      }
      const fileUserId = session.sent_by_user_id || session.customer_user_id
      const gaId = session.customer_ga_id
      if (!fileUserId || gaId == null) {
        res.status(503).json({
          success: false,
          code: 'signature_file_owner_missing',
          message: '파일 저장에 필요한 담당·GA 정보가 없습니다.',
        })
        return
      }
      const storageKey = `contracts/${session.id}/documents/${docId}/signature/${targetField.id}.png`
      const hashHex = createHash('sha256').update(buf).digest('hex')
      const signLogCtx = {
        route: 'contract public sign',
        linkCodePrefix: linkCode.length > 8 ? `${linkCode.slice(0, 8)}…` : linkCode,
        documentInstanceId: docId,
        sendSessionId: session.id,
        customerId: session.customer_id,
        gaId,
        fieldId: String(targetField.id),
        hasSignatureImageData: true,
        signatureByteLength: buf.length,
      }
      try {
        await consentPutObject(storageKey, buf, 'image/png')
      } catch (e) {
        logPublicSignFailure({ ...signLogCtx, uploadStage: 'object_storage' }, e)
        res.status(503).json({
          success: false,
          code: 'signature_upload_failed',
          message: '서명 이미지를 저장소에 올리지 못했습니다. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
      let outFileId = ''
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const ins = await client.query(
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
            status
          )
          VALUES ($1, $2, $3, NULL, NULL, $4, $4, $5, $6, 'image/png', '', true, 'active')
          RETURNING id
          `,
          [
            fileUserId,
            gaId,
            session.customer_id,
            `contract-signature-${targetField.id}.png`,
            storageKey,
            buf.length,
          ],
        )
        outFileId = String(ins.rows[0].id)
        await upsertDocumentValue(client, docId, targetField, null, outFileId, hashHex)
        await syncDocStatusAfterSign(client, pdfTid, docId, contractTemplateIdSign)
        await client.query(
          `
          UPDATE contract_send_sessions
          SET
            status = CASE WHEN status = 'identity_verified' THEN 'signing' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'identity_verified'
          `,
          [session.id],
        )
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        logPublicSignFailure({ ...signLogCtx, uploadStage: 'database' }, e)
        const mapped = mapPublicSignDatabaseError(e)
        if (mapped) {
          res.status(mapped.status).json({
            success: false,
            code: mapped.code,
            message: mapped.message,
          })
          return
        }
        res.status(500).json({
          success: false,
          code: 'signature_save_failed',
          message: '전자서명 저장 중 오류가 발생했습니다. 다시 시도해 주세요.',
        })
        return
      } finally {
        client.release()
      }
      res.status(200).json({
        success: true,
        data: {
          fieldId: String(targetField.id),
          valueHash: hashHex,
          fileId: outFileId,
        },
      })
    } catch (e) {
      logPublicSignFailure(
        {
          route: 'contract public sign',
          linkCodePrefix: String(req.params.linkCode ?? '').trim().slice(0, 8),
          documentInstanceId: String(req.params.documentInstanceId ?? '').trim(),
        },
        e,
      )
      res.status(500).json({
        success: false,
        code: 'signature_save_failed',
        message: '전자서명 저장 중 오류가 발생했습니다. 다시 시도해 주세요.',
      })
    }
  })

  apiRouter.post('/contracts/public/:linkCode/documents/:documentInstanceId/values', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const base = await resolveMutationBase(pool, linkCode, docId, 'values')
      if (base.error) {
        respondPublicMutationError(res, base.error)
        return
      }
      const { session } = base
      const bodyVals = req.body?.values
      if (!Array.isArray(bodyVals)) {
        res.status(400).json({ success: false, message: 'values 배열이 필요합니다.' })
        return
      }
      const docMeta = await pool.query(
        `
        SELECT cdi.*, ct.pdf_template_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, session.id],
      )
      if (!docMeta.rowCount) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      const contractTemplateMode = String(docMeta.rows[0].contract_template_mode ?? 'coordinate_pdf')

      if (contractTemplateMode === 'confirmation_only') {
        if (Array.isArray(bodyVals) && bodyVals.length > 0) {
          res.status(409).json({
            success: false,
            code: 'confirmation_only_field_values_not_applicable',
            message: CONFIRMATION_ONLY_VALUES_NOT_APPLICABLE_MESSAGE,
          })
          return
        }
        const confirmationFieldValuesRaw =
          req.body?.confirmationFieldValues ?? req.body?.confirmation_field_values ?? null
        let confirmationFieldInputMap = new Map()
        if (confirmationFieldValuesRaw != null) {
          if (
            typeof confirmationFieldValuesRaw !== 'object' ||
            Array.isArray(confirmationFieldValuesRaw)
          ) {
            res.status(400).json({
              success: false,
              code: 'invalid_confirmation_payload',
              message: 'confirmationFieldValues 형식이 올바르지 않습니다.',
            })
            return
          }
          confirmationFieldInputMap = new Map(
            Object.entries(confirmationFieldValuesRaw).map(([k, v]) => [String(k).trim(), v == null ? '' : String(v)]),
          )
          for (const k of confirmationFieldInputMap.keys()) {
            if (!k) {
              confirmationFieldInputMap.delete(k)
            }
          }
        }
        const hasAckInBody =
          Object.prototype.hasOwnProperty.call(req.body ?? {}, 'confirmationContentAcknowledged') ||
          Object.prototype.hasOwnProperty.call(req.body ?? {}, 'confirmation_content_acknowledged')
        const confirmationContentAckRaw =
          req.body?.confirmationContentAcknowledged ?? req.body?.confirmation_content_acknowledged
        const confirmationContentAck = confirmationContentAckRaw === true
        const existingAckR = await pool.query(
          `
          SELECT value_text
          FROM contract_document_values
          WHERE document_instance_id = $1 AND field_key = $2
          LIMIT 1
          `,
          [docId, CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY],
        )
        const existingContentAck = String(existingAckR.rows[0]?.value_text ?? '').trim() === 'true'
        const rawChecked = req.body?.confirmationCheckedItemIds ?? req.body?.confirmation_checked_item_ids
        if (rawChecked != null && !Array.isArray(rawChecked)) {
          res.status(400).json({
            success: false,
            code: 'invalid_confirmation_payload',
            message: 'confirmationCheckedItemIds 형식이 올바르지 않습니다.',
          })
          return
        }
        const hasCheckedItemsInBody = Array.isArray(rawChecked)
        const confirmationCheckedSet = new Set(
          (hasCheckedItemsInBody ? rawChecked : []).map((x) => String(x).trim()).filter(Boolean),
        )
        const confirmationFieldRows = await listConfirmationOnlyFieldRowsWithRole(
          pool,
          String(session.id),
          String(docMeta.rows[0].template_id),
        )
        const allowedFieldKeys = new Set(confirmationFieldRows.map((r) => String(r.field_key)))
        const existingCustomerValues = new Map()
        for (const r of confirmationFieldRows) {
          if (normalizeConfirmationOnlyInputRole(r.input_role) !== 'customer') {
            continue
          }
          existingCustomerValues.set(String(r.field_key), String(r.value_text ?? ''))
        }
        for (const k of confirmationFieldInputMap.keys()) {
          if (!allowedFieldKeys.has(k)) {
            res.status(400).json({
              success: false,
              code: 'invalid_confirmation_field_key',
              message: `확인서 항목에 없는 fieldKey입니다: ${k}`,
            })
            return
          }
          const def = confirmationFieldRows.find((r) => String(r.field_key) === k)
          if (def && normalizeConfirmationOnlyInputRole(def.input_role) !== 'customer') {
            res.status(400).json({
              success: false,
              code: 'confirmation_sender_field_not_editable',
              message: '발송자 입력 항목은 고객이 수정할 수 없습니다.',
            })
            return
          }
        }
        for (const [k, v] of confirmationFieldInputMap.entries()) {
          existingCustomerValues.set(k, String(v ?? ''))
        }
        for (const def of confirmationFieldRows) {
          if (normalizeConfirmationOnlyInputRole(def.input_role) !== 'customer') {
            continue
          }
          if (!Boolean(def.required)) {
            continue
          }
          const valueText = String(existingCustomerValues.get(String(def.field_key)) ?? '')
          if (valueText.trim() === '') {
            res.status(400).json({
              success: false,
              code: 'confirmation_customer_fields_required',
              message: `필수 확인서 항목「${String(def.label ?? def.field_key)}」값을 입력해 주세요.`,
            })
            return
          }
        }
        const confQ = await pool.query(
          `
          SELECT id, label, required
          FROM contract_confirmation_items
          WHERE send_session_id = $1
          ORDER BY sort_order ASC, id ASC
          `,
          [session.id],
        )
        if (hasCheckedItemsInBody) {
          const allowed = new Set(confQ.rows.map((x) => String(x.id)))
          for (const cid of confirmationCheckedSet) {
            if (!allowed.has(cid)) {
              res.status(400).json({
                success: false,
                code: 'invalid_confirmation_selection',
                message: '선택한 확인 항목이 유효하지 않습니다.',
              })
              return
            }
          }
        }
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          if (confirmationFieldInputMap.size > 0) {
            for (const [fieldKey, valueText] of confirmationFieldInputMap.entries()) {
              const ex = await client.query(
                `
                SELECT id
                FROM contract_send_session_confirmation_field_values
                WHERE send_session_id = $1 AND template_id = $2 AND field_key = $3
                LIMIT 1
                `,
                [String(session.id), String(docMeta.rows[0].template_id), fieldKey],
              )
              if (ex.rowCount > 0) {
                await client.query(
                  `
                  UPDATE contract_send_session_confirmation_field_values
                  SET value_text = $1, updated_at = NOW()
                  WHERE id = $2
                  `,
                  [String(valueText ?? ''), String(ex.rows[0].id)],
                )
              } else {
                await client.query(
                  `
                  INSERT INTO contract_send_session_confirmation_field_values (
                    id, send_session_id, template_id, field_key, value_text, created_at, updated_at
                  )
                  VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                  `,
                  [
                    `csscfv_${randomUUID()}`,
                    String(session.id),
                    String(docMeta.rows[0].template_id),
                    fieldKey,
                    String(valueText ?? ''),
                  ],
                )
              }
            }
          }
          if (hasAckInBody) {
            await upsertDocumentValue(
              client,
              docId,
              {
                id: CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY,
                field_key: CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY,
                field_type: 'checkbox',
              },
              confirmationContentAck ? 'true' : 'false',
              null,
              null,
            )
          }
          if (hasCheckedItemsInBody) {
            await upsertConfirmationValuesForComplete(client, session.id, confirmationCheckedSet, confQ.rows)
          }
          await client.query(
            `
            UPDATE contract_document_instances
            SET
              status = CASE WHEN status IN ('pending', 'viewed') THEN 'signing' ELSE status END,
              updated_at = NOW()
            WHERE id = $1
            `,
            [docId],
          )
          await client.query(
            `
            UPDATE contract_send_sessions
            SET
              status = CASE WHEN status = 'identity_verified' THEN 'signing' ELSE status END,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'identity_verified'
            `,
            [session.id],
          )
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK')
          handleDbError(err, req, res)
          return
        } finally {
          client.release()
        }
        const persistedAck = hasAckInBody ? confirmationContentAck : existingContentAck
        res.status(200).json({
          success: true,
          data: { saved: true, confirmationContentAcknowledged: persistedAck },
        })
        return
      }

      const pdfTid = docMeta.rows[0]?.pdf_template_id
      if (pdfTid == null) {
        res.status(400).json({ success: false, message: 'PDF 템플릿이 없어 값을 저장할 수 없습니다.' })
        return
      }
      const rawFields = await listFields(pool, Number(pdfTid))
      const contractTemplateIdForValues = String(docMeta.rows[0].template_id)
      const { byId } = fieldMapsFromRows(rawFields)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const settingsMapPost = await loadContractFieldSettingsMap(client, contractTemplateIdForValues)
        for (const item of bodyVals) {
          const fid = item?.fieldId != null ? String(item.fieldId) : ''
          const fkey = item?.fieldKey != null ? String(item.fieldKey).trim() : ''
          const fieldRow = byId.get(fid)
          if (!fieldRow) {
            throw Object.assign(new Error('템플릿에 없는 fieldId 입니다.'), { statusCode: 400 })
          }
          if (!fkey || String(fieldRow.field_key) !== fkey) {
            throw Object.assign(new Error('fieldKey가 해당 필드와 일치하지 않습니다.'), { statusCode: 400 })
          }
          const role = effectiveContractFieldRole(fieldRow, settingsMapPost.get(String(fieldRow.field_key)))
          if (!customerMayPostValuesForField(role, String(fieldRow.field_type))) {
            throw Object.assign(new Error('고객이 수정할 수 없는 필드입니다.'), { statusCode: 400 })
          }
          const normalized = normalizeContractFieldStoredValue(fieldRow, item?.value)
          if (!normalized.ok) {
            throw Object.assign(new Error(normalized.message || '값이 올바르지 않습니다.'), { statusCode: 400 })
          }
          await upsertDocumentValue(client, docId, fieldRow, normalized.valueText, null, null)
        }
        await client.query(
          `
          UPDATE contract_document_instances
          SET
            status = CASE WHEN status IN ('pending', 'viewed') THEN 'signing' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [docId],
        )
        await client.query(
          `
          UPDATE contract_send_sessions
          SET
            status = CASE WHEN status = 'identity_verified' THEN 'signing' ELSE status END,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'identity_verified'
          `,
          [session.id],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        const code = err.statusCode
        if (code >= 400 && code < 500) {
          res.status(code).json({ success: false, message: err.message || '요청이 올바르지 않습니다.' })
          return
        }
        handleDbError(err, req, res)
        return
      } finally {
        client.release()
      }
      res.status(200).json({ success: true, data: { saved: true } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents/:documentInstanceId/pdf', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docR = await pool.query(
        `
        SELECT cdi.id, cdi.template_id, ct.pdf_template_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, row.id],
      )
      if (docR.rowCount === 0) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      if (String(docR.rows[0].contract_template_mode ?? 'coordinate_pdf') === 'confirmation_only') {
        respondConfirmationOnlyPdfNotAvailable(res)
        return
      }
      const pdfTid = docR.rows[0].pdf_template_id
      if (pdfTid == null) {
        res.status(404).json({ success: false, message: 'PDF 템플릿이 연결되어 있지 않습니다.' })
        return
      }
      const tpl = await getTemplateById(pool, Number(pdfTid))
      if (!tpl || !tpl.storage_key) {
        res.status(404).json({ success: false, message: 'PDF 파일을 찾을 수 없습니다.' })
        return
      }
      const buf = await getTemplateObject(String(tpl.storage_key))
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Cache-Control', 'private, no-store')
      res.status(200).send(buf)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents/:documentInstanceId/rendered-pdf', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docR = await pool.query(
        `
        SELECT cdi.id, cdi.template_id, ct.pdf_template_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, row.id],
      )
      if (docR.rowCount === 0) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      if (String(docR.rows[0].contract_template_mode ?? 'coordinate_pdf') === 'confirmation_only') {
        respondConfirmationOnlyPdfNotAvailable(res)
        return
      }
      const pdfTid = docR.rows[0].pdf_template_id
      const contractTemplateIdRendered = String(docR.rows[0].template_id)
      if (pdfTid == null) {
        res.status(404).json({ success: false, message: 'PDF 템플릿이 연결되어 있지 않습니다.' })
        return
      }
      const valRows = await loadValueRows(pool, docId)
      const mode = String(req.query.mode ?? 'final').trim().toLowerCase()
      const excludeSignatures = mode === 'input'
      let stamped
      try {
        stamped = await buildStampedPdfBufferFromInstance(pool, pdfTid, valRows, {
          excludeSignatures,
          contractTemplateId: contractTemplateIdRendered,
        })
      } catch (rendErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[contract public rendered-pdf]', {
            documentInstanceId: docId,
            err: rendErr instanceof Error ? rendErr.message : String(rendErr),
          })
        } else {
          console.error('[contract public rendered-pdf] failed')
        }
        res.status(502).json({ success: false, message: '확인용 문서를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' })
        return
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Cache-Control', 'private, no-store')
      res.status(200).send(stamped)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents/:documentInstanceId/signed-pdf', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docR = await pool.query(
        `
        SELECT cdi.id, cdi.status, cdi.signed_pdf_file_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, row.id],
      )
      if (docR.rowCount === 0) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      if (String(docR.rows[0].contract_template_mode ?? 'coordinate_pdf') === 'confirmation_only') {
        if (String(docR.rows[0].status ?? '') !== 'completed') {
          res.status(403).json({ success: false, message: '완료된 문서만 다운로드할 수 있습니다.' })
          return
        }
        const fidCo = docR.rows[0].signed_pdf_file_id
        if (fidCo == null || String(fidCo).trim() === '') {
          res.status(404).json({ success: false, message: '완료 확인서 PDF 가 아직 준비되지 않았습니다.' })
          return
        }
        await respondWithPdfFromFileId(pool, res, fidCo, { attachmentFilename: '완료 확인서.pdf' })
        return
      }
      if (String(docR.rows[0].status ?? '') !== 'completed') {
        res.status(403).json({ success: false, message: '완료된 문서만 다운로드할 수 있습니다.' })
        return
      }
      const fid = docR.rows[0].signed_pdf_file_id
      if (fid == null || String(fid).trim() === '') {
        res.status(404).json({ success: false, message: '최종 PDF 가 아직 준비되지 않았습니다.' })
        return
      }
      await respondWithPdfFromFileId(pool, res, fid, { attachmentFilename: '완료 계약서.pdf' })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/attachments/:attachmentId/view', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const attachmentId = String(req.params.attachmentId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const att = await loadSendSessionAttachmentRow(pool, String(row.id), attachmentId)
      if (!att) {
        res.status(404).json({ success: false, message: '첨부자료를 찾을 수 없습니다.' })
        return
      }
      await streamConsentFileInlineForPublic(pool, res, att.file_id, String(att.display_filename ?? 'file'))
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/contracts/public/:linkCode/attachments/:attachmentId/confirm', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const attachmentId = String(req.params.attachmentId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentMutation(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요하거나 수정할 수 없는 상태입니다.' })
        return
      }
      const att = await loadSendSessionAttachmentRow(pool, String(row.id), attachmentId)
      if (!att) {
        res.status(404).json({ success: false, message: '첨부자료를 찾을 수 없습니다.' })
        return
      }
      const upd = await pool.query(
        `
        UPDATE contract_send_session_attachments
        SET
          viewed = true,
          viewed_at = COALESCE(viewed_at, NOW()),
          confirmed = true,
          confirmed_at = COALESCE(confirmed_at, NOW()),
          updated_at = NOW()
        WHERE id = $1 AND send_session_id = $2
        RETURNING id, viewed, confirmed, confirmed_at
        `,
        [attachmentId, String(row.id)],
      )
      const u = upd.rows[0]
      res.status(200).json({
        success: true,
        ok: true,
        attachmentId: String(u.id),
        viewed: Boolean(u.viewed),
        confirmed: Boolean(u.confirmed),
        confirmedAt: u.confirmed_at ? new Date(u.confirmed_at).toISOString() : null,
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents/:documentInstanceId', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const docId = String(req.params.documentInstanceId ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docR = await pool.query(
        `
        SELECT cdi.*, ct.pdf_template_id, COALESCE(ct.template_mode, 'coordinate_pdf') AS contract_template_mode
        FROM contract_document_instances cdi
        INNER JOIN contract_templates ct ON ct.id = cdi.template_id
        WHERE cdi.id = $1 AND cdi.send_session_id = $2
        LIMIT 1
        `,
        [docId, row.id],
      )
      if (docR.rowCount === 0) {
        res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다.' })
        return
      }
      const doc = docR.rows[0]
      if (String(doc.status ?? '') === 'pending') {
        await pool.query(
          `UPDATE contract_document_instances SET status = 'viewed', updated_at = NOW() WHERE id = $1`,
          [docId],
        )
        doc.status = 'viewed'
      }
      const contractTemplateMode = String(doc.contract_template_mode ?? 'coordinate_pdf')
      const confirmationItems = await listConfirmationItemsWithValues(pool, String(doc.send_session_id))
      const sendSessionAttachments = await listSendSessionAttachmentsPublic(pool, String(doc.send_session_id))
      const canEdit =
        allowsDocumentMutation(sendStatus, idStatus) && String(doc.status ?? '') !== 'completed'

      if (contractTemplateMode === 'confirmation_only') {
        const rawConf = await listConfirmationOnlyFieldRowsWithRole(
          pool,
          String(row.id),
          String(doc.template_id),
        )
        const ackR = await pool.query(
          `
          SELECT value_text
          FROM contract_document_values
          WHERE document_instance_id = $1 AND field_key = $2
          LIMIT 1
          `,
          [docId, CONFIRMATION_ONLY_CONTENT_ACK_FIELD_KEY],
        )
        const confirmationContentAcknowledged = String(ackR.rows[0]?.value_text ?? '').trim() === 'true'
        const contentStatus = computeConfirmationOnlyContentCompletion(rawConf, confirmationContentAcknowledged)
        const confirmationFields = rawConf.map((r) => ({
          fieldKey: String(r.field_key),
          label: String(r.label ?? ''),
          inputType: String(r.input_type ?? 'text'),
          inputRole: normalizeConfirmationOnlyInputRole(r.input_role),
          required: Boolean(r.required),
          sortOrder: Number(r.sort_order ?? 0),
          placeholder: r.placeholder != null ? String(r.placeholder) : null,
          helpText: r.help_text != null ? String(r.help_text) : null,
          valueText: String(r.value_text ?? ''),
        }))
        const sigRow = await pool.query(
          `
          SELECT value_file_id
          FROM contract_document_values
          WHERE document_instance_id = $1 AND field_key = $2
          LIMIT 1
          `,
          [docId, CONFIRMATION_ONLY_SIGNATURE_FIELD_KEY],
        )
        const sigFileId = sigRow.rows[0]?.value_file_id
        const hasSig = sigFileId != null && String(sigFileId).trim() !== ''
        const previewPath = hasSig
          ? `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/confirmation-signature`
          : null
        const docSt = String(doc.status ?? '')
        const docCompleted = docSt === 'completed'
        const confItemsOk =
          confirmationItems.length === 0 || confirmationItems.every((it) => !it.required || it.checked)
        const attOk =
          sendSessionAttachments.length === 0 ||
          sendSessionAttachments.every((a) => !a.required || a.confirmed)
        const completionAvailable =
          !docCompleted && canEdit && contentStatus.complete && confItemsOk && attOk && hasSig
        const hasSignedPdf = doc.signed_pdf_file_id != null && String(doc.signed_pdf_file_id).trim() !== ''
        const signedPdfDownloadPath =
          docCompleted && hasSignedPdf
            ? `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/signed-pdf`
            : null
        let confirmationEvidenceSummary = null
        if (docCompleted) {
          const evConf = await pool.query(
            `
            SELECT evidence_hash, signed_at
            FROM signature_evidences
            WHERE document_instance_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [docId],
          )
          const completedAtIsoConf = doc.completed_at ? new Date(doc.completed_at).toISOString() : null
          confirmationEvidenceSummary = buildPublicEvidenceFromRow(evConf.rows[0], {
            completedAt: completedAtIsoConf,
          })
        }
        res.status(200).json({
          success: true,
          data: {
            templateMode: 'confirmation_only',
            completed: docCompleted,
            evidenceAvailable: Boolean(confirmationEvidenceSummary),
            evidenceSummary: confirmationEvidenceSummary ?? undefined,
            document: {
              id: String(doc.id),
              templateId: String(doc.template_id),
              title: String(doc.title_snapshot ?? ''),
              status: String(doc.status ?? ''),
              required: doc.required === 1 || doc.required === true,
              sortOrder: Number(doc.sort_order ?? 0),
              pdfTemplateId: null,
              templateVersion: doc.template_version != null ? Number(doc.template_version) : null,
              originalPdfHash: doc.original_pdf_hash ? String(doc.original_pdf_hash) : null,
            },
            confirmationFields,
            confirmationContentAcknowledged,
            customerInputComplete: contentStatus.customerRequiredComplete,
            confirmationSignature: {
              exists: hasSig,
              fileId: hasSig ? String(sigFileId) : null,
              previewUrl: previewPath,
            },
            fields: [],
            pdfTemplate: null,
            pdfPreviewUrl: null,
            signedPdfDownloadPath,
            signedPdfDownloadAvailable: Boolean(signedPdfDownloadPath),
            pdfAvailable: false,
            signAvailable: !docCompleted && canEdit,
            completionAvailable,
            canEdit,
            confirmationItems,
            sendSessionAttachments,
            notice: docCompleted
              ? '전자확인서가 완료되었습니다. 아래에서 완료 확인서 PDF를 내려받을 수 있습니다.'
              : '담당자가 입력한 전자확인서 내용과 첨부자료를 확인한 뒤 전자서명을 남기고, 안내에 따라 최종 완료해 주세요.',
          },
        })
        return
      }

      const pdfTid = doc.pdf_template_id
      let pdfTemplate = null
      let fields = []
      if (pdfTid != null) {
        const tpl = await getTemplateById(pool, Number(pdfTid))
        if (tpl) {
          pdfTemplate = {
            id: tpl.id,
            code: tpl.code,
            title: tpl.title,
            description: tpl.description ?? '',
            pageCount: tpl.page_count,
            isActive: tpl.is_active,
          }
          const rawFields = await listFields(pool, Number(pdfTid))
          const valRows = await loadValueRows(pool, docId)
          const settingsMapDoc = await loadContractFieldSettingsMap(pool, String(doc.template_id))
          fields = rawFields.map((rf) => {
            const dto = fieldRowToPublicDto(rf, settingsMapDoc)
            const vr = findValueRowForTemplateField(rf, valRows)
            dto.suggestedDefault = buildSuggestedDefault()
            dto.publicValue = publicValueShape(rf, vr)
            return dto
          })
        }
      }
      const pdfPreviewPath = `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/pdf`
      let evidenceSummary = null
      if (String(doc.status ?? '') === 'completed') {
        const evR = await pool.query(
          `
          SELECT evidence_hash, signed_at
          FROM signature_evidences
          WHERE document_instance_id = $1
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [docId],
        )
        const completedAtIso = doc.completed_at ? new Date(doc.completed_at).toISOString() : null
        evidenceSummary = buildPublicEvidenceFromRow(evR.rows[0], { completedAt: completedAtIso })
      }
      const signedPdfDownloadPath =
        String(doc.status ?? '') === 'completed' &&
        doc.signed_pdf_file_id != null &&
        String(doc.signed_pdf_file_id).trim() !== ''
          ? `/api/contracts/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/signed-pdf`
          : null
      const signedPdfDownloadAvailable = signedPdfDownloadPath != null
      res.status(200).json({
        success: true,
        data: {
          templateMode: 'coordinate_pdf',
          pdfAvailable: true,
          completionAvailable: true,
          document: {
            id: String(doc.id),
            templateId: String(doc.template_id),
            title: String(doc.title_snapshot ?? ''),
            status: String(doc.status ?? ''),
            required: doc.required === 1 || doc.required === true,
            sortOrder: Number(doc.sort_order ?? 0),
            pdfTemplateId: pdfTid != null ? Number(pdfTid) : null,
            templateVersion: doc.template_version != null ? Number(doc.template_version) : null,
            originalPdfHash: doc.original_pdf_hash ? String(doc.original_pdf_hash) : null,
          },
          pdfTemplate,
          fields,
          pdfPreviewUrl: pdfPreviewPath,
          signedPdfDownloadPath,
          signedPdfDownloadAvailable,
          canEdit,
          evidenceSummary: evidenceSummary ?? undefined,
          confirmationItems,
          sendSessionAttachments,
          notice:
            '휴대폰 인증 완료 후 문서 작성 및 전자서명을 진행합니다. 본 화면에서 입력·임시저장·전자서명·문서 완료까지 이어집니다.',
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode/documents', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      if (!allowsDocumentDetail(sendStatus, idStatus)) {
        res.status(403).json({ success: false, message: '계약서 수신번호 인증이 필요합니다.' })
        return
      }
      const docs = await pool.query(
        `
        SELECT id, title_snapshot, required, sort_order, status
        FROM contract_document_instances
        WHERE send_session_id = $1
        ORDER BY sort_order ASC, created_at ASC
        `,
        [row.id],
      )
      res.status(200).json({
        success: true,
        data: {
          documents: docs.rows.map((d) => ({
            id: String(d.id),
            title: String(d.title_snapshot ?? ''),
            required: d.required === 1 || d.required === true,
            sortOrder: Number(d.sort_order ?? 0),
            status: String(d.status ?? ''),
          })),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/contracts/public/:linkCode/open', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      if (TERMINAL_SESSION.has(sendStatus)) {
        res.status(409).json({ success: false, message: '만료되었거나 취소된 링크입니다.' })
        return
      }
      await pool.query(
        `
        UPDATE contract_send_sessions
        SET
          opened_at = COALESCE(opened_at, NOW()),
          status = CASE WHEN status = 'pending' THEN 'opened' ELSE status END,
          updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('expired', 'cancelled')
        `,
        [row.id],
      )
      res.status(200).json({
        success: true,
        data: {
          opened: true,
          metaRecorded: true,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/contracts/public/:linkCode', async (req, res) => {
    try {
      const linkCode = String(req.params.linkCode ?? '').trim()
      const row = await loadSendSessionRow(pool, linkCode)
      if (!row) {
        res.status(404).json({ success: false, message: '유효하지 않은 링크입니다.' })
        return
      }
      const sendStatus = String(row.status ?? '')
      const idStatus = await loadLatestIdentityStatus(pool, row.id)
      const maskedPhone = computeMaskedPhone(row)
      const customerDisplayName = maskCustomerDisplayName(row.customer_name)
      const verified = isIdentityVerified(sendStatus, idStatus)
      const authenticationRequired = !verified && !TERMINAL_SESSION.has(sendStatus) && !COMPLETED_SESSION.has(sendStatus)

      const blocked = TERMINAL_SESSION.has(sendStatus)
      const blockedReason = !blocked ? null : sendStatus === 'cancelled' ? 'cancelled' : 'expired'

      const docs = await pool.query(
        `
        SELECT id, title_snapshot, required, sort_order, status
        FROM contract_document_instances
        WHERE send_session_id = $1
        ORDER BY sort_order ASC, created_at ASC
        `,
        [row.id],
      )
      const docRows = docs.rows
      const documentCount = docRows.length
      const completedDocumentCount = docRows.filter((d) => String(d.status ?? '') === 'completed').length
      const requiredRows = docRows.filter((d) => d.required === 1 || d.required === true)
      const allRequiredCompleted =
        requiredRows.length === 0 ||
        requiredRows.every((d) => String(d.status ?? '') === 'completed')

      const documentsPublic = docRows.map((d) => ({
        id: String(d.id),
        title: String(d.title_snapshot ?? ''),
        required: d.required === 1 || d.required === true,
        sortOrder: Number(d.sort_order ?? 0),
        status: String(d.status ?? ''),
      }))

      res.status(200).json({
        success: true,
        data: {
          sendSession: {
            id: String(row.id),
            status: sendStatus,
            maskedPhone,
            customerDisplayName,
            identityVerified: verified,
            identityStatus: idStatus,
            authenticationRequired,
            openedAt: row.opened_at ? new Date(row.opened_at).toISOString() : null,
          },
          blocked,
          blockedReason,
          completed: COMPLETED_SESSION.has(sendStatus),
          documentCount,
          completedDocumentCount,
          allRequiredCompleted,
          documents: documentsPublic,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
