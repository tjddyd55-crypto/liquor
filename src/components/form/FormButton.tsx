import type { ButtonHTMLAttributes } from 'react'
import { Button, type UiButtonSize } from '../ui'

export type FormButtonVariant = 'primary' | 'secondary' | 'action' | 'danger'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  htmlType?: 'button' | 'submit' | 'reset'
  variant?: FormButtonVariant
  size?: UiButtonSize
  loading?: boolean
  loadingText?: string
  fullWidth?: boolean
}

/*
 * FormButton — 공용 <Button> 의 레거시 호환 래퍼.
 *
 * 존재 이유:
 *   - 초기에 form 영역 전용으로 도입된 네이밍이 앱 전반에 퍼진 상태라
 *     호출부를 한 번에 치환하면 회귀 범위가 크다.
 *   - htmlType(= native type) 과 variant 의 기본값이 <Button> 과 다른 점(아래)을
 *     유지하기 위해 남아있다.
 *
 * <Button> 과의 차이점:
 *   1) type prop 이름을 htmlType 으로 받는다. 과거 antd 계열 컨벤션 호환.
 *   2) variant 의 기본값이 'action' (base .button 만, 무채색) — <Button> 은 'primary'.
 *      이 때문에 호출부에서 variant 를 생략하면 "모양이 약한 버튼" 이 나온다.
 *      다이얼로그 풋터 같은 "행동이 분명한 위치" 에서는 variant 를 반드시
 *      명시해야 한다 (secondary/primary/danger).
 *
 * 작성 규약 (신규/수정 시):
 *   - 신규 코드는 가능하면 공용 <Button> 을 직접 사용한다.
 *   - 다이얼로그 풋터는 <DialogActions> 안에서 <Button variant="..."> 를 쓴다.
 *     FormButton 을 쓰더라도 variant 는 생략 금지.
 *   - className 으로 버튼 모양(border-radius/background 등)을 덮는 것은 금지.
 *     그런 필요가 생기면 새 variant 를 제안한다 — 공용 SSOT 에서 관리해야
 *     페이지마다 모양이 달라지는 회귀가 재발하지 않는다.
 */
export default function FormButton({
  htmlType = 'button',
  variant = 'action',
  size = 'md',
  loading = false,
  loadingText = '처리 중…',
  fullWidth = false,
  className = '',
  children,
  ...props
}: Props) {
  return (
    <Button
      {...props}
      type={htmlType}
      variant={variant}
      size={size}
      loading={loading}
      loadingText={loadingText}
      fullWidth={fullWidth}
      className={className}
    >
      {children}
    </Button>
  )
}
