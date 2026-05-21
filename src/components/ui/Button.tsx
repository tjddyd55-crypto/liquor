import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type UiButtonVariant = 'primary' | 'secondary' | 'action' | 'danger'
export type UiButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: UiButtonVariant
  size?: UiButtonSize
  loading?: boolean
  fullWidth?: boolean
  loadingText?: string
}

/*
 * 공용 Button — 앱 전역의 행동 버튼 SSOT.
 *
 * 의도:
 *   - 모양/크기는 오직 (variant, size, fullWidth) 3개의 축으로만 표현한다.
 *     className 으로 모양을 덮으면 페이지마다 버튼이 달라지는 회귀가 재발한다.
 *   - 비활성화(disabled) 와 처리중(loading) 상태를 한 컴포넌트에서 일관되게
 *     다룬다. loading 은 클릭을 잠그고 loadingText 로 전환한다.
 *
 * variant 의미:
 *   - primary  : 주 액션 (확인/저장/전송). 강조색 배경.
 *   - secondary: 보조 액션 (취소/닫기/뒤로). 보더만 있는 중립.
 *   - danger   : 파괴적 액션 (삭제/탈퇴). 경고색 배경.
 *   - action   : base .button 만 적용되는 약한 표현. 아이콘 버튼 등
 *                "버튼이긴 하나 강조가 필요 없는 자리" 에만 사용.
 *
 * 사용 규칙:
 *   - 다이얼로그 풋터는 <DialogActions> 로 감싼 뒤 이 Button 을 배치한다.
 *   - type 기본값은 'button'. 폼 제출이 필요한 자리에서만 type="submit".
 */
export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  loadingText = '처리 중…',
  type = 'button',
  disabled = false,
  ...props
}: ButtonProps) {
  const variantClassName =
    variant === 'action' ? '' : variant === 'primary' ? 'button--primary' : `button--${variant}`
  const sizeClassName = size === 'sm' ? 'button--small' : ''
  const fullWidthClassName = fullWidth ? 'button--full' : ''
  const mergedClassName = ['button', variantClassName, sizeClassName, fullWidthClassName, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} {...props} disabled={disabled || loading} className={mergedClassName}>
      {loading ? loadingText : children}
    </button>
  )
}
