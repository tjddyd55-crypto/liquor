import { apiRequest } from '../../../lib/apiClient'

export type LiquorReceivablesSummary = {
  totalSupportAmount: number
  totalRepaidAmount: number
  totalBalanceAmount: number
  overdueOrCollectionCount: number
  repayingContractCount: number
  repaidContractCount: number
  unmatchedImportRowCount: number
  conflictImportRowCount: number
  recoveryRequiredItemCount: number
  recoveryScheduledOrRecoveredCount: number
}

export type LiquorReceivablesContractRow = {
  id: number
  customerId: number
  customerName: string
  representativeName: string
  customerPhone: string
  contractName: string
  supportType: string
  supportDate: string | null
  totalRepaymentPlannedAmount: number
  repaidAmount: number
  adjustmentAmount: number
  balanceAmount: number
  status: string
  latestRepaymentOn: string | null
  repaymentDueOn: string | null
}

export type LiquorReceivablesImportRow = {
  id: number
  batchId: number
  batchFileName: string
  transactionDate: string | null
  depositorName: string
  amount: number
  matchStatus: string
  matchReason: string
  matchedCustomerId: number | null
  matchedCustomerName: string | null
}

export type LiquorReceivablesSupportItemRow = {
  id: number
  customerId: number
  customerName: string
  itemKind: string
  itemKindOther: string
  modelName: string
  status: string
  recoveryRequired: boolean
  recoveryDueOn: string | null
  recoveredOn: string | null
  linkedFileCount: number
}

function mapSummary(raw: Record<string, unknown>): LiquorReceivablesSummary {
  return {
    totalSupportAmount: Number(raw.totalSupportAmount ?? raw.total_support_amount ?? 0),
    totalRepaidAmount: Number(raw.totalRepaidAmount ?? raw.total_repaid_amount ?? 0),
    totalBalanceAmount: Number(raw.totalBalanceAmount ?? raw.total_balance_amount ?? 0),
    overdueOrCollectionCount: Number(raw.overdueOrCollectionCount ?? raw.overdue_or_collection_count ?? 0),
    repayingContractCount: Number(raw.repayingContractCount ?? raw.repaying_contract_count ?? 0),
    repaidContractCount: Number(raw.repaidContractCount ?? raw.repaid_contract_count ?? 0),
    unmatchedImportRowCount: Number(raw.unmatchedImportRowCount ?? raw.unmatched_import_row_count ?? 0),
    conflictImportRowCount: Number(raw.conflictImportRowCount ?? raw.conflict_import_row_count ?? 0),
    recoveryRequiredItemCount: Number(raw.recoveryRequiredItemCount ?? raw.recovery_required_item_count ?? 0),
    recoveryScheduledOrRecoveredCount: Number(
      raw.recoveryScheduledOrRecoveredCount ?? raw.recovery_scheduled_or_recovered_count ?? 0,
    ),
  }
}

export type ReceivablesContractFilters = {
  status?: string
  supportType?: string
  hasBalance?: string
  overdueDue?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

function toQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim()) qs.set(k, String(v).trim())
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export async function fetchLiquorReceivablesSummary(token: string): Promise<LiquorReceivablesSummary> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    '/api/liquor/receivables/summary',
    { token },
  )
  return mapSummary(res.data ?? {})
}

