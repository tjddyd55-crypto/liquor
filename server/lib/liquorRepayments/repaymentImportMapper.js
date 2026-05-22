/**
 * import row 공통 DTO 매핑.
 */
import { createHash } from 'node:crypto'
import { normalizeRepaymentAliasValue } from './repaymentAliasNormalize.js'

/**
 * @typedef {{
 *   rawRowJson: Record<string, unknown>,
 *   transactionDate: string | null,
 *   transactionTime: string | null,
 *   amount: number,
 *   direction: 'deposit' | 'withdrawal',
 *   depositorName: string,
 *   normalizedDepositorName: string,
 *   description: string,
 *   bankName: string,
 *   accountNumber: string,
 *   balanceAfter: number | null,
 *   externalTransactionId: string | null,
 *   rowHash: string,
 * }} RepaymentImportMappedRow
 */

/**
 * @param {number | string} gaId
 * @param {Partial<RepaymentImportMappedRow>} row
 */
export function buildRepaymentImportRowHash(gaId, row) {
  const payload = [
    String(gaId),
    String(row.transactionDate ?? ''),
    String(row.transactionTime ?? ''),
    String(row.direction ?? ''),
    String(row.amount ?? 0),
    String(row.depositorName ?? ''),
    String(row.description ?? ''),
    String(row.accountNumber ?? ''),
    String(row.externalTransactionId ?? ''),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * @param {Record<string, unknown>} input
 * @param {number | string} gaId
 * @returns {RepaymentImportMappedRow | null}
 */
export function mapParsedRowToImportRow(input, gaId) {
  const depositorName = String(input.depositorName ?? input.depositor_name ?? '').trim()
  const description = String(input.description ?? '').trim()
  const amount = Number(input.amount ?? 0)
  const direction = input.direction === 'withdrawal' ? 'withdrawal' : 'deposit'

  if (direction === 'withdrawal') {
    const rawRowJson = input.rawRowJson && typeof input.rawRowJson === 'object' ? input.rawRowJson : { ...input }
    const mapped = {
      rawRowJson,
      transactionDate: input.transactionDate ?? input.transaction_date ?? null,
      transactionTime: input.transactionTime ?? input.transaction_time ?? null,
      amount: Math.abs(Number(input.amount ?? 0)),
      direction: 'withdrawal',
      depositorName,
      normalizedDepositorName: depositorName ? normalizeRepaymentAliasValue(depositorName) : '',
      description,
      bankName: String(input.bankName ?? input.bank_name ?? ''),
      accountNumber: String(input.accountNumber ?? input.account_number ?? ''),
      balanceAfter: input.balanceAfter != null ? Number(input.balanceAfter) : null,
      externalTransactionId: input.externalTransactionId != null ? String(input.externalTransactionId) : null,
      rowHash: '',
    }
    mapped.rowHash = buildRepaymentImportRowHash(gaId, mapped)
    return mapped
  }

  if (direction === 'deposit') {
    if (!input.transactionDate && !input.transaction_date) return null
    if (!Number.isFinite(amount) || amount <= 0) return null
    if (!depositorName && !description) return null
  }

  const rawRowJson = input.rawRowJson && typeof input.rawRowJson === 'object' ? input.rawRowJson : { ...input }
  const mapped = {
    rawRowJson,
    transactionDate: input.transactionDate ?? input.transaction_date ?? null,
    transactionTime: input.transactionTime ?? input.transaction_time ?? null,
    amount: direction === 'deposit' ? amount : Math.abs(amount),
    direction,
    depositorName,
    normalizedDepositorName: depositorName ? normalizeRepaymentAliasValue(depositorName) : '',
    description,
    bankName: String(input.bankName ?? input.bank_name ?? ''),
    accountNumber: String(input.accountNumber ?? input.account_number ?? ''),
    balanceAfter: input.balanceAfter != null ? Number(input.balanceAfter) : input.balance_after != null ? Number(input.balance_after) : null,
    externalTransactionId:
      input.externalTransactionId != null
        ? String(input.externalTransactionId)
        : input.external_transaction_id != null
          ? String(input.external_transaction_id)
          : null,
    rowHash: '',
  }
  mapped.rowHash = buildRepaymentImportRowHash(gaId, mapped)
  return mapped
}
