/**
 * 무좌표 전자확인서(confirmation_only) 전용 증빙 해시·DB 기록.
 * coordinate_pdf 의 computeDocumentReferenceHash / insertSignatureEvidenceRow 는 변경하지 않는다.
 */

import { randomUUID } from 'node:crypto'
import {
  computeContractEvidenceHash,
  extractClientIp,
  getEvidenceIntegritySecret,
  hashClientIp,
  hashContractConfirmationsForEvidence,
  hashContractSendAttachmentsForEvidence,
  pickSignatureAggregation,
  sha256Hex,
  stableStringify,
  truncateUserAgent,
} from './contractEvidenceService.js'

const CONFIRMATION_CONTENT_ACK_FIELD_KEY = '__confirmation_content_ack__'

function normalizeConfirmationInputRole(raw) {
  return String(raw ?? '').trim() === 'customer' ? 'customer' : 'sender'
}

/**
 * 확인서 발송 필드 값 + 문서 인스턴스 값(손사인 등) 스냅샷 해시.
 *
 * @param {Array<{ field_key?: unknown, value_text?: unknown, sort_order?: unknown, input_role?: unknown, label?: unknown, input_type?: unknown, required?: unknown }>} confirmationFieldRows listSendSessionConfirmationFieldValuesForPublic + input_role 결합 결과
 * @param {Array<Record<string, unknown>>} documentValueRows contract_document_values
 */
export function computeConfirmationOnlyValuesHash(confirmationFieldRows, documentValueRows) {
  const confirmationFieldValues = [...confirmationFieldRows]
    .sort((a, b) => {
      const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
      if (so !== 0) return so
      return String(a.field_key ?? '').localeCompare(String(b.field_key ?? ''))
    })
    .map((r) => ({
      fieldKey: String(r.field_key ?? ''),
      inputRole: normalizeConfirmationInputRole(r.input_role),
      valueText: r.value_text == null ? '' : String(r.value_text),
    }))

  const documentValues = [...documentValueRows].sort((a, b) =>
    String(a.field_key ?? '').localeCompare(String(b.field_key ?? '')),
  )
  const normalizedDocVals = documentValues.map((r) => ({
    fieldId: r.field_id == null ? '' : String(r.field_id),
    fieldKey: String(r.field_key ?? ''),
    fieldType: String(r.field_type ?? ''),
    valueFileId: r.value_file_id == null ? null : String(r.value_file_id),
    valueHash: r.value_hash == null ? null : String(r.value_hash),
    valueText: r.value_text == null ? null : String(r.value_text),
  }))

  return sha256Hex(stableStringify({ confirmationFieldValues, documentValues: normalizedDocVals }))
}

/**
 * document_reference_hash 입력. JSON 키는 stableStringify 가 정렬하므로 삽입 순서는 무관.
 *
 * @param {{
 *   templateMode: 'confirmation_only',
 *   evidencePayloadVersion: number,
 *   templateId: string,
 *   templateName: string,
 *   sendSessionId: string,
 *   documentInstanceId: string,
 *   linkCode: string | null,
 *   confirmationFields: Array<{
 *     fieldKey: string,
 *     label: string,
 *     inputType: string,
 *     required: boolean,
 *     sortOrder: number,
 *     inputRole: 'sender' | 'customer',
 *     valueText: string,
 *     enteredBy: 'sender' | 'customer',
 *   }>,
 *   confirmationContentAcknowledgement: {
 *     key: '__confirmation_content_ack__',
 *     required: boolean,
 *     acknowledged: boolean,
 *   },
 *   confirmationChecks: Array<{ id: string, label: string, required: boolean, checked: boolean, checkedAt: string | null }>,
 *   attachments: Array<{
 *     id: string,
 *     fileId: string | null,
 *     originalFilename: string,
 *     fileHash: string,
 *     required: boolean,
 *     sortOrder: number,
 *     confirmed: boolean,
 *     confirmedAt: string | null,
 *   }>,
 *   attachmentsSummary: { hasAttachments: boolean, status: 'none' | 'present' },
 *   signatureSummary: {
 *     exists: boolean,
 *     signatureFileId: string | null,
 *     signatureValueHash: string | null,
 *     signatureImageHash: string | null,
 *   },
 *   authenticationSummary: {
 *     identitySessionId: string,
 *     provider: string,
 *     level: string,
 *     otpVerifiedAtIso: string | null,
 *     targetPhoneHash: string | null,
 *   },
 *   generatedConfirmationPdfHash: string,
 *   completedAtIso: string,
 * }} p
 */
