import FileUploader from '../../../components/common/FileUploader'

type GovernmentProfileStorageToolbarProps = {
  isMobile: boolean
  validateUploadFile: (file: File) => string | null
  onUploadFiles: (files: File[]) => void
  onUploadInvalidBatch?: (failures: { file: File; message: string }[]) => void
  uploading: boolean
}

/** 보험 StorageToolbar — 폴더 없이 업로드만 (사업장 첨부 전용) */
export default function GovernmentProfileStorageToolbar({
  isMobile,
  validateUploadFile,
  onUploadFiles,
  onUploadInvalidBatch,
  uploading,
}: GovernmentProfileStorageToolbarProps) {
  return (
    <div className={`storage-toolbar${isMobile ? ' storage-toolbar--mobile' : ''}`}>
      <div className={`storage-toolbar__row${isMobile ? ' storage-toolbar__row--full' : ''}`}>
        <FileUploader
          accept="image/jpeg,image/png,application/pdf,.pdf,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          validateFile={validateUploadFile}
          onFiles={onUploadFiles}
          onInvalidBatch={onUploadInvalidBatch}
          compact={!isMobile}
          disabled={uploading}
          statusText={uploading ? '업로드 중…' : undefined}
          primaryHint="파일을 드래그하거나 클릭하여 업로드"
          hintLines={['JPG · PNG · PDF · XLS · XLSX · CSV, 파일당 최대 25MB']}
        />
      </div>
    </div>
  )
}
