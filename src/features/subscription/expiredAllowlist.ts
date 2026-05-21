/**
 * 구독 만료(EXPIRED) 유저가 접근할 수 있는 프론트엔드 경로 화이트리스트.
 *
 * ## 단일 진실 원천(SSOT)
 *
 * 이 목록은 프론트엔드에서 두 곳이 함께 참조한다:
 *
 *   - `RequireActiveSubscription` (라우트 가드) — 네비게이션 차단/통과 결정
 *   - `buildAppMenuForSession` (gaTenantMenu.ts) — EXPIRED 메뉴 필터링
 *
 * 서버의 `server/subscription/expiredAllowlist.js` 와 같은 개념 쌍(API 화이트리스트)
 * 을 그대로 UI 계층에서 반영한다. 백엔드가 403 으로 차단할 자원은 프론트에서도
 * 탐색 메뉴에서 숨기고 URL 로 접근 시 자동으로 내 정보 관리로 유도해, 유저가
 * "클릭은 되는데 안으로는 못 들어가는" 이질감을 겪지 않게 한다.
 *
 * 경로는 단순 접두사(prefix) 매칭으로 비교한다: `/profile` 은
 * `/profile` 자체와 `/profile/...` 하위를 허용한다.
 */
export const EXPIRED_ALLOW_FRONTEND_PATHS: readonly string[] = Object.freeze([
  '/profile',
  '/account/reset',
  '/feature-request',
])

/**
 * EXPIRED 유저가 차단된 경로로 이동하려 할 때 대신 보낼 기본 경로.
 * "이용 종료 → 결제/문의 유도" 흐름의 진입점이 된다.
 */
export const EXPIRED_FALLBACK_PATH = '/profile'

/**
 * 주어진 경로가 EXPIRED 유저에게 허용된 경로인지 판단한다.
 * 접두사 비교이므로 하위 경로도 모두 허용된다.
 */
export function isAllowedForExpiredFrontend(
  pathname: string | null | undefined,
): boolean {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    return false
  }
  return EXPIRED_ALLOW_FRONTEND_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
