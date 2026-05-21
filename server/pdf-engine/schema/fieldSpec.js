/**
 * PDF 자동화 엔진 — 필드/배치(placement) 스키마 검증.
 *
 * 책임:
 *   - 외부(관리자 UI·API 요청 바디)에서 들어온 raw 데이터를 "도메인 객체" 로 정규화한다.
 *   - 허용되지 않는 타입/좌표/키 네이밍을 방어해 하위 모듈(repository, renderer)이
 *     불변 조건(타입 일관성) 을 당연하게 가정할 수 있게 한다.
 *
 * 의존성 원칙:
 *   - 이 모듈은 어떤 I/O 도 하지 않는다(pure). 테스트 대상.
 *   - DB/HTTP/pdf-lib 에 의존하지 않는다. 다른 레이어가 이 모듈에 맞춘다.
 *
 * 확장 포인트:
 *   - 새 필드 타입을 추가하려면 ALLOWED_FIELD_TYPES 와 dispatchStamp(렌더러) 양쪽만
 *     수정한다. DB CHECK 제약(initDb.js ensurePdfTemplateSchema) 도 같이 확장한다.
 *   - radio 는 필드 전체가 "옵션 집합" 을 갖고, 각 placement 는 자신이 대표하는
 *     옵션 값(`optionValue`) 을 갖는다. 선택된 값과 일치하는 placement 만 렌더된다.
 */

/**
 * Phase 2 포함 허용 타입.
 *
 * - text/textarea: 단일 값 텍스트 스탬프
 * - checkbox: boolean("true"/"false") — true 일 때 placement 위치에 체크 마크
 * - radio: 여러 옵션 중 하나. placement 별 optionValue 와 매칭된 것만 체크 마크
 */
export const ALLOWED_FIELD_TYPES = Object.freeze([
  'text',
  'textarea',
  'checkbox',
  'radio',
  'signature',
])

import { INPUT_ROLES, parseInputRoleString } from './inputRole.js'
import { normalizeFieldDataMapping, parseFieldDataMapping } from './fieldDataMapping.js'

/** @deprecated 저장 시 항상 null — 전자계약 플로우는 inputRole 만 사용한다. */
export const ALLOWED_CUSTOMER_MAPPINGS = Object.freeze([])

/** 필드 key 네이밍 규칙: 라틴 소문자/숫자/언더스코어. 한글·공백 금지 — PDF 내부 검색/스크립트 안정성. */
const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/

/** 텍스트 정렬 — PDF 출력 시 좌·중·우. */
const ALLOWED_ALIGNS = Object.freeze(['left', 'center', 'right'])

/** 최대 한 문서의 필드/배치 상한. 악성 입력 방지. */
const MAX_FIELDS_PER_TEMPLATE = 500
const MAX_PLACEMENTS_PER_FIELD = 50
const MAX_PAGE_INDEX = 999
/** radio 옵션 상한. UX 상으로도 20개가 넘어가면 다른 UI 로 재설계해야 한다. */
const MAX_OPTIONS_PER_FIELD = 50
const MAX_OPTION_LENGTH = 120

/**
 * @typedef {{
 *   page: number,
 *   x: number,
 *   y: number,
 *   width: number | null,
 *   height: number | null,
 *   fontSize: number | null,
 *   align: 'left' | 'center' | 'right',
 *   optionValue: string | null,
 * }} Placement
 */

/**
 * @typedef {{
 *   fieldKey: string,
 *   label: string,
 *   fieldType: typeof ALLOWED_FIELD_TYPES[number],
 *   required: boolean,
 *   orderIndex: number,
 *   inputRole: 'customer' | 'sender' | 'disabled',
 *   dataMapping: import('./fieldDataMapping.js').PdfFieldDataMapping,
 *   customerMapping: null,
 *   options: string[] | null,
 *   placements: Placement[],
 * }} FieldSpec
 */

