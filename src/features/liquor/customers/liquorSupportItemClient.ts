import { apiRequest } from '../../../lib/apiClient'

export type LiquorSupportItemStatus =
  | 'planned'
  | 'installed'
  | 'in_use'
  | 'broken'
  | 'recovery_scheduled'
  | 'recovered'
  | 'lost'
  | 'disposed'

export type LiquorSupportItem = {
  id: number
  customerId: number
  supportContractId: number | null
  itemKind: string
  itemKindOther: string
  modelName: string
  manufacturer: string
  quantity: number
  unitPrice: number
  totalAmount: number
  supportedOn: string | null
  installedOn: string | null
  installLocation: string
  ownershipType: string
  recoveryRequired: boolean
  recoveryDueOn: string | null
  recoveredOn: string | null
  status: LiquorSupportItemStatus | string
  memo: string
  linkedFileCount?: number
}

export type LiquorSupportItemInput = {
  supportContractId?: number | null
  itemKind?: string
  itemKindOther?: string
  modelName?: string
  manufacturer?: string
  quantity?: number
  unitPrice?: number
  totalAmount?: number
  supportedOn?: string | null
  installedOn?: string | null
  installLocation?: string
  ownershipType?: string
  recoveryRequired?: boolean
  recoveryDueOn?: string | null
  recoveredOn?: string | null
  status?: string
  memo?: string
}

function dateOnly(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v).slice(0, 10)
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function mapLiquorSupportItem(row: Record<string, unknown>): LiquorSupportItem {
  return {
    id: num(row.id),
    customerId: num(row.customerId ?? row.customer_id),
    supportContractId:
      row.supportContractId != null
        ? num(row.supportContractId)
        : row.support_contract_id != null
          ? num(row.support_contract_id)
          : null,
    itemKind: String(row.itemKind ?? row.item_kind ?? 'other'),
    itemKindOther: String(row.itemKindOther ?? row.item_kind_other ?? ''),
    modelName: String(row.modelName ?? row.model_name ?? ''),
    manufacturer: String(row.manufacturer ?? ''),
    quantity: num(row.quantity ?? 1),
    unitPrice: num(row.unitPrice ?? row.unit_price),
    totalAmount: num(row.totalAmount ?? row.total_amount),
    supportedOn: dateOnly(row.supportedOn ?? row.supported_on),
    installedOn: dateOnly(row.installedOn ?? row.installed_on),
    installLocation: String(row.installLocation ?? row.install_location ?? ''),
    ownershipType: String(row.ownershipType ?? row.ownership_type ?? ''),
    recoveryRequired: Boolean(row.recoveryRequired ?? row.recovery_required),
    recoveryDueOn: dateOnly(row.recoveryDueOn ?? row.recovery_due_on),
    recoveredOn: dateOnly(row.recoveredOn ?? row.recovered_on),
    status: String(row.status ?? 'planned'),
    memo: String(row.memo ?? ''),
    linkedFileCount:
      row.linkedFileCount != null
        ? num(row.linkedFileCount)
        : row.linked_file_count != null
          ? num(row.linked_file_count)
          : undefined,
  }
}

export function computeSupportItemTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

export function parseSupportItemAmountInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n * 100) / 100
}

export function parseSupportItemQuantityInput(raw: string): number {
  const n = Math.trunc(Number(String(raw).trim()))
  if (!Number.isFinite(n) || n < 1) return NaN
  return n
}

export function validateLiquorSupportItemInput(input: LiquorSupportItemInput): string | null {
  const qty = input.quantity ?? 1
  if (!Number.isFinite(qty) || qty < 1) return '수량은 1 이상이어야 합니다.'
  const unit = input.unitPrice ?? 0
  if (!Number.isFinite(unit) || unit < 0) return '단가는 0 이상이어야 합니다.'
  const total = input.totalAmount ?? computeSupportItemTotal(qty, unit)
  if (!Number.isFinite(total) || total < 0) return '총액은 0 이상이어야 합니다.'
  if (input.itemKind === 'other' && !String(input.itemKindOther ?? '').trim()) {
    return '기타 물품명을 입력해 주세요.'
  }
  if (input.status === 'recovered' && !input.recoveredOn) {
    return '회수완료 상태에서는 회수일을 입력해 주세요.'
  }
  if (['broken', 'lost', 'disposed'].includes(String(input.status ?? '')) && !String(input.memo ?? '').trim()) {
    return '고장/분실/폐기 상태에서는 메모를 입력해 주세요.'
  }
  return null
}

export async function createLiquorSupportItem(
  token: string,
  customerId: number,
  body: LiquorSupportItemInput,
): Promise<LiquorSupportItem> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-items`,
    { method: 'POST', token, body },
  )
  return mapLiquorSupportItem(res.data ?? {})
}

export async function updateLiquorSupportItem(
  token: string,
  customerId: number,
  itemId: number,
  body: LiquorSupportItemInput,
): Promise<LiquorSupportItem> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-items/${itemId}`,
    { method: 'PATCH', token, body },
  )
  return mapLiquorSupportItem(res.data ?? {})
}

export async function deleteLiquorSupportItem(token: string, customerId: number, itemId: number): Promise<void> {
  await apiRequest(`/api/liquor/customers/${customerId}/support-items/${itemId}`, { method: 'DELETE', token })
}
