import { apiRequest } from '../../../lib/apiClient'

export type RepaymentImportMatchStatus =
  | 'unmatched'
  | 'exact_alias_matched'
  | 'conflict'
  | 'duplicate'
  | 'confirmed'
  | 'ignored'
  | 'failed'

export type RepaymentImportBatch = {
  id: number
  originalFileName: string
  status: string
  rowCount: number
  matchedCount: number
  confirmedCount: number
  failedCount: number
  createdAt: string
}

export type RepaymentImportRow = {
  id: number
  batchId: number
  transactionDate: string | null
  amount: number
  direction: string
  depositorName: string
  description: string
  accountNumberMasked: string
  matchedCustomerId: number | null
  matchedSupportContractId: number | null
  matchStatus: RepaymentImportMatchStatus
  matchReason: string
  confirmedRepaymentId: number | null
}

export type RepaymentMatchAlias = {
  id: number
  customerId: number
  supportContractId: number | null
  aliasValue: string
  usageCount: number
  isActive: boolean
}

function mapBatch(row: Record<string, unknown>): RepaymentImportBatch {
  return {
    id: Number(row.id),
    originalFileName: String(row.originalFileName ?? row.original_file_name ?? ''),
    status: String(row.status ?? ''),
    rowCount: Number(row.rowCount ?? row.row_count ?? 0),
    matchedCount: Number(row.matchedCount ?? row.matched_count ?? 0),
    confirmedCount: Number(row.confirmedCount ?? row.confirmed_count ?? 0),
    failedCount: Number(row.failedCount ?? row.failed_count ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  }
}

export function mapImportRow(row: Record<string, unknown>): RepaymentImportRow {
  return {
    id: Number(row.id),
    batchId: Number(row.batchId ?? row.batch_id),
    transactionDate: row.transactionDate != null ? String(row.transactionDate).slice(0, 10) : row.transaction_date != null ? String(row.transaction_date).slice(0, 10) : null,
    amount: Number(row.amount ?? 0),
    direction: String(row.direction ?? ''),
    depositorName: String(row.depositorName ?? row.depositor_name ?? ''),
    description: String(row.description ?? ''),
    accountNumberMasked: String(row.accountNumberMasked ?? row.account_number_masked ?? ''),
    matchedCustomerId:
      row.matchedCustomerId != null
        ? Number(row.matchedCustomerId)
        : row.matched_customer_id != null
          ? Number(row.matched_customer_id)
          : null,
    matchedSupportContractId:
      row.matchedSupportContractId != null
        ? Number(row.matchedSupportContractId)
        : row.matched_support_contract_id != null
          ? Number(row.matched_support_contract_id)
          : null,
    matchStatus: String(row.matchStatus ?? row.match_status ?? 'unmatched') as RepaymentImportMatchStatus,
    matchReason: String(row.matchReason ?? row.match_reason ?? ''),
    confirmedRepaymentId:
      row.confirmedRepaymentId != null
        ? Number(row.confirmedRepaymentId)
        : row.confirmed_repayment_id != null
          ? Number(row.confirmed_repayment_id)
          : null,
  }
}

const MATCH_STATUS_LABELS: Record<string, string> = {
  unmatched: '미매칭',
  exact_alias_matched: '별칭 정확 일치',
  conflict: '별칭 충돌',
  duplicate: '중복',
  confirmed: '확정됨',
  ignored: '무시(출금)',
  failed: '실패',
}

export function repaymentImportStatusLabel(status: string): string {
  return MATCH_STATUS_LABELS[status] ?? status
}

export async function uploadRepaymentImportBatch(token: string, file: File): Promise<{ batch: RepaymentImportBatch; parseErrors: string[] }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/backend/api/liquor/repayment-import/batches/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json.message ?? '업로드에 실패했습니다.'))
  }
  const data = json.data ?? json
  return {
    batch: mapBatch(data.batch ?? data),
    parseErrors: Array.isArray(data.parseErrors) ? data.parseErrors.map(String) : [],
  }
}

export async function listRepaymentImportBatches(token: string): Promise<RepaymentImportBatch[]> {
  const res = await apiRequest<{ ok?: boolean; data?: Array<Record<string, unknown>> }>(
    '/api/liquor/repayment-import/batches',
    { token },
  )
  return (res.data ?? []).map(mapBatch)
}

export async function listRepaymentImportRows(
  token: string,
  batchId: number,
  status?: string,
): Promise<RepaymentImportRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await apiRequest<{ ok?: boolean; data?: Array<Record<string, unknown>> }>(
    `/api/liquor/repayment-import/batches/${batchId}/rows${q}`,
    { token },
  )
  return (res.data ?? []).map(mapImportRow)
}

export async function confirmRepaymentImportRowApi(
  token: string,
  rowId: number,
  body: { customerId: number; supportContractId: number; saveAlias?: boolean },
): Promise<{ repaymentId: number; balanceAmount: number }> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/repayment-import/rows/${rowId}/confirm`,
    { method: 'POST', token, body: { ...body, saveAlias: body.saveAlias !== false } },
  )
  return {
    repaymentId: Number(res.data?.repaymentId ?? 0),
    balanceAmount: Number(res.data?.balanceAmount ?? 0),
  }
}

export async function listRepaymentMatchAliases(token: string): Promise<RepaymentMatchAlias[]> {
  const res = await apiRequest<{ ok?: boolean; data?: Array<Record<string, unknown>> }>(
    '/api/liquor/repayment-import/aliases',
    { token },
  )
  return (res.data ?? []).map((row) => ({
    id: Number(row.id),
    customerId: Number(row.customerId ?? row.customer_id),
    supportContractId:
      row.supportContractId != null
        ? Number(row.supportContractId)
        : row.support_contract_id != null
          ? Number(row.support_contract_id)
          : null,
    aliasValue: String(row.aliasValue ?? row.alias_value ?? ''),
    usageCount: Number(row.usageCount ?? row.usage_count ?? 0),
    isActive: Boolean(row.isActive ?? row.is_active),
  }))
}

export async function deactivateRepaymentMatchAlias(token: string, aliasId: number): Promise<void> {
  await apiRequest(`/api/liquor/repayment-import/aliases/${aliasId}/deactivate`, { method: 'PATCH', token })
}
