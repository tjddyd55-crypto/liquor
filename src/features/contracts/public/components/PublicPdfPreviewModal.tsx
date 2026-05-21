import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { FormButton } from '../../../../components/form'
import { getPdfJsCmapAndStandardFontUrls } from '../../../../lib/pdfjs/pdfDocumentInitParams'
import { setupPdfWorker } from '../../../../lib/pdfjs/setupWorker'
import { copyPdfBytesForPdfJs } from '../../../pdf-engine/lib/pdfArrayBuffer'
import { isPdfJsRenderingCancelled } from '../../../pdf-engine/lib/pdfErrors'
import '../contract-public-sign.css'

setupPdfWorker()

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
const MAX_DPR = 3
const SCROLL_PAD_PX = 24

function clampZoom(s: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s))
}

type PdfJsPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>
type PdfPageRenderTask = ReturnType<PdfJsPage['render']>

export interface PublicPdfPreviewModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** 공개 PDF URL (검증된 경로). 새 창 열기·모달 내부 재시도에 사용 */
  pdfUrl: string
  /** 부모에서 이미 로드한 바이너리가 있으면 전달해 중복 fetch 방지 */
  initialPdfBytes?: ArrayBuffer | null
  /** 템플릿 기준 페이지 수(로딩 중 표시용) */
  pageCount: number
  /** 1-based */
  initialPageNo?: number
  /** 모달이 열릴 때마다 PDF 로드를 강제하려면 증가 */
  loadNonce?: number
  subtitle?: string
  footerSlot?: ReactNode
  /** 오류 로그용(선택) */
  documentInstanceId?: string
}

