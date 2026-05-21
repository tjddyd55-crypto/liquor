import type { ReactNode } from 'react'

/*
 * 다이얼로그 풋터 레이아웃 SSOT.
 *
 * 책임:
 *   1) 다이얼로그(BaseDialog / ConfirmDialog / FormDialog) 풋터의 "버튼 줄" 을
 *      앱 전체에서 한 벌 규격으로 정의한다.
 *   2) 정렬·간격·줄바꿈 정책만 담당하고, 버튼의 모양·크기는 공용 <Button>
 *      컴포넌트(variant/size) 에 위임한다. 이 컴포넌트는 절대 버튼 모양을
 *      덮어쓰지 않는다 — 그러면 페이지마다 모양이 달라지는 회귀가 재발한다.
 *
 * 규약:
 *   - children 은 반드시 <Button> 혹은 <Button> 을 감싼 래퍼(FormButton) 여야 한다.
 *     native <button> 은 금지.
 *   - 버튼 순서는 좌 → 우, 의미적 중요도가 낮은 것(취소/닫기) 이 앞, 주 액션이 뒤.
 *     macOS/웹 일반 관례를 따른다 (Windows 네이티브와 다름에 유의).
 *   - 파괴적 액션은 variant="danger" 로 의도를 표현하고, 위치는 주 액션 자리에
 *     둔다 (좌=취소, 우=삭제).
 *
 * 레이아웃 결정:
 *   - flex-wrap 으로 내용이 길어지면 자연스럽게 줄바꿈한다.
 *     좁은 모바일에서 단순히 폭을 100% 로 강제하면, 닫기/확인 같은 짧은 버튼이
 *     화면을 도배해 시각적 무게가 맞지 않는다. wrap 이 가장 안전한 기본값.
 *   - gap 은 공용 spacing 토큰이 없는 상황이라 0.5rem(8px) 로 .button 의 패딩과
 *     균형을 맞췄다. spacing 토큰이 도입되면 여기만 바꾸면 된다.
 *
 * 확장 포인트:
 *   - align="space-between" 등 변종이 필요해지면 prop 로 추가한다. 지금은 단일
 *     기본값만 제공해 호출부의 잘못된 커스터마이즈를 구조적으로 차단한다.
 */

export type DialogActionsProps = {
  children: ReactNode
  className?: string
}

export function DialogActions({ children, className = '' }: DialogActionsProps) {
  const merged = ['dialog-actions', className].filter(Boolean).join(' ')
  return <div className={merged}>{children}</div>
}
