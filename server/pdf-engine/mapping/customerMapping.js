/**
 * 고객 프로필 → PDF 필드값 자동 매핑 (하위 호환 re-export).
 *
 * 신규 코드는 resolvePdfFieldValue / applyCustomerMappingToValues 를 사용한다.
 */

import { pickCustomerPdfFieldValue } from './customerPdfFieldKeys.js'
import { applyCustomerMappingToValues, resolvePdfFieldValue } from './resolvePdfFieldValue.js'
import { parseFieldDataMapping } from '../schema/fieldDataMapping.js'

export { resolvePdfFieldValue, applyCustomerMappingToValues, pickCustomerPdfFieldValue }

/**
 * @deprecated 레거시 users 프로필 행 — 신규는 customers API 객체를 사용한다.
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {'name' | 'dob' | 'phone' | 'address'} mapping
 */
export function pickMappedValue(profile, mapping) {
  if (!profile) return ''
  const asCustomer = {
    name: profile.display_name,
    phone: profile.phone_number,
    birthDate: profile.customer_dob,
    address: profile.customer_address,
  }
  switch (mapping) {
    case 'name':
      return pickCustomerPdfFieldValue(asCustomer, 'name')
    case 'phone':
      return pickCustomerPdfFieldValue(asCustomer, 'phone')
    case 'dob':
      return pickCustomerPdfFieldValue(asCustomer, 'birthDate')
    case 'address':
      return pickCustomerPdfFieldValue(asCustomer, 'address')
    default:
      return ''
  }
}

/**
 * @param {Array<{ fieldKey: string, dataMapping?: unknown, customerMapping?: unknown }>} fields
 * @param {Record<string, unknown>} userValues
 * @param {Record<string, unknown> | null | undefined} profileOrCustomer
 * @returns {Record<string, unknown>}
 */
function toCustomerLike(profileOrCustomer) {
  if (!profileOrCustomer || typeof profileOrCustomer !== 'object') return null
  const row = /** @type {Record<string, unknown>} */ (profileOrCustomer)
  if (typeof row.name === 'string' && row.name.trim()) {
    return profileOrCustomer
  }
  return {
    name: row.display_name,
    phone: row.phone_number,
    birthDate: row.customer_dob,
    address: row.customer_address,
  }
}

export function injectCustomerValues(fields, userValues, profileOrCustomer) {
  const normalizedFields = fields.map((f) => ({
    ...f,
    dataMapping:
      f.dataMapping ??
      (typeof f.customerMapping === 'string' && f.customerMapping
        ? parseFieldDataMapping(f.customerMapping)
        : null),
  }))
  return applyCustomerMappingToValues(
    normalizedFields,
    userValues,
    toCustomerLike(profileOrCustomer),
    {
      overwriteMode: true,
    },
  )
}
