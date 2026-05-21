/**
 * 인증된 세션이 "처음 도착해야 하는" 기본 경로(랜딩 경로)를 결정한다.
 *
 * 정책 근거:
 *  - SUPER_ADMIN 은 공통 대시보드 `/dashboard` 로 보낸다 (관리자 메뉴 카드).
 *  - GA_STAFF, INSURER_MANAGER, LOSS_ADJUSTER 등은 각 업무 기본 경로로 보낸다 (`resolveAuthLandingPath` 본문 참고).
 *  - USER / GA_ADMIN 등은 기존과 같다:
 *      - PC: 사이드바가 상존 → `/customers` 직행
 *      - Mobile: `/dashboard` (햄버거 한 번 절약)
 *  - `role` 이 없으면(구 호출·마이그레이션) PC `/customers` · 모바일 `/dashboard` 로 폴백한다.
 *
 * 이 함수는 "경로 정책" 의 단일 진실 원천(SSOT)이다.
 * 로그인 성공 직후 / 루트(`/`) 진입 / 기타 자동 리다이렉트가 전부
 * 이 함수를 통해 동일한 경로로 수렴하도록 구성한다.
 *
 * 새 역할·랜딩 정책 요구가 생기면 여기만 수정하면 된다.
 */
export type AuthLandingRole =
  | 'SUPER_ADMIN'
  | 'GA_ADMIN'
  | 'GA_STAFF'
  | 'USER'
  | 'INSURER_MANAGER'
  | 'LOSS_ADJUSTER'
  | string
  | undefined
  | null

export function resolveAuthLandingPath(isMobile: boolean, role?: AuthLandingRole): string {
  const normalizedRole = String(role ?? '').trim().toUpperCase()

  if (normalizedRole === 'SUPER_ADMIN') {
    return '/dashboard'
  }

  if (normalizedRole === 'GA_STAFF') {
    return '/insurance/company-registry'
  }

  if (normalizedRole === 'INSURER_MANAGER') {
    return '/insurer/news'
  }

  if (normalizedRole === 'LOSS_ADJUSTER') {
    return '/adjuster/news'
  }

  return isMobile ? '/dashboard' : '/customers'
}
