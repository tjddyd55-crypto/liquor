/**
 * 동적 CRM 빌더 — 라벨 기반 키 자동 생성(클라이언트 모듈과 동일 규칙 스모크 테스트)
 * 실행: node --test server/crm/crmTemplateFieldKeyAuto.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// 클라이언트 TS 모듈과 동일 로직(회귀용 최소 복제)
const FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_.]*$/
const TAB_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/

function labelToKeySegment(label) {
  const latin = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  if (!latin || !/^[a-z]/.test(latin)) return ''
  const parts = latin.split('_').filter(Boolean)
  if (parts.length === 0) return ''
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

function sanitizeNamespace(code) {
  const ns = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return ns && /^[a-z]/.test(ns) ? ns : 'custom'
}

function ensureUnique(base, used, suffixFn) {
  if (!used.has(base) && FIELD_KEY_REGEX.test(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const candidate = suffixFn(base, n)
    if (!used.has(candidate) && FIELD_KEY_REGEX.test(candidate)) return candidate
  }
  return `${base}_x`
}

function generateExtensionFieldKey(label, industryCode, used) {
  const ns = sanitizeNamespace(industryCode)
  const segment = labelToKeySegment(label)
  const base = segment ? `${ns}.${segment}` : `${ns}.field`
  const key = ensureUnique(base, used, (b, n) => {
    if (n <= 1) return b
    const dot = b.lastIndexOf('.')
    if (dot >= 0) return `${b.slice(0, dot + 1)}${b.slice(dot + 1)}${n}`
    return `${b}${n}`
  })
  used.add(key)
  return key
}

function normalizeExtensionKeys(formFields, industryCode) {
  const ic = industryCode.trim().toLowerCase()
  const used = new Set()
  return formFields.map((f) => {
    if (f.storage === 'core') {
      if (f.fieldKey) used.add(f.fieldKey)
      return f
    }
    let fk = (f.fieldKey || '').trim()
    if (!fk) {
      const seed = (f.label || '').trim() || `field_${f.localId}`
      fk = generateExtensionFieldKey(seed, ic, used)
    } else {
      used.add(fk)
    }
    return { ...f, fieldKey: fk }
  })
}

describe('crmTemplateFieldKeyAuto (smoke)', () => {
  it('한글 라벨만 있어도 extension fieldKey 자동 생성', () => {
    const out = normalizeExtensionKeys(
      [{ storage: 'extension', fieldKey: '', label: '고객명', localId: 'a1' }],
      'liquor',
    )
    assert.equal(out[0].fieldKey.length > 0, true)
    assert.equal(FIELD_KEY_REGEX.test(out[0].fieldKey), true)
  })

  it('기존 fieldKey는 라벨 변경과 무관하게 유지', () => {
    const original = 'liquor.existingKey'
    const out = normalizeExtensionKeys(
      [{ storage: 'extension', fieldKey: original, label: '다른 라벨', localId: 'a1' }],
      'liquor',
    )
    assert.equal(out[0].fieldKey, original)
  })

  it('영문 라벨은 camelCase 세그먼트로 키 생성', () => {
    const out = normalizeExtensionKeys(
      [{ storage: 'extension', fieldKey: '', label: 'Main Products', localId: 'a1' }],
      'liquor',
    )
    assert.match(out[0].fieldKey, /^liquor\.mainProducts\d*$/)
  })

  it('tabId 자동 생성 형식', () => {
    const ns = sanitizeNamespace('gym')
    const seg = labelToKeySegment('기본 정보')
    const base = seg ? `${ns}_${seg}` : `${ns}_tab`
    assert.equal(TAB_ID_REGEX.test(base) || TAB_ID_REGEX.test(`${ns}_tab_1`), true)
  })

  it('저장 직전 normalize — 라벨 전체 기준(첫 글자만으로 고정되지 않음)', () => {
    const partial = normalizeExtensionKeys(
      [{ storage: 'extension', fieldKey: '', label: '고', localId: 'a1' }],
      'liquor',
    )
    const full = normalizeExtensionKeys(
      [{ storage: 'extension', fieldKey: '', label: '고객명', localId: 'a1' }],
      'liquor',
    )
    assert.equal(partial[0].fieldKey, full[0].fieldKey)
    assert.match(full[0].fieldKey, /^liquor\.field\d*$/)
  })

  it('동일 라벨 신규 필드 2개 — fieldKey 충돌 없이 유니크', () => {
    const out = normalizeExtensionKeys(
      [
        { storage: 'extension', fieldKey: '', label: '고객명', localId: 'a1' },
        { storage: 'extension', fieldKey: '', label: '고객명', localId: 'a2' },
      ],
      'liquor',
    )
    assert.notEqual(out[0].fieldKey, out[1].fieldKey)
    assert.equal(FIELD_KEY_REGEX.test(out[0].fieldKey), true)
    assert.equal(FIELD_KEY_REGEX.test(out[1].fieldKey), true)
  })
})
