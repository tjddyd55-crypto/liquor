import type { ApplicantPdfPageViewport } from './pdfApplicantPreviewTypes'

/** PDF 좌표(원점 좌하단)·pt 단위 상자를 미리보기 CSS 픽셀 상자로 변환한다. */
export function pdfPlacementBoxToCss(
  placement: {
    x: number
    y: number
    width: number | null | undefined
    height: number | null | undefined
  },
  view: ApplicantPdfPageViewport,
): { left: number; top: number; width: number; height: number } | null {
  const wPt = placement.width != null && placement.width > 0 ? placement.width : null
  const hPt = placement.height != null && placement.height > 0 ? placement.height : null
  if (wPt == null || hPt == null) return null

  const { widthPt: pw, heightPt: ph, cssWidthPx: cw, cssHeightPx: ch } = view

  const left = (placement.x / pw) * cw
  const boxTopPdf = ph - placement.y - hPt
  const top = (boxTopPdf / ph) * ch
  const width = (wPt / pw) * cw
  const height = (hPt / ph) * ch
  return { left, top, width, height }
}

/** PDF pt 단위 글자 크기를 해당 페이지 래스터 높이에 맞춘 CSS 픽셀로 환산한다. */
export function pdfFontPtToCssPx(fontSizePt: number, view: ApplicantPdfPageViewport): number {
  return (fontSizePt / view.heightPt) * view.cssHeightPx
}
