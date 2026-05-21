import type { ReactNode } from 'react'
import { BaseDialog } from '../../../components/dialog'
import { Button } from '../../../components/ui/Button'

export type DeleteConfirmModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children?: ReactNode
  footer: ReactNode
  ariaLabel?: string
}

/**
 * Sticky 메모 stacking context 아래로 가리지 않도록 body에 Portal + 최상단 z-index.
 */
export default function DeleteConfirmModal({
  open,
  onClose,
  title = '메모 삭제',
  children,
  footer,
  ariaLabel = '메모 삭제',
}: DeleteConfirmModalProps) {
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel}
      panelClassName="memo-delete-modal__panel"
      overlayClassName="memo-delete-modal__overlay"
      closeOnBackdrop
      closeOnEsc
      usePortal
    >
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
      {footer}
    </BaseDialog>
  )
}

export function MemoDeleteConfirmFooter({
  onCancel,
  onConfirm,
  submitting,
  confirmLabel = '삭제',
}: {
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
  confirmLabel?: string
}) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        className="memo-delete-modal__btn min-h-8 min-w-[88px] px-3 py-1.5 text-sm"
        onClick={onCancel}
        disabled={submitting}
      >
        취소
      </Button>
      <Button
        type="button"
        variant="primary"
        className="memo-delete-modal__btn min-h-8 min-w-[88px] !border-red-700 !bg-red-600 !text-white px-3 py-1.5 text-sm hover:!bg-red-700"
        onClick={onConfirm}
        disabled={submitting}
      >
        {submitting ? '삭제 중…' : confirmLabel}
      </Button>
    </div>
  )
}