function toFiniteNumberOrNull(value) {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function clampNonNegativeNumber(value, fallback) {
  const n = toFiniteNumberOrNull(value)
  if (n == null || n < 0) return fallback
  return n
}

/**
 * placement 의 `optionValue` 정규화.
 * 숫자가 와도 문자열로 찍어 비교(선택값과 JSON 동등성) 가 단순해진다.
 * 비어 있으면 null — radio 가 아닌 타입이거나 "기본 체크" 전용 placement 를 의미한다.
 */
function normalizeOptionValue(raw) {
  if (raw == null) return null
  const str = typeof raw === 'string' ? raw : String(raw)
  const trimmed = str.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_OPTION_LENGTH) {
    throw new Error(`optionValue 가 상한(${MAX_OPTION_LENGTH}자)을 초과합니다.`)
  }
  return trimmed
}

function normalizePlacement(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('placement 은 객체여야 합니다.')
  }
  const src = /** @type {Record<string, unknown>} */ (raw)
  const pageRaw = toFiniteNumberOrNull(src.page)
  const page = pageRaw == null ? 0 : Math.max(0, Math.floor(pageRaw))
  if (page > MAX_PAGE_INDEX) {
    throw new Error(`placement.page 범위 초과: ${page}`)
  }
  const x = toFiniteNumberOrNull(src.x)
  const y = toFiniteNumberOrNull(src.y)
  if (x == null || y == null || x < 0 || y < 0) {
    throw new Error('placement.x, placement.y 는 0 이상의 유한 수여야 합니다.')
  }

  const width = clampNonNegativeNumber(src.width, null)
  const height = clampNonNegativeNumber(src.height, null)
  const fontSize = clampNonNegativeNumber(src.fontSize, null)

  const alignRaw = typeof src.align === 'string' ? src.align.trim().toLowerCase() : ''
  const align = ALLOWED_ALIGNS.includes(alignRaw) ? /** @type {'left'|'center'|'right'} */ (alignRaw) : 'left'

  return {
    page,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: width != null ? Math.round(width * 100) / 100 : null,
    height: height != null ? Math.round(height * 100) / 100 : null,
    fontSize: fontSize != null ? Math.round(fontSize) : null,
    align,
    optionValue: normalizeOptionValue(src.optionValue),
  }
}

/**
 * radio 의 options 배열 정규화.
 * - 중복 제거(앞 값 우선)
 * - 공백 trim
 * - 빈 문자열 제거
 * - 상한 초과 시 에러
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeOptions(raw) {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    throw new Error('options 는 배열이어야 합니다.')
  }
  if (raw.length > MAX_OPTIONS_PER_FIELD) {
    throw new Error(`options 수가 상한(${MAX_OPTIONS_PER_FIELD})을 초과했습니다.`)
  }
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const v = normalizeOptionValue(item)
    if (v == null) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/**
 * raw 필드 데이터를 FieldSpec 으로 정규화. 실패 시 throw.
 *
 * @param {unknown} raw
 * @param {number} fallbackOrder
 * @returns {FieldSpec}
 */
