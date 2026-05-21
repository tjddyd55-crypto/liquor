/**
 * 업종(Government/Gym 등) 전용 필드 — canonical fieldKey → 문자열 값.
 * 형식: { v: 1, fields: { "gym.memberCode": "...", "customer.memo": "..." } }
 */

const EXT_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_.]*$/
const KEY_MAX = 120
const VALUE_MAX = 8000
const MAX_KEYS = 400

function isSafeExtensionKey(key) {
  const k = String(key ?? '').trim()
  if (!k || k.length > KEY_MAX) {
    return false
  }
  return EXT_KEY_REGEX.test(k)
}

function sanitizeExtensionScalar(value) {
  if (value == null) {
    return ''
  }
  return String(value).slice(0, VALUE_MAX)
}

/**
 * DB/응답용 — JSONB 에서 읽은 값을 정규 객체로.
 * @param {unknown} raw
 * @returns {{ v: number; fields: Record<string, string> }}
 */
export function parseCrmExtensionFromDb(raw) {
  if (raw == null || raw === '') {
    return { v: 1, fields: {} }
  }
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { v: 1, fields: {} }
    }
    let src = obj
    if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) {
      src = obj.fields
    }
    const fields = {}
    for (const [k0, v0] of Object.entries(src)) {
      if (!isSafeExtensionKey(k0)) {
        continue
      }
      const k = String(k0).trim()
      fields[k] = sanitizeExtensionScalar(v0)
    }
    return { v: 1, fields }
  } catch {
    return { v: 1, fields: {} }
  }
}

/**
 * API 요청 바디에서 crmExtension / crm_extension 수용.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeCrmExtensionFieldsFromRequest(raw) {
  if (raw == null || raw === '') {
    return {}
  }
  const root = typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const bodyFields =
    root.fields && typeof root.fields === 'object' && !Array.isArray(root.fields)
      ? root.fields
      : root
  const out = {}
  let n = 0
  for (const [k0, v0] of Object.entries(bodyFields)) {
    if (n >= MAX_KEYS) {
      break
    }
    if (!isSafeExtensionKey(k0)) {
      continue
    }
    const k = String(k0).trim()
    out[k] = sanitizeExtensionScalar(v0)
    n += 1
  }
  return out
}

/**
 * DB 저장용 JSON 문자열
 * @param {unknown} raw
 */
export function stringifyCrmExtensionForDb(raw) {
  const fields = sanitizeCrmExtensionFieldsFromRequest(raw)
  return JSON.stringify({ v: 1, fields })
}
