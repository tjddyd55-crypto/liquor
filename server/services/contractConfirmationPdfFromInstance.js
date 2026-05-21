/**
 * 무좌표 전자확인서(confirmation_only) 완료 증서 PDF — 좌표형 스탬프 PDF 와 분리.
 */

import { PDFDocument, rgb } from 'pdf-lib'
import { embedKoreanFont } from '../pdf-engine/renderer/fontProvider.js'
import pool from '../db.js'

const A4_W = 595
const A4_H = 842
const MARGIN = 50
const FONT_SIZE = 9
const LINE_HEIGHT = 11
const MAX_TEXT_WIDTH = A4_W - MARGIN * 2
const CONFIRMATION_CONTENT_ACK_FIELD_KEY = '__confirmation_content_ack__'

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

function shortenId(s, max = 22) {
  const t = String(s ?? '').trim()
  if (!t) {
    return '—'
  }
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/**
 * @param {import('pdf-lib').PDFFont} font
 * @param {string} text
 * @param {number} [size]
 */
function wrapText(font, text, size = FONT_SIZE) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n')
  const out = []
  for (const para of raw.split('\n')) {
    let cur = ''
    for (const ch of para) {
      const next = cur + ch
      if (font.widthOfTextAtSize(next, size) <= MAX_TEXT_WIDTH) {
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

function displayOrDash(s) {
  const t = String(s ?? '').trim()
  return t.length > 0 ? t : '—'
}

function normalizeConfirmationInputRole(raw) {
  return String(raw ?? '').trim() === 'customer' ? 'customer' : 'sender'
}

/**
 * @param {string} sendSessionId
 * @param {string} documentInstanceId
 */
async function loadConfirmationFieldRowsForCertificate(sendSessionId, documentInstanceId) {
  const templateR = await pool.query(
    `
    SELECT template_id
    FROM contract_document_instances
    WHERE id = $1
    LIMIT 1
    `,
    [documentInstanceId],
  )
  const templateId = templateR.rows[0]?.template_id ? String(templateR.rows[0].template_id) : null
  if (!templateId) {
    return []
  }
  const defR = await pool.query(
    `
    SELECT id, field_key, label, required, sort_order, input_role
    FROM contract_template_confirmation_fields
    WHERE template_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [templateId],
  )
  if (defR.rows.length === 0) {
    return []
  }
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
    label: String(r.label ?? ''),
    required: Boolean(r.required),
    valueText: valueByFieldKey.get(String(r.field_key ?? '')) ?? '',
    inputRole: normalizeConfirmationInputRole(r.input_role),
  }))
}

/**
 * @param {string} documentInstanceId
 */
async function loadConfirmationContentAcknowledged(documentInstanceId) {
  const ackR = await pool.query(
    `
    SELECT value_text
    FROM contract_document_values
    WHERE document_instance_id = $1
      AND field_key = $2
    LIMIT 1
    `,
    [documentInstanceId, CONFIRMATION_CONTENT_ACK_FIELD_KEY],
  )
  return String(ackR.rows[0]?.value_text ?? '').trim() === 'true'
}

/**
 * @param {{
 *   documentTitle: string,
 *   contractTemplateTitle: string,
 *   completedAtIso: string,
 *   linkCode: string,
 *   documentInstanceId: string,
 *   sendSessionId: string,
 *   customerNameMasked?: string | null,
 *   customerPhoneMasked?: string | null,
 *   customerAddress?: string | null,
 *   sentAtIso?: string | null,
 *   openedAtIso?: string | null,
 *   sessionCreatedAtIso?: string | null,
 *   senderLine: string,
 *   gaName: string,
 *   confirmationFields: Array<{ label: string, required: boolean, valueText: string }>,
 *   confirmationItems: Array<{ label: string, required: boolean, checked: boolean }>,
 *   attachments: Array<{ displayFilename: string, required: boolean, confirmed: boolean }>,
 *   signaturePngBytes: Buffer,
 * }} p
 * @returns {Promise<Buffer>}
 */
export async function buildConfirmationCertificatePdfBuffer(p) {
  const sig = p.signaturePngBytes
  if (!sig || !Buffer.isBuffer(sig) || sig.length < 32) {
    throw new Error('confirmation_certificate_signature_bytes_invalid')
  }

  /** @type {Array<{ label: string, required: boolean, valueText: string, inputRole: 'sender' | 'customer' }>} */
  let roleAwareFields = []
  let confirmationContentAcknowledged = false
  try {
    roleAwareFields = await loadConfirmationFieldRowsForCertificate(String(p.sendSessionId), String(p.documentInstanceId))
    confirmationContentAcknowledged = await loadConfirmationContentAcknowledged(String(p.documentInstanceId))
  } catch {
    roleAwareFields = (p.confirmationFields ?? []).map((row) => ({
      label: row.label,
      required: row.required,
      valueText: row.valueText,
      inputRole: 'sender',
    }))
    confirmationContentAcknowledged = false
  }
  const senderFields = roleAwareFields.filter((row) => row.inputRole === 'sender')
  const customerFields = roleAwareFields.filter((row) => row.inputRole === 'customer')

  const pdfDoc = await PDFDocument.create()
  const font = await embedKoreanFont(pdfDoc)

  /** @type {import('pdf-lib').PDFPage} */
  let page = pdfDoc.addPage([A4_W, A4_H])
  let y = A4_H - MARGIN

  const flushParagraph = (text, size = FONT_SIZE) => {
    for (const line of wrapText(font, text, size)) {
      if (y < MARGIN + LINE_HEIGHT * 2) {
        page = pdfDoc.addPage([A4_W, A4_H])
        y = A4_H - MARGIN
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      })
      y -= LINE_HEIGHT
    }
  }

  flushParagraph('전자확인서 완료 증서', FONT_SIZE + 3)
  y -= 4
  flushParagraph(
    '본 문서는 전자적으로 확인 및 서명된 무좌표 전자확인서 완료 내역입니다. 원본 계약 PDF 템플릿이 없는 확인 전용 발송입니다.',
  )
  y -= 6

  flushParagraph('— 문서·세션 정보 —')
  flushParagraph(`문서 제목: ${displayOrDash(p.documentTitle)}`)
  flushParagraph(`계약 템플릿명: ${displayOrDash(p.contractTemplateTitle)}`)
  flushParagraph(`문서 인스턴스 ID: ${shortenId(p.documentInstanceId)}`)
  flushParagraph(`발송 세션 ID: ${shortenId(p.sendSessionId)}`)
  flushParagraph(`공개 링크 코드: ${shortenId(p.linkCode, 16)}`)
  flushParagraph(`완료 일시: ${formatTsKor(p.completedAtIso)}`)
  y -= 4

  flushParagraph('— 담당자·고객 —')
  flushParagraph(`발송자: ${displayOrDash(p.senderLine)}`)
  flushParagraph(`GA/회사: ${displayOrDash(p.gaName)}`)
  flushParagraph(`고객 표시명: ${displayOrDash(p.customerNameMasked)}`)
  flushParagraph(`연락처(마스킹): ${displayOrDash(p.customerPhoneMasked)}`)
  const addr = displayOrDash(p.customerAddress)
  if (addr !== '—') {
    flushParagraph(`주소: ${addr}`)
  }
  flushParagraph(`발송 기록 시각: ${formatTsKor(p.sentAtIso ?? p.sessionCreatedAtIso)}`)
  flushParagraph(`고객 열람 시각: ${formatTsKor(p.openedAtIso)}`)
  y -= 6

  flushParagraph('— 발송자 입력 내용 —')
  if (!senderFields.length) {
    flushParagraph('발송자 입력 항목 없음')
  } else {
    for (const row of senderFields) {
      const req = row.required ? '[필수] ' : ''
      const val = displayOrDash(row.valueText || '입력 없음')
      flushParagraph(`· ${req}${displayOrDash(row.label)}`)
      flushParagraph(`  ${val}`)
    }
  }
  y -= 6

  flushParagraph('— 고객 입력 내용 —')
  if (!customerFields.length) {
    flushParagraph('고객 입력 항목 없음')
  } else {
    for (const row of customerFields) {
      const req = row.required ? '[필수] ' : ''
      const val = displayOrDash(row.valueText)
      flushParagraph(`· ${req}${displayOrDash(row.label)}`)
      flushParagraph(`  ${val}`)
    }
  }
  y -= 6

  flushParagraph('— 고객 확인(발송자 입력 내용) —')
  if (!senderFields.length) {
    flushParagraph('발송자 입력 내용 없음')
  } else {
    flushParagraph(`· 위 내용을 확인했습니다 — ${confirmationContentAcknowledged ? '확인 완료' : '미완료'}`)
  }
  y -= 6

  flushParagraph('— 고객 확인 체크 —')
  if (!p.confirmationItems.length) {
    flushParagraph('등록된 자동 확인 항목 없음')
  } else {
    for (const c of p.confirmationItems) {
      const req = c.required ? '[필수] ' : ''
      const ok = c.checked ? '완료' : '미완료'
      flushParagraph(`· ${req}${displayOrDash(c.label)} — ${ok}`)
    }
  }
  y -= 6

  flushParagraph('— 첨부자료 확인(파일 본문은 포함하지 않음) —')
  if (!p.attachments.length) {
    flushParagraph('첨부 없음')
  } else {
    let i = 0
    for (const a of p.attachments) {
      i += 1
      const req = a.required ? '필수' : '선택'
      const ok = a.confirmed ? '확인 완료' : '미확인'
      flushParagraph(`${i}. ${displayOrDash(a.displayFilename)} (${req}) — ${ok}`)
    }
  }
  y -= 6

  flushParagraph('— 고객 전자서명 —')
  const img = await pdfDoc.embedPng(sig)
  const maxW = 200
  const maxH = 72
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  const w = img.width * scale
  const h = img.height * scale
  if (y < MARGIN + h + LINE_HEIGHT * 2) {
    page = pdfDoc.addPage([A4_W, A4_H])
    y = A4_H - MARGIN
  }
  page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h })
  y -= h + 8

  flushParagraph(
    '위 고객 확인·첨부 확인·전자서명 및 최종 완료 절차는 시스템에 기록되었으며, 본 PDF 는 그 요약 증서입니다.',
  )

  const out = await pdfDoc.save()
  return Buffer.from(out)
}