export function PublicPdfPreviewModal({
  open,
  onClose,
  title,
  pdfUrl,
  initialPdfBytes,
  pageCount,
  initialPageNo = 1,
  documentInstanceId,
  loadNonce = 0,
  subtitle,
  footerSlot,
}: PublicPdfPreviewModalProps) {
  const scrollHostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageRenderTaskRef = useRef<PdfPageRenderTask | null>(null)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)
  const basePageSizeRef = useRef<{ w: number; h: number } | null>(null)
  const lastEffectiveZoomRef = useRef(1)
  const pinchRef = useRef<{ initialDist: number; baseZoom: number } | null>(null)
  const renderGenRef = useRef(0)
  const paintGenRef = useRef(0)

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageNo, setPageNo] = useState(1)
  const [numPages, setNumPages] = useState(pageCount)
  /** 화면 너비 맞춤 vs 사용자 배율 */
  const [fitMode, setFitMode] = useState<'fit' | 'manual'>('fit')
  const [manualZoom, setManualZoom] = useState(1)
  /** fit 모드에서 리사이즈 시 재렌더 */
  const [hostWidthTick, setHostWidthTick] = useState(0)

  const computeEffectiveZoom = useCallback(
    (baseW: number): number => {
      if (baseW <= 0) {
        return clampZoom(manualZoom)
      }
      if (fitMode === 'manual') {
        return clampZoom(manualZoom)
      }
      const host = scrollHostRef.current?.clientWidth ?? 0
      if (host <= SCROLL_PAD_PX) {
        return clampZoom(manualZoom)
      }
      const w = host - SCROLL_PAD_PX
      return clampZoom(w / baseW)
    },
    [fitMode, manualZoom],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const prevOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const host = scrollHostRef.current
    if (!host) {
      return
    }
    const ro = new ResizeObserver(() => {
      if (fitMode === 'fit') {
        setHostWidthTick((t) => t + 1)
      }
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [open, fitMode, loading, loadError])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const el = scrollHostRef.current
    if (!el) {
      return
    }

    const pinchDist = (ev: TouchEvent): number | null => {
      if (ev.touches.length < 2) {
        return null
      }
      const [a, b] = [ev.touches[0], ev.touches[1]]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    const onTouchStart = (ev: TouchEvent) => {
      const d = pinchDist(ev)
      if (d != null && d > 0) {
        pinchRef.current = { initialDist: d, baseZoom: lastEffectiveZoomRef.current }
      }
    }

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length < 2 || !pinchRef.current) {
        return
      }
      const d = pinchDist(ev)
      if (d == null || pinchRef.current.initialDist <= 0) {
        return
      }
      ev.preventDefault()
      const next = clampZoom(pinchRef.current.baseZoom * (d / pinchRef.current.initialDist))
      setFitMode('manual')
      setManualZoom(next)
    }

    const onTouchEnd = (ev: TouchEvent) => {
      if (ev.touches.length < 2) {
        pinchRef.current = null
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [open, loading, loadError])

  useEffect(() => {
    if (!open) {
      return
    }
    setPageNo(Math.max(1, initialPageNo))
    setFitMode('fit')
    setManualZoom(1)
    setLoadError(null)
    setNumPages(Math.max(1, pageCount))
  }, [open, initialPageNo, pageCount])

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    const gen = ++renderGenRef.current

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        let buf: ArrayBuffer
        if (initialPdfBytes && initialPdfBytes.byteLength > 0) {
          buf = initialPdfBytes
        } else {
          const res = await fetch(pdfUrl, { credentials: 'include' })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const ct = res.headers.get('content-type') ?? ''
          if (!ct.includes('application/pdf')) {
            throw new Error(`unexpected content-type`)
          }
          buf = await res.arrayBuffer()
        }
        if (cancelled || gen !== renderGenRef.current) {
          return
        }
        const pdfJsBytes = copyPdfBytesForPdfJs(buf)
        const cmapFonts = getPdfJsCmapAndStandardFontUrls()
        const pdf = await getDocument({
          data: pdfJsBytes,
          ...cmapFonts,
          cMapPacked: true,
          useSystemFonts: true,
          disableFontFace: false,
        }).promise
        if (cancelled || gen !== renderGenRef.current) {
          void pdf.destroy().catch(() => {})
          return
        }
        const prev = pdfDocRef.current
        pdfDocRef.current = pdf
        if (prev && prev !== pdf) {
          void prev.destroy().catch(() => {})
        }
        const n = pdf.numPages
        setNumPages(n)
        setPageNo((p) => Math.min(Math.max(1, p), n))
        setLoading(false)
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('[public pdf modal]', { documentInstanceId, error: e })
        }
        if (!cancelled && gen === renderGenRef.current) {
          setLoadError('문서 미리보기를 불러오지 못했습니다.')
          setLoading(false)
          pdfDocRef.current = null
        }
      }
    }

    void load()

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
  }, [open, pdfUrl, initialPdfBytes, documentInstanceId, loadNonce])

  useEffect(() => {
    if (!open || loading || loadError) {
      return
    }
    const pdf = pdfDocRef.current
    if (!pdf) {
      return
    }

    let cancelled = false
    const paintGen = ++paintGenRef.current

    ;(async () => {
      const t = pageRenderTaskRef.current
      if (t) {
        try {
          t.cancel()
        } catch {
          /* ignore */
        }
        pageRenderTaskRef.current = null
      }

      try {
        const page = await pdf.getPage(pageNo)
        if (cancelled || paintGen !== paintGenRef.current) {
          return
        }
        const base = page.getViewport({ scale: 1 })
        basePageSizeRef.current = { w: base.width, h: base.height }
        const z = computeEffectiveZoom(base.width)
        lastEffectiveZoomRef.current = z
        const viewport = page.getViewport({ scale: z })
        const canvas = canvasRef.current
        if (!canvas || cancelled) {
          return
        }
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_DPR)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.style.maxWidth = 'none'

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, viewport.width, viewport.height)

        let task: PdfPageRenderTask | null = null
        try {
          task = page.render({ canvasContext: ctx, viewport, canvas })
          pageRenderTaskRef.current = task
          await task.promise
        } catch (e) {
          if (isPdfJsRenderingCancelled(e)) {
            return
          }
          throw e
        } finally {
          if (pageRenderTaskRef.current === task) {
            pageRenderTaskRef.current = null
          }
        }
      } catch (e) {
        if (!isPdfJsRenderingCancelled(e) && import.meta.env.DEV) {
          console.error('[public pdf modal render]', e)
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
  }, [open, loading, loadError, pageNo, pdfUrl, fitMode, manualZoom, hostWidthTick, computeEffectiveZoom])

  useEffect(() => {
    if (open) {
      return
    }
    renderGenRef.current += 1
    paintGenRef.current += 1
    const doc = pdfDocRef.current
    pdfDocRef.current = null
    if (doc) {
      void doc.destroy().catch(() => {})
    }
  }, [open])

  const bumpManualZoom = (delta: number) => {
    const baseW = basePageSizeRef.current?.w ?? 0
    const cur =
      fitMode === 'fit' && baseW > 0
        ? computeEffectiveZoom(baseW)
        : clampZoom(manualZoom)
    setFitMode('manual')
    setManualZoom(clampZoom(cur + delta))
  }

  const totalLabel = numPages > 0 ? numPages : Math.max(1, pageCount)

  if (!open) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || '계약서 미리보기'}
      className="public-pdf-preview-modal"
    >
      <header className="public-pdf-preview-modal__header">
        <div className="public-pdf-preview-modal__titles">
          <h2 className="public-pdf-preview-modal__title">{title || '계약서 미리보기'}</h2>
          {subtitle ? <p className="public-pdf-preview-modal__subtitle">{subtitle}</p> : null}
        </div>
        <FormButton htmlType="button" variant="secondary" onClick={onClose}>
          닫기
        </FormButton>
      </header>

      <div className="public-pdf-preview-modal__toolbar">
        <FormButton htmlType="button" variant="secondary" onClick={() => bumpManualZoom(ZOOM_STEP)} disabled={loading}>
          +
        </FormButton>
        <FormButton htmlType="button" variant="secondary" onClick={() => bumpManualZoom(-ZOOM_STEP)} disabled={loading}>
          -
        </FormButton>
        <FormButton
          htmlType="button"
          variant="secondary"
          onClick={() => {
            setFitMode('manual')
            setManualZoom(1)
          }}
          disabled={loading}
        >
          100%
        </FormButton>
        <FormButton
          htmlType="button"
          variant="secondary"
          onClick={() => {
            setFitMode('fit')
            setHostWidthTick((t) => t + 1)
          }}
          disabled={loading}
        >
          화면 맞춤
        </FormButton>
      </div>

      <div className="public-pdf-preview-modal__pager">
        <FormButton
          htmlType="button"
          variant="secondary"
          onClick={() => setPageNo((p) => Math.max(1, p - 1))}
          disabled={loading || pageNo <= 1}
        >
          이전
        </FormButton>
        <span className="public-pdf-preview-modal__page-label">
          {pageNo} / {totalLabel}
        </span>
        <FormButton
          htmlType="button"
          variant="secondary"
          onClick={() => setPageNo((p) => Math.min(totalLabel, p + 1))}
          disabled={loading || pageNo >= totalLabel}
        >
          다음
        </FormButton>
      </div>

      <div ref={scrollHostRef} className="public-pdf-preview-modal__scroll">
        {loading ? <p className="public-pdf-preview-modal__scroll-loading">PDF 불러오는 중…</p> : null}
        {loadError ? (
          <div className="public-pdf-preview-modal__error">
            <p className="public-pdf-preview-modal__error-msg">{loadError}</p>
            <div className="public-pdf-preview-modal__error-actions">
              <FormButton
                htmlType="button"
                variant="secondary"
                onClick={() => {
                  renderGenRef.current += 1
                  paintGenRef.current += 1
                  const t = pageRenderTaskRef.current
                  if (t) {
                    try {
                      t.cancel()
                    } catch {
                      /* ignore */
                    }
                    pageRenderTaskRef.current = null
                  }
                  setLoadError(null)
                  setLoading(true)
                  void (async () => {
                    const gen = renderGenRef.current
                    try {
                      const res = await fetch(pdfUrl, { credentials: 'include' })
                      if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`)
                      }
                      const buf = await res.arrayBuffer()
                      if (gen !== renderGenRef.current) {
                        return
                      }
                      const pdfJsBytes = copyPdfBytesForPdfJs(buf)
                      const cmapFonts = getPdfJsCmapAndStandardFontUrls()
                      const pdf = await getDocument({
                        data: pdfJsBytes,
                        ...cmapFonts,
                        cMapPacked: true,
                        useSystemFonts: true,
                        disableFontFace: false,
                      }).promise
                      if (gen !== renderGenRef.current) {
                        void pdf.destroy().catch(() => {})
                        return
                      }
                      const prev = pdfDocRef.current
                      pdfDocRef.current = pdf
                      if (prev && prev !== pdf) {
                        void prev.destroy().catch(() => {})
                      }
                      setNumPages(pdf.numPages)
                      setPageNo(1)
                      setLoadError(null)
                    } catch (e) {
                      if (import.meta.env.DEV) {
                        console.error('[public pdf modal retry]', e)
                      }
                      if (gen === renderGenRef.current) {
                        setLoadError('문서 미리보기를 불러오지 못했습니다.')
                      }
                    } finally {
                      if (gen === renderGenRef.current) {
                        setLoading(false)
                      }
                    }
                  })()
                }}
              >
                다시 시도
              </FormButton>
              <FormButton htmlType="button" variant="primary" onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}>
                새 창으로 열기
              </FormButton>
            </div>
          </div>
        ) : null}
        {!loading && !loadError ? (
          <div className="public-pdf-preview-modal__canvas-wrap">
            <div className="public-pdf-preview-modal__canvas-host">
              <canvas ref={canvasRef} role="img" aria-label={`PDF 페이지 ${pageNo}`} />
            </div>
          </div>
        ) : null}
      </div>
      {footerSlot ? <div className="public-pdf-preview-modal__footer">{footerSlot}</div> : null}
    </div>
  )
}
