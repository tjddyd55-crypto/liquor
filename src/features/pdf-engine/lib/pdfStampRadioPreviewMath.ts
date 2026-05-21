/**
 * PDF 라디오 미리보기·좌표 편집기용 테두리 색/두께.
 * 미리보기/편집기는 placement 박스 width·height 전체에 맞춘 타원(또는 원) 테두리만 그린다.
 * stampPdf.js 의 min(w,h)×0.8 원형 스탬프와는 별도(서버 최종 PDF 전용).
 */

/** stampPdf 의 STAMP_RADIO_OUTLINE 과 동일 채널값 (rgb(0.937, 0.267, 0.267)) */
export const PDF_STAMP_RADIO_OUTLINE_CSS = 'rgb(239, 68, 68)'

/** stampPdf.js placement 폭·높이 폴백과 동일 (`DEFAULT_FONT_SIZE_PT` = 11) */
const DEFAULT_BOX_FALLBACK_PT = 11

/**
 * 라디오 원 지름 = min(boxW, boxH) × 0.8 (양수 폭·높이가 없으면 폴백).
 */
export function stampRadioDiameterFromBox(boxW: number, boxH: number): number {
  const w = Number.isFinite(boxW) && boxW > 0 ? boxW : DEFAULT_BOX_FALLBACK_PT
  const h = Number.isFinite(boxH) && boxH > 0 ? boxH : DEFAULT_BOX_FALLBACK_PT
  return Math.min(w, h) * 0.8
}

/** stampPdf: borderWidth = max(1, r * 0.12), r = 반경 */
export function stampRadioBorderWidthFromRadius(radius: number): number {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 4
  return Math.max(1, r * 0.12)
}
