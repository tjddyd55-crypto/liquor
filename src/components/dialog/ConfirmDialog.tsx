import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { BaseDialog } from './BaseDialog'
import { DialogActions } from './DialogActions'

export type ConfirmDialogProps = {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  tone?: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/*
 * 표준 확인 다이얼로그.
 *   - 풋터는 <DialogActions> + 공용 <Button> 조합을 사용한다.
 *     이 파일이 앱의 "다이얼로그 풋터 모범 사례" 역할을 하므로, 여기가 곧
 *     다른 다이얼로그 풋터가 따라야 할 참고점이다.
 *   - busy 중에는 취소/확인 모두 disabled. 이 동작을 Button 에만 맡기지 않고
 *     backdrop/ESC 도 함께 잠궈 되돌릴 수 없는 동시 호출을 차단한다.
 *   - usePortal + 높은 z-index: 전자문서 발송 상세 모달(z-index 100050) 위에
 *     확인 레이어가 오도록 한다.
 */
export function ConfirmDialog({
  open,
  title = '확인',
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  busy = false,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <BaseDialog
      open={open}
      onClose={onCancel}
      ariaLabel={title}
      closeOnBackdrop={!busy}
      closeOnEsc={!busy}
      panelClassName="max-w-lg"
      usePortal
      overlayClassName="!z-[100100]"
    >
      <h3 className="text-lg font-semibold text-[var(--text-main)]">{title}</h3>
      <div className="mt-3 text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">{message}</div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={() => void onConfirm()}
          disabled={busy}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </BaseDialog>
  )
}
