/**
 * 지원계약 잔액 = 총 상환 예정금액 - 상환완료금액 + 조정금액
 */

/**
 * @param {{
 *   totalRepaymentPlannedAmount: number | string,
 *   repaidAmount: number | string,
 *   adjustmentAmount?: number | string,
 * }} input
 */
export function computeLiquorSupportContractBalance(input) {
  const planned = Number(input.totalRepaymentPlannedAmount) || 0
  const repaid = Number(input.repaidAmount) || 0
  const adjustment = Number(input.adjustmentAmount) || 0
  return Math.round((planned - repaid + adjustment) * 100) / 100
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string} contractId
 */
export async function recalculateLiquorSupportContractBalance(executor, contractId) {
  const sum = await executor.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM liquor_repayments WHERE support_contract_id = $1`,
    [contractId],
  )
  const repaid = Number(sum.rows[0]?.total ?? 0)
  const cur = await executor.query(
    `SELECT total_repayment_planned_amount, adjustment_amount FROM liquor_support_contracts WHERE id = $1 LIMIT 1`,
    [contractId],
  )
  const row = cur.rows[0]
  if (!row) return null
  const balance = computeLiquorSupportContractBalance({
    totalRepaymentPlannedAmount: row.total_repayment_planned_amount,
    repaidAmount: repaid,
    adjustmentAmount: row.adjustment_amount,
  })
  await executor.query(
    `UPDATE liquor_support_contracts SET repaid_amount = $2, balance_amount = $3, updated_at = NOW() WHERE id = $1`,
    [contractId, repaid, balance],
  )
  return { repaidAmount: repaid, balanceAmount: balance }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string} contractId
 * @param {number | string} repaymentId
 */
export async function refreshLiquorRepaymentBalanceAfter(executor, contractId, repaymentId) {
  const bal = await recalculateLiquorSupportContractBalance(executor, contractId)
  if (!bal) return null
  await executor.query(
    `UPDATE liquor_repayments SET balance_after = $2, updated_at = NOW() WHERE id = $1`,
    [repaymentId, bal.balanceAmount],
  )
  return bal
}