export function normalizeFieldSpec(raw, fallbackOrder = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('필드는 객체여야 합니다.')
  }
  const src = /** @type {Record<string, unknown>} */ (raw)

  const fieldKey = typeof src.fieldKey === 'string' ? src.fieldKey.trim() : ''
  if (!FIELD_KEY_REGEX.test(fieldKey)) {
    throw new Error(
      `필드 key 형식이 올바르지 않습니다: "${fieldKey}". 소문자/숫자/언더스코어로 시작하며 64자 이하여야 합니다.`,
    )
  }

  const label = typeof src.label === 'string' ? src.label.trim() : ''
  if (!label) {
    throw new Error(`필드 label 이 비어 있습니다. (${fieldKey})`)
  }

  const fieldTypeRaw = typeof src.fieldType === 'string' ? src.fieldType.trim().toLowerCase() : ''
  if (!ALLOWED_FIELD_TYPES.includes(fieldTypeRaw)) {
    throw new Error(`허용되지 않는 필드 타입입니다: "${fieldTypeRaw}". (${fieldKey})`)
  }

  const required = Boolean(src.required)
  const orderIdxRaw = toFiniteNumberOrNull(src.orderIndex)
  const orderIndex = orderIdxRaw == null ? fallbackOrder : Math.max(0, Math.floor(orderIdxRaw))

  let inputRoleRaw =
    typeof src.inputRole === 'string' ? src.inputRole.trim().toLowerCase() : ''
  if (!INPUT_ROLES.includes(inputRoleRaw)) {
    inputRoleRaw = parseInputRoleString(inputRoleRaw)
  }
  /** @type {FieldSpec['inputRole']} */
  let inputRole = /** @type {FieldSpec['inputRole']} */ (inputRoleRaw)
  if (fieldTypeRaw === 'signature') {
    if (inputRole === 'sender') {
      throw new Error(`서명(signature) 필드는 입력 주체를 "설계사"로 둘 수 없습니다: "${fieldKey}"`)
    }
    inputRole = 'customer'
  }

  /* checkbox/radio 만 options 를 저장한다. 다른 타입에서 온 options 는 무시해
     DB 에 "의미 없는 옵션 잔재" 가 남지 않도록 한다. */
  const options =
    fieldTypeRaw === 'radio' || fieldTypeRaw === 'checkbox' ? normalizeOptions(src.options) : null
  if ((fieldTypeRaw === 'radio' || fieldTypeRaw === 'checkbox') && options.length === 0) {
    throw new Error(
      `${fieldTypeRaw} 필드 "${fieldKey}" 는 최소 1개 이상의 옵션(세부 라벨)이 필요합니다.`,
    )
  }

  const placementsRaw = Array.isArray(src.placements) ? src.placements : []
  if (placementsRaw.length > MAX_PLACEMENTS_PER_FIELD) {
    throw new Error(`필드 ${fieldKey} 의 placement 수가 상한(${MAX_PLACEMENTS_PER_FIELD})을 초과했습니다.`)
  }
  const placements = placementsRaw.map((p) => normalizePlacement(p))

  /* checkbox/radio placement 는 반드시 options 에 등록된 값과 매칭되어야 한다.
     실수로 optionValue 를 비워둔 placement 는 "어떤 선택지에도 연결되지 않는 스탬프" 가
     되어 렌더 시 아무 효과가 없으므로 여기서 막는다. */
  if (fieldTypeRaw === 'radio' || fieldTypeRaw === 'checkbox') {
    const allowed = new Set(options)
    for (const p of placements) {
      if (p.optionValue == null) {
        throw new Error(
          `${fieldTypeRaw} 필드 "${fieldKey}" 의 placement 에 optionValue 가 없습니다. 옵션 중 하나를 지정하세요.`,
        )
      }
      if (!allowed.has(p.optionValue)) {
        throw new Error(
          `${fieldTypeRaw} 필드 "${fieldKey}" 의 placement.optionValue "${p.optionValue}" 가 옵션 목록에 없습니다.`,
        )
      }
    }
  }

  const dataMapping = normalizeFieldDataMapping(
    src.dataMapping ?? src.customerMapping ?? null,
  )

  return {
    fieldKey,
    label,
    fieldType: /** @type {FieldSpec['fieldType']} */ (fieldTypeRaw),
    required,
    orderIndex,
    inputRole,
    dataMapping,
    customerMapping: null,
    options,
    placements,
  }
}

/**
 * DB row 의 customer_mapping 컬럼을 FieldSpec.dataMapping 으로 병합한다.
 *
 * @param {FieldSpec} field
 * @param {unknown} customerMappingRaw
 * @returns {FieldSpec}
 */
export function fieldSpecWithDbMapping(field, customerMappingRaw) {
  const fromDb = parseFieldDataMapping(customerMappingRaw)
  const hasDb =
    customerMappingRaw != null &&
    String(customerMappingRaw).trim() !== '' &&
    (fromDb.dataSourceType === 'customer' || fromDb.fallbackText || fromDb.transformType)
  return {
    ...field,
    dataMapping: hasDb ? fromDb : field.dataMapping,
  }
}

/**
 * 필드 배열을 정규화한다. key 중복을 금지한다.
 *
 * @param {unknown} raw
 * @returns {FieldSpec[]}
 */
