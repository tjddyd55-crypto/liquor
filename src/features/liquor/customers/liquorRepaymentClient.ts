import { apiRequest } from '../../../lib/apiClient'

export type LiquorRepaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'card'
  | 'sales_offset'
  | 'goods_return'
  | 'other'

export type LiquorRepaymentInput = {
  repaidOn?: string | null
  amount?: number
  method?: LiquorRepaymentMethod | string
  depositorName?: string
  depositAccount?: string
  memo?: string
}

export type LiquorRepayment = {
  id: number
  supportContractId: number
  customerId: number
  repaidOn: string | null
  amount: number
  method: string
  depositorName: string
  depositAccount: string
  processedByUserId: string | null
  processedByName: string
  balanceAfter: number
  memo: string
  linkedFileCount: number
  createdAt: string
  updatedAt: string | null
}

function dateOnly(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export function mapLiquorRepayment(row: Record<string, unknown>): LiquorRepayment {
  return {
    id: Number(row.id),
    supportContractId: Number(row.supportContractId ?? row.support_contract_id),
    customerId: Number(row.customerId ?? row.customer_id),
    repaidOn: dateOnly(row.repaidOn ?? row.repaid_on),
    amount: Number(row.amount ?? 0),
    method: String(row.method ?? 'other'),
    depositorName: String(row.depositorName ?? row.depositor_name ?? ''),
    depositAccount: String(row.depositAccount ?? row.deposit_account ?? ''),
    processedByUserId:
      row.processedByUserId != null
        ? String(row.processedByUserId)
        : row.processed_by_user_id != null
          ? String(row.processed_by_user_id)
          : null,
    processedByName: String(row.processedByName ?? row.processed_by_name ?? ''),
    balanceAfter: Number(row.balanceAfter ?? row.balance_after ?? 0),
    memo: String(row.memo ?? ''),
    linkedFileCount: Number(row.linkedFileCount ?? row.linked_file_count ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : row.updated_at != null ? String(row.updated_at) : null,
  }
}

export function validateLiquorRepaymentInput(input: LiquorRepaymentInput): string | null {
  if (input.amount != null) {
    const n = Number(String(input.amount).replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n < 0) return '상환금액은 0 이상이어야 합니다.'
  }
  return null
}

export async function createLiquorRepayment(
  token: string,
  customerId: number,
  contractId: number,
  body: LiquorRepaymentInput,
): Promise<LiquorRepayment> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-contracts/${contractId}/repayments`,
    { method: 'POST', token, body },
  )
  return mapLiquorRepayment(res.data ?? {})
}

export async function updateLiquorRepayment(
  token: string,
  customerId: number,
  contractId: number,
  repaymentId: number,
  body: LiquorRepaymentInput,
): Promise<LiquorRepayment> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-contracts/${contractId}/repayments/${repaymentId}`,
    { method: 'PATCH', token, body },
  )
  return mapLiquorRepayment(res.data ?? {})
}

export async function cancelLiquorRepayment(
  token: string,
  customerId: number,
  contractId: number,
  repaymentId: number,
): Promise<void> {
  await apiRequest(
    `/api/liquor/customers/${customerId}/support-contracts/${contractId}/repayments/${repaymentId}`,
    { method: 'DELETE', token },
  )
}
