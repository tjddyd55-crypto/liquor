/**
 * 발송 세션 단위 전자서명 증빙 PDF 생성 (서버).
 * 데이터는 DB·증빙 해시 입력과 동일 출처를 재사용한다.
 */

import { PDFDocument, rgb } from 'pdf-lib'
import { embedKoreanFont } from '../pdf-engine/renderer/fontProvider.js'
import { consentGetBuffer } from '../lib/consentStorage.js'
import { listFields } from '../pdf-engine/repository/pdfTemplateRepo.js'
import { listConfirmationItemsWithValues } from './contractConfirmationItems.js'
import { listSendSessionAttachmentsPublic } from './contractSendAttachments.js'

const A4_W = 595
const A4_H = 842
const MARGIN = 50
const FONT_SIZE = 8.5
const LINE_HEIGHT = 10
const MAX_TEXT_WIDTH = A4_W - MARGIN * 2
const CONFIRMATION_CONTENT_ACK_FIELD_KEY = '__confirmation_content_ack__'

/**
 * @param {string} name
 */
export function encodeContractEvidenceContentDispositionFilename(name) {
  const ascii = String(name)
    .replace(/[^\x20-\x7E]/g, '_')
    .slice(0, 180)
  const utf8 = encodeURIComponent(name)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

function formatTsKor(value) {
  if (value == null || value === '') {
    return '—'
  }
  try {
    return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  } catch {
    return String(value)
  }
}

function hashPrefix(hex, n = 16) {
  const s = String(hex ?? '').trim()
  if (!s) {
    return '—'
  }
  return s.length <= n ? s : `${s.slice(0, n)}…`
}

function normalizeConfirmationInputRole(raw) {
  return String(raw ?? '').trim() === 'customer' ? 'customer' : 'sender'
}

/**
 * @param {import('pdf-lib').PDFFont} font
 * @param {string} text
 */
function wrapText(font, text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n')
  const out = []
  for (const para of raw.split('\n')) {
    let cur = ''
    for (const ch of para) {
      const next = cur + ch
      if (font.widthOfTextAtSize(next, FONT_SIZE) <= MAX_TEXT_WIDTH) {
        cur = next
      } else {
        if (cur) {
          out.push(cur)
        }
        cur = ch
      }
    }
    if (cur) {
      out.push(cur)
    }
  }
  return out.length > 0 ? out : ['']
}

/**
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {import('pdf-lib').PDFFont} font
 * @param {string} sendSessionId
 * @param {import('pg').Pool} pool
 */
async function loadSessionBasics(pool, sendSessionId) {
  const r = await pool.query(
    `
    SELECT
      s.id,
      s.status,
      s.link_code,
      s.created_at,
      s.sent_at,
      s.opened_at,
      s.completed_at,
      s.sent_by_user_id,
      s.target_phone_masked,
      c.id AS customer_pk,
      c.name AS customer_name,
      g.name AS ga_name,
      u.display_name AS sender_display_name,
      u.username AS sender_username
    FROM contract_send_sessions s
    INNER JOIN customers c ON c.id = s.customer_id
    LEFT JOIN ga_companies g ON g.id = c.ga_id
    LEFT JOIN users u ON u.id = s.sent_by_user_id
    WHERE s.id = $1
    LIMIT 1
    `,
    [sendSessionId],
  )
  return r.rows[0] ?? null
}

async function loadIdentitySession(pool, sendSessionId) {
  const r = await pool.query(
    `
    SELECT *
    FROM identity_verification_sessions
    WHERE send_session_id = $1 AND status = 'verified'
    ORDER BY otp_verified_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1
    `,
    [sendSessionId],
  )
  return r.rows[0] ?? null
}

async function loadDocuments(pool, sendSessionId) {
  const r = await pool.query(
    `
    SELECT
      cdi.id,
      cdi.template_id,
      cdi.title_snapshot,
      cdi.status,
      cdi.sort_order,
      cdi.completed_at,
      ct.title AS contract_template_title,
      COALESCE(ct.template_mode, 'coordinate_pdf') AS template_mode,
      ct.pdf_template_id,
      pt.title AS pdf_template_title
    FROM contract_document_instances cdi
    INNER JOIN contract_templates ct ON ct.id = cdi.template_id
    LEFT JOIN pdf_templates pt ON pt.id = ct.pdf_template_id
    WHERE cdi.send_session_id = $1
    ORDER BY cdi.sort_order ASC, cdi.created_at ASC
    `,
    [sendSessionId],
  )
  return r.rows
}

async function loadDocumentValues(pool, documentInstanceId) {
  const r = await pool.query(
    `
    SELECT field_id, field_key, field_type, value_text, value_file_id, value_hash, updated_at
    FROM contract_document_values
    WHERE document_instance_id = $1
    ORDER BY field_key ASC
    `,
    [documentInstanceId],
  )
  return r.rows
}

async function loadConfirmationRoleAwareValues(pool, sendSessionId, templateId) {
  const defR = await pool.query(
    `
    SELECT id, field_key, label, input_type, required, sort_order, input_role
    FROM contract_template_confirmation_fields
    WHERE template_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [templateId],
  )
  const valR = await pool.query(
    `
    SELECT field_key, value_text
    FROM contract_send_session_confirmation_field_values
    WHERE send_session_id = $1
      AND template_id = $2
    `,
    [sendSessionId, templateId],
  )
  const valueByFieldKey = new Map(valR.rows.map((r) => [String(r.field_key ?? ''), String(r.value_text ?? '')]))
  return defR.rows.map((r) => ({
    fieldKey: String(r.field_key ?? ''),
    label: String(r.label ?? '').trim() || String(r.field_key ?? ''),
    inputType: String(r.input_type ?? 'text'),
    required: r.required === true || r.required === 1,
    sortOrder: Number(r.sort_order ?? 0),
    inputRole: normalizeConfirmationInputRole(r.input_role),
    valueText: valueByFieldKey.get(String(r.field_key ?? '')) ?? '',
  }))
}

async function loadConfirmationContentAcknowledgement(pool, documentInstanceId) {
  const ackR = await pool.query(
    `
    SELECT value_text, updated_at
    FROM contract_document_values
    WHERE document_instance_id = $1
      AND field_key = $2
    LIMIT 1
    `,
    [documentInstanceId, CONFIRMATION_CONTENT_ACK_FIELD_KEY],
  )
  const row = ackR.rows[0] ?? null
  return {
    acknowledged: String(row?.value_text ?? '').trim() === 'true',
    acknowledgedAt: row?.updated_at != null ? new Date(row.updated_at).toISOString() : null,
  }
}

async function loadEvidenceForDoc(pool, sendSessionId, documentInstanceId) {
  const r = await pool.query(
    `
    SELECT *
    FROM signature_evidences
    WHERE send_session_id = $1 AND document_instance_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [sendSessionId, documentInstanceId],
  )
  return r.rows[0] ?? null
}

async function loadFileBuffer(pool, fileId) {
  if (fileId == null || String(fileId).trim() === '') {
    return null
  }
  const fk = await pool.query(`SELECT file_path FROM files WHERE id = $1 LIMIT 1`, [String(fileId).trim()])
  const key = fk.rows[0]?.file_path
  if (!key) {
    return null
  }
  try {
    const buf = await consentGetBuffer(String(key))
    return buf && buf.length > 0 ? Buffer.from(buf) : null
  } catch {
    return null
  }
}

/**
 * @param {PDFDocument} pdfDoc
 * @param {Buffer} bytes
 */
async function tryEmbedRaster(pdfDoc, bytes) {
  try {
    return await pdfDoc.embedPng(bytes)
  } catch {
    try {
      return await pdfDoc.embedJpg(bytes)
    } catch {
      return null
    }
  }
}

const PROVIDER_LABEL = {
  self_sms: '휴대폰 문자(OTP) 인증',
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   sendSessionId: string,
 * }} ctx
 * @returns {Promise<{ buffer: Buffer, downloadFilename: string }>}
 */
