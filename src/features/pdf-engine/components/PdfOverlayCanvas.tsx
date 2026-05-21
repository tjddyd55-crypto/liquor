/**
 * PDF 페이지를 캔버스에 렌더하고, 그 위에 등록된 좌표(placement)를 시각화한다.
 *
 * 역할 분리:
 *   - 이 컴포넌트는 "렌더 + 좌표 픽(클릭/드래그)" 만 한다. 필드 상태 관리는 상위(Editor) 가.
 *   - 픽 이벤트는 PDF 포인트 좌표로 정규화해 상위에 전달한다 → 배율과 독립.
 *   - pdfjs 워커 설정은 setupPdfWorker() SSOT 에 위임 — Electron/웹 차이 흡수.
 *
 * 두 가지 픽 모드:
 *   - 'pick-point': 단일 클릭 → {x, y}
 *   - 'pick-box'  : 드래그 → {x, y, width, height}
 *     사용자가 실수로 "누르자마자 뗀" 드래그(이동 거리 매우 작음)는 무시해
 *     잡음 placement 생성을 막는다. 상위가 기본값을 주고 싶다면 pick-point 를 쓰면 된다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { canvasLengthToPdf, canvasToPdf } from '../lib/coordinateMath'
import { copyPdfBytesForPdfJs } from '../lib/pdfArrayBuffer'
import {
  describePdfLoadError,
  isPdfJsRenderingCancelled,
  messageForPdfLoadErrorCode,
  messageForPdfOverlayWarning,
  PdfLoadError,
  type PdfLoadErrorCode,
  type PdfOverlayWarningCode,
} from '../lib/pdfErrors'
import { logger } from '../../../lib/logger'
import { getPdfJsCmapAndStandardFontUrls } from '../../../lib/pdfjs/pdfDocumentInitParams'
import { setupPdfWorker } from '../../../lib/pdfjs/setupWorker'
import {
  PDF_STAMP_RADIO_OUTLINE_CSS,
  stampRadioBorderWidthFromRadius,
} from '../lib/pdfStampRadioPreviewMath'

setupPdfWorker()

/*
 * 캔버스 드로잉 전용 내부 상수.
 * 디자인 토큰 대상이 아닌 "마커 렌더 고유의 구현 상수" 라서 파일 상단에 모아둔다.
 * 디자인 변경 시 이곳만 손보면 된다.
 * (Canvas 2D fillStyle 은 CSS 변수 문자열을 일반적으로 쓰지 않는다.)
 */
/* eslint-disable no-restricted-syntax -- canvas 마커용 고정 RGBA */
const MARK_FILL_SELECTED = 'rgba(255, 77, 79, 0.98)'
const MARK_FILL_DEFAULT = 'rgba(0, 163, 255, 0.96)'
const MARK_STROKE = '#ffffff'
const MARK_LABEL_COLOR = '#ffffff'
const MARK_LABEL_BG = 'rgba(15, 23, 42, 0.9)'
const BOX_FILL_SELECTED = 'rgba(255, 77, 79, 0.16)'
const BOX_FILL_DEFAULT = 'rgba(0, 163, 255, 0.14)'
const BOX_STROKE_SELECTED = 'rgba(255, 77, 79, 0.98)'
const BOX_STROKE_DEFAULT = 'rgba(0, 163, 255, 0.95)'
const DRAG_PREVIEW_FILL = 'rgba(255, 77, 79, 0.12)'
const DRAG_PREVIEW_STROKE = 'rgba(255, 77, 79, 0.98)'
const PDF_CANVAS_BG = 'white'
/* eslint-enable no-restricted-syntax */

/**
 * 드래그 박스 픽이 유효하다고 판정하는 최소 치수(CSS 픽셀).
 * 실수 클릭·떨림으로 아주 얇은 박스가 생기는 걸 막는다.
 */
const MIN_BOX_SIZE_PX = 6

/**
 * 미리보기에서 한 페이지가 차지하는 CSS 가로 폭 목표(A4 96dpi 근사).
 * 저장 좌표(PDF pt)와 무관 — canvas 픽셀 ↔ pt 는 coordinateMath 가 처리한다.
 */
const TARGET_PAGE_CSS_WIDTH_PX = 794

/** 매우 좁은 뷰포트에서의 하한. */
const MIN_PAGE_CSS_WIDTH_PX = 260

