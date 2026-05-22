/**
 * 입금자명 exact alias 매칭 — 점수/유사도/부분포함 금지.
 */
import { normalizeRepaymentAliasValue } from './repaymentAliasNormalize.js'

/**
 * @typedef {{
 *   id: number,
 *   customer_id: number,
 *   support_contract_id: number | null,
 *   normalized_alias_value: string,
 *   is_active: boolean,
 * }} AliasRow
 */

/**
 * @param {string} normalizedDepositor
 * @param {AliasRow[]} activeAliases
 */
export function matchRepaymentByExactAlias(normalizedDepositor, activeAliases) {
  const key = normalizeRepaymentAliasValue(normalizedDepositor)
  if (!key) {
    return { matchStatus: 'unmatched', matchReason: '입금자명 없음', matches: [] }
  }

  const hits = activeAliases.filter(
    (a) => a.is_active !== false && String(a.normalized_alias_value ?? '') === key,
  )
  if (hits.length === 0) {
    return { matchStatus: 'unmatched', matchReason: '등록된 별칭 없음', matches: [] }
  }

  const customerIds = new Set(hits.map((h) => Number(h.customer_id)))
  if (customerIds.size > 1) {
    return {
      matchStatus: 'conflict',
      matchReason: '동일 별칭이 여러 거래처에 등록됨',
      matches: hits,
      matchedCustomerId: null,
      matchedSupportContractId: null,
    }
  }

  const pick = hits[0]
  return {
    matchStatus: 'exact_alias_matched',
    matchReason: '등록된 별칭 정확 일치',
    matches: hits,
    matchedCustomerId: Number(pick.customer_id),
    matchedSupportContractId: pick.support_contract_id != null ? Number(pick.support_contract_id) : null,
  }
}
