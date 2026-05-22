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
 * 유효 상환내역 기준으로 계약·각 상환 row balance_after 를 동기화한다.
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string} contractId
 */
export async function syncLiquorRepaymentBalancesForContract(executor, contractId) {
  const cur = await executor.query(
    `SELECT total_repayment_planned_amount, adjustment_amount FROM liquor_support_contracts WHERE id = $1 LIMIT 1`,
    [contractId],
  )
  const row = cur.rows[0]
  if (!row) return null

  const planned = Number(row.total_repayment_planned_amount) || 0
  const adjustment = Number(row.adjustment_amount) || 0

  const repRows = await executor.query(
    `
    SELECT id, amount
    FROM liquor_repayments
    WHERE support_contract_id = $1 AND deleted_at IS NULL
    ORDER BY repaid_on ASC NULLS LAST, id ASC
    `,
    [contractId],
  )

  let cumulative = 0
  for (const r of repRows.rows) {
    cumulative += Number(r.amount) || 0
    const balanceAfter = computeLiquorSupportContractBalance({
      totalRepaymentPlannedAmount: planned,
      repaidAmount: cumulative,
      adjustmentAmount: adjustment,
    })
    await executor.query(
      `UPDATE liquor_repayments SET balance_after = $2, updated_at = NOW() WHERE id = $1`,
      [r.id, balanceAfter],
    )
  }

  const balanceAmount = computeLiquorSupportContractBalance({
    totalRepaymentPlannedAmount: planned,
    repaidAmount: cumulative,
    adjustmentAmount: adjustment,
  })
  await executor.query(
    `UPDATE liquor_support_contracts SET repaid_amount = $2, balance_amount = $3, updated_at = NOW() WHERE id = $1`,
    [contractId, cumulative, balanceAmount],
  )
  return { repaidAmount: cumulative, balanceAmount }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string} contractId
 */
export async function recalculateLiquorSupportContractBalance(executor, contractId) {
  return syncLiquorRepaymentBalancesForContract(executor, contractId)
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string} contractId
 * @param {number | string} _repaymentId
 */
export async function refreshLiquorRepaymentBalanceAfter(executor, contractId, _repaymentId) {
  return syncLiquorRepaymentBalancesForContract(executor, contractId)
}

/**
 * @param {unknown} raw
 */
export function parseLiquorRepaymentAmount(raw) {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}
