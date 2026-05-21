/** 개인메시지 제목·안내 줄에 쓰는 호칭(고객 번호 노출 안 함). */
export function salutationHonorific(customerNameTrimmed: string | null | undefined): string {
  const n = String(customerNameTrimmed ?? '').trim()
  if (n) {
    return `${n} 고객님께`
  }
  return '선택 고객님께'
}
