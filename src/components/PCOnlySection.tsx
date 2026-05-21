import type { ReactNode } from 'react'
import useIsMobile from '../hooks/useIsMobile'

/**
 * [공용] "PC 에서만 의미가 있는 섹션" 을 선언적으로 감싸는 컴포넌트.
 *
 * 예) 엑셀 대용량 업로드·드래그 앤 드롭 등 모바일 UX 에 부적합한 기능 블록.
 *
 * ---
 *
 * `ResponsiveLayout` 과의 역할 구분 (AGENTS §8-2 원칙 1):
 *   - `ResponsiveLayout`   : **페이지 전체**를 PC/Mobile View 파일로 쪼개는 추상화.
 *   - `PCOnlySection`      : **페이지 내부의 부분 섹션** 하나를 플랫폼 한정으로 표시.
 *
 * 두 추상화는 스코프가 다르므로 "같은 역할의 중복 추상화" 가 아니다.
 * 페이지 대부분이 PC/Mobile 공통이고 몇 개 섹션만 플랫폼별로 달라지는 경우,
 * `ResponsiveLayout` 으로 전체를 쪼개면 공통 마크업이 중복 복제되어
 * 유지보수성이 악화된다. 그런 경우에 사용한다.
 *
 * 이 컴포넌트를 쓰면:
 *   - 페이지 컨테이너에서 `useIsMobile()` 직접 호출을 제거할 수 있어 §8-2 원칙 4 에 부합.
 *   - `useIsMobile` 호출 지점이 이 한 컴포넌트로 수렴되어 일관된 판정식을 공유.
 *
 * ---
 *
 * fallback 기본값:
 *   표준 안내 박스 `.mobile-disabled-box "해당 기능은 PC에서만 사용 가능합니다."`
 *   다른 안내가 필요하면 `fallback` prop 으로 대체한다.
 *
 *   fallback 을 `null` 로 건네면 모바일에서 아무것도 렌더하지 않는다
 *   (섹션 자체가 숨겨져도 무방한 경우에만 사용할 것).
 */
type PCOnlySectionProps = {
  children: ReactNode
  /**
   * 모바일에서 보여줄 대체 UI. 미지정 시 표준 안내 박스를 렌더한다.
   * `null` 로 명시하면 모바일에서 아무것도 그리지 않는다.
   */
  fallback?: ReactNode
}

const DEFAULT_MOBILE_FALLBACK = (
  <div className="mobile-disabled-box">해당 기능은 PC에서만 사용 가능합니다.</div>
)

export default function PCOnlySection({ children, fallback }: PCOnlySectionProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <>{fallback === undefined ? DEFAULT_MOBILE_FALLBACK : fallback}</>
  }

  return <>{children}</>
}
