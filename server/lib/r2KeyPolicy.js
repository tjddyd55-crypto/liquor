/**
 * CRM 멀티테넌트 R2 object key 정책.
 *
 * - CRM_R2_OBJECT_ROOT 가 비어 있으면(withR2ObjectRoot) 기존 상대키와 바이트 동일 패스스루.
 * - 값이 있으면 신규 업로드 키 앞에 root를 붙인다(production에서는 env 미설정으로 동작 변경 없음).
 *   상대키 형태(insurer/, files/, insurer-news/ 등)는 각 도메인 모듈이 root 활성 여부에 따라 선택한다.
 * - 읽기/삭제 호출측은 DB 저장 키를 그대로 쓴다(strip은 assert 등 검증 단계에서만 사용).
 */

const ENV_CRM_R2_OBJECT_ROOT = 'CRM_R2_OBJECT_ROOT'

/** @param {unknown} value */
export function normalizeR2KeyPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

/** @param {unknown} value */
export function normalizeR2Prefix(value) {
  return normalizeR2KeyPart(value)
}

export function getR2ObjectRoot() {
  return normalizeR2Prefix(process.env[ENV_CRM_R2_OBJECT_ROOT])
}

export function isR2ObjectRootEnabled() {
  return getR2ObjectRoot().length > 0
}

/**
 * 슬래시 정규화 후 단일 객체 키 문자열을 만든다.
 * @param {...unknown} parts
 */
export function joinR2Key(...parts) {
  /** @type {string[]} */
  const chunks = []
  for (const p of parts) {
    const norm = normalizeR2KeyPart(p)
    if (!norm) {
      continue
    }
    for (const seg of norm.split('/')) {
      if (seg) {
        chunks.push(seg)
      }
    }
  }
  return chunks.join('/')
}

/**
 * 상대 키 앞에 CRM 루트를 붙인다. 루트 비활성 시 상대 키만 반환(선행 슬래시 1회 제거).
 * @param {string} relativeKey
 */
export function withR2ObjectRoot(relativeKey) {
  const rel = String(relativeKey ?? '').replace(/^\//, '')
  const root = getR2ObjectRoot()
  if (!root) {
    return rel
  }
  if (!rel) {
    return root
  }
  return `${root}/${rel}`
}

/**
 * 현재 환경의 CRM 루트가 앞에 붙어 있으면 제거한 상대 키를 반환한다.
 * @param {string} objectKey
 */
export function stripR2ObjectRootIfPresent(objectKey) {
  const k = String(objectKey ?? '').replace(/^\//, '')
  const root = getR2ObjectRoot()
  if (!root) {
    return k
  }
  if (k === root) {
    return ''
  }
  if (!k.startsWith(`${root}/`)) {
    return k
  }
  return k.slice(root.length + 1)
}

/**
 * 전체 키에 대해 루트를 벗긴 뒤 상대 키 검증 함수를 호출한다(assert 재사용).
 * @param {string} objectKey
 * @param {(relativeKey: string) => boolean} checkRelative
 */
export function assertR2KeyMatchingRelative(objectKey, checkRelative) {
  const stripped = stripR2ObjectRootIfPresent(String(objectKey ?? '').trim().replace(/^\//, ''))
  return typeof checkRelative === 'function' && checkRelative(stripped)
}