export async function fetchLiquorReceivablesContracts(
  token: string,
  filters: ReceivablesContractFilters = {},
): Promise<{ total: number; items: LiquorReceivablesContractRow[] }> {
  const q = toQuery({
    status: filters.status,
    supportType: filters.supportType,
    hasBalance: filters.hasBalance,
    overdueDue: filters.overdueDue,
    search: filters.search,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })
  const res = await apiRequest<{
    ok?: boolean
    data?: { total?: number; items?: Array<Record<string, unknown>> }
  }>(`/api/liquor/receivables/contracts${q}`, { token })
  const data = res.data ?? {}
  return {
    total: Number(data.total ?? 0),
    items: (data.items ?? []).map((row) => ({
      id: Number(row.id),
      customerId: Number(row.customerId ?? row.customer_id),
      customerName: String(row.customerName ?? row.customer_name ?? ''),
      representativeName: String(row.representativeName ?? row.representative_name ?? row.business_representative_name ?? ''),
      customerPhone: String(row.customerPhone ?? row.customer_phone ?? ''),
      contractName: String(row.contractName ?? row.contract_name ?? ''),
      supportType: String(row.supportType ?? row.support_type ?? ''),
      supportDate: row.supportDate != null ? String(row.supportDate).slice(0, 10) : row.support_date != null ? String(row.support_date).slice(0, 10) : null,
      totalRepaymentPlannedAmount: Number(row.totalRepaymentPlannedAmount ?? row.total_repayment_planned_amount ?? 0),
      repaidAmount: Number(row.repaidAmount ?? row.repaid_amount ?? 0),
      adjustmentAmount: Number(row.adjustmentAmount ?? row.adjustment_amount ?? 0),
      balanceAmount: Number(row.balanceAmount ?? row.balance_amount ?? 0),
      status: String(row.status ?? ''),
      latestRepaymentOn:
        row.latestRepaymentOn != null
          ? String(row.latestRepaymentOn).slice(0, 10)
          : row.latest_repayment_on != null
            ? String(row.latest_repayment_on).slice(0, 10)
            : null,
      repaymentDueOn:
        row.repaymentDueOn != null
          ? String(row.repaymentDueOn).slice(0, 10)
          : row.repayment_due_on != null
            ? String(row.repayment_due_on).slice(0, 10)
            : null,
    })),
  }
}

export async function fetchLiquorReceivablesImportRows(
  token: string,
): Promise<{ total: number; items: LiquorReceivablesImportRow[] }> {
  const res = await apiRequest<{
    ok?: boolean
    data?: { total?: number; items?: Array<Record<string, unknown>> }
  }>('/api/liquor/receivables/import-rows', { token })
  const data = res.data ?? {}
  return {
    total: Number(data.total ?? 0),
    items: (data.items ?? []).map((row) => ({
      id: Number(row.id),
      batchId: Number(row.batchId ?? row.batch_id),
      batchFileName: String(row.batchFileName ?? row.batch_file_name ?? row.original_file_name ?? ''),
      transactionDate:
        row.transactionDate != null
          ? String(row.transactionDate).slice(0, 10)
          : row.transaction_date != null
            ? String(row.transaction_date).slice(0, 10)
            : null,
      depositorName: String(row.depositorName ?? row.depositor_name ?? ''),
      amount: Number(row.amount ?? 0),
      matchStatus: String(row.matchStatus ?? row.match_status ?? ''),
      matchReason: String(row.matchReason ?? row.match_reason ?? ''),
      matchedCustomerId:
        row.matchedCustomerId != null
          ? Number(row.matchedCustomerId)
          : row.matched_customer_id != null
            ? Number(row.matched_customer_id)
            : null,
      matchedCustomerName:
        row.matchedCustomerName != null
          ? String(row.matchedCustomerName)
          : row.matched_customer_name != null
            ? String(row.matched_customer_name)
            : null,
    })),
  }
}

export async function fetchLiquorReceivablesSupportItems(
  token: string,
): Promise<{ total: number; items: LiquorReceivablesSupportItemRow[] }> {
  const res = await apiRequest<{
    ok?: boolean
    data?: { total?: number; items?: Array<Record<string, unknown>> }
  }>('/api/liquor/receivables/support-items', { token })
  const data = res.data ?? {}
  return {
    total: Number(data.total ?? 0),
    items: (data.items ?? []).map((row) => ({
      id: Number(row.id),
      customerId: Number(row.customerId ?? row.customer_id),
      customerName: String(row.customerName ?? row.customer_name ?? ''),
      itemKind: String(row.itemKind ?? row.item_kind ?? ''),
      itemKindOther: String(row.itemKindOther ?? row.item_kind_other ?? ''),
      modelName: String(row.modelName ?? row.model_name ?? ''),
      status: String(row.status ?? ''),
      recoveryRequired: Boolean(row.recoveryRequired ?? row.recovery_required),
      recoveryDueOn:
        row.recoveryDueOn != null
          ? String(row.recoveryDueOn).slice(0, 10)
          : row.recovery_due_on != null
            ? String(row.recovery_due_on).slice(0, 10)
            : null,
      recoveredOn:
        row.recoveredOn != null
          ? String(row.recoveredOn).slice(0, 10)
          : row.recovered_on != null
            ? String(row.recovered_on).slice(0, 10)
            : null,
      linkedFileCount: Number(row.linkedFileCount ?? row.linked_file_count ?? 0),
    })),
  }
}

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  unmatched: '미매칭',
  conflict: '별칭 충돌',
  duplicate: '중복',
}
