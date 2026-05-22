/**
 * 상환 import row 확정 + alias 저장.
 */
import { normalizeRepaymentAliasValue } from './repaymentAliasNormalize.js'
import { parseLiquorRepaymentAmount, syncLiquorRepaymentBalancesForContract } from '../../services/liquorCustomerBalance.js'

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   gaId: number,
 *   userId: string,
 *   rowId: number,
 *   customerId: number,
 *   supportContractId: number,
 *   saveAlias: boolean,
 * }} input
 */
export async function confirmRepaymentImportRow(client, input) {
  const { gaId, userId, rowId, customerId, supportContractId, saveAlias } = input

  const rowR = await client.query(
    `
    SELECT * FROM liquor_repayment_import_rows
    WHERE id = $1 AND ga_id = $2
    FOR UPDATE
    `,
    [rowId, gaId],
  )
  if (!rowR.rowCount) {
    return { ok: false, status: 404, message: 'import row를 찾을 수 없습니다.' }
  }
  const row = rowR.rows[0]
  if (String(row.match_status) === 'confirmed') {
    return { ok: false, status: 409, message: '이미 확정된 row입니다.' }
  }
  if (String(row.direction) !== 'deposit') {
    return { ok: false, status: 400, message: '입금 row만 확정할 수 있습니다.' }
  }

  const contractR = await client.query(
    `SELECT id FROM liquor_support_contracts WHERE id = $1 AND customer_id = $2 AND ga_id = $3 LIMIT 1`,
    [supportContractId, customerId, gaId],
  )
  if (!contractR.rowCount) {
    return { ok: false, status: 400, message: '지원계약을 찾을 수 없습니다.' }
  }

  const amount = parseLiquorRepaymentAmount(row.amount)
  if (amount == null || amount <= 0) {
    return { ok: false, status: 400, message: '상환금액이 올바르지 않습니다.' }
  }

  const ins = await client.query(
    `
    INSERT INTO liquor_repayments (
      support_contract_id, customer_id, ga_id, repaid_on, amount, method,
      depositor_name, deposit_account, processed_by_user_id, memo
    ) VALUES ($1,$2,$3,$4,$5,'bank_transfer',$6,$7,$8,$9)
    RETURNING id
    `,
    [
      supportContractId,
      customerId,
      gaId,
      row.transaction_date,
      amount,
      String(row.depositor_name ?? ''),
      String(row.account_number ?? ''),
      userId,
      String(row.description ?? ''),
    ],
  )
  const repaymentId = ins.rows[0].id

  await client.query(
    `
    UPDATE liquor_repayment_import_rows SET
      matched_customer_id = $2,
      matched_support_contract_id = $3,
      match_status = 'confirmed',
      match_reason = '수동 확정',
      confirmed_repayment_id = $4,
      updated_at = NOW()
    WHERE id = $1
    `,
    [rowId, customerId, supportContractId, repaymentId],
  )

  if (saveAlias) {
    const aliasResult = await upsertRepaymentMatchAlias(client, {
      gaId,
      userId,
      customerId,
      supportContractId,
      aliasValue: String(row.depositor_name ?? ''),
      importRowId: rowId,
    })
    if (!aliasResult.ok) {
      return aliasResult
    }
  }

  const bal = await syncLiquorRepaymentBalancesForContract(client, supportContractId)

  await client.query(
    `
    UPDATE liquor_repayment_import_batches SET
      confirmed_count = (
        SELECT COUNT(*)::int FROM liquor_repayment_import_rows
        WHERE batch_id = $1 AND match_status = 'confirmed'
      ),
      updated_at = NOW()
    WHERE id = $1
    `,
    [row.batch_id],
  )

  return { ok: true, repaymentId, balance: bal }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   gaId: number,
 *   userId: string,
 *   customerId: number,
 *   supportContractId: number | null,
 *   aliasValue: string,
 *   importRowId: number | null,
 * }} input
 */
export async function upsertRepaymentMatchAlias(client, input) {
  const aliasValue = String(input.aliasValue ?? '').trim()
  if (!aliasValue) {
    return { ok: true, skipped: true }
  }
  const normalized = normalizeRepaymentAliasValue(aliasValue)

  const conflictR = await client.query(
    `
    SELECT customer_id FROM liquor_repayment_match_aliases
    WHERE ga_id = $1 AND normalized_alias_value = $2 AND is_active = true AND customer_id <> $3
    LIMIT 1
    `,
    [input.gaId, normalized, input.customerId],
  )
  if (conflictR.rowCount) {
    return {
      ok: false,
      status: 409,
      message: '동일 별칭이 다른 거래처에 등록되어 있습니다.',
    }
  }

  const existingR = await client.query(
    `
    SELECT id FROM liquor_repayment_match_aliases
    WHERE ga_id = $1 AND customer_id = $2 AND normalized_alias_value = $3 AND is_active = true
    LIMIT 1
    `,
    [input.gaId, input.customerId, normalized],
  )
  if (existingR.rowCount) {
    await client.query(
      `
      UPDATE liquor_repayment_match_aliases SET
        usage_count = usage_count + 1,
        last_used_at = NOW(),
        support_contract_id = COALESCE($2, support_contract_id),
        updated_at = NOW()
      WHERE id = $1
      `,
      [existingR.rows[0].id, input.supportContractId],
    )
    return { ok: true, aliasId: existingR.rows[0].id, updated: true }
  }

  const ins = await client.query(
    `
    INSERT INTO liquor_repayment_match_aliases (
      ga_id, customer_id, support_contract_id, alias_type, alias_value, normalized_alias_value,
      usage_count, last_used_at, created_from_import_row_id, created_by_user_id, is_active
    ) VALUES ($1,$2,$3,'depositor_name',$4,$5,1,NOW(),$6,$7,true)
    RETURNING id
    `,
    [
      input.gaId,
      input.customerId,
      input.supportContractId,
      aliasValue,
      normalized,
      input.importRowId,
      input.userId,
    ],
  )
  return { ok: true, aliasId: ins.rows[0].id, created: true }
}