/** 상위에서 그려야 할 마커 한 개. */
export interface OverlayMark {
  id: string
  pageIndex: number
  /** PDF 포인트. 원점 좌하단. */
  x: number
  y: number
  /**
   * PDF 포인트 기준 박스 크기. 있으면 사각형 박스 마커로 렌더한다.
   * 둘 중 하나라도 null/undefined 면 점 마커로 폴백(기존 placement 하위 호환).
   */
  width?: number | null
  height?: number | null
  /** 마커 라벨(필드 라벨). */
  label: string
  /** 선택된 상태(강조). */
  selected?: boolean
  /**
   * true 이면 stampPdf 라디오와 동일: placement 박스 안에 빨간 테두리 원만 추가(저장 필드 타입 변경 없음).
   */
  stampRadioOutline?: boolean
}

export interface OverlayPick {
  /** PDF 포인트. 박스 모드에선 좌하단 꼭짓점. */
  x: number
  y: number
  /** 박스 모드에서만 채워짐(PDF 포인트). */
  width?: number
  height?: number
  /** 현재 페이지 인덱스. */
  pageIndex: number
  /** 변환 기준 PDF 페이지 크기. */
  pdfWidth: number
  pdfHeight: number
}

export type OverlayPickMode = 'pick-point' | 'pick-box'

/** 개발용 진단 로그 — 전체 스토리지 경로·민감 URL 은 넣지 않는다. */
export interface PdfOverlayDebugMeta {
  pdfTemplateId?: number
  serverPageCount?: number
  /** API 경로만 (예: /api/admin/pdf-templates/12/file) */
  fetchUrlPath?: string
}

interface Props {
  pdfBuffer: ArrayBuffer | null
  pageIndex: number
  marks: OverlayMark[]
  clickEnabled: boolean
  onPick: (p: OverlayPick) => void
  onSelectMark?: (markId: string) => void
  onDocumentReady?: (doc: PDFDocumentProxy) => void
  /** 기본 'pick-point'. 'pick-box' 이면 드래그로 영역을 잡는다. */
  mode?: OverlayPickMode
  debugMeta?: PdfOverlayDebugMeta
}

/**
 * CSS 픽셀 좌표 → 실제 캔버스 버퍼 픽셀 좌표로 변환.
 * getBoundingClientRect 기준 (CSS 픽셀) 과 canvas.width/height(디바이스 픽셀) 은 비율이 다를 수 있다.
 */
function cssToCanvasPixels(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

interface DragState {
  /** 캔버스 버퍼 좌표(픽셀). */
  startX: number
  startY: number
  currentX: number
  currentY: number
}

type PdfJsPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>
type PdfPageRenderTask = ReturnType<PdfJsPage['render']>

/** paint 가 취소·대체됨 → 호출측은 fatal 을 올리지 않고 조용히 빠진다. */
type PaintPdfOutcome = 'rendered' | 'aborted'

const MAX_PDF_PREVIEW_DEVICE_PIXEL_RATIO = 3

async function paintPdfPageToCanvas(payload: {
  page: PdfJsPage
  pageIndex: number
  previewInnerWidth: number
  cancelled: () => boolean
  gen: number
  loadGenRef: MutableRefObject<number>
  layoutHostRef: MutableRefObject<HTMLDivElement | null>
  wrapRef: MutableRefObject<HTMLDivElement | null>
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
  pageSizeRef: MutableRefObject<{ widthPt: number; heightPt: number } | null>
  pageRenderTaskRef: MutableRefObject<PdfPageRenderTask | null>
}): Promise<PaintPdfOutcome> {
  const {
    page,
    pageIndex,
    previewInnerWidth,
    cancelled,
    gen,
    loadGenRef,
    layoutHostRef,
    wrapRef,
    canvasRef,
    pageSizeRef,
    pageRenderTaskRef,
  } = payload

  const base = page.getViewport({ scale: 1 })
  let wrap = wrapRef.current
  let canvas = canvasRef.current
  if (!wrap || !canvas) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    if (cancelled() || gen !== loadGenRef.current) return 'aborted'
    wrap = wrapRef.current
    canvas = canvasRef.current
  }
  if (cancelled() || gen !== loadGenRef.current) return 'aborted'
  if (!wrap || !canvas) {
    throw new PdfLoadError('page-render-failed', {
      reason: 'wrap-or-canvas-unavailable',
      pageIndex,
    })
  }

  /*
   * 스케일 기준 폭은 "미리보기 스크롤 영역 전체"(layoutHost)만 사용한다.
   * wrap(오버레이)는 초기 HTML canvas 기본 폭(300px) 등으로 좁게 잡혀
   * min(794, 300) 축소가 고착되는 문제가 있다.
   */
  const hostW = layoutHostRef.current?.clientWidth ?? 0
  const innerW =
    hostW > 0 ? hostW : previewInnerWidth > 0 ? previewInnerWidth : TARGET_PAGE_CSS_WIDTH_PX
  const targetCssW = Math.max(
    MIN_PAGE_CSS_WIDTH_PX,
    Math.min(TARGET_PAGE_CSS_WIDTH_PX, innerW),
  )
  const scale = targetCssW / base.width
  const viewport = page.getViewport({ scale })
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(window.devicePixelRatio || 1, MAX_PDF_PREVIEW_DEVICE_PIXEL_RATIO)
      : 1
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  pageSizeRef.current = { widthPt: base.width, heightPt: base.height }

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
    throw new PdfLoadError('page-render-failed', { reason: 'canvas-2d-context-null' })
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = PDF_CANVAS_BG
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  let task: PdfPageRenderTask | null = null
  try {
    task = page.render({ canvasContext: ctx, viewport, canvas })
    pageRenderTaskRef.current = task
    await task.promise
  } catch (e) {
    if (isPdfJsRenderingCancelled(e)) {
      return 'aborted'
    }
    throw new PdfLoadError(
      'page-render-failed',
      { pageIndex, canvasW: canvas.width, canvasH: canvas.height },
      e,
    )
  } finally {
    if (pageRenderTaskRef.current === task) {
      pageRenderTaskRef.current = null
    }
  }
  return 'rendered'
}

