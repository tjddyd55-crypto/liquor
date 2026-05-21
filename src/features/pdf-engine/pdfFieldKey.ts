/**
 * PDF 템플릿 필드 `fieldKey` — 서버 `server/pdf-engine/schema/fieldSpec.js` 와 동일 규칙.
 *
 * 라벨 기반 자동 생성 시 한글만 있거나 "1. …"처럼 숫자로 시작하는 슬러그가 되면
 * 예전 클라이언트는 `"2"` 같은 값이 나와 PUT 이 400 으로 실패할 수 있었다.
 */

import type { PdfFieldSpec } from './types'

/** `[a-z]` 로 시작, 이후 소문자·숫자·밑줄 최대 63자 (전체 길이 최대 64). */
export const PDF_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

const MAX_FIELD_KEY_LEN = 64

export function isValidPdfFieldKey(key: string): boolean {
  return PDF_FIELD_KEY_PATTERN.test(key)
}

/**
 * 관리자 입력 라벨로부터 1차 슬러그를 만든다.
 * (유효한 fieldKey 인지는 별도로 `ensureLeadingLetter` 등으로 보정한다.)
 */
export function slugFromPdfFieldLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

/**
 * 라벨에서 파생한 키 후보를 서버 허용 형태로 맞춘다.
 * - 빈 슬러그 → `field`
 * - `[a-z]` 로 시작하지 않으면 `field_` 접두(예: 순번 `2` → `field_2`)
 * - 길이 상한 64
 */
export function ensureValidPdfFieldKeyBase(baseRaw: string): string {
  let base = baseRaw.trim().toLowerCase()
  if (base === '') {
    return 'field'
  }
  if (!/^[a-z]/.test(base)) {
    base = `field_${base}`
  }
  base = base.slice(0, MAX_FIELD_KEY_LEN)
  if (!isValidPdfFieldKey(base)) {
    return 'field'
  }
  return base
}

/**
 * 새 필드 추가 시: 라벨에서 fieldKey 자동 생성 + 템플릿 내 유일성.
 */
export function genPdfFieldKeyFromLabel(label: string, existing: ReadonlySet<string>): string {
  const slug = slugFromPdfFieldLabel(label)
  let base = ensureValidPdfFieldKeyBase(slug)
  if (!existing.has(base)) return base
  for (let i = 2; i < 200; i += 1) {
    const candidate = `${base}_${i}`.slice(0, MAX_FIELD_KEY_LEN)
    if (isValidPdfFieldKey(candidate) && !existing.has(candidate)) return candidate
  }
  return `field_${Date.now().toString(36)}`.slice(0, MAX_FIELD_KEY_LEN)
}

export type NormalizePdfFieldKeysResult = {
  fields: PdfFieldSpec[]
  keysChanged: boolean
}

/**
 * 저장·로드 직후: 서버 검증에 맞지 않거나 서로 충돌하는 fieldKey 를 안전한 값으로 교체한다.
 */
export function normalizePdfFieldKeys(fields: PdfFieldSpec[]): NormalizePdfFieldKeysResult {
  const used = new Set<string>()
  let keysChanged = false
  const out: PdfFieldSpec[] = []

  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i]
    let key = f.fieldKey

    if (!isValidPdfFieldKey(key) || used.has(key)) {
      keysChanged = true
      key = genPdfFieldKeyFromLabel(f.label.trim() || `필드_${i + 1}`, used)
    }

    used.add(key)

    if (key !== f.fieldKey) {
      out.push({ ...f, fieldKey: key })
    } else {
      out.push(f)
    }
  }

  return { fields: out, keysChanged }
}
