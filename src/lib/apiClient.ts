import { safeApiResponse } from './safeApiResponse'
import { getPublicOrigin } from './publicOrigin'

export class ApiError extends Error {
  status: number
  retryAfterSec?: number
  retryAfterMin?: number
  /** 서버 JSON payload.code (예: 고객앱 연결 프로필 부족) */
  code?: string
  /** 서버 JSON payload.data (민감 필드 제외·계약 공개 API 등) */
  data?: unknown

  constructor(
    message: string,
    status: number,
    opts?: { retryAfterSec?: number; retryAfterMin?: number; code?: string; data?: unknown },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    if (opts?.data !== undefined) {
      this.data = opts.data
    }
    if (opts?.code != null && String(opts.code).trim()) {
      this.code = String(opts.code).trim()
    }
    if (opts?.retryAfterSec != null && Number.isFinite(opts.retryAfterSec)) {
      this.retryAfterSec = Math.max(1, Math.floor(opts.retryAfterSec))
    }
    if (opts?.retryAfterMin != null && Number.isFinite(opts.retryAfterMin)) {
      this.retryAfterMin = Math.max(1, Math.floor(opts.retryAfterMin))
    }
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null
}

/** API base 후보: VITE_API_URL, then VITE_API_BASE_PATH, then /backend. */
const CONFIGURED_API_BASE_PATH =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.VITE_API_BASE_PATH as string | undefined)?.replace(/\/$/, '') ||
  '/backend'

function isHttpWebRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const protocol = window.location?.protocol
  return protocol === 'http:' || protocol === 'https:'
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const host = String(window.location?.hostname ?? '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
}

function isRailwayHost(host: string): boolean {
  return host.toLowerCase().endsWith('.up.railway.app')
}

function resolveApiBasePath(): string {
  // 웹 런타임(http/https)에서는 same-origin API를 기본값으로 강제해
  // 잘못된 VITE_API_URL(다른 환경 API)로 인한 운영 장애를 방지한다.
  if (!isHttpWebRuntime()) {
    return CONFIGURED_API_BASE_PATH
  }

  if (/^https?:\/\//.test(CONFIGURED_API_BASE_PATH)) {
    try {
      const configuredUrl = new URL(CONFIGURED_API_BASE_PATH)
      const configuredOrigin = configuredUrl.origin
      if (configuredOrigin !== window.location.origin) {
        // 로컬 개발 서버(http://localhost:3000)에서만 same-origin 프록시(/backend)를 강제한다.
        // 운영/배포 웹에서는 설정된 절대 API URL을 그대로 사용한다.
        if (isLocalDevHost()) {
          console.warn(
            '[apiClient] cross-origin VITE_API_URL ignored on local web runtime:',
            CONFIGURED_API_BASE_PATH,
            '-> /backend',
          )
          return '/backend'
        }
        const currentHost = String(window.location.hostname ?? '').toLowerCase()
        const configuredHost = String(configuredUrl.hostname ?? '').toLowerCase()
        // Railway는 배포/도메인 갱신 시 호스트가 바뀔 수 있으므로,
        // 절대 API 호스트가 현재 페이지 호스트와 다르면 same-origin을 우선한다.
        if (isRailwayHost(currentHost) && isRailwayHost(configuredHost)) {
          console.warn(
            '[apiClient] stale Railway API host ignored on web runtime:',
            CONFIGURED_API_BASE_PATH,
            '-> /backend',
          )
          return '/backend'
        }
        return CONFIGURED_API_BASE_PATH
      }
    } catch {
      return '/backend'
    }
  }

  return CONFIGURED_API_BASE_PATH || '/backend'
}

const API_BASE_PATH = resolveApiBasePath()

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path
  }

  if (path.startsWith('/api/')) {
    // 동일 출처: /backend + /customer/...  →  Express의 app.use('/backend', apiRouter)
    // 절대 API 호스트: /api/... 경로를 그대로 이어 붙임 (잘못된 /customer/... 단독 경로 방지)
    if (/^https?:\/\//.test(API_BASE_PATH)) {
      return `${API_BASE_PATH}${path}`
    }
    return `${API_BASE_PATH}${path.slice('/api'.length)}`
  }

  return path
}

/**
 * `window.open` / iframe `src` 등 Bearer 헤더 없이 열리는 탭용 절대 URL.
 * 웹은 상대 경로로도 동작하지만 Electron `file://` 등에서는 origin 결합이 필요하다.
 */
export function resolveAbsoluteApiUrl(path: string): string {
  const resolved = resolveApiUrl(path)
  if (/^https?:\/\//i.test(resolved)) {
    return resolved
  }
  const origin = getPublicOrigin().trim().replace(/\/$/, '')
  if (origin) {
    return `${origin}${resolved.startsWith('/') ? resolved : `/${resolved}`}`
  }
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    !/^file:/i.test(window.location.origin)
  ) {
    return `${window.location.origin}${resolved.startsWith('/') ? resolved : `/${resolved}`}`
  }
  return resolved
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options
  const bearer =
    typeof token === 'string' && token.trim() ? `Bearer ${token.trim()}` : ''
  const resolvedUrl = resolveApiUrl(path)

  let response: Response
  try {
    response = await fetch(resolvedUrl, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: bearer } : {}),
        ...headers,
      },
    })
  } catch (error) {
    /**
     * AbortController 로 의도적으로 취소한 요청까지 "서버 연결 실패" 로 뭉뚱그리면
     * 호출자(useEffect cleanup, 컴포넌트 언마운트 등) 가 정상적인 취소와 실제 네트워크
     * 장애를 구분하지 못한다. AbortError 는 원본 그대로 흘려보내고, 그 외의 fetch 오류만
     * 사용자용 ApiError 로 감싼다.
     */
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 0)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string
    error?: string
    code?: string
    data?: unknown
    retryAfterSec?: number
    retryAfterMin?: number
  }
  if (!response.ok) {
    const fallback =
      response.status === 429
        ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : '요청 처리에 실패했습니다.'
    const rawCode =
      typeof payload.code === 'string' && payload.code.trim() ? payload.code.trim() : ''
    const rawErr =
      typeof payload.error === 'string' && payload.error.trim() ? payload.error.trim() : ''
    const code =
      rawCode ||
      (rawErr && /^[a-z][a-z0-9_]*$/i.test(rawErr) ? rawErr : undefined)
    const userMsg =
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : fallback
    throw new ApiError(userMsg, response.status, {
      retryAfterSec: payload.retryAfterSec,
      retryAfterMin: payload.retryAfterMin,
      code,
      data: payload.data,
    })
  }

  return safeApiResponse(payload) as T
}
