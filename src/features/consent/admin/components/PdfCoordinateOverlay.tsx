import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { getPdfJsCmapAndStandardFontUrls } from '../../../../lib/pdfjs/pdfDocumentInitParams'
import { setupPdfWorker } from '../../../../lib/pdfjs/setupWorker'
import { copyPdfBytesForPdfJs } from '../../../pdf-engine/lib/pdfArrayBuffer'
import { isPdfJsRenderingCancelled } from '../../../pdf-engine/lib/pdfErrors'

type PdfJsPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>
type PdfPageRenderTask = ReturnType<PdfJsPage['render']>

/*
 * pdfjs 워커는 공용 SSOT 에서만 초기화한다 — Electron(file://) 환경에서도
 * 동일하게 동작하도록 Vite 의 ?worker 로 번들된 워커 인스턴스를 주입한다.
 */
setupPdfWorker()

export interface PdfMark {
  clientId: string
  x: number
  y: number
  key: string
  type: 'text' | 'signature'
  page: number
}

export interface PdfCoordinatePick {
  x: number
  y: number
  pageIndex: number
  pdfWidth: number
  pdfHeight: number
}

interface PdfCoordinateOverlayProps {
  pdfArrayBuffer: ArrayBuffer | null
  pageIndex: number
  marks: PdfMark[]
  clickEnabled: boolean
  onPick: (payload: PdfCoordinatePick) => void
  onDocumentReady?: (doc: PDFDocumentProxy) => void
}

export function PdfCoordinateOverlay({
  pdfArrayBuffer,
  pageIndex,
  marks,
  clickEnabled,
  onPick,
  onDocumentReady,
}: PdfCoordinateOverlayProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const markCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pdfSizeRef = useRef<{ w: number; h: number } | null>(null)
  const pageRenderTaskRef = useRef<PdfPageRenderTask | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const drawMarks = useCallback(() => {
    const pdfCanvas = canvasRef.current
    const markCanvas = markCanvasRef.current
    const pdfSize = pdfSizeRef.current
    if (!pdfCanvas || !markCanvas || !pdfSize) {
      return
    }
    markCanvas.width = pdfCanvas.width
    markCanvas.height = pdfCanvas.height
    markCanvas.style.width = pdfCanvas.style.width
    markCanvas.style.height = pdfCanvas.style.height
    const ctx = markCanvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, markCanvas.width, markCanvas.height)
    const pdfW = pdfSize.w
    const pdfH = pdfSize.h
    for (const m of marks) {
      if (m.page !== pageIndex) {
        continue
      }
      const cx = (m.x / pdfW) * markCanvas.width
      const cy = ((pdfH - m.y) / pdfH) * markCanvas.height
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.92)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillText(m.key, cx + 10, cy + 4)
    }
  }, [marks, pageIndex])

  useEffect(() => {
    drawMarks()
  }, [drawMarks])

  useEffect(() => {
    if (!pdfArrayBuffer) {
      const t = pageRenderTaskRef.current
      if (t) {
        try {
          t.cancel()
        } catch {
          /* ignore */
        }
        pageRenderTaskRef.current = null
      }
      queueMicrotask(() => {
        setStatus('idle')
        pdfSizeRef.current = null
      })
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      setStatus('loading')
    })

    ;(async () => {
      try {
        const pdfJsBytes = copyPdfBytesForPdfJs(pdfArrayBuffer)
        const cmapFonts = getPdfJsCmapAndStandardFontUrls()
        const pdf = await getDocument({
          data: pdfJsBytes,
          ...cmapFonts,
          cMapPacked: true,
          useSystemFonts: true,
          disableFontFace: false,
        }).promise
        if (cancelled) {
          void pdf.destroy().catch(() => {})
          return
        }
        onDocumentReady?.(pdf)
        const page = await pdf.getPage(pageIndex + 1)
        const base = page.getViewport({ scale: 1 })
        const wrap = wrapRef.current
        const canvas = canvasRef.current
        if (!canvas || !wrap || cancelled) {
          return
        }
        const maxW = Math.min(920, Math.max(320, wrap.clientWidth || 640))
        const scale = maxW / base.width
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        pdfSizeRef.current = { w: base.width, h: base.height }

        const prevTask = pageRenderTaskRef.current
        if (prevTask) {
          try {
            prevTask.cancel()
          } catch {
            /* ignore */
          }
          pageRenderTaskRef.current = null
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          if (!cancelled) {
            setStatus('error')
          }
          return
        }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        let task: PdfPageRenderTask | null = null
        try {
          task = page.render({ canvasContext: ctx, viewport, canvas })
          pageRenderTaskRef.current = task
          await task.promise
        } catch (e) {
          if (isPdfJsRenderingCancelled(e)) {
            return
          }
          if (!cancelled) {
            setStatus('error')
          }
          return
        } finally {
          if (pageRenderTaskRef.current === task) {
            pageRenderTaskRef.current = null
          }
        }
        if (cancelled) {
          return
        }
        setStatus('ready')
      } catch {
        if (!cancelled) {
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      const t = pageRenderTaskRef.current
      if (t) {
        try {
          t.cancel()
        } catch {
          /* ignore */
        }
        pageRenderTaskRef.current = null
      }
    }
  }, [pdfArrayBuffer, pageIndex, onDocumentReady])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!clickEnabled || status !== 'ready') {
      return
    }
    const canvas = canvasRef.current
    const pdfSize = pdfSizeRef.current
    if (!canvas || !pdfSize) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    const pdfW = pdfSize.w
    const pdfH = pdfSize.h
    const pdfX = (px / canvas.width) * pdfW
    const pdfY = pdfH - (py / canvas.height) * pdfH
    onPick({ x: pdfX, y: pdfY, pageIndex, pdfWidth: pdfW, pdfHeight: pdfH })
  }

  if (!pdfArrayBuffer) {
    return (
      <p className="consent-admin__coord-hint" style={{ margin: 0 }}>
        PDF 파일을 업로드하거나 기존 템플릿을 불러오면 미리보기가 표시됩니다.
      </p>
    )
  }

  return (
    <div>
      {status === 'loading' ? (
        <p className="consent-admin__coord-hint" style={{ margin: '0 0 8px' }}>
          PDF 렌더링 중…
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="consent-admin__err" style={{ marginBottom: 8 }}>
          PDF를 표시하지 못했습니다. 파일 형식을 확인해 주세요.
        </p>
      ) : null}
      <div ref={wrapRef} className="consent-admin__overlay-wrap">
        <canvas
          ref={canvasRef}
          className="consent-admin__pdf-canvas"
          onClick={handleClick}
          role="presentation"
          aria-label="PDF 좌표 선택 — 클릭하면 필드 위치가 등록됩니다"
  />
        <canvas ref={markCanvasRef} className="consent-admin__mark-canvas" aria-hidden />
      </div>
    </div>
  )
}
