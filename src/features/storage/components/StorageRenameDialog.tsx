import { FormButton, FormInput } from '../../../components/form'
import Modal from '../../../components/ui/Modal'

type StorageRenameDialogProps = {
  open: boolean
  title: string
  value: string
  loading?: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export default function StorageRenameDialog({
  open,
  title,
  value,
  loading = false,
  onChange,
  onClose,
  onSubmit,
}: StorageRenameDialogProps) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={title} panelClassName="max-w-md" closeOnBackdrop={false}>
      <div className="text-lg font-semibold mb-3 text-[var(--text-primary)]">{title}</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <FormInput value={value} onChange={(event) => onChange(event.target.value)} maxLength={120} autoFocus />
        <div className="flex justify-end gap-2 mt-4">
          <FormButton htmlType="button" variant="secondary" onClick={onClose} disabled={loading}>
            취소
          </FormButton>
          <FormButton htmlType="submit" variant="primary" disabled={loading}>
            {loading ? '저장 중…' : '저장'}
          </FormButton>
        </div>
      </form>
    </Modal>
  )
}
