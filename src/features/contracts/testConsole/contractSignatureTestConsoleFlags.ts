/**
 * 전자서명 관리(/admin/contract-signatures) 환경 게이트.
 * - 기본값: production 빌드 포함 노출 허용. 실제 메뉴·라우트는 `canAccessContractSignatureTestConsole(role)` 와 AND.
 * - 운영 등에서 콘솔을 끄려면 `VITE_ENABLE_CONTRACT_SIGNATURE_TEST_MENU=false` 로 명시(레거시 변수명 유지).
 */
export function isContractSignatureTestMenuEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_CONTRACT_SIGNATURE_TEST_MENU !== 'false'
}

/** SUPER_ADMIN · GA_ADMIN 만 — 스태프/일반 고객·원수사 채널은 제외 */
export function canAccessContractSignatureTestConsole(role: string | undefined): boolean {
  const r = role ?? ''
  return r === 'SUPER_ADMIN' || r === 'GA_ADMIN'
}

/** 메뉴·라우트 가드 공통: 환경 비활성이 아니고 역할이 허용된 경우만 */
export function canAccessContractSignatureAdminConsole(role: string | undefined): boolean {
  return isContractSignatureTestMenuEnabled() && canAccessContractSignatureTestConsole(role)
}

/** 전자서명 발송(/contracts/signatures/send) — USER · GA_STAFF */
export function canAccessContractSignatureUserSend(role: string | undefined): boolean {
  const r = role ?? ''
  return r === 'USER' || r === 'GA_STAFF'
}
