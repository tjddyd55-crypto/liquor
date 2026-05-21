import { FormButton } from '../../../components/form'
import type { StorageFileRow, StorageFolderRow, StorageFileDownloadLinkEntry } from '../api/storageApi'

export type { StorageFileDownloadLinkEntry } from '../api/storageApi'

type StorageFileListProps = {
  folders: StorageFolderRow[]
  files: StorageFileRow[]
  loading: boolean
  /** 목록 조회 실패 시에만 설정 — 빈 목록 안내와 구분한다 */
  listFetchError?: string
  selectedFileId: number | null
  expandedFolderIds: Set<number>
  onToggleFolder: (folderId: number) => void
  onSelectFile: (id: number) => void
  onOpen: (file: StorageFileRow) => void
  /** 클릭 시점에 href가 준비된 경우에만 브라우저 기본 다운로드(비동기 발급 없음) */
  downloadLinksByFileId: Record<number, StorageFileDownloadLinkEntry>
  downloadLinkFailedIds: ReadonlySet<number>
  onRename: (file: StorageFileRow) => void
  onDelete: (file: StorageFileRow) => void
  onRenameFolder: (folder: StorageFolderRow) => void
  onDeleteFolder: (folder: StorageFolderRow) => void
}

function renderFileIcon(file: StorageFileRow): string {
  const mime = String(file.mimeType ?? '').toLowerCase()
  if (mime === 'application/pdf') {
    return '📄'
  }
  if (mime.startsWith('image/')) {
    return '🖼️'
  }
  if (mime.includes('spreadsheet') || mime.includes('excel') || file.fileName.toLowerCase().endsWith('.csv')) {
    return '📊'
  }
  return '📁'
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString('ko-KR')
}

function formatFileSize(bytes: number | null): string {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) < 1) {
    return '0 KB'
  }
  const safeBytes = Number(bytes)
  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.ceil(safeBytes / 1024)} KB`
}

export default function StorageFileList({
  folders,
  files,
  loading,
  listFetchError = '',
  selectedFileId,
  expandedFolderIds,
  onToggleFolder,
  onSelectFile,
  onOpen,
  downloadLinksByFileId,
  downloadLinkFailedIds,
  onRename,
  onDelete,
  onRenameFolder,
  onDeleteFolder,
}: StorageFileListProps) {
  if (loading) {
    return <p className="storage-file-list__empty">불러오는 중…</p>
  }
  if (listFetchError.trim()) {
    return (
      <p className="storage-file-list__empty" role="alert">
        {listFetchError.trim()}
      </p>
    )
  }
  if (files.length === 0 && folders.length === 0) {
    return <p className="storage-file-list__empty">등록된 파일 없음</p>
  }

  const filesByFolderId = new Map<number | null, StorageFileRow[]>()
  for (const file of files) {
    const key = file.folderId ?? null
    const bucket = filesByFolderId.get(key)
    if (bucket) {
      bucket.push(file)
    } else {
      filesByFolderId.set(key, [file])
    }
  }
  const rootFiles = filesByFolderId.get(null) ?? []

  const renderFileRow = (file: StorageFileRow, nested = false) => {
    const selected = selectedFileId === file.id
    const downloadEntry = downloadLinksByFileId[file.id]
    const downloadHref = downloadEntry?.href?.trim() ?? ''
    const downloadFailed = downloadLinkFailedIds.has(file.id)
    return (
      <div
        key={file.id}
        className={`storage-file-list__item${selected ? ' storage-file-list__item--selected' : ''}${
          nested ? ' storage-file-list__item--nested' : ''
        }`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectFile(file.id)}
        onDoubleClick={() => onOpen(file)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelectFile(file.id)
          }
        }}
      >
        <div className="storage-file-list__main">
          <span className="storage-file-list__icon">{renderFileIcon(file)}</span>
          <div className="storage-file-list__meta">
            <div className="storage-file-list__name">{file.displayName}</div>
            <div className="storage-file-list__sub">{formatFileSize(file.fileSize)} · {formatDate(file.createdAt)}</div>
          </div>
        </div>
        <div className="storage-file-list__actions">
          <FormButton
            htmlType="button"
            variant="action"
            size="sm"
            className="storage-file-list__action-button storage-file-list__action-button--open"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(file)
            }}
          >
            열기
          </FormButton>
          {downloadHref ? (
            <a
              href={downloadHref}
              download
              className="button button--small storage-file-list__action-button storage-file-list__action-button--download"
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              다운로드
            </a>
          ) : (
            <FormButton
              htmlType="button"
              variant="action"
              size="sm"
              disabled
              className="storage-file-list__action-button storage-file-list__action-button--download"
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {downloadFailed ? '준비 실패' : '준비 중'}
            </FormButton>
          )}
          <FormButton
            htmlType="button"
            variant="secondary"
            size="sm"
            className="storage-file-list__action-button storage-file-list__action-button--rename"
            onClick={(event) => {
              event.stopPropagation()
              onRename(file)
            }}
          >
            이름 변경
          </FormButton>
          <FormButton
            htmlType="button"
            variant="danger"
            size="sm"
            className="storage-file-list__action-button storage-file-list__action-button--delete"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(file)
            }}
          >
            삭제
          </FormButton>
        </div>
      </div>
    )
  }

  return (
    <div className="storage-file-list">
      <div className="storage-tree__root">
        <span className="storage-tree__arrow">▼</span>
        <span className="storage-tree__label">전체</span>
      </div>

      {rootFiles.length > 0 ? (
        <div className="storage-tree__folder-block">
          <div className="storage-tree__virtual-group">
            <span className="storage-tree__arrow">•</span>
            <span className="storage-tree__label">미분류</span>
          </div>
          {rootFiles.map((file) => renderFileRow(file, true))}
        </div>
      ) : null}

      {folders.map((folder) => {
        const expanded = expandedFolderIds.has(folder.id)
        const folderFiles = filesByFolderId.get(folder.id) ?? []
        return (
          <div key={folder.id} className="storage-tree__folder-block">
            <div
              className="storage-tree__folder"
              role="button"
              tabIndex={0}
              onClick={() => onToggleFolder(folder.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggleFolder(folder.id)
                }
              }}
            >
              <div className="storage-tree__folder-main">
                <span className="storage-tree__arrow">{expanded ? '▼' : '▶'}</span>
                <span className="storage-tree__folder-icon">📁</span>
                <span className="storage-tree__label">{folder.name}</span>
                <span className="storage-tree__count">{folderFiles.length}</span>
              </div>
              <div className="storage-tree__folder-actions">
                <FormButton
                  htmlType="button"
                  variant="action"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRenameFolder(folder)
                  }}
                >
                  ✏️
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="action"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteFolder(folder)
                  }}
                >
                  🗑️
                </FormButton>
              </div>
            </div>

            {expanded ? folderFiles.map((file) => renderFileRow(file, true)) : null}
            {expanded && folderFiles.length === 0 ? (
              <p className="storage-file-list__empty storage-file-list__empty--nested">파일이 없습니다.</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
