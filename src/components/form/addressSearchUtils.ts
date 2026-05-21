/**
 * AddressSearchField 의 순수 유틸리티. 컴포넌트와 분리해 둬야
 * React Fast Refresh 가 안전하게 동작하고, 단위 테스트도 편하다.
 */

export interface AddressSearchValue {
  zonecode: string
  baseAddress: string
  detailAddress: string
}

/**
 * 우편번호·기본주소·상세주소를 단일 저장형 문자열로 합친다.
 *
 * 규칙:
 *   - "(우편번호) 기본주소 상세주소"
 *   - 빈 조각은 제거하고 join — 공백 중복 금지
 *   - 우편번호가 없으면 괄호 블록 자체 생략
 *
 * 이 규칙이 단순해야 후일 역파싱(저장된 문자열 → 분리 입력) 이 가능하다.
 */
export function formatAddressForSave(value: AddressSearchValue): string {
  const base = value.baseAddress.trim()
  const detail = value.detailAddress.trim()
  const zip = value.zonecode.trim()
  const head = zip ? `(${zip})` : ''
  return [head, base, detail].filter(Boolean).join(' ').trim()
}
