/**
 * 원본 PDF 바이트 + 필드 정의 + 입력값 → 스탬핑된 PDF 바이트.
 */

import { PDFDocument, rgb } from 'pdf-lib'
import { embedKoreanFont } from './fontProvider.js'
import {
  DEFAULT_FONT_SIZE_PT,
  MULTI_LINE_FACTOR,
  effectiveFontSizePt,
  wrapText,
} from './pdfTextLayout.js'

/** @typedef {import('../schema/fieldSpec.js').FieldSpec} FieldSpec */
/** @typedef {FieldSpec['placements'][number]} Placement */

/** 사용자 입력 텍스트/마크는 항상 검정으로 고정한다. */
const STAMP_COLOR_BLACK = rgb(0, 0, 0)

function fontSizeForField(fieldKey, placement, overridesByFieldKey) {
  return effectiveFontSizePt(placement?.fontSize ?? null, overridesByFieldKey ?? {}, fieldKey)
}

function stampSingleLine({ page, font, placement, value, overridesByFieldKey, fieldKey }) {
  if (!value) return
  const fontSize = fontSizeForField(fieldKey, placement, overridesByFieldKey)
  const textWidth = font.widthOfTextAtSize(value, fontSize)
  let x = placement.x
  let y = placement.y
  if (placement.width && placement.width > 0) {
    const remain = placement.width - textWidth
    if (remain <= 0) {
      x = placement.x
    } else {
      x = placement.x + remain / 2
    }
  }
  if (placement.height && placement.height > 0) {
    y = placement.y + (placement.height - fontSize) / 2 + fontSize * 0.15
  }
  page.drawText(value, {
    x,
    y,
    size: fontSize,
    font,
    color: STAMP_COLOR_BLACK,
  })
}

function stampMultiLine({ page, font, placement, value, overridesByFieldKey, fieldKey }) {
  if (!value) return
  const fontSize = fontSizeForField(fieldKey, placement, overridesByFieldKey)
  const lineHeight = fontSize * MULTI_LINE_FACTOR
  const maxWidth = placement.width && placement.width > 0 ? placement.width : null
  const maxLines =
    placement.height && placement.height > 0 ? Math.max(1, Math.floor(placement.height / lineHeight)) : null

  const lines = wrapText(value, font, fontSize, maxWidth)
  const drawLines = maxLines != null ? lines.slice(0, maxLines) : lines

  drawLines.forEach((line, idx) => {
    page.drawText(line, {
      x: placement.x,
      y: placement.y - idx * lineHeight,
      size: fontSize,
      font,
      color: STAMP_COLOR_BLACK,
    })
  })
}

/** checkbox 라디오·체크 표시 영역 안에 라인 마크. */
function stampCheckMarkLines({ page, placement }) {
  const size =
    placement.fontSize && placement.fontSize > 0 ? placement.fontSize : DEFAULT_FONT_SIZE_PT
  const boxW = placement.width && placement.width > 0 ? placement.width : size
  const boxH = placement.height && placement.height > 0 ? placement.height : size
  const markSize = Math.min(boxW, boxH) * 0.85
  const left = placement.x + (boxW - markSize) / 2
  const bottom = placement.y + (boxH - markSize) / 2

  const p1 = { x: left + markSize * 0.1, y: bottom + markSize * 0.5 }
  const p2 = { x: left + markSize * 0.4, y: bottom + markSize * 0.15 }
  const p3 = { x: left + markSize * 0.9, y: bottom + markSize * 0.85 }
  const thickness = Math.max(1, markSize * 0.12)
  const color = STAMP_COLOR_BLACK
  page.drawLine({ start: p1, end: p2, thickness, color })
  page.drawLine({ start: p2, end: p3, thickness, color })
}

/** radio 선택: 빨간색 테두리 원만(내부 비채움). pdf-lib 는 color·borderColor 를 동시에 넣으면 채워진 원처럼 보일 수 있어 테두리만 지정한다. */
const STAMP_RADIO_OUTLINE = rgb(0.937, 0.267, 0.267)

/**
 * radio: 선택 영역 안에 빨간 테두리 원(지름=min(w,h)×0.8).
 * drawCircle 의 size 파라미터는 반경(semi-axis 류).
 */
