/**
 * 전자서명 발송 첨부 전용 file input.
 * FormInput 래퍼는 type=file 에서 ref/onChange·표시 숨김 조합 이슈가 있어 네이티브 input만 사용한다.
 * eslint.config.js ignores 에서 no-restricted-syntax 예외 처리.
 */
import { forwardRef, type ChangeEventHandler } from 'react'

type Props = {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
  onChange?: ChangeEventHandler<HTMLInputElement>
}

export const SendAttachmentFileInput = forwardRef<HTMLInputElement, Props>(function SendAttachmentFileInput(
  { accept, multiple, disabled, className, onChange },
  ref,
) {
  return <input ref={ref} type="file" accept={accept} multiple={multiple} disabled={disabled} className={className} onChange={onChange} />
})
