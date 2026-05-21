/**
 * PDF 텍스트 줄바꿈·영역 초과 검사 — stampPdf 와 레이아웃 사전 검증에서 공통 사용.
 */

export const DEFAULT_FONT_SIZE_PT = 11
/** stampPdf 의 stampMultiLine 과 동일 */
export const MULTI_LINE_FACTOR = 1.35

/**
 * @typedef {import('pdf-lib').PDFFont} PDFFont
 */

/**
 * 서버 렌더·클라이언트 캔버스 측정이 동일한 규칙을 쓰도록 wrap 텍스트.
 */
export function wrapText(value, font, fontSize, maxWidthPt) {
  const result = []
  const paragraphs = String(value ?? '').split(/\r?\n/)
  for (const para of paragraphs) {
    if (maxWidthPt == null) {
      result.push(para)
      continue
    }
    if (para === '') {
      result.push('')
      continue
    }
    const words = para.split(/(\s+)/).filter((w) => w.length > 0)
    let line = ''
    for (const word of words) {
      const next = line + word
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidthPt || line === '') {
        line = next
      } else {
        result.push(line.trimEnd())
        line = word.trimStart()
      }
    }
    if (line) {
      result.push(line.trimEnd())
    }
  }
  return result
}

/**
 * @typedef {{ ok: boolean, message?: string, fieldLabel?: string, fieldKey?: string }} PdfLayoutAssertResult
 */

export function effectiveFontSizePt(baseFromPlacement, overridesByFieldKey, fieldKey) {
  const o = overridesByFieldKey?.[fieldKey]
  if (typeof o === 'number' && Number.isFinite(o) && o > 0) {
    return Math.round(o * 10) / 10
  }
  if (baseFromPlacement != null && Number.isFinite(baseFromPlacement) && baseFromPlacement > 0) {
    return Math.round(Number(baseFromPlacement) * 10) / 10
  }
  return DEFAULT_FONT_SIZE_PT
}

/**
 * @param {{ width: number | null | undefined }} placement
 */
function exceedsSingleLineHorizontal(font, text, fontSizePt, placement) {
  const w = placement.width
  const maxW = w != null && w > 0 ? w : null
  if (!text || maxW == null) return false
  return font.widthOfTextAtSize(text, fontSizePt) > maxW
}

function fail(fieldLabel, msg, fieldKey) {
  return {
    ok: false,
    message: `"${fieldLabel}" ${msg}`,
    fieldKey,
    fieldLabel,
  }
}

/**
 * text: 한 줄 규격 — 개행 시 공백으로 합친 뒤 가로 초과 검사.
 * 높이가 있으면 1줄 높이 박스에 맞는지(줄 수) 간접 검사.
 *
 * textarea: wrap 적용 후 세로 줄 수 제한 및 각 줄 가로 제한(double-check).
 *
 * @param {import('../schema/fieldSpec.js').FieldSpec} field
 * @param {PDFFont} font
 * @param {number} fontSizePt
 * @param {string} value
 * @returns {PdfLayoutAssertResult}
 */
export function assertTextFieldLayout(field, font, fontSizePt, value) {
  if (!value) return { ok: true }
  const lbl = field.label
  const lineHeight = fontSizePt * MULTI_LINE_FACTOR

  if (field.fieldType === 'text') {
    const flat = String(value).replace(/\r?\n/g, ' ').trimEnd()
    /* 오른쪽 과다 공백도 너비에 포함 — trimStart만 */
    const t = flat.trimStart()

    for (const p of field.placements) {
      const mw = p.width != null && p.width > 0 ? p.width : null
      if (mw != null && font.widthOfTextAtSize(t, fontSizePt) > mw) {
        return fail(lbl, `값이 입력 영역(가로)을 초과했습니다.`, field.fieldKey)
      }

      const mh = p.height != null && p.height > 0 ? p.height : null
      if (mh != null) {
        const maxLines = Math.max(1, Math.floor(mh / lineHeight))
        /*
         * 폭 없으면 wrap 이 한 줄 — 있으면 wrap 로 실제 줄 수 산출.
         * text 타입 폼은 한 줄 목적이라 maxLines 초과만 막음.
         */
        const wrapped = wrapText(t, font, fontSizePt, mw)
        if (wrapped.length > maxLines) {
          return fail(lbl, `값이 입력 영역(세로)을 초과했습니다.`, field.fieldKey)
        }
      }
    }
    return { ok: true }
  }

  if (field.fieldType === 'textarea') {
    const txt = String(value)
    for (const p of field.placements) {
      const mw = p.width != null && p.width > 0 ? p.width : null
      const mh = p.height != null && p.height > 0 ? p.height : null
      const lines = wrapText(txt, font, fontSizePt, mw)
      /* 개행 포함 단문단이 폭 무제한 일 때 줄이 너무 길면 */
      if (mw != null) {
        for (const line of lines) {
          if (font.widthOfTextAtSize(line, fontSizePt) > mw + 1e-6) {
            return fail(lbl, `값이 입력 영역(가로)을 초과했습니다.`, field.fieldKey)
          }
        }
      }
      if (mh != null) {
        const maxLines = Math.max(1, Math.floor(mh / lineHeight))
        if (lines.length > maxLines) {
          return fail(lbl, `값이 입력 영역(세로)을 초과했습니다.`, field.fieldKey)
        }
      }
    }
    return { ok: true }
  }

  return { ok: true }
}

/**
 * 모든 텍스트형 필드를 검사한다.
 *
 * @param {import('../schema/fieldSpec.js').FieldSpec[]} fields
 * @param {PDFFont} font
 * @param {Record<string, string>} normalizedValues
 * @param {Record<string, number>} fontSizeOverrides
 * @returns {PdfLayoutAssertResult}
 */
export function assertAllTextLayouts(fields, font, normalizedValues, fontSizeOverrides = {}) {
  for (const f of fields) {
    if (f.fieldType !== 'text' && f.fieldType !== 'textarea') continue
    const raw = normalizedValues[f.fieldKey] ?? ''
    const placement0 = f.placements[0]
    const baseFs = placement0?.fontSize ?? null
    const fsPt = effectiveFontSizePt(baseFs, fontSizeOverrides, f.fieldKey)
    const r = assertTextFieldLayout(f, font, fsPt, raw)
    if (!r.ok) return r
  }
  return { ok: true }
}

/**
 * 빈 문서에 한글 폰트만 임베드 후 텍스트 영역 초과 검사.
 *
 * @param {import('../schema/fieldSpec.js').FieldSpec[]} fields
 * @param {Record<string, string>} normalizedValues
 * @param {Record<string, number>} fontSizeOverrides
 */
export async function assertAllTextLayoutsWithEmbeddedFont(
  fields,
  normalizedValues,
  fontSizeOverrides = {},
) {
  const overrides = typeof fontSizeOverrides === 'object' && fontSizeOverrides != null ? fontSizeOverrides : {}
  const texts = fields.some(
    (f) =>
      (f.fieldType === 'text' || f.fieldType === 'textarea') &&
      String(normalizedValues[f.fieldKey] ?? '').length > 0,
  )
  if (!texts && Object.keys(overrides).length === 0) {
    return { ok: true }
  }

  const { PDFDocument } = await import('pdf-lib')
  const { embedKoreanFont } = await import('./fontProvider.js')
  const doc = await PDFDocument.create()
  const font = await embedKoreanFont(doc)
  return assertAllTextLayouts(fields, font, normalizedValues, overrides)
}
