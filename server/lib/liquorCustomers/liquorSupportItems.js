/**
 * 주류 CRM 지원물품 검증·매핑.
 */

export const LIQUOR_ITEM_KINDS = [
  'refrigerator',
  'upright_freezer',
  'ice_maker',
  'horizontal_stocker',
  'signboard',
  'display_shelf',
  'other',
]

export const LIQUOR_ITEM_STATUSES = [
  'planned',
  'installed',
  'in_use',
  'broken',
  'recovery_scheduled',
  'recovered',
  'lost',
  'disposed',
]

export const LIQUOR_OWNERSHIP_TYPES = ['company_owned', 'customer_owned', 'transfer_after_contract', 'other']

/**
 * @param {unknown} v
 */
export function parseLiquorItemQuantity(v) {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

/**
 * @param {unknown} v
 */
export function parseLiquorItemMoney(v) {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * @param {number} quantity
 * @param {number} unitPrice
 */
export function computeLiquorItemTotalAmount(quantity, unitPrice) {
  return Math.round(quantity * unitPrice * 100) / 100
}

/**
 * @param {Record<string, unknown>} b
 * @param {{ quantity?: number, unitPrice?: number, totalAmount?: number }} [existing]
 */
export function resolveLiquorSupportItemAmounts(b, existing = {}) {
  const quantity =
    b.quantity != null || b.quantity === 0
      ? parseLiquorItemQuantity(b.quantity)
      : existing.quantity != null
        ? existing.quantity
        : 1
  if (quantity == null) {
    return { ok: false, message: '수량은 1 이상이어야 합니다.' }
  }

  const unitPrice =
    b.unitPrice != null || b.unit_price != null
      ? parseLiquorItemMoney(b.unitPrice ?? b.unit_price)
      : existing.unitPrice != null
        ? existing.unitPrice
        : 0
  if (unitPrice == null) {
    return { ok: false, message: '단가는 0 이상이어야 합니다.' }
  }

  const hasExplicitTotal = b.totalAmount != null || b.total_amount != null
  let totalAmount
  if (hasExplicitTotal) {
    totalAmount = parseLiquorItemMoney(b.totalAmount ?? b.total_amount)
    if (totalAmount == null) {
      return { ok: false, message: '총액은 0 이상이어야 합니다.' }
    }
  } else {
    totalAmount = computeLiquorItemTotalAmount(quantity, unitPrice)
  }

  return { ok: true, quantity, unitPrice, totalAmount }
}

/**
 * @param {Record<string, unknown>} b
 * @param {{ status?: string, recoveredOn?: string | null, memo?: string }} [existing]
 */
export function validateLiquorSupportItemBusinessRules(b, existing = {}) {
  const status = String(b.status ?? existing.status ?? 'planned')
  const recoveredOn = b.recoveredOn ?? b.recovered_on ?? existing.recoveredOn ?? existing.recovered_on ?? null
  const memo = String(b.memo ?? existing.memo ?? '').trim()

  if (status === 'recovered' && !recoveredOn) {
    return { ok: false, message: '회수완료 상태에서는 회수일을 입력해 주세요.' }
  }
  if (['broken', 'lost', 'disposed'].includes(status) && !memo) {
    return { ok: false, message: '고장/분실/폐기 상태에서는 메모를 입력해 주세요.' }
  }
  return { ok: true }
}

/**
 * @param {Record<string, unknown>} row
 */
export function supportItemToDto(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    supportContractId: row.support_contract_id != null ? Number(row.support_contract_id) : null,
    itemKind: String(row.item_kind ?? 'other'),
    itemKindOther: String(row.item_kind_other ?? ''),
    modelName: String(row.model_name ?? ''),
    manufacturer: String(row.manufacturer ?? ''),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    supportedOn: row.supported_on ?? null,
    installedOn: row.installed_on ?? null,
    installLocation: String(row.install_location ?? ''),
    ownershipType: String(row.ownership_type ?? ''),
    recoveryRequired: Boolean(row.recovery_required),
    recoveryDueOn: row.recovery_due_on ?? null,
    recoveredOn: row.recovered_on ?? null,
    status: String(row.status ?? 'planned'),
    memo: String(row.memo ?? ''),
    linkedFileCount: row.linked_file_count != null ? Number(row.linked_file_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
