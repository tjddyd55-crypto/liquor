import { assertCustomerDataRecord } from '../api/customersApi'
import type { CustomerRecord } from '../domain/types'

/**
 * API 이후에도 customers state에 깨진 행·undefined 슬롯이 들어가지 않도록 방어한다.
 *
 * 이 함수는 목록 API 응답을 React state에 넣기 직전의 최종 검증 계층이다.
 * 데이터 형태가 깨진 경우 여기서 즉시 실패시켜, 이후 필터/정렬/카드 렌더링에서
 * 원인을 알기 어려운 런타임 오류로 번지는 것을 막는다.
 */
export function coerceCustomersStatePayload(rows: unknown): CustomerRecord[] {
  if (!Array.isArray(rows)) {
    console.error('[CustomersPage] ❌ customers is not an array:', rows)
    throw new Error('Invalid customers response')
  }
  return rows.map((c, idx) => assertCustomerDataRecord(c, { listIndex: idx }))
}