export function PdfOverlayCanvas({
  pdfBuffer,
  pageIndex,
  marks,
  clickEnabled,
  onPick,
  onSelectMark,
  onDocumentReady,
  mode = 'pick-point',
  debugMeta,
}: Props) {
  const layoutHostRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const markCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageSizeRef = useRef<{ widthPt: number; heightPt: number } | null>(null)
  /** 동일 원본 ArrayBuffer 참조에 대해 pdfjs 문서를 재파싱하지 않기 위한 캐시(참조는 prop 그대로). */
  const pdfDocCacheRef = useRef<{ sourceRef: ArrayBuffer; doc: PDFDocumentProxy } | null>(null)
  /** 동일 캔버스에 겹치는 page.render 를 막기 위해 최신 태스크만 추적·취소한다. */
  const pageRenderTaskRef = useRef<PdfPageRenderTask | null>(null)
  const loadGenRef = useRef(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [fatalErrorCode, setFatalErrorCode] = useState<PdfLoadErrorCode | 'unknown' | null>(null)
  const [warningCode, setWarningCode] = useState<PdfOverlayWarningCode | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** 미리보기 래퍼 가로폭 — ResizeObserver 로 갱신해 A4 목표 폭(794px) 스케일을 맞춘다. */
  const [previewInnerWidth, setPreviewInnerWidth] = useState(0)

  /** 드래그 중 프리뷰 박스 하나를 marks 위에 덧그린다. 렌더가 별 함수로 빠져 있어야
      drawMarks 의 단일 책임을 해치지 않는다. */
  const drawPreviewBox = useCallback((ctx: CanvasRenderingContext2D, d: DragState) => {
    const x = Math.min(d.startX, d.currentX)
    const y = Math.min(d.startY, d.currentY)
    const w = Math.abs(d.currentX - d.startX)
    const h = Math.abs(d.currentY - d.startY)
    ctx.fillStyle = DRAG_PREVIEW_FILL
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = DRAG_PREVIEW_STROKE
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
  }, [])

  const drawMarks = useCallback(() => {
    const pdfCanvas = canvasRef.current
    const markCanvas = markCanvasRef.current
    const pageSize = pageSizeRef.current
    if (!pdfCanvas || !markCanvas || !pageSize) return

    markCanvas.width = pdfCanvas.width
    markCanvas.height = pdfCanvas.height
    markCanvas.style.width = pdfCanvas.style.width
    markCanvas.style.height = pdfCanvas.style.height
    const ctx = markCanvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, markCanvas.width, markCanvas.height)

    for (const m of marks) {
      if (m.pageIndex !== pageIndex) continue
      const cx = (m.x / pageSize.widthPt) * markCanvas.width
      /* 원점이 좌하단이라 y 축을 뒤집어 준다. */
      const cyBottom = ((pageSize.heightPt - m.y) / pageSize.heightPt) * markCanvas.height

      const hasBox = typeof m.width === 'number' && typeof m.height === 'number' && m.width > 0 && m.height > 0
      if (hasBox) {
        /* PDF 의 width/height 를 캔버스 픽셀로 환산. y 는 좌하단 원점이므로
           박스의 "위쪽 모서리" 는 cyBottom - heightPx. */
        const widthPx = ((m.width as number) / pageSize.widthPt) * markCanvas.width
        const heightPx = ((m.height as number) / pageSize.heightPt) * markCanvas.height
        const boxX = cx
        const boxY = cyBottom - heightPx

        if (m.stampRadioOutline) {
          const cxPx = boxX + widthPx / 2
          const cyPx = boxY + heightPx / 2
          const rx = widthPx / 2
          const ry = heightPx / 2
          const lw = stampRadioBorderWidthFromRadius(Math.min(rx, ry))
          ctx.beginPath()
          ctx.ellipse(cxPx, cyPx, rx, ry, 0, 0, Math.PI * 2)
          ctx.strokeStyle = PDF_STAMP_RADIO_OUTLINE_CSS
          ctx.lineWidth = lw
          ctx.stroke()
          if (m.selected) {
            ctx.beginPath()
            ctx.ellipse(cxPx, cyPx, rx, ry, 0, 0, Math.PI * 2)
            ctx.strokeStyle = BOX_STROKE_SELECTED
            ctx.lineWidth = 2
            ctx.stroke()
          }
        } else {
          ctx.fillStyle = m.selected ? BOX_FILL_SELECTED : BOX_FILL_DEFAULT
          ctx.fillRect(boxX, boxY, widthPx, heightPx)
          ctx.strokeStyle = m.selected ? BOX_STROKE_SELECTED : BOX_STROKE_DEFAULT
          ctx.lineWidth = m.selected ? 2 : 1.5
          ctx.strokeRect(boxX, boxY, widthPx, heightPx)
        }

        drawMarkLabel(ctx, m.label, boxX + 2, boxY - 4)
      } else {
        /* 점 마커(기존 placement 하위 호환). */
        ctx.beginPath()
        ctx.arc(cx, cyBottom, m.selected ? 9 : 7, 0, Math.PI * 2)
        ctx.fillStyle = m.selected ? MARK_FILL_SELECTED : MARK_FILL_DEFAULT
        ctx.fill()
        ctx.strokeStyle = MARK_STROKE
        ctx.lineWidth = 2
        ctx.stroke()
        drawMarkLabel(ctx, m.label, cx + 11, cyBottom + 4)
      }
    }

    if (drag) drawPreviewBox(ctx, drag)
  }, [marks, pageIndex, drag, drawPreviewBox])

  /*
   * status 도 의존성에 넣는다.
   * PDF 첫 로드 완료 시점에는 marks·pageIndex 가 바뀌지 않아
   * drawMarks 이펙트가 재실행되지 않기 때문에,
   * 'ready' 전이를 트리거로 삼아 기존 placement 가 누락되지 않게 한다.
   */
  useEffect(() => {
    if (status !== 'ready') return
    drawMarks()
  }, [drawMarks, status, previewInnerWidth])

  useEffect(() => {
    return () => {
      void pdfDocCacheRef.current?.doc.destroy().catch(() => {})
      pdfDocCacheRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!pdfBuffer) {
      return
    }
    const el = layoutHostRef.current
    if (!el) {
      return
    }
    const apply = () => {
      setPreviewInnerWidth(el.clientWidth)
    }
    const ro = new ResizeObserver(() => apply())
    ro.observe(el)
    queueMicrotask(apply)
    return () => {
      ro.disconnect()
    }
  }, [pdfBuffer])

  useEffect(() => {
    /*
     * 외부 prop(pdfBuffer/pageIndex/previewInnerWidth) 에 맞춰 렌더한다.
     * 동일 pdfBuffer 참조면 getDocument 는 생략하고 페이지 raster 만 갱신한다.
     * getDocument에는 원본 ArrayBuffer 를 넘기지 않는다(transfer 로 detach 됨).
     * loadGenRef 로 오래된 비동게 완료가 UI 를 덮어쓰지 않게 한다.
     */
    if (!pdfBuffer) {
      const t = pageRenderTaskRef.current
      if (t) {
        try {
          t.cancel()
        } catch {
          /* ignore */
        }
        pageRenderTaskRef.current = null
      }
      void pdfDocCacheRef.current?.doc.destroy().catch(() => {})
      pdfDocCacheRef.current = null
      setStatus('idle')
      setFatalErrorCode(null)
      setWarningCode(null)
      pageSizeRef.current = null
      return
    }

    const myGen = ++loadGenRef.current
    let cancelled = false
    setStatus('loading')
    setFatalErrorCode(null)
    setWarningCode(null)

    void (async () => {
      let sourceByteLength = 0
      let parseOk = false
      let renderOk = false
      let numPagesForLog: number | undefined
      try {
        sourceByteLength = pdfBuffer.byteLength

        let pdf: PDFDocumentProxy
        let documentCallbackError: unknown = null
        const cached = pdfDocCacheRef.current
        const reuseDoc = Boolean(cached && cached.sourceRef === pdfBuffer)

        if (reuseDoc && cached) {
          pdf = cached.doc
          parseOk = true
        } else {
          if (cached) {
            void cached.doc.destroy().catch(() => {})
            pdfDocCacheRef.current = null
          }
          try {
            const pdfJsBytes = copyPdfBytesForPdfJs(pdfBuffer)
            const cmapFonts = getPdfJsCmapAndStandardFontUrls()
            pdf = await getDocument({
              data: pdfJsBytes,
              ...cmapFonts,
              cMapPacked: true,
              useSystemFonts: true,
              disableFontFace: false,
            }).promise
          } catch (e) {
            throw new PdfLoadError('parse-failed', { byteLength: sourceByteLength }, e)
          }
          parseOk = true
          if (cancelled || myGen !== loadGenRef.current) {
            void pdf.destroy().catch(() => {})
            return
          }
          pdfDocCacheRef.current = { sourceRef: pdfBuffer, doc: pdf }
          try {
            onDocumentReady?.(pdf)
          } catch (cbErr) {
            documentCallbackError = cbErr
          }
        }

        if (cancelled || myGen !== loadGenRef.current) return

        numPagesForLog = pdf.numPages
        const pageNum = pageIndex + 1
        if (pageNum < 1 || pageNum > pdf.numPages) {
          throw new PdfLoadError('page-fetch-failed', {
            pageIndex,
            pageNum,
            numPages: pdf.numPages,
          })
        }

        let page: PdfJsPage
        try {
          page = await pdf.getPage(pageNum)
        } catch (e) {
          throw new PdfLoadError(
            'page-fetch-failed',
            { pageIndex, pageNum, numPages: pdf.numPages },
            e,
          )
        }

        if (cancelled || myGen !== loadGenRef.current) return

        const paintOutcome = await paintPdfPageToCanvas({
          page,
          pageIndex,
          previewInnerWidth,
          cancelled: () => cancelled,
          gen: myGen,
          loadGenRef,
          layoutHostRef,
          wrapRef,
          canvasRef,
          pageSizeRef,
          pageRenderTaskRef,
        })
        if (cancelled || myGen !== loadGenRef.current) return

        if (paintOutcome === 'aborted') {
          return
        }
        renderOk = true

        if (documentCallbackError != null) {
          if (logger.isDev) {
            console.warn('[pdf.overlay] onDocumentReady threw (preview still usable)', {
              pdfTemplateId: debugMeta?.pdfTemplateId,
              error:
                documentCallbackError instanceof Error
                  ? { name: documentCallbackError.name, message: documentCallbackError.message }
                  : String(documentCallbackError),
            })
          }
          setWarningCode('document-callback-failed')
        } else {
          setWarningCode(null)
        }

        setFatalErrorCode(null)
        setStatus('ready')
      } catch (e) {
        if (cancelled || myGen !== loadGenRef.current) return
        const { code } = describePdfLoadError(e)
        setWarningCode(null)
        setFatalErrorCode(code)
        setStatus('error')
        if (logger.isDev) {
          console.error('[pdf.overlay] load failure', {
            pdfTemplateId: debugMeta?.pdfTemplateId,
            selectedPageNo: pageIndex + 1,
            pageCount: numPagesForLog,
            serverPageCount: debugMeta?.serverPageCount,
            fetchUrlPath: debugMeta?.fetchUrlPath,
            byteLength: sourceByteLength,
            renderSucceeded: renderOk,
            parserSucceeded: parseOk,
            error:
              e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
          })
        }
        logger.error('pdf.overlay.load-failed', {
          code,
          pageIndex,
          byteLength: sourceByteLength,
          error: e,
        })
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
  }, [
    pdfBuffer,
    pageIndex,
    previewInnerWidth,
    onDocumentReady,
    debugMeta?.pdfTemplateId,
    debugMeta?.serverPageCount,
    debugMeta?.fetchUrlPath,
  ])

  /* ---------- 포인트 모드: 단순 클릭 ---------- */

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'pick-point') return
    if (!clickEnabled || status !== 'ready') return
    const canvas = canvasRef.current
    const pageSize = pageSizeRef.current
    if (!canvas || !pageSize) return

    const { x: px, y: py } = cssToCanvasPixels(e.clientX, e.clientY, canvas)

    const pdf = canvasToPdf(
      { x: px, y: py },
      { width: canvas.width, height: canvas.height },
      { widthPt: pageSize.widthPt, heightPt: pageSize.heightPt },
    )
    onPick({
      x: pdf.x,
      y: pdf.y,
      pageIndex,
      pdfWidth: pageSize.widthPt,
      pdfHeight: pageSize.heightPt,
    })
  }

  /* ---------- 박스 모드: 드래그 ---------- */

  const trySelectExistingMark = useCallback(
    (clientX: number, clientY: number): boolean => {
      const canvas = canvasRef.current
      const pageSize = pageSizeRef.current
      if (!canvas || !pageSize) return false
      const { x, y } = cssToCanvasPixels(clientX, clientY, canvas)
      const hitRadius = 12
      const pageMarks = [...marks].filter((m) => m.pageIndex === pageIndex).reverse()
      for (const m of pageMarks) {
        const cx = (m.x / pageSize.widthPt) * canvas.width
        const cyBottom = ((pageSize.heightPt - m.y) / pageSize.heightPt) * canvas.height
        const hasBox = typeof m.width === 'number' && typeof m.height === 'number' && m.width > 0 && m.height > 0
        if (hasBox) {
          const widthPx = ((m.width as number) / pageSize.widthPt) * canvas.width
          const heightPx = ((m.height as number) / pageSize.heightPt) * canvas.height
          const boxX = cx
          const boxY = cyBottom - heightPx
          if (x >= boxX && x <= boxX + widthPx && y >= boxY && y <= boxY + heightPx) {
            onSelectMark?.(m.id)
            return true
          }
          continue
        }
        const dx = x - cx
        const dy = y - cyBottom
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          onSelectMark?.(m.id)
          return true
        }
      }
      return false
    },
    [marks, onSelectMark, pageIndex],
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'pick-box') return
    if (!clickEnabled || status !== 'ready') return
    if (e.button !== 0) return
    if (trySelectExistingMark(e.clientX, e.clientY)) {
      e.preventDefault()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const { x, y } = cssToCanvasPixels(e.clientX, e.clientY, canvas)
    setDrag({ startX: x, startY: y, currentX: x, currentY: y })
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag) return
    const canvas = canvasRef.current
    if (!canvas) return
    const { x, y } = cssToCanvasPixels(e.clientX, e.clientY, canvas)
    setDrag({ ...drag, currentX: x, currentY: y })
  }

  const finalizeDrag = useCallback(() => {
    if (!drag) return
    const canvas = canvasRef.current
    const pageSize = pageSizeRef.current
    const current = drag
    /* 드래그 상태는 즉시 비워야 실패·성공과 무관하게 프리뷰가 남지 않는다. */
    setDrag(null)
    if (!canvas || !pageSize) return

    /* CSS 픽셀 기준 최소 치수로 판정해 잡음 클릭을 걸러낸다.
       캔버스 버퍼 픽셀 기준이 아니라 사용자가 본 화면 기준이어야 직관과 맞다. */
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width > 0 ? rect.width / canvas.width : 1
    const scaleY = rect.height > 0 ? rect.height / canvas.height : 1
    const boxCssWidth = Math.abs(current.currentX - current.startX) * scaleX
    const boxCssHeight = Math.abs(current.currentY - current.startY) * scaleY
    if (boxCssWidth < MIN_BOX_SIZE_PX || boxCssHeight < MIN_BOX_SIZE_PX) {
      return
    }

    /* 박스의 좌상단을 canvas 기준으로 확정한 뒤, 좌하단 꼭짓점을 PDF 좌표로 변환한다.
       PDF 좌표계는 원점이 좌하단이므로 placement.x, placement.y 는 박스의 좌하단. */
    const leftPx = Math.min(current.startX, current.currentX)
    const topPx = Math.min(current.startY, current.currentY)
    const widthPx = Math.abs(current.currentX - current.startX)
    const heightPx = Math.abs(current.currentY - current.startY)
    const bottomPx = topPx + heightPx

    const pdfOrigin = canvasToPdf(
      { x: leftPx, y: bottomPx },
      { width: canvas.width, height: canvas.height },
      { widthPt: pageSize.widthPt, heightPt: pageSize.heightPt },
    )
    const widthPt = canvasLengthToPdf(
      widthPx,
      { width: canvas.width, height: canvas.height },
      { widthPt: pageSize.widthPt, heightPt: pageSize.heightPt },
      'x',
    )
    const heightPt = canvasLengthToPdf(
      heightPx,
      { width: canvas.width, height: canvas.height },
      { widthPt: pageSize.widthPt, heightPt: pageSize.heightPt },
      'y',
    )

    onPick({
      x: pdfOrigin.x,
      y: pdfOrigin.y,
      width: widthPt,
      height: heightPt,
      pageIndex,
      pdfWidth: pageSize.widthPt,
      pdfHeight: pageSize.heightPt,
    })
  }, [drag, onPick, pageIndex])

  const handleMouseUp = () => {
    if (mode !== 'pick-box') return
    finalizeDrag()
  }

  const handleMouseLeave = () => {
    /* 캔버스 밖으로 나가면 드래그를 "취소" 로 처리. 사용자가 의도한 박스가 아닐 가능성 크다. */
    if (drag) setDrag(null)
  }

  const cursorStyle = useMemo<React.CSSProperties>(() => {
    if (!clickEnabled || status !== 'ready') return {}
    if (mode === 'pick-box') return { cursor: 'crosshair' }
    return { cursor: 'crosshair' }
  }, [clickEnabled, status, mode])

  if (!pdfBuffer) {
    return (
      <p className="pdf-engine-editor__hint">
        PDF 파일을 업로드하거나 기존 템플릿을 불러오면 미리보기가 표시됩니다.
      </p>
    )
  }

  return (
    <div>
      {status === 'loading' ? (
        <p className="pdf-engine-editor__hint">PDF 렌더링 중…</p>
      ) : null}
      {status === 'error' ? (
        <p className="pdf-engine-editor__error pdf-engine-editor__error--fatal">
          {messageForPdfLoadErrorCode(fatalErrorCode)}
          {logger.isDev && fatalErrorCode ? (
            <span className="pdf-engine-editor__error-code"> [code: {fatalErrorCode}]</span>
          ) : null}
        </p>
      ) : null}
      {status === 'ready' && warningCode ? (
        <p className="pdf-engine-editor__error pdf-engine-editor__error--warning">
          {messageForPdfOverlayWarning(warningCode)}
        </p>
      ) : null}
      <div ref={layoutHostRef} className="pdf-engine-editor__preview-canvas-host">
        <div ref={wrapRef} className="pdf-engine-editor__overlay pdf-engine-editor__overlay--a4-page">
          <canvas
            ref={canvasRef}
            className="pdf-engine-editor__pdf-canvas"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            role="presentation"
            aria-label="PDF 좌표 선택 — 선택된 필드를 그 위치에 배치합니다"
            style={cursorStyle}
          />
          <canvas ref={markCanvasRef} className="pdf-engine-editor__mark-canvas" aria-hidden />
        </div>
      </div>
    </div>
  )
}

/**
 * 라벨을 "배경 + 글자" 로 그린다. 배경이 없으면 PDF 배경색과 뒤섞여
 * 겹치는 영역에서 가독성이 급격히 떨어진다.
 */
function drawMarkLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
): void {
  ctx.font = '600 11px system-ui, sans-serif'
  const metrics = ctx.measureText(label)
  const padding = 3
  const textWidth = metrics.width + padding * 2
  const textHeight = 14
  ctx.fillStyle = MARK_LABEL_BG
  ctx.fillRect(x - padding, y - textHeight + 2, textWidth, textHeight)
  ctx.fillStyle = MARK_LABEL_COLOR
  ctx.fillText(label, x, y)
}
