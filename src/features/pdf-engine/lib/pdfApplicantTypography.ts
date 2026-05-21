/**
 * 사용자 신청서 입력 — pdf-lib 과 동일한 줄바꿈·영역 검사를 브라우저 캔버스 폭 기준으로 수행한다.
 */

import type { PdfFieldSpec } from '../types'
import {
  PDF_APPLICANT_DEFAULT_FONT_PT,
  PDF_APPLICANT_FONT_MAX_PT,
  PDF_APPLICANT_FONT_MIN_PT,
  PDF_APPLICANT_LINE_HEIGHT_FACTOR,
  PDF_PT_TO_CSS_PX,
} from './pdfApplicantConstants'

let canvas: HTMLCanvasElement | null = null
function measureCtx(): CanvasRenderingContext2D {
  if (!canvas && typeof document !== 'undefined') canvas = document.createElement('canvas')
  const ctx = canvas?.getContext('2d')
  if (!ctx) {
    throw new Error('브라우저 canvas 2D 컨텍스트를 초기화할 수 없습니다.')
  }
  return ctx
}

function widthOf(text: string, fontSizePt: number): number {
  const ctx = measureCtx()
  ctx.font = `400 ${fontSizePt * PDF_PT_TO_CSS_PX}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`
  return ctx.measureText(text).width
}

/** 서버 pdfTextLayout.wrapText 와 동일한 알고리즘(폭 단위 일치 위해 PDF pt 를 CSS px 로 환산). */
export function wrapApplicantLines(value: string, fontSizePt: number, maxWidthPt: number | null): string[] {
  const result: string[] = []
  const maxWpx = maxWidthPt != null && maxWidthPt > 0 ? maxWidthPt * PDF_PT_TO_CSS_PX : null
  const paragraphs = String(value ?? '').split(/\r?\n/)
  for (const para of paragraphs) {
    if (maxWpx == null) {
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
      if (widthOf(next, fontSizePt) <= maxWpx || line === '') {
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

export function clampApplicantFontSizePt(raw: number): number {
  if (!Number.isFinite(raw)) return PDF_APPLICANT_DEFAULT_FONT_PT
  return Math.min(PDF_APPLICANT_FONT_MAX_PT, Math.max(PDF_APPLICANT_FONT_MIN_PT, Math.round(raw * 10) / 10))
}

export function effectiveApplicantFontSizePt(
  field: PdfFieldSpec,
  overrides: Record<string, number> | undefined,
): number {
  const k = field.fieldKey
  if (overrides && typeof overrides[k] === 'number' && Number.isFinite(overrides[k]) && overrides[k]! > 0) {
    return clampApplicantFontSizePt(overrides[k]!)
  }
  const p0 = field.placements[0]
  if (p0?.fontSize != null && p0.fontSize > 0) return clampApplicantFontSizePt(p0.fontSize)
  return PDF_APPLICANT_DEFAULT_FONT_PT
}

/**
 * 서버 `assertTextFieldLayout` 동형. 모든 placement 를 동시 만족해야 true.
 */
export function applicantTextFullyFits(field: PdfFieldSpec, fontSizePt: number, raw: string): boolean {
  if (!raw) return true
  if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return true

  const fsPt = clampApplicantFontSizePt(fontSizePt)
  const lineHeightPx = fsPt * PDF_PT_TO_CSS_PX * PDF_APPLICANT_LINE_HEIGHT_FACTOR

  if (field.fieldType === 'text') {
    const flat = String(raw).replace(/\r?\n/g, ' ')
    const t = flat.trimEnd().trimStart()
    for (const p of field.placements) {
      const mwPt = p.width != null && p.width > 0 ? p.width : null
      if (mwPt != null && widthOf(t, fsPt) > mwPt * PDF_PT_TO_CSS_PX + 1e-6) {
        return false
      }

      const mhPt = p.height != null && p.height > 0 ? p.height : null
      if (mhPt != null) {
        const maxLines = Math.max(1, Math.floor((mhPt * PDF_PT_TO_CSS_PX) / lineHeightPx))
        const wrapped = wrapApplicantLines(t, fsPt, mwPt)
        if (wrapped.length > maxLines) {
          return false
        }
      }
    }
    return true
  }

  const txt = String(raw)
  for (const p of field.placements) {
    const mwPt = p.width != null && p.width > 0 ? p.width : null
    const mhPt = p.height != null && p.height > 0 ? p.height : null

    const lines = wrapApplicantLines(txt, fsPt, mwPt)
    if (mwPt != null) {
      for (const line of lines) {
        if (widthOf(line, fsPt) > mwPt * PDF_PT_TO_CSS_PX + 1e-6) {
          return false
        }
      }
    }

    if (mhPt != null) {
      const maxLines = Math.max(1, Math.floor((mhPt * PDF_PT_TO_CSS_PX) / lineHeightPx))
      if (lines.length > maxLines) {
        return false
      }
    }
  }
  return true
}

export function truncateApplicantTextToFit(
  field: PdfFieldSpec,
  fontSizePt: number,
  proposed: string,
): string {
  if (applicantTextFullyFits(field, fontSizePt, proposed)) return proposed
  if (!proposed) return ''

  let low = 0
  let high = proposed.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const sliced = proposed.slice(0, mid)
    if (applicantTextFullyFits(field, fontSizePt, sliced)) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return proposed.slice(0, low)
}

/**
 * 첫 placement 기준으로 줄 수 표시 및 "더 넣을 수 있는지".
 * 더 넣을 여부는 접미 테스트 문자 하나로 근사 판별(입력 차단 로직과 정합).
 */
export function applicantTextLineStats(field: PdfFieldSpec, fontSizePt: number, raw: string): {
  linesUsed: number
  linesMax: number | null
  canGrow: boolean
} | null {
  if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return null

  const fsPt = clampApplicantFontSizePt(fontSizePt)
  const lineHeightPx = fsPt * PDF_PT_TO_CSS_PX * PDF_APPLICANT_LINE_HEIGHT_FACTOR

  const p0 = field.placements[0]
  const mwPt = p0?.width != null && p0.width > 0 ? p0.width : null
  const mhPt = p0?.height != null && p0.height > 0 ? p0.height : null
  const linesMax = mhPt != null ? Math.max(1, Math.floor((mhPt * PDF_PT_TO_CSS_PX) / lineHeightPx)) : null

  let linesUsed = 0
  if (field.fieldType === 'text') {
    const flat = String(raw).replace(/\r?\n/g, ' ')
    const t = flat.trimEnd().trimStart()
    linesUsed = t === '' ? 0 : wrapApplicantLines(t, fsPt, mwPt).length
  } else {
    linesUsed = raw.trim() === '' ? 0 : wrapApplicantLines(String(raw), fsPt, mwPt).length
  }

  const canGrow =
    truncateApplicantTextToFit(field, fsPt, `${raw}a`).length > raw.length ||
    truncateApplicantTextToFit(field, fsPt, `${raw}가`).length > raw.length

  return { linesUsed, linesMax, canGrow }
}