export function buildConfirmationOnlyEvidenceReferencePayload(p) {
  return {
    evidencePayloadVersion: Number(p.evidencePayloadVersion ?? 2),
    templateMode: p.templateMode,
    templateId: p.templateId,
    templateName: p.templateName,
    sendSessionId: p.sendSessionId,
    documentInstanceId: p.documentInstanceId,
    linkCode: p.linkCode == null || String(p.linkCode).trim() === '' ? null : String(p.linkCode).trim(),
    confirmationFields: p.confirmationFields,
    confirmationContentAcknowledgement: p.confirmationContentAcknowledgement,
    confirmationChecks: p.confirmationChecks,
    attachments: p.attachments,
    attachmentsSummary: p.attachmentsSummary,
    signatureSummary: p.signatureSummary,
    authenticationSummary: p.authenticationSummary,
    generatedConfirmationPdfHash: String(p.generatedConfirmationPdfHash ?? '').trim() || null,
    completedAtIso: p.completedAtIso,
  }
}

/**
 * @param {ReturnType<typeof buildConfirmationOnlyEvidenceReferencePayload>} payload
 */
export function computeConfirmationOnlyDocumentReferenceHash(payload) {
  return sha256Hex(stableStringify(payload))
}

/**
 * @param {import('pg').PoolClient} client
 * @param {import('express').Request} req
 * @param {{
 *   sendSession: Record<string, unknown>,
 *   documentInstance: Record<string, unknown>,
 *   identityRow: Record<string, unknown>,
 *   contractTemplateTitle: string,
 *   confirmationFieldRows: Array<Record<string, unknown>>,
 *   documentValueRows: Array<Record<string, unknown>>,
 *   signedPdfFileId: string | null,
 *   signedPdfHash: string | null,
 * }} input
 */
