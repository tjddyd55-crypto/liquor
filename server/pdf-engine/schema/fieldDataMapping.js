/**
 * PDF 좌표 필드 ↔ 고객 데이터 매핑 (템플릿에 저장되는 메타만).
 * 실제 고객 값은 발급/미리보기 시점에 resolve 한다.
 */

import { isAllowedCustomerPdfFieldKey } from '../mapping/customerPdfFieldKeys.js'

/** @typedef {'manual' | 'customer'} PdfFieldDataSourceType */

/**
 * @typedef {{
 *   dataSourceType: PdfFieldDataSourceType,
 *   customerFieldKey: string | null,
 *   customerFieldLabel: string | null,
 *   fallbackText: string | null,
 *   transformType: string | null,
 * }} PdfFieldDataMapping
 */

const LEGACY_MAPPING_KEYS = Object.freeze({
  name: 'name',
  phone: 'phone',
  dob: 'birthDate',
  address: 'address',
})

export const DEFAULT_FIELD_DATA_MAPPING = Object.freeze({
  dataSourceType: 'manual',
  customerFieldKey: null,
  customerFieldLabel: null,
  fallbackText: null,
  transformType: null,
})

/**
 * @returns {PdfFieldDataMapping}
 */
export function defaultFieldDataMapping() {
  return { ...DEFAULT_FIELD_DATA_MAPPING }
}

/**
 * DB customer_mapping TEXT → 도메인 객체.
 * - JSON 객체
 * - 레거시 단일 키: name | phone | dob | address
 *
 * @param {unknown} raw
 * @returns {PdfFieldDataMapping}
 */
export function parseFieldDataMapping(raw) {
  if (raw == null || raw === '') {
    return defaultFieldDataMapping()
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeFieldDataMapping(raw)
  }

  const str = String(raw).trim()
  if (!str) {
    return defaultFieldDataMapping()
  }

  if (str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str)
      if (parsed && typeof parsed === 'object') {
        return normalizeFieldDataMapping(parsed)
      }
    } catch {
      return defaultFieldDataMapping()
    }
  }

  const legacyKey = LEGACY_MAPPING_KEYS[str]
  if (legacyKey) {
    return {
      dataSourceType: 'customer',
      customerFieldKey: legacyKey,
      customerFieldLabel: null,
      fallbackText: null,
      transformType: null,
    }
  }

  return defaultFieldDataMapping()
}

/**
 * @param {unknown} raw
 * @returns {PdfFieldDataMapping}
 */
export function normalizeFieldDataMapping(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  const typeRaw = typeof src.dataSourceType === 'string' ? src.dataSourceType.trim().toLowerCase() : ''
  const dataSourceType = typeRaw === 'customer' ? 'customer' : 'manual'

  let customerFieldKey =
    typeof src.customerFieldKey === 'string' ? src.customerFieldKey.trim() : null
  if (customerFieldKey === 'dob') {
    customerFieldKey = 'birthDate'
  }
  if (customerFieldKey && !isAllowedCustomerPdfFieldKey(customerFieldKey)) {
    customerFieldKey = null
  }

  const customerFieldLabel =
    typeof src.customerFieldLabel === 'string' && src.customerFieldLabel.trim()
      ? src.customerFieldLabel.trim().slice(0, 80)
      : null

  const fallbackText =
    typeof src.fallbackText === 'string' ? src.fallbackText.trim().slice(0, 500) : null

  const transformType =
    typeof src.transformType === 'string' && src.transformType.trim()
      ? src.transformType.trim().slice(0, 40)
      : null

  if (dataSourceType !== 'customer') {
    return {
      dataSourceType: 'manual',
      customerFieldKey: null,
      customerFieldLabel: null,
      fallbackText,
      transformType,
    }
  }

  return {
    dataSourceType: 'customer',
    customerFieldKey: customerFieldKey || null,
    customerFieldLabel,
    fallbackText,
    transformType,
  }
}

/**
 * @param {PdfFieldDataMapping | null | undefined} mapping
 * @returns {string | null}
 */
export function serializeFieldDataMapping(mapping) {
  const m = normalizeFieldDataMapping(mapping ?? defaultFieldDataMapping())
  if (m.dataSourceType === 'manual' && !m.fallbackText && !m.transformType) {
    return null
  }
  return JSON.stringify(m)
}