export function normalizeFieldSpecList(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('fields 는 배열이어야 합니다.')
  }
  if (raw.length > MAX_FIELDS_PER_TEMPLATE) {
    throw new Error(`필드 수가 상한(${MAX_FIELDS_PER_TEMPLATE})을 초과했습니다.`)
  }
  const seen = new Set()
  const result = []
  for (let i = 0; i < raw.length; i += 1) {
    const field = normalizeFieldSpec(raw[i], i)
    if (seen.has(field.fieldKey)) {
      throw new Error(`필드 key 가 중복됩니다: "${field.fieldKey}"`)
    }
    seen.add(field.fieldKey)
    result.push(field)
  }
  return result
}

/**
 * 타입별 값 검증 전략.
 * switch 분기를 한 곳에 모아 "값 검증" 과 "값 정규화" 를 같이 처리한다.
 * 새 타입이 추가되면 이 함수만 수정한다.
 *
 * @param {FieldSpec} field
 * @param {string} rawStr 이미 trim 된 문자열
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateOneValue(field, rawStr) {
  switch (field.fieldType) {
    case 'checkbox': {
      if (rawStr === '') return { ok: true, value: '[]' }
      let parsed
      try {
        parsed = JSON.parse(rawStr)
      } catch {
        return { ok: false, error: `"${field.label}" 선택값 형식이 올바르지 않습니다.` }
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, error: `"${field.label}" 선택값 형식이 올바르지 않습니다.` }
      }
      const allowed = new Set(field.options ?? [])
      const normalized = []
      const seen = new Set()
      for (const item of parsed) {
        if (typeof item !== 'string') {
          return { ok: false, error: `"${field.label}" 선택값 형식이 올바르지 않습니다.` }
        }
        const v = item.trim()
        if (!v) continue
        if (!allowed.has(v)) {
          return { ok: false, error: `"${field.label}" 의 선택값이 유효하지 않습니다.` }
        }
        if (seen.has(v)) continue
        seen.add(v)
        normalized.push(v)
      }
      return { ok: true, value: JSON.stringify(normalized) }
    }
    case 'radio': {
      if (rawStr === '') return { ok: true, value: '' }
      const allowed = new Set(field.options ?? [])
      if (!allowed.has(rawStr)) {
        return { ok: false, error: `"${field.label}" 의 선택값이 유효하지 않습니다.` }
      }
      return { ok: true, value: rawStr }
    }
    case 'text':
    case 'textarea':
    default:
      return { ok: true, value: rawStr }
  }
}

/**
 * required 검증은 타입별로 달라진다.
 * - text/textarea/radio: 비어 있으면 위반
 * - checkbox: "true" 여야 통과("필수 동의" 같은 의미)
 */
function isRequiredViolated(field, value) {
  if (!field.required) return false
  /* 손사인은 계약 서명 플로우에서 파일/해시로 검증한다. PDF 텍스트 렌더 입력 맵에는 없다. */
  if (field.fieldType === 'signature') return false
  if (field.fieldType === 'checkbox') {
    try {
      const parsed = JSON.parse(value)
      return !Array.isArray(parsed) || parsed.length === 0
    } catch {
      return true
    }
  }
  return !value
}

/**
 * 사용자 입력값 검증: 필드 정의 + values → 렌더링에 쓸 수 있는 문자열 map 으로 변환.
 *
 * @param {FieldSpec[]} fields
 * @param {Record<string, unknown>} values
 * @returns {{ ok: true, normalized: Record<string, string> } | { ok: false, error: string }}
 */
export function validateRenderValues(fields, values) {
  const normalized = {}
  for (const f of fields) {
    const raw = values?.[f.fieldKey]
    const str = raw == null ? '' : String(raw).trim()
    const r = validateOneValue(f, str)
    if (!r.ok) return r
    if (isRequiredViolated(f, r.value)) {
      return { ok: false, error: `"${f.label}" 항목은 필수입니다.` }
    }
    normalized[f.fieldKey] = r.value
  }
  return { ok: true, normalized }
}
