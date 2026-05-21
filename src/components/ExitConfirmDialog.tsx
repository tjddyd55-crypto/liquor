import { ConfirmDialog } from './dialog'

export type ExitConfirmDialogProps = {
  message: string
  title?: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * AppExitConfirm(POP 차단) · 고객 등록 이탈 등 동일한 이탈 확인 UI.
 * window.confirm 대신 이 모달만 사용한다.
 */
export function ExitConfirmDialog({ message, title = '확인', onCancel, onConfirm }: ExitConfirmDialogProps) {
  return (
    <ConfirmDialog
      open
      title={title}
      message={message}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
