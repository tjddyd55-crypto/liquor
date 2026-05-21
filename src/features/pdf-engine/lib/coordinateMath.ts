/**
 * 좌표 변환 순수 함수.
 *
 * 두 좌표계를 왕복한다:
 *   - 브라우저 캔버스 좌표 : 원점 좌상단, 단위 = 렌더 픽셀
 *   - PDF user space 좌표  : 원점 좌하단, 단위 = pt
 *
 * DB 에 저장하는 값은 항상 PDF user space. 그래야 렌더 배율·화면 DPI 에 독립적이다.
 *
 * 설계 원칙:
 *   - 입력/출력 모두 평범한 숫자 객체 (DOM·pdfjs 의존 금지) → 브라우저 없이 테스트 가능.
 *   - 좌표·크기 모두 "PDF 포인트" 단위. 에디터에서 width 를 드래그로 바꿀 때도
 *     동일하게 canvas px → PDF pt 로 변환해 저장한다.
 */

export interface PdfPageSize {
  /** PDF 포인트. 원본 페이지의 pt 단위 너비. */
  widthPt: number
  /** PDF 포인트. */
  heightPt: number
}

export interface CanvasSize {
  /** 렌더된 캔버스의 버퍼 픽셀 너비( devicePixelRatio 반영 시 width 속성 값 ). */
  width: number
  height: number
}

export interface CanvasPoint {
  /** 원점 좌상단, 캔버스 버퍼 픽셀(cssToCanvasPixels 등과 동일 기준). */
  x: number
  y: number
}

export interface PdfPoint {
  /** 원점 좌하단, pt. */
  x: number
  y: number
}

/**
 * 캔버스 픽셀 좌표를 PDF 포인트로 변환한다.
 *
 *    x_pt = x_px * (widthPt / canvasWidth)
 *    y_pt = heightPt - y_px * (heightPt / canvasHeight)
 *
 * canvas 의 너비/높이가 0 이면 (0,0) 으로 떨어진다(방어).
 */
export function canvasToPdf(
  point: CanvasPoint,
  canvas: CanvasSize,
  page: PdfPageSize,
): PdfPoint {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { x: 0, y: 0 }
  }
  const x = (point.x / canvas.width) * page.widthPt
  const y = page.heightPt - (point.y / canvas.height) * page.heightPt
  return { x: round2(x), y: round2(y) }
}

/**
 * PDF 포인트를 캔버스 픽셀로 변환한다(기존 placement 를 캔버스 위에 그릴 때).
 */
export function pdfToCanvas(
  point: PdfPoint,
  canvas: CanvasSize,
  page: PdfPageSize,
): CanvasPoint {
  if (page.widthPt <= 0 || page.heightPt <= 0) {
    return { x: 0, y: 0 }
  }
  const x = (point.x / page.widthPt) * canvas.width
  const y = ((page.heightPt - point.y) / page.heightPt) * canvas.height
  return { x: round2(x), y: round2(y) }
}

/**
 * 캔버스 기준 길이(예: 드래그한 상자의 너비 픽셀)를 PDF 포인트 길이로 환산한다.
 * 방향이 없는 스칼라라 부호를 그대로 유지한다.
 */
export function canvasLengthToPdf(
  canvasPx: number,
  canvas: CanvasSize,
  page: PdfPageSize,
  axis: 'x' | 'y',
): number {
  if (canvas.width <= 0 || canvas.height <= 0) return 0
  if (axis === 'x') {
    return round2((canvasPx / canvas.width) * page.widthPt)
  }
  return round2((canvasPx / canvas.height) * page.heightPt)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