export async function buildSendSessionEvidencePdf(ctx) {
  const { pool, sendSessionId } = ctx
  const sid = String(sendSessionId ?? '').trim()
  if (!sid) {
    const e = new Error('유효하지 않은 발송 세션입니다.')
    /** @type {{ statusCode?: number }} */ (e).statusCode = 400
    throw e
  }

  const sessionRow = await loadSessionBasics(pool, sid)
  if (!sessionRow) {
    const e = new Error('발송 세션을 찾을 수 없습니다.')
    /** @type {{ statusCode?: number }} */ (e).statusCode = 404
    throw e
  }
  if (String(sessionRow.status ?? '') !== 'completed') {
    const e = new Error('완료된 문서만 다운로드할 수 있습니다.')
    /** @type {{ statusCode?: number }} */ (e).statusCode = 403
    throw e
  }

  const docs = await loadDocuments(pool, sid)
  const completedDocs = docs.filter((d) => String(d.status ?? '') === 'completed')
  const completedCoordinateDocs = completedDocs.filter((d) => String(d.template_mode ?? '') !== 'confirmation_only')
  const completedConfirmationDocs = completedDocs.filter((d) => String(d.template_mode ?? '') === 'confirmation_only')
  if (completedDocs.length === 0) {
    const e = new Error('완료된 문서만 다운로드할 수 있습니다.')
    /** @type {{ statusCode?: number }} */ (e).statusCode = 403
    throw e
  }

  const identity = await loadIdentitySession(pool, sid)
  const confirmations = await listConfirmationItemsWithValues(pool, sid)
  const attachments = await listSendSessionAttachmentsPublic(pool, sid)

  const customerName = String(sessionRow.customer_name ?? '').trim() || '고객'
  const tplLabel =
    completedDocs.length === 1
      ? String(completedDocs[0].title_snapshot ?? completedDocs[0].contract_template_title ?? '문서')
      : `다중문서(${completedDocs.length}건)`
  const downloadFilename = `${safeFilenameSeg(tplLabel)}_${safeFilenameSeg(customerName)}_전자서명증빙.pdf`

  const pdfDoc = await PDFDocument.create()
  const font = await embedKoreanFont(pdfDoc)

  /** @type {import('pdf-lib').PDFPage} */
  let page = pdfDoc.addPage([A4_W, A4_H])
  let y = A4_H - MARGIN

  const flushParagraph = (text) => {
    for (const line of wrapText(font, text)) {
      if (y < MARGIN + LINE_HEIGHT * 2) {
        page = pdfDoc.addPage([A4_W, A4_H])
        y = A4_H - MARGIN
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      })
      y -= LINE_HEIGHT
    }
  }

  flushParagraph('전자서명 증빙 확인서')
  y -= 4
  flushParagraph(`발송 세션 ID: ${sid}`)
  flushParagraph(`고객명: ${customerName}`)
  flushParagraph(`고객 ID(DB): ${sessionRow.customer_pk ?? '—'}`)
  flushParagraph(`고객 연락처(마스킹): ${sessionRow.target_phone_masked ?? '—'}`)
  flushParagraph(
    `발송자: ${String(sessionRow.sender_display_name ?? '').trim() || String(sessionRow.sender_username ?? '').trim() || sessionRow.sent_by_user_id || '—'}`,
  )
  flushParagraph(`GA/회사: ${sessionRow.ga_name ?? '—'}`)
  flushParagraph(`발송일시: ${formatTsKor(sessionRow.sent_at ?? sessionRow.created_at)}`)
  flushParagraph(`세션 완료일시: ${formatTsKor(sessionRow.completed_at)}`)
  flushParagraph(`현재 상태: ${sessionRow.status ?? '—'}`)
  y -= 6

  flushParagraph('— 섹션 1. 전자서명 진행 요약 —')
  flushParagraph(`· 고객 공개 링크 발급: ${formatTsKor(sessionRow.created_at)}`)
  flushParagraph(`· 세션 발송 기록: ${formatTsKor(sessionRow.sent_at ?? sessionRow.created_at)}`)
  flushParagraph(`· 고객 열람(가능 시각): ${formatTsKor(sessionRow.opened_at)}`)
  if (identity) {
    flushParagraph(
      `· 휴대폰 인증 완료: ${formatTsKor(identity.otp_verified_at)} (${PROVIDER_LABEL[String(identity.provider)] ?? identity.provider ?? '—'})`,
    )
  } else {
    flushParagraph('· 휴대폰 인증 완료: —')
  }
  for (const d of completedDocs) {
    flushParagraph(`· 문서 완료 처리: ${String(d.title_snapshot)} @ ${formatTsKor(d.completed_at)}`)
  }
  y -= 6

  flushParagraph('— 섹션 2. 본인 확인 정보 —')
  if (identity) {
    flushParagraph(`인증 방식: ${PROVIDER_LABEL[String(identity.provider)] ?? identity.provider ?? '—'}`)
    flushParagraph(`인증 상태: ${identity.status ?? '—'}`)
    flushParagraph(`인증 완료 시각: ${formatTsKor(identity.otp_verified_at)}`)
    flushParagraph(`마스킹 휴대폰: ${identity.target_phone_masked ?? sessionRow.target_phone_masked ?? '—'}`)
    flushParagraph(`접속 IP(해시): ${hashPrefix(identity.ip_hash)}`)
    flushParagraph(`User-Agent: ${String(identity.user_agent ?? '').trim() || '—'}`)
  } else {
    flushParagraph('인증 세션 기록을 찾을 수 없습니다.')
  }
  y -= 6

  flushParagraph('— 섹션 3~6. 문서별 입력·서명·증빙 —')
  for (const d of completedCoordinateDocs) {
    flushParagraph(`▶ ${String(d.title_snapshot ?? d.id)}`)
    flushParagraph(`  계약 템플릿: ${d.contract_template_title ?? '—'}`)
    flushParagraph(`  PDF 템플릿: ${d.pdf_template_title ?? '—'}`)

    const pdfTid = d.pdf_template_id
    /** @type {Map<string, string>} */
    const labelByFieldId = new Map()
    /** @type {Map<string, string>} */
    const labelByKey = new Map()
    if (pdfTid != null) {
      try {
        const fields = await listFields(pool, Number(pdfTid))
        for (const f of fields) {
          const lid = String(f.id)
          const fk = String(f.field_key)
          const lb = String(f.label ?? '').trim() || fk
          labelByFieldId.set(lid, lb)
          labelByKey.set(fk, lb)
        }
      } catch {
        /* ignore */
      }
    }

    flushParagraph('  [고객 입력 항목]')
    const vals = await loadDocumentValues(pool, String(d.id))
    for (const v of vals) {
      const ft = String(v.field_type ?? '')
      const lid = v.field_id != null ? String(v.field_id) : ''
      const fk = String(v.field_key ?? '')
      const lab = (lid && labelByFieldId.get(lid)) || labelByKey.get(fk) || fk
      if (ft === 'signature') {
        flushParagraph(`  · ${lab}: 서명 저장됨 (파일/해시 기록)`)
        continue
      }
      const shown = String(v.value_text ?? '').trim() || '—'
      flushParagraph(`  · ${lab}: ${shown} (저장 시각: ${formatTsKor(v.updated_at)})`)
    }

    const ev = await loadEvidenceForDoc(pool, sid, String(d.id))
    flushParagraph('  [전자서명·증빙]')
    if (ev) {
      flushParagraph(`  · evidenceHash: ${String(ev.evidence_hash ?? '').trim() || '—'}`)
      flushParagraph(`  · 서명 완료 시각: ${formatTsKor(ev.signed_at)}`)
      flushParagraph(`  · signedPdfHash: ${hashPrefix(ev.signed_pdf_hash, 24)}`)
      flushParagraph(`  · 접속 IP(해시): ${hashPrefix(ev.ip_hash)}`)
      flushParagraph(`  · User-Agent: ${String(ev.user_agent ?? '').trim() || '—'}`)
      const sigBytes = await loadFileBuffer(pool, ev.signature_file_id)
      if (sigBytes) {
        const img = await tryEmbedRaster(pdfDoc, sigBytes)
        if (img) {
          const maxW = 140
          const scale = Math.min(maxW / img.width, 40 / img.height)
          const w = img.width * scale
          const h = img.height * scale
          if (y < MARGIN + h + LINE_HEIGHT * 3) {
            page = pdfDoc.addPage([A4_W, A4_H])
            y = A4_H - MARGIN
          }
          y -= 4
          page.drawText('  [서명 이미지(축소)]', { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) })
          y -= LINE_HEIGHT
          page.drawImage(img, { x: MARGIN + 10, y: y - h, width: w, height: h })
          y -= h + 6
        }
      }
    } else {
      flushParagraph('  증빙 행이 없습니다.')
    }
    y -= 4
  }

  if (completedConfirmationDocs.length > 0) {
    flushParagraph('— 무좌표 전자확인서: 확인서 항목·증빙 —')
    for (const d of completedConfirmationDocs) {
      flushParagraph(`▶ ${String(d.title_snapshot ?? d.id)} (전자확인서)`)
      flushParagraph(`  계약 템플릿: ${d.contract_template_title ?? '—'}`)
      flushParagraph('  PDF 템플릿: — (무좌표)')
      const cfRows = await loadConfirmationRoleAwareValues(pool, sid, String(d.template_id))
      const senderRows = cfRows.filter((r) => r.inputRole === 'sender')
      const customerRows = cfRows.filter((r) => r.inputRole === 'customer')
      const contentAck = await loadConfirmationContentAcknowledgement(pool, String(d.id))

      flushParagraph('  [발송자 입력 내용]')
      if (senderRows.length === 0) {
        flushParagraph('  · 발송자 입력 항목 없음')
      } else {
        for (const r of senderRows) {
          const shown = String(r.valueText ?? '').trim() || '입력 없음'
          flushParagraph(
            `  · ${r.label} (${r.fieldKey}, type=${r.inputType}, required=${r.required ? 'Y' : 'N'}, role=sender): ${shown}`,
          )
        }
      }

      flushParagraph('  [고객 입력 내용]')
      if (customerRows.length === 0) {
        flushParagraph('  · 고객 입력 항목 없음')
      } else {
        for (const r of customerRows) {
          const shown = String(r.valueText ?? '').trim() || '—'
          flushParagraph(
            `  · ${r.label} (${r.fieldKey}, type=${r.inputType}, required=${r.required ? 'Y' : 'N'}, role=customer): ${shown}`,
          )
        }
      }

      flushParagraph('  [발송자 입력 내용 고객 확인]')
      if (senderRows.length === 0) {
        flushParagraph('  · 발송자 입력 내용 없음')
      } else {
        flushParagraph(
          `  · ${contentAck.acknowledged ? '확인 완료' : '미완료'} @ ${formatTsKor(contentAck.acknowledgedAt)}`,
        )
      }

      flushParagraph('  [고객 확인 체크 항목]')
      if (confirmations.length === 0) {
        flushParagraph('  · 등록된 확인 체크 항목 없음')
      } else {
        for (const c of confirmations) {
          const checked = c.checked === true ? '완료' : '미완료'
          flushParagraph(`  · ${String(c.label ?? c.id)} (${c.required ? '필수' : '선택'}) — ${checked}`)
        }
      }

      flushParagraph('  [첨부자료 확인]')
      if (attachments.length === 0) {
        flushParagraph('  · 첨부자료 없음')
      } else {
        let idx = 0
        for (const a of attachments) {
          idx += 1
          flushParagraph(
            `  ${idx}. ${a.displayFilename ?? a.id} / 해시=${String(a.fileHash ?? '').trim() || '—'} / 확인=${a.confirmed ? formatTsKor(a.confirmedAt) : '미확인'} / 열람=${a.viewed ? formatTsKor(a.viewedAt) : '—'}`,
          )
        }
      }

      flushParagraph('  [문서 인스턴스 값(서명 등)]')
      const valsCo = await loadDocumentValues(pool, String(d.id))
      for (const v of valsCo) {
        const ft = String(v.field_type ?? '')
        const fk = String(v.field_key ?? '')
        if (ft === 'signature') {
          flushParagraph(
            `  · ${fk}: 서명 저장됨 (fileId=${v.value_file_id != null ? String(v.value_file_id) : '—'}, valueHash=${v.value_hash != null ? String(v.value_hash) : '—'}, updatedAt=${formatTsKor(v.updated_at)})`,
          )
          continue
        }
        const shown = String(v.value_text ?? '').trim() || '—'
        flushParagraph(`  · ${fk}: ${shown} (저장 시각: ${formatTsKor(v.updated_at)})`)
      }
      const evCo = await loadEvidenceForDoc(pool, sid, String(d.id))
      flushParagraph('  [전자확인·증빙]')
      if (evCo) {
        flushParagraph(`  · evidenceHash: ${String(evCo.evidence_hash ?? '').trim() || '—'}`)
        flushParagraph(`  · 완료 시각: ${formatTsKor(evCo.signed_at)}`)
        flushParagraph(`  · 완료 확인서 PDF 해시: ${hashPrefix(evCo.signed_pdf_hash ?? evCo.document_hash, 24)}`)
        flushParagraph(`  · 접속 IP(해시): ${hashPrefix(evCo.ip_hash)}`)
        flushParagraph(`  · User-Agent: ${String(evCo.user_agent ?? '').trim() || '—'}`)
        const sigBytesCo = await loadFileBuffer(pool, evCo.signature_file_id)
        if (sigBytesCo) {
          const imgCo = await tryEmbedRaster(pdfDoc, sigBytesCo)
          if (imgCo) {
            const maxW = 140
            const scale = Math.min(maxW / imgCo.width, 40 / imgCo.height)
            const w = imgCo.width * scale
            const h = imgCo.height * scale
            if (y < MARGIN + h + LINE_HEIGHT * 3) {
              page = pdfDoc.addPage([A4_W, A4_H])
              y = A4_H - MARGIN
            }
            y -= 4
            page.drawText('  [서명 이미지(축소)]', { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) })
            y -= LINE_HEIGHT
            page.drawImage(imgCo, { x: MARGIN + 10, y: y - h, width: w, height: h })
            y -= h + 6
          }
        }
      } else {
        flushParagraph('  증빙 행이 없습니다.')
      }
      y -= 4
    }
  }

  flushParagraph('— 섹션 4. 고객 확인 체크 항목 —')
  for (const c of confirmations) {
    const checked = c.checked === true ? '예' : '아니오'
    flushParagraph(`· ${c.label ?? c.id} — 확인: ${checked} @ ${formatTsKor(c.checkedAt)}`)
  }
  if (confirmations.length === 0) {
    flushParagraph('해당 없음')
  }
  y -= 6

  flushParagraph('— 섹션 5. 첨부자료 확인 내역 —')
  let attIdx = 0
  for (const a of attachments) {
    attIdx += 1
    flushParagraph(`${attIdx}. ${a.displayFilename ?? a.id}`)
    flushParagraph(`   종류: ${a.mimeType ?? '—'} / 크기: ${a.sizeBytes != null ? `${a.sizeBytes} bytes` : '—'} / 필수: ${a.required ? '예' : '아니오'}`)
    flushParagraph(`   파일 해시: ${String(a.fileHash ?? '').trim() || '—'}`)
    flushParagraph(`   열람: ${a.viewed ? formatTsKor(a.viewedAt) : '—'} / 확인: ${a.confirmed ? formatTsKor(a.confirmedAt) : '—'}`)
  }
  if (attachments.length === 0) {
    flushParagraph('첨부 없음')
  }
  y -= 6

  flushParagraph('— 섹션 7. 최종 문서 확인 및 제출 동의 —')
  flushParagraph(
    '“본인은 위 문서의 내용을 충분히 확인하였으며, 입력한 내용과 전자서명이 본인의 의사에 따라 직접 작성·서명된 것임을 확인하고, 본 전자서명 문서를 제출하는 데 동의합니다.”',
  )
  const lastEv = completedDocs.length
    ? await loadEvidenceForDoc(pool, sid, String(completedDocs[completedDocs.length - 1].id))
    : null
  flushParagraph(`동의·제출 처리: 예 (문서 완료 API 기준 시각: ${formatTsKor(lastEv?.signed_at)})`)
  flushParagraph(`제출 시 IP(해시): ${hashPrefix(lastEv?.ip_hash)}`)
  flushParagraph(`제출 시 User-Agent: ${String(lastEv?.user_agent ?? '').trim() || '—'}`)
  y -= 6

  flushParagraph('— 섹션 8. 무결성 정보 —')
  for (const d of completedDocs) {
    const ev = await loadEvidenceForDoc(pool, sid, String(d.id))
    flushParagraph(`· ${d.title_snapshot}: evidenceHash=${String(ev?.evidence_hash ?? '').trim() || '—'}`)
  }
  flushParagraph(`생성 시각(서버): ${formatTsKor(new Date().toISOString())} (Asia/Seoul 표기)`)
  flushParagraph('본 증빙서는 전자서명 완료 시점의 기록을 기준으로 생성되었습니다.')
  y -= 8

  const pages = pdfDoc.getPages()
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i]
    p.drawText(`시스템: 보험 FC 전자문서 · ${i + 1}/${pages.length}`, {
      x: MARGIN,
      y: 28,
      size: 7.5,
      font,
      color: rgb(0.35, 0.35, 0.35),
    })
  }

  const pdfBytes = await pdfDoc.save()
  return { buffer: Buffer.from(pdfBytes), downloadFilename }
}

function safeFilenameSeg(s) {
  const t = String(s ?? '').trim() || '문서'
  return t.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 72)
}
