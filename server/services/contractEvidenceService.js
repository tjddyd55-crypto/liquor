import { createHash, randomUUID } from 'node:crypto'

/**
 * evidence_hash 입력용: key 정렬 + null 일관 처리.
 *
 * @param {unknown} obj
 */
export function stableStringify(obj) {
  if (obj === null) {
    return 'null'
  }
  if (obj === undefined) {
    return 'null'
  }
  const t = typeof obj
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((x) => stableStringify(x)).join(',')}]`
  }
  if (t === 'object') {
    const rec = /** @type {Record<string, unknown>} */ (obj)
    const keys = Object.keys(rec).sort()
    const inner = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')
    return `{${inner}}`
  }
  return JSON.stringify(String(obj))
}

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function getEvidenceIntegritySecret() {
  return String(process.env.EVIDENCE_IP_SALT ?? process.env.JWT_SECRET ?? 'evidence-dev-only').trim()
}

/** @param {import('express').Request} req */
export function extractClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim()
  }
  const rip = req.ip
  if (typeof rip === 'string' && rip.trim()) {
    return rip.trim()
  }
  const sock = req.socket?.remoteAddress
  return typeof sock === 'string' ? sock : ''
}

export function hashClientIp(ip, secret) {
  const raw = String(ip ?? '').trim()
  if (!raw) {
    return null
  }
  return sha256Hex(`${raw}:${secret}`)
}

const UA_STORE_MAX = 400

/** @param {import('express').Request} req */
export function truncateUserAgent(req) {
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : ''
  if (!ua) {
    return null
  }
  return ua.length > UA_STORE_MAX ? ua.slice(0, UA_STORE_MAX) : ua
}

/**
 * @param {Array<{ field_id?: string | null, field_key?: string, field_type?: string, value_text?: string | null, value_file_id?: string | null, value_hash?: string | null }>} rows
 */
export function hashContractDocumentValuesForEvidence(rows) {
  const sorted = [...rows].sort((a, b) => {
    const ia = String(a.field_id ?? '')
    const ib = String(b.field_id ?? '')
    const na = Number(ia)
    const nb = Number(ib)
    if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === ia && String(nb) === ib) {
      return na - nb
    }
    return ia.localeCompare(ib)
  })
  const normalized = sorted.map((r) => ({
    fieldId: String(r.field_id ?? ''),
    fieldKey: String(r.field_key ?? ''),
    fieldType: String(r.field_type ?? ''),
    valueFileId: r.value_file_id == null ? null : String(r.value_file_id),
    valueHash: r.value_hash == null ? null : String(r.value_hash),
    valueText: r.value_text == null ? null : String(r.value_text),
  }))
  return sha256Hex(stableStringify(normalized))
}

/**
 * @param {Array<{ field_id?: string | null, field_type?: string, value_hash?: string | null, value_file_id?: string | null }>} rows
 */
export function pickSignatureAggregation(rows) {
  const sig = rows.filter((r) => String(r.field_type ?? '') === 'signature')
  const sorted = [...sig].sort((a, b) => {
    const ia = String(a.field_id ?? '')
    const ib = String(b.field_id ?? '')
    const na = Number(ia)
    const nb = Number(ib)
    if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === ia && String(nb) === ib) {
      return na - nb
    }
    return ia.localeCompare(ib)
  })
  const parts = sorted.map((r) => String(r.value_hash ?? '').trim()).filter(Boolean)
  const signatureImageHash = parts.length > 0 ? sha256Hex(parts.join('|')) : null
  const firstFile = sorted.find((r) => r.value_file_id)
  const signatureFileId = firstFile?.value_file_id != null ? String(firstFile.value_file_id) : null
  return { signatureImageHash, signatureFileId }
}

/**
 * 증빙 해시용 — 고객 확인 체크 항목 스냅샷(sort_order, id 안정 정렬).
 * @param {Array<{ id?: unknown, label?: unknown, required?: unknown, sort_order?: unknown, checked?: unknown, checked_at?: unknown }>} rows
 */
export function hashContractConfirmationsForEvidence(rows) {
  if (!rows || rows.length === 0) {
    return null
  }
  const sorted = [...rows].sort((a, b) => {
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
    if (so !== 0) {
      return so
    }
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
  const normalized = sorted.map((r) => ({
    id: String(r.id ?? ''),
    label: String(r.label ?? ''),
    required: r.required === true || r.required === 1,
    checked: Boolean(r.checked),
    checkedAt: r.checked_at != null ? new Date(r.checked_at).toISOString() : null,
  }))
  return sha256Hex(stableStringify(normalized))
}

/**
 * 증빙 해시용 — 첨부자료 확인 스냅샷(세션 단위).
 * @param {Array<{ id?: unknown, display_filename?: unknown, mime_type?: unknown, size_bytes?: unknown, content_hash?: unknown, required?: unknown, sort_order?: unknown, viewed?: unknown, viewed_at?: unknown, confirmed?: unknown, confirmed_at?: unknown }>} rows
 */
export function hashContractSendAttachmentsForEvidence(rows) {
  if (!rows || rows.length === 0) {
    return null
  }
  const sorted = [...rows].sort((a, b) => {
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
    if (so !== 0) {
      return so
    }
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
  const normalized = sorted.map((r) => ({
    id: String(r.id ?? ''),
    filename: String(r.display_filename ?? ''),
    mimeType: r.mime_type == null ? null : String(r.mime_type),
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    fileHash: String(r.content_hash ?? ''),
    required: r.required === true || r.required === 1,
    sortOrder: Number(r.sort_order ?? 0),
    viewed: Boolean(r.viewed),
    viewedAt: r.viewed_at != null ? new Date(r.viewed_at).toISOString() : null,
    confirmed: Boolean(r.confirmed),
    confirmedAt: r.confirmed_at != null ? new Date(r.confirmed_at).toISOString() : null,
  }))
  return sha256Hex(stableStringify(normalized))
}

/**
 * @param {{
 *   sendSessionId: string,
 *   documentInstanceId: string,
 *   templateId: string,
 *   pdfTemplateId: number | null,
 *   originalPdfHash: string | null,
 *   contractTemplatePdfHash: string | null,
 *   valuesHash: string,
 * }} src
 */
export function computeDocumentReferenceHash(src) {
  const hasDoc =
    src.originalPdfHash && String(src.originalPdfHash).trim()
      ? String(src.originalPdfHash).trim()
      : src.contractTemplatePdfHash && String(src.contractTemplatePdfHash).trim()
        ? String(src.contractTemplatePdfHash).trim()
        : null
  if (hasDoc) {
    return null
  }
  return sha256Hex(
    stableStringify({
      documentInstanceId: src.documentInstanceId,
      pdfTemplateId: src.pdfTemplateId,
      sendSessionId: src.sendSessionId,
      templateId: src.templateId,
      valuesHash: src.valuesHash,
    }),
  )
}

/**
 * @param {{
 *   sendSessionId: string,
 *   documentInstanceId: string,
 *   templateId: string,
 *   templateVersion: number | null,
 *   pdfTemplateId: number | null,
 *   identitySessionId: string | null,
 *   customerId: number | null,
 *   identityProvider: string,
 *   identityLevel: string,
 *   otpVerifiedAtIso: string | null,
 *   targetPhoneHash: string | null,
 *   documentHash: string | null,
 *   documentReferenceHash: string | null,
 *   signedPdfHash: string | null,
 *   valuesHash: string,
 *   signatureImageHash: string | null,
 *   signatureFileId: string | null,
 *   signedAtIso: string,
 *   completedAtIso: string,
 *   ipHash: string | null,
 *   userAgentHash: string | null,
 *   confirmationsHash?: string | null,
 *   attachmentsHash?: string | null,
 * }} p
 */
export function computeContractEvidenceHash(p) {
  const ch =
    p.confirmationsHash != null && String(p.confirmationsHash).trim()
      ? String(p.confirmationsHash).trim()
      : null
  const ah =
    p.attachmentsHash != null && String(p.attachmentsHash).trim() ? String(p.attachmentsHash).trim() : null
  const ordered = {
    completedAtIso: p.completedAtIso,
    customerId: p.customerId,
    documentHash: p.documentHash,
    documentInstanceId: p.documentInstanceId,
    documentReferenceHash: p.documentReferenceHash,
    identityLevel: p.identityLevel,
    identityProvider: p.identityProvider,
    identitySessionId: p.identitySessionId,
    ipHash: p.ipHash,
    otpVerifiedAtIso: p.otpVerifiedAtIso,
    pdfTemplateId: p.pdfTemplateId,
    sendSessionId: p.sendSessionId,
    signatureFileId: p.signatureFileId,
    signatureImageHash: p.signatureImageHash,
    signedAtIso: p.signedAtIso,
    signedPdfHash: p.signedPdfHash,
    targetPhoneHash: p.targetPhoneHash,
    templateId: p.templateId,
    templateVersion: p.templateVersion,
    userAgentHash: p.userAgentHash,
    valuesHash: p.valuesHash,
    ...(ch ? { confirmationsHash: ch } : {}),
    ...(ah ? { attachmentsHash: ah } : {}),
  }
  return sha256Hex(stableStringify(ordered))
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 * @param {string | null} pinnedId
 */
export async function loadVerifiedIdentitySession(client, sendSessionId, pinnedId) {
  if (pinnedId && String(pinnedId).trim()) {
    const r = await client.query(
      `
      SELECT *
      FROM identity_verification_sessions
      WHERE id = $1
        AND send_session_id = $2
        AND status = 'verified'
      LIMIT 1
      `,
      [String(pinnedId).trim(), sendSessionId],
    )
    if (r.rowCount > 0) {
      return r.rows[0]
    }
  }
  const r2 = await client.query(
    `
    SELECT *
    FROM identity_verification_sessions
    WHERE send_session_id = $1
      AND status = 'verified'
    ORDER BY otp_verified_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `,
    [sendSessionId],
  )
  return r2.rows[0] ?? null
}

/**
 * @param {import('pg').PoolClient} client
 * @param {import('express').Request} req
 * @param {{
 *   sendSession: Record<string, unknown>,
 *   documentInstance: Record<string, unknown>,
 *   contractTemplate: Record<string, unknown>,
 *   pdfTemplateId: number | null,
 *   valueRows: Array<Record<string, unknown>>,
 *   identityRow: Record<string, unknown>,
 *   signedPdfHash?: string | null,
 *   signedPdfFileId?: string | null,
 * }} input
 */
export async function insertSignatureEvidenceRow(client, req, input) {
  const idRow = input.identityRow
  if (!idRow || idRow.id == null) {
    throw Object.assign(new Error('인증 세션을 찾을 수 없습니다.'), { statusCode: 400 })
  }

  const secret = getEvidenceIntegritySecret()
  const now = new Date()
  const signedAtIso = now.toISOString()
  const completedAtIso = signedAtIso

  const sendSessionId = String(input.sendSession.id)
  const documentInstanceId = String(input.documentInstance.id)
  const templateId = String(input.documentInstance.template_id)
  const tv = input.documentInstance.template_version
  const templateVersion = tv == null ? null : Number(tv)

  const valuesHash = hashContractDocumentValuesForEvidence(input.valueRows)
  const { signatureImageHash, signatureFileId } = pickSignatureAggregation(input.valueRows)

  const signedPdfHashNorm =
    input.signedPdfHash != null && String(input.signedPdfHash).trim()
      ? String(input.signedPdfHash).trim()
      : null
  const signedPdfFileIdNorm =
    input.signedPdfFileId != null && String(input.signedPdfFileId).trim()
      ? String(input.signedPdfFileId).trim()
      : null

  const orig = input.documentInstance.original_pdf_hash
  const ctpdf = input.contractTemplate.pdf_hash
  const originalPdfHash = orig && String(orig).trim() ? String(orig).trim() : null
  const contractTemplatePdfHash = ctpdf && String(ctpdf).trim() ? String(ctpdf).trim() : null
  const documentHash = originalPdfHash ?? contractTemplatePdfHash

  const documentReferenceHash = computeDocumentReferenceHash({
    sendSessionId,
    documentInstanceId,
    templateId,
    pdfTemplateId: input.pdfTemplateId,
    originalPdfHash,
    contractTemplatePdfHash,
    valuesHash,
  })

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

  const ipRaw = extractClientIp(req)
  const ipHash = hashClientIp(ipRaw, secret)
  const ua = truncateUserAgent(req)
  const userAgentHash = ua ? sha256Hex(ua) : null

  const confRows = await client.query(
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
  const confirmationsHash = hashContractConfirmationsForEvidence(confRows.rows)

  const attRows = await client.query(
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
  const attachmentsHash = hashContractSendAttachmentsForEvidence(attRows.rows)

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
    pdfTemplateId: input.pdfTemplateId,
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
