/**
 * PDF 필드 최종 표시값 resolve — 프론트·서버 공통 규칙(서버 구현).
 */

import { parseFieldDataMapping } from '../schema/fieldDataMapping.js'
import { pickCustomerPdfFieldValue } from './customerPdfFieldKeys.js'

/**
 * @param {{
 *   field: { fieldKey?: string, dataMapping?: unknown, customerMapping?: unknown },
 *   manualValue?: unknown,
 *   customer?: Record<string, unknown> | null,
 *   overwriteMode?: boolean,
 * }} input
 * @returns {string}
 */
export function resolvePdfFieldValue({ field, manualValue, customer, overwriteMode = false }) {
  const manual = manualValue == null ? '' : String(manualValue).trim()
  const mapping = parseFieldDataMapping(field.dataMapping ?? field.customerMapping ?? null)

  if (mapping.dataSourceType !== 'customer' || !mapping.customerFieldKey) {
    return manual
  }

  const fromCustomer = pickCustomerPdfFieldValue(customer, mapping.customerFieldKey)
  const resolved = fromCustomer || mapping.fallbackText || ''

  if (overwriteMode) {
    return resolved
  }
  if (manual) {
    return manual
  }
  return resolved
}

/**
 * @param {Array<{ fieldKey: string, dataMapping?: unknown, customerMapping?: unknown }>} fields
 * @param {Record<string, unknown>} userValues
 * @param {Record<string, unknown> | null | undefined} customer
 * @param {{ overwriteMode?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function applyCustomerMappingToValues(fields, userValues, customer, opts = {}) {
  const overwriteMode = opts.overwriteMode === true
  const out = { ...(userValues ?? {}) }
  for (const f of fields) {
    const key = f.fieldKey
    if (!key) continue
    const mapping = parseFieldDataMapping(f.dataMapping ?? f.customerMapping ?? null)
    if (mapping.dataSourceType !== 'customer' || !mapping.customerFieldKey) {
      continue
    }
    const manual = out[key] == null ? '' : String(out[key]).trim()
    const next = resolvePdfFieldValue({
      field: f,
      manualValue: manual,
      customer,
      overwriteMode,
    })
    if (overwriteMode || !manual) {
      if (next) {
        out[key] = next
      }
    }
  }
  return out
}
