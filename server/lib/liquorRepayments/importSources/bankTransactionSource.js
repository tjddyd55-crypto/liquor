/**
 * 은행 API 거래내역 import 소스 (stub).
 * 실제 오픈뱅킹/은행 API 호출은 이 단계에서 구현하지 않는다.
 */

/**
 * @typedef {import('../repaymentImportMapper.js').RepaymentImportMappedRow} RepaymentImportMappedRow
 */

/**
 * @param {unknown} _payload
 * @returns {Promise<{ rows: RepaymentImportMappedRow[], sourceType: 'bank_api' }>}
 */
export async function parseBankTransactionImport(_payload) {
  throw new Error('bank_api import는 아직 지원하지 않습니다.')
}
