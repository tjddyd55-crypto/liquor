import { FormButton } from '../../../components/form'
import Modal from '../../../components/ui/Modal'

type StorageDeleteDialogProps = {
  open: boolean
  title: string
  description: string
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function StorageDeleteDialog({
  open,
  title,
  description,
  loading = false,
  onClose,
  onConfirm,
}: StorageDeleteDialogProps) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={title} panelClassName="max-w-md">
      <div className="text-lg font-semibold mb-2 text-[var(--text-primary)]">{title}</div>
      <p className="text-sm text-[var(--text-secondary)]">{description}</p>
      <div className="flex justify-end gap-2 mt-4">
        <FormButton htmlType="button" variant="secondary" onClick={onClose} disabled={loading}>
          취소
        </FormButton>
        <FormButton htmlType="button" variant="primary" onClick={onConfirm} disabled={loading}>
          {loading ? '처리 중…' : '확인'}
        </FormButton>
      </div>
    </Modal>
  )
}
