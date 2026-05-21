import { FormButton, FormSelect } from '../../../components/form'
import Modal from '../../../components/ui/Modal'
import type { StorageFolderRow } from '../api/storageApi'

type FolderOption = StorageFolderRow | { id: null; name: '전체'; createdAt: string }

type FolderPickerProps = {
  folders: FolderOption[]
  selectedFolderId: number | null
  isMobile: boolean
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSelect: (folderId: number | null) => void
}

export default function FolderPicker({
  folders,
  selectedFolderId,
  isMobile,
  isOpen,
  onOpen,
  onClose,
  onSelect,
}: FolderPickerProps) {
  if (!isMobile) {
    const selectOptions = folders.map((folder) => ({
      value: folder.id == null ? 'all' : String(folder.id),
      label: folder.name,
    }))
    return (
      <FormSelect
        value={selectedFolderId == null ? 'all' : String(selectedFolderId)}
        onChange={(event) => {
          const value = event.target.value
          onSelect(value === 'all' ? null : Number(value))
        }}
        className="storage-toolbar__folder-select"
        options={selectOptions}
      />
    )
  }

  const selected = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0]

  return (
    <>
      <FormButton htmlType="button" variant="secondary" className="storage-toolbar__folder-trigger" onClick={onOpen}>
        {selected?.name ?? '전체'} ▼
      </FormButton>

      <Modal open={isOpen} onClose={onClose} ariaLabel="폴더 선택" panelClassName="storage-folder-sheet">
        <div className="storage-folder-sheet__title">폴더 선택</div>
        <div className="storage-folder-sheet__list">
          {folders.map((folder) => {
            const active = folder.id === selectedFolderId
            return (
              <FormButton
                key={folder.id == null ? 'all' : String(folder.id)}
                htmlType="button"
                variant={active ? 'primary' : 'secondary'}
                className="storage-folder-sheet__item"
                onClick={() => {
                  onSelect(folder.id)
                  onClose()
                }}
              >
                {folder.name}
              </FormButton>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
