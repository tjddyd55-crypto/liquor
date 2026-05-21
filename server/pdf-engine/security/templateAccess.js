/**
 * PDF 템플릿 접근 권한 게이트 — 순수 함수.
 *
 * 라우터(registerPdfTemplateApi) 가 HTTP 관심사와 분리되어 이 로직을 단위 테스트할 수 있게 한다.
 * 결정 기준:
 *   - SUPER_ADMIN 은 템플릿 전부 접근 가능.
 *   - 그 외 role 은 본인 GA 이거나 공용(ga_id IS NULL) 템플릿만 접근 가능.
 *   - template 이 null/undefined 면 접근 불가.
 *
 * 호출측은 `isActive` 는 별도로 검사한다(활성 여부는 보안이 아니라 UX 필터이므로).
 */

/**
 * @param {{ ga_id: number | null } | null | undefined} template
 * @param {{ role?: string, gaId?: number | null } | null | undefined} user
 * @param {(role: unknown) => boolean} isSuperAdminRole
 * @returns {boolean}
 */
export function canAccessTemplateForUser(template, user, isSuperAdminRole) {
  if (!template) return false
  if (isSuperAdminRole(user?.role)) return true
  if (template.ga_id == null) return true
  return Number(user?.gaId) === Number(template.ga_id)
}
