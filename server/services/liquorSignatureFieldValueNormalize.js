/**
 * 전자계약 문서값 정규화 — 공개 values API 와 발송 시 설계사(sender) 사전 입력이 동일 규약을 따른다.
 */

const MAX_TEXT_LEN = 8000

export function checkboxStorageFromBoolean(fieldRow, boolVal) {
  const opts = fieldRow.options
  const arr = Array.isArray(opts) && opts.length > 0 ? opts : null
  if (boolVal === true) {
    if (arr) {
      return JSON.stringify([String(arr[0])])
    }
    return 'true'
  }
  if (arr) {
    return '[]'
  }
  return 'false'
}

export function normalizeContractFieldStoredValue(fieldRow, raw) {
  const ft = fieldRow.field_type
  if (ft === 'signature') {
    return { ok: false, message: '서명 필드는 이 경로에서 저장할 수 없습니다.' }
  }
  if (ft === 'text' || ft === 'textarea') {
    if (raw == null) {
      return { ok: true, valueText: '' }
    }
    const s = String(raw).trim().slice(0, MAX_TEXT_LEN)
    return { ok: true, valueText: s }
  }
  if (ft === 'radio') {
    if (raw == null || raw === '') {
      return { ok: true, valueText: '' }
    }
    const s = String(raw).trim()
    const allowed = new Set((Array.isArray(fieldRow.options) ? fieldRow.options : []).map((x) => String(x)))
    if (!allowed.has(s)) {
      return { ok: false, message: `선택할 수 없는 옵션입니다: ${fieldRow.field_key}` }
    }
    return { ok: true, valueText: s }
  }
  if (ft === 'checkbox') {
    if (typeof raw === 'boolean') {
      return { ok: true, valueText: checkboxStorageFromBoolean(fieldRow, raw) }
    }
    if (raw == null) {
      return { ok: true, valueText: checkboxStorageFromBoolean(fieldRow, false) }
    }
    return { ok: false, message: `checkbox 필드는 boolean 만 허용합니다: ${fieldRow.field_key}` }
  }
  return { ok: false, message: `지원하지 않는 필드 타입입니다: ${ft}` }
}