export async function insertConfirmationOnlySignatureEvidenceRow(client, req, input) {
  const idRow = input.identityRow
  if (!idRow || idRow.id == null) {
    throw Object.assign(new Error('인증 세션을 찾을 수 없습니다.'), { statusCode: 400 })
  }

  const documentInstanceIdEarly = String(input.documentInstance.id)
  const existingEv = await client.query(
    `
    SELECT id, evidence_hash, signed_at
    FROM signature_evidences
    WHERE document_instance_id = $1
    LIMIT 1
    `,
    [documentInstanceIdEarly],
  )
  if (existingEv.rowCount > 0) {
    const er = existingEv.rows[0]
    return {
      evidenceId: String(er.id),
      evidenceHash: String(er.evidence_hash ?? ''),
      signedAt: er.signed_at,
    }
  }

  const secret = getEvidenceIntegritySecret()
  const now = new Date()
  const signedAtIso = now.toISOString()
  const completedAtIso = signedAtIso

  const sendSessionId = String(input.sendSession.id)
  const documentInstanceId = documentInstanceIdEarly
  const templateId = String(input.documentInstance.template_id)
  const tv = input.documentInstance.template_version
  const templateVersion = tv == null ? null : Number(tv)
  const templateName = String(input.contractTemplateTitle ?? '').trim() || '—'
  const linkCode =
    input.sendSession.link_code != null && String(input.sendSession.link_code).trim()
      ? String(input.sendSession.link_code).trim()
      : null

  const signedPdfHashNorm =
    input.signedPdfHash != null && String(input.signedPdfHash).trim()
      ? String(input.signedPdfHash).trim()
      : null
  const signedPdfFileIdNorm =
    input.signedPdfFileId != null && String(input.signedPdfFileId).trim()
      ? String(input.signedPdfFileId).trim()
      : null

  if (!signedPdfHashNorm) {
    throw Object.assign(new Error('완료 확인서 PDF 해시가 없습니다.'), { statusCode: 500 })
  }

  /** 확인서 PDF 바이트 기반 문서 지문( coordinate_pdf 의 원본/템플릿 PDF 해시와 분리 ) */
  const documentHash = signedPdfHashNorm

  const valuesHash = computeConfirmationOnlyValuesHash(input.confirmationFieldRows, input.documentValueRows)
  const { signatureImageHash, signatureFileId } = pickSignatureAggregation(input.documentValueRows)

  const confRowsDb = await client.query(
    `
    SELECT
      i.id,
      i.label,
      i.required,
      i.sort_order,
      COALESCE(v.checked, false) AS checked,
      v.checked_at
    FROM contract_confirmation_items i
    LEFT JOIN contract_confirmation_item_values v
      ON v.confirmation_item_id = i.id AND v.send_session_id = i.send_session_id
    WHERE i.send_session_id = $1
    ORDER BY i.sort_order ASC, i.id ASC
    `,
    [sendSessionId],
  )
  const confirmationsHash = hashContractConfirmationsForEvidence(confRowsDb.rows)

  const attRowsDb = await client.query(
    `
    SELECT
      id,
      file_id,
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
  const attachmentsHash = hashContractSendAttachmentsForEvidence(attRowsDb.rows)

  const ackRow = await client.query(
    `
    SELECT value_text
    FROM contract_document_values
    WHERE document_instance_id = $1
      AND field_key = $2
    LIMIT 1
    `,
    [documentInstanceId, CONFIRMATION_CONTENT_ACK_FIELD_KEY],
  )
  const confirmationContentAcknowledged = String(ackRow.rows[0]?.value_text ?? '').trim() === 'true'

  const sigRow = input.documentValueRows.find((r) => String(r.field_type ?? '') === 'signature') ?? null
  const signatureValueHash = sigRow?.value_hash != null ? String(sigRow.value_hash) : null

  const roleMapRows = await client.query(
    `
    SELECT field_key, input_role
    FROM contract_template_confirmation_fields
    WHERE template_id = $1
    `,
    [templateId],
  )
  const roleByFieldKey = new Map(
    roleMapRows.rows.map((r) => [String(r.field_key ?? ''), normalizeConfirmationInputRole(r.input_role)]),
  )

  const sortedConfirmationRows = [...input.confirmationFieldRows]
    .sort((a, b) => {
      const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
      if (so !== 0) return so
      return String(a.field_key ?? '').localeCompare(String(b.field_key ?? ''))
    })

  const confirmationFieldsPayload = sortedConfirmationRows.map((r) => {
    const inputRole = roleByFieldKey.get(String(r.field_key ?? '')) ?? 'sender'
    return {
      fieldKey: String(r.field_key ?? ''),
      label: String(r.label ?? ''),
      inputType: String(r.input_type ?? 'text'),
      required: r.required === true || r.required === 1,
      sortOrder: Number(r.sort_order ?? 0),
      inputRole,
      valueText: r.value_text == null ? '' : String(r.value_text),
      enteredBy: inputRole,
    }
  })

  const senderFieldExists = confirmationFieldsPayload.some((row) => row.inputRole === 'sender')

  const confirmationRowsSorted = [...confRowsDb.rows].sort((a, b) => {
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
    if (so !== 0) return so
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
  const checkPayload = confirmationRowsSorted.map((r) => ({
    id: String(r.id ?? ''),
    label: String(r.label ?? ''),
    required: r.required === true || r.required === 1,
    checked: Boolean(r.checked),
    checkedAt: r.checked_at != null ? new Date(r.checked_at).toISOString() : null,
  }))

  const attachmentsPayload = attRowsDb.rows.map((r) => ({
    id: String(r.id ?? ''),
    fileId: r.file_id == null ? null : String(r.file_id),
    originalFilename: String(r.display_filename ?? ''),
    fileHash: String(r.content_hash ?? ''),
    required: r.required === true || r.required === 1,
    sortOrder: Number(r.sort_order ?? 0),
    confirmed: Boolean(r.confirmed),
    confirmedAt: r.confirmed_at != null ? new Date(r.confirmed_at).toISOString() : null,
  }))

  const attachmentsSummary = {
    hasAttachments: attachmentsPayload.length > 0,
    status: attachmentsPayload.length > 0 ? 'present' : 'none',
  }

  const signatureSummary = {
    exists: signatureFileId != null && String(signatureFileId).trim() !== '',
    signatureFileId: signatureFileId == null ? null : String(signatureFileId),
    signatureValueHash: signatureValueHash == null ? null : String(signatureValueHash),
    signatureImageHash: signatureImageHash == null ? null : String(signatureImageHash),
  }

  const identitySessionId = String(idRow.id)
  const otpVerifiedAtIso =
    idRow.otp_verified_at != null ? new Date(idRow.otp_verified_at).toISOString() : null

  const customerId =
    input.sendSession.customer_id != null && input.sendSession.customer_id !== ''
      ? Number(input.sendSession.customer_id)
      : null
  const targetPhoneHash =
    input.sendSession.target_phone_hash != null && String(input.sendSession.target_phone_hash).trim()
      ? String(input.sendSession.target_phone_hash).trim()
      : null

  const authenticationSummary = {
    identitySessionId,
    provider: String(idRow?.provider ?? 'self_sms'),
    level: String(idRow?.level ?? 'phone_possession'),
    otpVerifiedAtIso,
    targetPhoneHash,
  }

  const refPayload = buildConfirmationOnlyEvidenceReferencePayload({
    templateMode: 'confirmation_only',
    evidencePayloadVersion: 2,
    templateId,
    templateName,
    sendSessionId,
    documentInstanceId,
    linkCode,
    confirmationFields: confirmationFieldsPayload,
    confirmationContentAcknowledgement: {
      key: CONFIRMATION_CONTENT_ACK_FIELD_KEY,
      required: senderFieldExists,
      acknowledged: confirmationContentAcknowledged,
    },
    confirmationChecks: checkPayload,
    attachments: attachmentsPayload,
    attachmentsSummary,
    signatureSummary,
    authenticationSummary,
    generatedConfirmationPdfHash: signedPdfHashNorm,
    completedAtIso,
  })

  const documentReferenceHash = computeConfirmationOnlyDocumentReferenceHash(refPayload)

  const ipRaw = extractClientIp(req)
  const ipHash = hashClientIp(ipRaw, secret)
  const ua = truncateUserAgent(req)
  const userAgentHash = ua ? sha256Hex(ua) : null

  const evidenceHash = computeContractEvidenceHash({
    completedAtIso,
    customerId: Number.isFinite(customerId) ? customerId : null,
    documentHash,
    documentInstanceId,
    documentReferenceHash,
    identityLevel: String(idRow?.level ?? 'phone_possession'),
    identityProvider: String(idRow?.provider ?? 'self_sms'),
    identitySessionId,
    ipHash,
    otpVerifiedAtIso,
    pdfTemplateId: null,
    sendSessionId,
    signatureFileId,
    signatureImageHash,
    signedAtIso,
    signedPdfHash: signedPdfHashNorm,
    targetPhoneHash,
    templateId,
    templateVersion,
    userAgentHash,
    valuesHash,
    confirmationsHash,
    attachmentsHash,
  })

  const evidenceId = `sev_${randomUUID()}`
  await client.query(
    `
    INSERT INTO signature_evidences (
      id,
      send_session_id,
      document_instance_id,
      identity_session_id,
      customer_id,
      provider,
      level,
      target_phone_hash,
      document_hash,
      signature_image_hash,
      signed_pdf_hash,
      signed_pdf_file_id,
      evidence_hash,
      ip_hash,
      user_agent,
      signed_at,
      otp_verified_at,
      values_hash,
      document_reference_hash,
      signature_file_id
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    `,
    [
      evidenceId,
      sendSessionId,
      documentInstanceId,
      identitySessionId,
      Number.isFinite(customerId) ? customerId : null,
      String(idRow?.provider ?? 'self_sms'),
      String(idRow?.level ?? 'phone_possession'),
      targetPhoneHash,
      documentHash,
      signatureImageHash,
      signedPdfHashNorm,
      signedPdfFileIdNorm,
      evidenceHash,
      ipHash,
      ua,
      now,
      idRow?.otp_verified_at ?? null,
      valuesHash,
      documentReferenceHash,
      signatureFileId,
    ],
  )

  return { evidenceId, evidenceHash, signedAt: now }
}
