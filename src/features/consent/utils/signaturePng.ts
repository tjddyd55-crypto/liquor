const TARGET_MAX_BYTES = 900 * 1024
const MIN_SCALE = 0.6
const SCALE_STEP = 0.1

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('서명 이미지를 생성하지 못했습니다.'))
          return
        }
        resolve(blob)
      },
      'image/png',
      0.92,
    )
  })
}

function drawScaledCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const next = document.createElement('canvas')
  next.width = Math.max(1, Math.floor(source.width * scale))
  next.height = Math.max(1, Math.floor(source.height * scale))
  const ctx = next.getContext('2d')
  if (!ctx) {
    throw new Error('서명 캔버스를 처리할 수 없습니다.')
  }
  ctx.imageSmoothingEnabled = false
  ctx.imageSmoothingQuality = 'low'
  ctx.clearRect(0, 0, next.width, next.height)
  ctx.drawImage(source, 0, 0, next.width, next.height)
  return next
}

/**
 * 서명 선(line-art) 특성상 PNG 용량이 크지 않지만,
 * 과도한 DPR/뷰포트에서 비정상적으로 커질 수 있어 상한을 둔다.
 */
export async function exportSignatureCanvasToPngBlob(
  canvas: HTMLCanvasElement,
  maxBytes = TARGET_MAX_BYTES,
): Promise<Blob> {
  let blob = await canvasToBlob(canvas)
  if (blob.size <= maxBytes) {
    return blob
  }

  let scale = 1 - SCALE_STEP
  while (scale >= MIN_SCALE) {
    const resized = drawScaledCanvas(canvas, scale)
    blob = await canvasToBlob(resized)
    if (blob.size <= maxBytes) {
      return blob
    }
    scale -= SCALE_STEP
  }

  throw new Error('서명 이미지 용량이 너무 큽니다. 캔버스를 지운 뒤 다시 시도해 주세요.')
}
