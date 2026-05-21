/**
 * 정부지원 전자서명 — 이용자(program user) 전용 접근 플래그.
 * 실제 게이트는 GovernmentProtectedRoute(requireProgramUserWorkspace) 가 담당한다.
 */
export function isGovernmentSignatureMenuEnabled(): boolean {
  return true
}

/** 템플릿 관리(/government/signature-templates) */
export function canAccessGovernmentSignatureTemplates(_role: string | undefined): boolean {
  return true
}

/** 전자서명 발송·내역 */
export function canAccessGovernmentSignatureUserSend(_role: string | undefined): boolean {
  return true
}

/** @deprecated 레거시 이름 — canAccessGovernmentSignatureTemplates 와 동일 */
export function canAccessGovernmentSignatureTestConsole(role: string | undefined): boolean {
  return canAccessGovernmentSignatureTemplates(role)
}

export function canAccessGovernmentSignatureAdminConsole(role: string | undefined): boolean {
  return canAccessGovernmentSignatureTemplates(role)
}

export function isGovernmentSignatureTestMenuEnabled(): boolean {
  return isGovernmentSignatureMenuEnabled()
}