function stampRadioCircleOutline({ page, placement }) {
  const boxW = placement.width && placement.width > 0 ? placement.width : DEFAULT_FONT_SIZE_PT
  const boxH = placement.height && placement.height > 0 ? placement.height : DEFAULT_FONT_SIZE_PT
  const diameter = Math.min(boxW, boxH) * 0.8
  const r = diameter / 2
  const cx = placement.x + boxW / 2
  const cy = placement.y + boxH / 2
  page.drawCircle({
    x: cx,
    y: cy,
    size: r,
    borderColor: STAMP_RADIO_OUTLINE,
    borderWidth: Math.max(1, r * 0.12),
  })
}

function stampCheckbox({ page, placement, value }) {
  if (!placement.optionValue) return
  if (!value) return
  let selected = []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return
    selected = parsed.filter((v) => typeof v === 'string')
  } catch {
    return
  }
  if (!selected.includes(placement.optionValue)) return
  stampCheckMarkLines({ page, placement })
}

function stampRadio({ page, placement, value }) {
  if (!value) return
  if (placement.optionValue !== value) return
  stampRadioCircleOutline({ page, placement })
}

function dispatchStamp(fieldType) {
  switch (fieldType) {
    case 'textarea':
      return stampMultiLine
    case 'text':
      return stampSingleLine
    case 'checkbox':
      return stampCheckbox
    case 'radio':
      return stampRadio
    case 'signature':
      return () => {}
    default: {
      throw new Error(`지원하지 않는 필드 타입: ${fieldType}`)
    }
  }
}

function shouldSkipEmpty(fieldType, value) {
  if (fieldType === 'checkbox') return false
  return !value
}

function needsFont(fieldType) {
  return fieldType === 'text' || fieldType === 'textarea'
}

async function stampSignatureField(pdfDoc, pages, field, pngBytes) {
  let image
  try {
    image = await pdfDoc.embedPng(pngBytes)
  } catch {
    return
  }
  const iw = image.width
  const ih = image.height
  for (const placement of field.placements) {
    const page = pages[placement.page]
    if (!page) {
      continue
    }
    const boxW = placement.width && placement.width > 0 ? placement.width : iw * 0.35
    const boxH = placement.height && placement.height > 0 ? placement.height : ih * 0.35
    const scale = Math.min(boxW / iw, boxH / ih)
    const w = iw * scale
    const h = ih * scale
    const left = placement.x + (boxW - w) / 2
    const bottom = placement.y + (boxH - h) / 2
    page.drawImage(image, { x: left, y: bottom, width: w, height: h })
  }
}

/**
 * @param {Buffer | Uint8Array} templatePdfBytes
 * @param {FieldSpec[]} fields
 * @param {Record<string, string>} values
 * @param {Record<string, Buffer | Uint8Array>} [signaturePngByFieldKey]
 * @param {Record<string, number>} [fontSizeOverridesByFieldKey] 필드별 런타임 글자 크기(pt)
 * @returns {Promise<Buffer>}
 */
export async function stampPdf(
  templatePdfBytes,
  fields,
  values,
  signaturePngByFieldKey = {},
  fontSizeOverridesByFieldKey = {},
) {
  const pdfDoc = await PDFDocument.load(templatePdfBytes)
  const pages = pdfDoc.getPages()
  if (pages.length === 0) {
    throw new Error('템플릿 PDF 에 페이지가 없습니다.')
  }

  const hasTextStamp = fields.some((f) => {
    if (!needsFont(f.fieldType)) return false
    const v = values[f.fieldKey] ?? ''
    return !shouldSkipEmpty(f.fieldType, v)
  })
  const font = hasTextStamp ? await embedKoreanFont(pdfDoc) : null

  const overrides =
    typeof fontSizeOverridesByFieldKey === 'object' && fontSizeOverridesByFieldKey != null
      ? fontSizeOverridesByFieldKey
      : {}

  for (const field of fields) {
    if (field.fieldType === 'signature') {
      const png = signaturePngByFieldKey[field.fieldKey]
      if (!png || png.length === 0) {
        continue
      }
      await stampSignatureField(pdfDoc, pages, field, png)
      continue
    }
    const value = values[field.fieldKey] ?? ''
    if (shouldSkipEmpty(field.fieldType, value)) {
      continue
    }
    const stamp = dispatchStamp(field.fieldType)
    for (const placement of field.placements) {
      const page = pages[placement.page]
      if (!page) {
        continue
      }
      stamp({ page, font, placement, value, overridesByFieldKey: overrides, fieldKey: field.fieldKey })
    }
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}
