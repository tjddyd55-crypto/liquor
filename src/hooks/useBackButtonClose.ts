import { useEffect, useId, useRef } from 'react'

/**
 * "열린 UI 레이어"(드로어/모달/바텀시트 등) 를 브라우저 뒤로가기(또는 Android 하드웨어 back)
 * 로 닫게 해 주는 공용 훅.
 *
 * 왜 훅으로:
 *   모바일 UX 의 뒤로가기 우선순위 원칙 "열린 UI 닫기 → 페이지 이동 → 앱 종료" 는
 *   서비스 전반에 동일하게 적용되어야 한다. 레이어마다 history API 를 직접 만지면
 *   구현이 중복되고, 한 곳의 엣지 케이스 누락이 다른 곳으로 번진다.
 *   훅 한 곳에 push/popstate/cleanup 을 캡슐화해 호출 측은 `useBackButtonClose(isOpen, onClose)`
 *   한 줄로 끝내게 한다.
 *
 * 동작:
 *   1. isOpen === true 로 진입하면 history.pushState 로 가짜 히스토리 1개를 쌓는다.
 *   2. 뒤로가기(popstate) 가 오면 onClose() 를 호출한다. 브라우저는 우리 가짜 entry 만
 *      소비하고 실제 페이지 이동은 일어나지 않는다.
 *   3. 외부에서 isOpen 이 false 로 바뀌면(예: backdrop 클릭, 메뉴 내 링크 클릭)
 *      내가 쌓아둔 가짜 entry 를 1칸 되돌려 스택을 깨끗하게 정리한다.
 *
 * 엣지 케이스 방어:
 *   - 메뉴 내 링크 클릭 → navigate + close 동시 발생:
 *     react-router 의 pushState 로 내 가짜 state 가 더 이상 top 이 아니게 된다.
 *     top 의 __uiLayer 가 "내 layerId" 일 때만 back() 을 호출하도록 가드해
 *     "방금 이동한 페이지를 취소" 하는 치명적 버그를 차단.
 *   - StrictMode 더블 invocation: 동일 가드로 history stack 이 망가지지 않음.
 *   - 중첩 레이어(드로어 + 모달): useId() 로 인스턴스별 식별자를 state 에 심어
 *     서로의 entry 를 잘못 소비하지 않게 구분.
 *
 * 사용 예:
 *   const [drawerOpen, setDrawerOpen] = useState(false)
 *   useBackButtonClose(drawerOpen, () => setDrawerOpen(false))
 *
 * 한계:
 *   - 훅이 "가짜 history entry" 에 의존하는 설계 특성상 SSR 에서는 동작하지 않는다
 *     (window/history 미존재). 클라이언트 전용 컴포넌트에서만 안전.
 *   - PWA/Android 하드웨어 back 은 popstate 로 정상 도달한다. iOS Safari 의 제스처 back
 *     도 동일. 다만 일부 임베디드 웹뷰는 popstate 를 가로챌 수 있으므로 네이티브 래퍼
 *     도입 시 별도 확인 필요.
 */
export function useBackButtonClose(isOpen: boolean, onClose: () => void): void {
  const layerId = useId()

  /*
   * onClose 는 호출 측에서 렌더마다 새 함수 참조일 수 있다.
   * 의존성에 직접 넣으면 pushState 재실행 루프가 발생하므로 ref 로 최신 참조만 유지.
   */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /*
   * "내가 쌓은 가짜 entry 가 아직 살아있는가" 를 추적하는 래치.
   * true 인 동안만 popstate 를 내 레이어의 close 로 간주한다.
   */
  const pushedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!isOpen) {
      return
    }

    window.history.pushState({ __uiLayer: layerId }, '', window.location.href)
    pushedRef.current = true

    const onPopState = () => {
      if (!pushedRef.current) {
        return
      }
      pushedRef.current = false
      onCloseRef.current()
    }

    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)

      if (!pushedRef.current) {
        return
      }
      pushedRef.current = false

      /*
       * 가드: 내가 쌓은 state 가 여전히 history top 일 때만 back() 을 호출한다.
       * 메뉴 내 링크 클릭 등으로 이미 새 navigation 이 top 에 올라왔다면
       * back() 을 부르면 "방금 이동한 페이지를 취소" 하게 되므로 절대 호출 금지.
       */
      const topState = window.history.state as { __uiLayer?: string } | null
      if (topState && topState.__uiLayer === layerId) {
        window.history.back()
      }
    }
  }, [isOpen, layerId])
}
