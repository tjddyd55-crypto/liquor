import { apiRequest } from '../../../lib/apiClient'

export type LiquorSupportContractStatus =
  | 'draft'
  | 'pending_contract'
  | 'support_completed'
  | 'repaying'
  | 'repaid'
  | 'overdue'
  | 'collection_required'
  | 'terminated'

export type LiquorSupportType = 'liquor_loan' | 'cash_support' | 'goods_support' | 'mixed' | 'other'

export type LiquorSupportContract = {
  id: number
  customerId?: number
  contractName: string
  supportType: LiquorSupportType | string
  supportDate: string | null
  supportAmount: number
  supportDescription: string
  supportConditions: string
  agreementStartOn: string | null
  agreementEndOn: string | null
  repaymentRequired: boolean
  repaymentStartOn: string | null
  repaymentDueOn: string | null
  totalRepaymentPlannedAmount: number
  repaidAmount: number
  balanceAmount: number
  adjustmentAmount: number
  adjustmentReason: string
  adjustedAt: string | null
  status: LiquorSupportContractStatus | string
  memo: string
}

export type LiquorSupportContractInput = {
  contractName?: string
  supportType?: string
  supportDate?: string | null
  supportAmount?: number
  supportDescription?: string
  supportConditions?: string
  agreementStartOn?: string | null
  agreementEndOn?: string | null
  repaymentRequired?: boolean
  repaymentStartOn?: string | null
  repaymentDueOn?: string | null
  totalRepaymentPlannedAmount?: number
  adjustmentAmount?: number
  adjustmentReason?: string
  status?: string
  memo?: string
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function dateOnly(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export function mapLiquorSupportContract(row: Record<string, unknown>): LiquorSupportContract {
  return {
    id: num(row.id),
    customerId: row.customerId != null ? num(row.customerId) : row.customer_id != null ? num(row.customer_id) : undefined,
    contractName: String(row.contractName ?? row.contract_name ?? ''),
    supportType: String(row.supportType ?? row.support_type ?? 'other'),
    supportDate: dateOnly(row.supportDate ?? row.support_date),
    supportAmount: num(row.supportAmount ?? row.support_amount),
    supportDescription: String(row.supportDescription ?? row.support_description ?? ''),
    supportConditions: String(row.supportConditions ?? row.support_conditions ?? ''),
    agreementStartOn: dateOnly(row.agreementStartOn ?? row.agreement_start_on),
    agreementEndOn: dateOnly(row.agreementEndOn ?? row.agreement_end_on),
    repaymentRequired: Boolean(row.repaymentRequired ?? row.repayment_required),
    repaymentStartOn: dateOnly(row.repaymentStartOn ?? row.repayment_start_on),
    repaymentDueOn: dateOnly(row.repaymentDueOn ?? row.repayment_due_on),
    totalRepaymentPlannedAmount: num(row.totalRepaymentPlannedAmount ?? row.total_repayment_planned_amount),
    repaidAmount: num(row.repaidAmount ?? row.repaid_amount),
    balanceAmount: num(row.balanceAmount ?? row.balance_amount),
    adjustmentAmount: num(row.adjustmentAmount ?? row.adjustment_amount),
    adjustmentReason: String(row.adjustmentReason ?? row.adjustment_reason ?? ''),
    adjustedAt: row.adjustedAt != null ? String(row.adjustedAt) : row.adjusted_at != null ? String(row.adjusted_at) : null,
    status: String(row.status ?? 'draft'),
    memo: String(row.memo ?? ''),
  }
}

export async function createLiquorSupportContract(
  token: string,
  customerId: number,
  body: LiquorSupportContractInput,
): Promise<LiquorSupportContract> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-contracts`,
    { method: 'POST', token, body },
  )
  return mapLiquorSupportContract(res.data ?? {})
}

export async function updateLiquorSupportContract(
  token: string,
  customerId: number,
  contractId: number,
  body: LiquorSupportContractInput,
): Promise<LiquorSupportContract> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/support-contracts/${contractId}`,
    { method: 'PATCH', token, body },
  )
  return mapLiquorSupportContract(res.data ?? {})
}
