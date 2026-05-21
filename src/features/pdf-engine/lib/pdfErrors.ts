import { isLikelyDetachedArrayBufferError } from './pdfArrayBuffer'

/**
 * PDF 로딩/렌더 과정의 "실패 지점 라벨".
 *
 * 왜 라벨이 필요한가:
 *   PdfOverlayCanvas 는 다음 단계를 순차 실행한다.
 *     1) getDocument(data) 로 바이너리 파싱
 *     2) pdf.getPage(n) 로 페이지 객체 조회
 *     3) page.render(...) 로 캔버스 래스터화
 *   셋 중 어디서 실패했는지에 따라 대응 방법이 다르다:
 *     - parse-failed             → 바이너리 파싱 실패(형식/MIME 등). buffer detach 는 buffer-transport-failed
 *     - buffer-transport-failed → ArrayBuffer 가 worker transfer 로 detach 된 뒤 재사용된 경우(클라이언트)
 *     - page-fetch-failed  → 페이지 수 범위 오류 또는 내부 구조 손상
 *     - page-render-failed → 폰트/이미지 서브리소스 취득 실패, 메모리
 *     - not-pdf-response   → fetch 층에서 구분 (API가 HTML/JSON 을 돌려준 경우 등)
 *   사용자 메시지는 동일하더라도 개발자 로그·원격 진단용으로는 반드시 구분해야 한다.
 */

export type PdfLoadErrorCode =
  | 'fetch-failed'
  | 'parse-failed'
  | 'buffer-transport-failed'
  | 'page-fetch-failed'
  | 'page-render-failed'
  | 'not-pdf-response'

/** 미리보기·좌표 픽은 가능하지만 부가 콜백(페이지 수 동기화 등)만 실패한 경우 */
export type PdfOverlayWarningCode = 'document-callback-failed'

export class PdfLoadError extends Error {
  readonly code: PdfLoadErrorCode
  readonly context: Record<string, unknown>

  constructor(code: PdfLoadErrorCode, context: Record<string, unknown> = {}, cause?: unknown) {
    super(code)
    this.name = 'PdfLoadError'
    this.code = code
    this.context = context
    /* ES2022 Error.cause 를 지원하지 않는 번들 타겟을 대비해 수동으로 붙인다. */
    if (cause !== undefined) {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}

/** code → 사람 친화적 메시지. 미지 code 는 일반 메시지로 안전하게 폴백. */
export function messageForPdfLoadErrorCode(
  code: PdfLoadErrorCode | 'unknown' | null | undefined,
): string {
  switch (code) {
    case 'fetch-failed':
      return 'PDF 파일을 불러오지 못했습니다. 파일 저장 경로나 접근 권한을 확인해주세요.'
    case 'not-pdf-response':
      return 'PDF 파일 대신 다른 응답을 받았습니다. 서버 응답을 확인해주세요.'
    case 'parse-failed':
      return 'PDF 파일 형식을 해석하지 못했습니다. 네트워크 또는 파일이 손상되지 않았는지 확인해주세요.'
    case 'buffer-transport-failed':
      return 'PDF 데이터를 다시 읽는 중 오류가 발생했습니다. 화면을 새로고침하거나 다시 시도해주세요.'
    case 'page-fetch-failed':
      return '선택한 페이지를 불러올 수 없습니다. 페이지 번호를 다시 확인해주세요.'
    case 'page-render-failed':
      return 'PDF 미리보기를 표시하지 못했습니다. 파일 형식 또는 렌더링 설정을 확인해주세요.'
    default:
      return 'PDF 미리보기를 표시하지 못했습니다. 잠시 후 다시 시도하거나 새로고침해주세요.'
  }
}

export function messageForPdfOverlayWarning(code: PdfOverlayWarningCode): string {
  switch (code) {
    case 'document-callback-failed':
      return 'PDF 미리보기는 가능하지만 일부 분석 정보를 읽지 못했습니다. 좌표 설정은 계속할 수 있습니다.'
    default:
      return ''
  }
}

/** page.render 가 취소되어 promise 가 reject 된 경우 — fatal 로 취급하지 않는다. */
export function isPdfJsRenderingCancelled(error: unknown): boolean {
  return error != null && typeof error === 'object' && (error as { name?: string }).name === 'RenderingCancelledException'
}

/** 에러 객체 → code 분류. PdfLoadError 가 아니면 'unknown'. */
export function describePdfLoadError(error: unknown): {
  code: PdfLoadErrorCode | 'unknown'
  message: string
} {
  const cause = error instanceof PdfLoadError ? (error as { cause?: unknown }).cause : undefined
  if (isLikelyDetachedArrayBufferError(error) || isLikelyDetachedArrayBufferError(cause)) {
    return {
      code: 'buffer-transport-failed',
      message: messageForPdfLoadErrorCode('buffer-transport-failed'),
    }
  }
  if (error instanceof PdfLoadError) {
    return { code: error.code, message: messageForPdfLoadErrorCode(error.code) }
  }
  return { code: 'unknown', message: messageForPdfLoadErrorCode('unknown') }
}
