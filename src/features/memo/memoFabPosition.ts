/**
 * 모바일 메모 FAB 의 세로 위치(localStorage) SSOT.
 *
 * ## 설계
 *
 *  - 저장 단위는 `dvh` (동적 뷰포트 높이 기준 백분율). 기기 해상도가 달라도
 *    같은 상대 위치로 복원된다. 픽셀 저장은 기기 교체 시 화면 밖으로 튈 수 있다.
 *  - 계정이 아닌 "이 기기의 물리적 습관" 이므로 userId 스코프가 아닌 글로벌 키.
 *  - clamp 범위는 `[MIN_DVH, MAX_DVH]`. 탑바(48px ~ 대략 6dvh) 충돌과
 *    하단 safe-area/터치 바 충돌을 시각적으로 피한다.
 *
 * ## 변경 지점
 *
 *  - 기본 위치를 바꾸려면 `FAB_DEFAULT_BOTTOM_DVH` 만 수정.
 *  - 이동 한계를 바꾸려면 `FAB_MIN_BOTTOM_DVH` / `FAB_MAX_BOTTOM_DVH` 만 수정.
 *  - 저장 스키마가 바뀌면 키의 `.v` 숫자를 올려 구버전 값을 자연스럽게 무시.
 */

const STORAGE_KEY = 'insurance.memo.fab.position.v1'

export const FAB_MIN_BOTTOM_DVH = 8
export const FAB_MAX_BOTTOM_DVH = 85
export const FAB_DEFAULT_BOTTOM_DVH = 33.333

export function clampFabBottomDvh(value: number): number {
  if (!Number.isFinite(value)) {
    return FAB_DEFAULT_BOTTOM_DVH
  }
  return Math.min(FAB_MAX_BOTTOM_DVH, Math.max(FAB_MIN_BOTTOM_DVH, value))
}

export function loadFabBottomDvh(): number {
  if (typeof window === 'undefined') {
    return FAB_DEFAULT_BOTTOM_DVH
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return FAB_DEFAULT_BOTTOM_DVH
    }
    return clampFabBottomDvh(Number(raw))
  } catch {
    return FAB_DEFAULT_BOTTOM_DVH
  }
}

export function saveFabBottomDvh(value: number): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampFabBottomDvh(value)))
  } catch {
    /* quota / private mode — 무시 (UI 위치는 현재 세션에서만 유지) */
  }
}
