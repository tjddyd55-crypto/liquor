/**
 * 클라이언트 로거 (렌더러 공용).
 *
 * 설계 원칙:
 *   - "임시 console.log → 완성 후 삭제" 패턴을 대체한다. 완성 후엔 삭제하지 않고
 *     레벨만 낮춘다 (debug → info, 혹은 제거).
 *   - 개발(import.meta.env.DEV): 모든 레벨을 콘솔에.
 *   - 프로덕션: warn/error 만 콘솔 + 서버(/api/client-log) 로 비동기 전송.
 *     debug/info 는 조용히 사라진다.
 *   - 절대 throw 하지 않는다. 로깅은 메인 흐름을 방해해선 안 된다.
 *
 * 사용:
 *   logger.error('pdf.overlay.parse-failed', { templateId, byteLength })
 *   logger.warn('subscription.expired.redirect', { userId })
 *
 * event 키 규약:
 *   - '도메인.서브도메인.상태' 형태의 dot.case. 예: 'pdf.overlay.parse-failed'
 *   - 같은 문자열을 코드 전역에서 찾아(grep) 흐름 추적이 가능하도록 literal 로 유지한다.
 */

import { resolveApiUrl } from './apiClient'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [k: string]: unknown
}

const IS_DEV = (() => {
  /* Vite/ESM 환경에선 import.meta.env.DEV 가 정답.
     SSR/Node 유닛 테스트 등 예외 환경에선 'development' NODE_ENV 로 폴백. */
  try {
    if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') {
      return Boolean(import.meta.env.DEV)
    }
  } catch {
    /* 무시: import.meta 가 없는 런타임 */
  }
  try {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  } catch {
    return false
  }
})()

/**
 * Error 를 직렬화 가능한 형태로 평탄화.
 * cause 체인이 있으면 한 레벨까지만 포함 (무한 루프 방지).
 */
function flattenError(err: unknown, depth = 0): LogContext | null {
  if (!(err instanceof Error)) return null
  const base: LogContext = {
    name: err.name,
    message: err.message,
  }
  if (IS_DEV && err.stack) base.stack = err.stack
  const cause = (err as { cause?: unknown }).cause
  if (cause && depth < 1) {
    base.cause = flattenError(cause, depth + 1) ?? String(cause)
  }
  return base
}

/**
 * 비동기 서버 전송. 실패는 무시 — 로깅 자체가 장애 원인이 되면 안 된다.
 * fetch 가 없는 환경(테스트) 도 자연스럽게 no-op.
 */
function sendToServer(level: LogLevel, event: string, context: LogContext) {
  if (typeof fetch !== 'function') return
  try {
    const url = resolveApiUrl('/api/client-log')
    const body = JSON.stringify({
      level,
      event,
      context,
      timestamp: Date.now(),
      platform: 'web',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      path: typeof location !== 'undefined' ? location.pathname : null,
    })
    /* keepalive: 페이지 이동 중에도 최대한 전송 시도. */
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* 네트워크 오류 조용히 무시. */
    })
  } catch {
    /* 무시. */
  }
}

function emit(level: LogLevel, event: string, raw?: LogContext | unknown) {
  const context: LogContext =
    raw instanceof Error
      ? { error: flattenError(raw) ?? { message: String(raw) } }
      : raw && typeof raw === 'object'
        ? { ...(raw as LogContext) }
        : raw !== undefined
          ? { value: raw }
          : {}

  /* Error 인스턴스가 context 안에 섞여 있으면 풀어준다. */
  for (const key of Object.keys(context)) {
    const v = context[key]
    if (v instanceof Error) {
      context[key] = flattenError(v)
    }
  }

  if (IS_DEV) {
    const fn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`[${level}] ${event}`, context)
    return
  }

  if (level === 'warn' || level === 'error') {
    const fn = level === 'error' ? console.error : console.warn
    fn(`[${level}] ${event}`, context)
    sendToServer(level, event, context)
  }
  /* debug/info in prod → 조용히 drop. */
}

export const logger = {
  debug: (event: string, context?: LogContext | unknown) => emit('debug', event, context),
  info: (event: string, context?: LogContext | unknown) => emit('info', event, context),
  warn: (event: string, context?: LogContext | unknown) => emit('warn', event, context),
  error: (event: string, context?: LogContext | unknown) => emit('error', event, context),
  /** 개발 환경 여부. UI 에서 "DEV 전용 디버그 배지" 등을 그릴 때 사용. */
  isDev: IS_DEV,
}
