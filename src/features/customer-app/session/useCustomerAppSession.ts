import { useMemo } from 'react'
import { readCustomerAppSession, type CustomerAppSession } from './customerAppSession'

/**
 * 고객앱 세션을 "렌더 안정 참조" 로 제공하는 훅.
 *
 * 왜 훅으로 감쌌나:
 *   readCustomerAppSession() 은 storage 에서 JSON 을 매번 새로 파싱해 "새 객체" 를 반환한다.
 *   호출 측에서 이 값을 그대로 useEffect 의존성에 넣으면 렌더마다 참조가 바뀌어
 *   useEffect 가 무한 재실행되는 사고가 난다(실제 운영 중 1회 발생 → hotfix c099786).
 *   훅 단계에서 useMemo 로 참조를 mount-once 고정해, 호출 측이 규약을 깜빡할 여지를 구조적으로 차단한다.
 *
 * 사용 규칙:
 *   - 고객앱 페이지/Shell 에서 세션을 읽을 때는 반드시 이 훅을 사용한다.
 *     `useMemo(() => readCustomerAppSession(), [])` 직작성 금지.
 *   - 비 React 컨텍스트(예: api/customerAppApi.ts 의 fetch 인터셉터) 에서는
 *     기존 readCustomerAppSession() 을 직접 호출한다(훅은 React 규칙상 그쪽에서 못 씀).
 *
 * 한계와 향후 확장:
 *   - 현재는 세션이 "마운트 시점 한 번만 읽히면 충분하다" 는 가정에 기반한다.
 *     고객앱 플로우상 로그아웃은 페이지 언마운트와 함께 일어나므로 이 가정은 성립한다.
 *   - 만약 같은 페이지에 머무른 채 세션이 바뀌는 흐름(예: 인앱 재로그인) 이 도입되면
 *     storage event 구독형 useSyncExternalStore 기반으로 교체해야 한다.
 */
export function useCustomerAppSession(): CustomerAppSession | null {
  return useMemo(() => readCustomerAppSession(), [])
}
