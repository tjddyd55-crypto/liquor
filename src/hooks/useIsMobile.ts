import { useEffect, useState } from 'react'

/**
 * "레이아웃용 모바일 여부"를 반환한다.
 *
 * 정의: 뷰포트 너비(<= 768px) **AND** 터치 포인터(`pointer: coarse`)가 모두 참일 때만 true.
 *
 * 왜 width 단독이 아닌가?
 *   - 과거에는 `(max-width: 768px)` 단독으로 판정했는데, PC 브라우저에서 DevTools를 열거나
 *     창을 좁게 쓰면 PC인데도 모바일로 오판정되어
 *       * 고객관리 우측 패널(`CustomerWorkspaceLayoutPC`)이 통째로 사라지고,
 *       * PC 전용 CSS(`.customers-page--pc …`)가 적용되지 않아 UI가 망가지는
 *     문제를 일으켰다. PC 유저가 가장 쉽게 밟는 함정이었다.
 *
 *   - `pointer: coarse`를 AND 조건으로 두면
 *       * 데스크톱 브라우저/Electron(마우스 = pointer: fine)은 창을 아무리 좁혀도 항상 PC로 유지,
 *       * 실제 스마트폰(터치 = coarse, 좁은 viewport)은 여전히 모바일,
 *       * 태블릿은 viewport가 넓어 PC UI로 자연 합류(대부분 기기에서 바람직한 방향).
 *
 * 이 hook의 의미는 "레이아웃 분기용"으로만 한정한다.
 * 터치 이벤트 처리 등 다른 목적이 생기면 이 hook을 확장하지 말고 별도 hook을 추가할 것.
 */
const MOBILE_MEDIA_QUERY = '(max-width: 768px) and (pointer: coarse)'

function evaluateIsMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => evaluateIsMobile())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const handleChange = () => {
      setIsMobile(mql.matches)
    }
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => {
      mql.removeEventListener('change', handleChange)
    }
  }, [])

  return isMobile
}
