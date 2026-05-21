/**
 * PDF 템플릿 필드 입력 주체(전자계약 플로우).
 * 허용: customer · sender · disabled
 */

export const INPUT_ROLES = Object.freeze(['customer', 'sender', 'disabled'])

const LEGACY_TO_ROLE = Object.freeze({
  fixed: 'customer',
  auto: 'customer',
  customer_profile: 'customer',
  sender_profile: 'sender',
  customer: 'customer',
  sender: 'sender',
  disabled: 'disabled',
})

/**
 * 행 또는 원시 문자열에서 input_role 만 추출한다(검증은 호출측).
 * @param {string | null | undefined} raw
 */
export function parseInputRoleString(raw) {
  const k = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (LEGACY_TO_ROLE[k]) {
    return /** @type {'customer' | 'sender' | 'disabled'} */ (LEGACY_TO_ROLE[k])
  }
  if (!k) {
    return 'customer'
  }
  return 'customer'
}

/**
 * @param {{ input_role?: string | null }} row
 */
export function inputRoleFromPdfFieldRow(row) {
  const r = parseInputRoleString(row?.input_role)
  const ft = String(row?.field_type ?? '')
  if (ft === 'signature' && r === 'sender') {
    return 'customer'
  }
  return r
}

export function inputRoleAllowsCustomerEdit(role) {
  return role === 'customer'
}

export function inputRoleExcludedFromPdfStamp(role) {
  return role === 'disabled'
}
