import FileUploader from '../../../components/common/FileUploader'
import { FormButton } from '../../../components/form'
import type { StorageFolderRow } from '../api/storageApi'
import FolderPicker from './FolderPicker'

type FolderOption = StorageFolderRow | { id: null; name: '전체'; createdAt: string }

type StorageToolbarProps = {
  isMobile: boolean
  folderOptions: FolderOption[]
  selectedFolderId: number | null
  folderPickerOpen: boolean
  onOpenFolderPicker: () => void
  onCloseFolderPicker: () => void
  onSelectFolder: (folderId: number | null) => void
  onOpenCreateFolder: () => void
  validateUploadFile: (file: File) => string | null
  onUploadFiles: (files: File[]) => void
  onUploadInvalidBatch?: (failures: { file: File; message: string }[]) => void
  uploading: boolean
}

export default function StorageToolbar({
  isMobile,
  folderOptions,
  selectedFolderId,
  folderPickerOpen,
  onOpenFolderPicker,
  onCloseFolderPicker,
  onSelectFolder,
  onOpenCreateFolder,
  validateUploadFile,
  onUploadFiles,
  onUploadInvalidBatch,
  uploading,
}: StorageToolbarProps) {
  return (
    <div className={`storage-toolbar${isMobile ? ' storage-toolbar--mobile' : ''}`}>
      <div className="storage-toolbar__row">
        <FormButton htmlType="button" variant="secondary" onClick={onOpenCreateFolder}>
          폴더 생성
        </FormButton>
        <FolderPicker
          folders={folderOptions}
          selectedFolderId={selectedFolderId}
          isMobile={isMobile}
          isOpen={folderPickerOpen}
          onOpen={onOpenFolderPicker}
          onClose={onCloseFolderPicker}
          onSelect={onSelectFolder}
        />
        {!isMobile ? (
          <FileUploader
            accept="image/jpeg,image/png,application/pdf,.pdf,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            validateFile={validateUploadFile}
            onFiles={onUploadFiles}
            onInvalidBatch={onUploadInvalidBatch}
            compact
            disabled={uploading}
            statusText={uploading ? '업로드 중…' : undefined}
            primaryHint="파일을 드래그하거나 클릭하여 업로드"
            hintLines={['JPG · PNG · PDF · XLS · XLSX · CSV, 파일당 최대 25MB']}
          />
        ) : null}
      </div>
      {isMobile ? (
        <div className="storage-toolbar__row storage-toolbar__row--full">
          <FileUploader
            accept="image/jpeg,image/png,application/pdf,.pdf,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            validateFile={validateUploadFile}
            onFiles={onUploadFiles}
            onInvalidBatch={onUploadInvalidBatch}
            disabled={uploading}
            statusText={uploading ? '업로드 중…' : undefined}
            primaryHint="파일을 드래그하거나 클릭하여 업로드"
            hintLines={['JPG · PNG · PDF · XLS · XLSX · CSV, 파일당 최대 25MB']}
          />
        </div>
      ) : null}
    </div>
  )
}
