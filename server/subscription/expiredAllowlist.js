/**
 * EXPIRED 유저에게도 접근 허용되는 API prefix SSOT (서버 측).
 *
 * 설계 원칙:
 * 1) 화이트리스트 방식 — 기본은 "차단". 신규 API 가 추가되어도 의도적으로 여기 등록하지 않는 한
 *    EXPIRED 유저에게는 노출되지 않는다. 보안 사고 방지.
 * 2) 이 파일은 "정책 집행의 게이트웨이" 로서 단일 파일 단일 책임을 가진다.
 *    메뉴 필터·프론트 라우트 가드는 이를 복사하지 말고 프론트 미러(policy.ts 옆) 에서
 *    같은 의미 구조로만 재현한다. 프론트와 서버가 실수로 어긋나는 것을 방지.
 * 3) prefix 는 반드시 `/` 로 시작하고 `/api/...` 하위에서 정확 일치(문자열 기준) 또는
 *    startsWith 기준으로 통과 여부를 판정한다. 동적 path-to-regex 매칭을 도입하지 않는다
 *    (→ 예측 가능성 우선, 편의를 위해 규칙을 복잡하게 만들지 않는다).
 *
 * 향후 확장 지점:
 * - 결제 연동이 붙으면 `/api/payments/` 를 추가.
 * - EXPIRED 가 아니라 "모든 상태" 에서 통과시켜야 하는 공개 API 는 여기가 아니라
 *   requireAuth 가 붙지 않은 엔드포인트로 등록한다(인증 자체가 필요 없는 경로).
 */

/** @type {ReadonlyArray<string>} */
export const EXPIRED_ALLOW_API_PREFIXES = Object.freeze([
  // 인증 자체 — 로그아웃/재로그인 흐름 유지
  '/api/auth/',
  // 자기 프로필 조회/수정 (사용자 정의: /profile 도 허용 대상이지만 서버는 /api/me 로 매핑됨)
  '/api/me',
  // 비밀번호 재설정 등 계정 조작
  '/api/account/',
  // 본 구독 API — 자기 상태 조회, 향후 결제 진입점
  '/api/subscription/',
  // 문의·요청 (단건 + 목록)
  '/api/feature-request',
  '/api/feature-requests/',
  // 회원가입 GA 코드 검증(비로그인도 접근하지만 인증된 EXPIRED 유저도 통과 허용)
  '/api/ga/validate',
])

/**
 * 주어진 요청 경로가 EXPIRED 화이트리스트에 속하는지 판정.
 *
 * @param {string | null | undefined} requestPath  `req.path` 값 (쿼리스트링 제외).
 * @returns {boolean}
 */
export function isAllowedForExpiredApi(requestPath) {
  if (typeof requestPath !== 'string' || requestPath.length === 0) {
    return false
  }
  return EXPIRED_ALLOW_API_PREFIXES.some(
    (prefix) => requestPath === prefix || requestPath.startsWith(prefix),
  )
}
