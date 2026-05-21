/**
 * 2xx JSON 본문 정규화: 관용(lenient)·에러 envelope → 빈 목록 등 안전한 값.
 * `{ data, total }` 같이 data 토만 쓰면 안 되는 형태는 전체 body 유지.
 */

const ENVELOPE_META_KEYS = new Set(['data', 'success', 'error', 'message'])

function hasNonDataSiblingKeys(b: Record<string, unknown>): boolean {
  return Object.keys(b).some((k) => !ENVELOPE_META_KEYS.has(k))
}

/** 와일드카드 `error` 키(문자/비어 있지 않은 truthy) */
function hasApiErrorField(b: Record<string, unknown>): boolean {
  if (!('error' in b)) return false
  const e = b.error
  if (e == null || e === false) return false
  if (typeof e === 'string') return e.length > 0
  return true
}

/**
 * @returns 실패 시 `[]`, 성공 시 배열·또는 객체(`data`만 있으면 `data`, 형제 필드 있으면 전체 body)
 */
export function safeApiResponse(body: unknown): unknown {
  if (body == null) return []
  if (Array.isArray(body)) return body
  if (typeof body !== 'object') return []

  const b = body as Record<string, unknown>

  if (hasApiErrorField(b)) return []
  if (b.success === false) return []

  if ('data' in b && b.data !== undefined) {
    if (hasNonDataSiblingKeys(b)) return body
    return b.data
  }

  return body
}

export function isLenientFailurePayload(v: unknown): v is { success: false } {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    'success' in v &&
    (v as { success?: unknown }).success === false
  )
}
