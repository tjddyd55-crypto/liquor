import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  createStorageFileDownloadUrl,
  createStorageFolder,
  deleteStorageFile,
  deleteStorageFolder,
  getPersonalStorageQuota,
  listStorageFiles,
  listStorageFolders,
  markStorageUploadFailed,
  openStorageFile,
  presignStorageFile,
  renameStorageFile,
  renameStorageFolder,
  revokeStorageStagedUpload,
  saveStorageFile,
  type StorageFileDownloadLinkEntry,
  type StorageFileRow,
  type StorageFolderRow,
} from '../api/storageApi'
import StorageDeleteDialog from './StorageDeleteDialog'
import StorageFileList from './StorageFileList'
import StorageRenameDialog from './StorageRenameDialog'
import StorageToolbar from './StorageToolbar'

const FILE_NAME_MAX_LENGTH = 120
const FOLDER_NAME_MAX_LENGTH = 12
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
])
const FILE_NAME_REGEX = /^[A-Za-z0-9._\-() \u3131-\u318e\uac00-\ud7a3]+$/
const FOLDER_NAME_REGEX = /^[A-Za-z0-9 \u3131-\u318e\uac00-\ud7a3]+$/

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  )
}

type RenameTarget =
  | { kind: 'file'; file: StorageFileRow; value: string }
  | { kind: 'folder'; folder: StorageFolderRow; value: string }

type DeleteTarget =
  | { kind: 'file'; file: StorageFileRow }
  | { kind: 'folder'; folder: StorageFolderRow }

type StorageWorkspaceProps = {
  token: string | null
  customerId?: number | null
  title: string
  subtitle?: string
  headerSlot?: ReactNode
  variant: 'pc' | 'mobile'
}

function normalizeName(raw: string, maxLength: number): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function isValidFileName(raw: string): boolean {
  const value = normalizeName(raw, FILE_NAME_MAX_LENGTH)
  return Boolean(value) && FILE_NAME_REGEX.test(value)
}

function isValidFolderName(raw: string): boolean {
  const value = normalizeName(raw, FOLDER_NAME_MAX_LENGTH)
  return Boolean(value) && FOLDER_NAME_REGEX.test(value)
}

function guessContentType(file: File): string {
  if (file.type && ALLOWED_MIME.has(file.type)) {
    return file.type
  }
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (lower.endsWith('.png')) {
    return 'image/png'
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (lower.endsWith('.xls')) {
    return 'application/vnd.ms-excel'
  }
  if (lower.endsWith('.csv')) {
    return 'text/csv'
  }
  return file.type || 'application/octet-stream'
}

function formatStorageMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0'
  }
  return (bytes / (1024 * 1024)).toFixed(1)
}

function calculateStoragePercent(usedBytes: number, limitBytes: number): number {
  const total = Number.isFinite(limitBytes) && limitBytes > 0 ? limitBytes : 0
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0
  if (total <= 0) {
    return 0
  }
  return (used / total) * 100
}

function storageFileKind(file: StorageFileRow): 'image' | 'pdf' | 'spreadsheet' | 'other' {
  const mime = String(file.mimeType ?? '').toLowerCase()
  const name = String(file.fileName || file.displayName || '').toLowerCase()
  if (mime.startsWith('image/')) {
    return 'image'
  }
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf'
  }
  if (mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return 'spreadsheet'
  }
  return 'other'
}

export default function StorageWorkspace({
  token,
  customerId = null,
  title,
  subtitle,
  headerSlot,
  variant,
}: StorageWorkspaceProps) {
  const isMobile = variant === 'mobile'
  const [folders, setFolders] = useState<StorageFolderRow[]>([])
  const [files, setFiles] = useState<StorageFileRow[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<number>>(new Set())
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'pdf' | 'spreadsheet'>('all')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 업로드·이름변경·열기 등 액션 실패 등 (파일 목록 자체 성공 여부와 분리) */
  const [error, setError] = useState('')
  /** 폴더 목록(/storage/folders)만 실패 — 파일 목록이 성공했어도 탭 전체를 DB 에러처럼 보이지 않게 한다 */
  const [foldersLoadError, setFoldersLoadError] = useState('')
  /** 파일 목록(/storage/files) 로드 실패 */
  const [filesListError, setFilesListError] = useState('')
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [createFolderName, setCreateFolderName] = useState('')
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [quota, setQuota] = useState<{
    usedBytes: number
    limitBytes: number
    pendingUploadBytes?: number
  } | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)

  const folderOptions = useMemo(
    () => [{ id: null, name: '전체', createdAt: '' } as const, ...folders],
    [folders],
  )

  const storageFolderScope = useMemo(
    () => (customerId != null ? { customerId } : undefined),
    [customerId],
  )

  const filteredFiles = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return files.filter((file) => {
      if (selectedFolderId !== null && (file.folderId ?? null) !== selectedFolderId) {
        return false
      }
      if (kindFilter !== 'all' && storageFileKind(file) !== kindFilter) {
        return false
      }
      if (!query) {
        return true
      }
      const haystack = `${file.displayName ?? ''} ${file.fileName ?? ''} ${file.originalName ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [files, kindFilter, searchText, selectedFolderId])

  const FILE_DOWNLOAD_TTL_MS = 8 * 60 * 1000
  const fileDownloadLinksRef = useRef<Record<number, StorageFileDownloadLinkEntry>>({})
  const [fileDownloadLinks, setFileDownloadLinks] = useState<Record<number, StorageFileDownloadLinkEntry>>({})
  const [fileDownloadFailedIds, setFileDownloadFailedIds] = useState<ReadonlySet<number>>(() => new Set())

  const filteredFileIdsKey = useMemo(
    () =>
      filteredFiles
        .map((f) => f.id)
        .sort((a, b) => a - b)
        .join(','),
    [filteredFiles],
  )

  useEffect(() => {
    if (!token?.trim()) {
      fileDownloadLinksRef.current = {}
      setFileDownloadLinks({})
      setFileDownloadFailedIds(new Set())
      return
    }
    let cancelled = false
    const run = async () => {
      const now = Date.now()
      const tok = token.trim()
      const next: Record<number, StorageFileDownloadLinkEntry> = {}
      const failed = new Set<number>()
      for (const file of filteredFiles) {
        const cached = fileDownloadLinksRef.current[file.id]
        if (cached && now - cached.createdAt < FILE_DOWNLOAD_TTL_MS) {
          next[file.id] = cached
          continue
        }
        try {
          const href = await createStorageFileDownloadUrl(tok, file.id)
          if (cancelled) {
            return
          }
          next[file.id] = { href, createdAt: Date.now() }
        } catch {
          failed.add(file.id)
        }
      }
      fileDownloadLinksRef.current = next
      if (!cancelled) {
        setFileDownloadLinks({ ...next })
        setFileDownloadFailedIds(failed)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token, filteredFileIdsKey, filteredFiles])

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    setFolders([])
    setFiles([])
    setSelectedFolderId(null)
    setSelectedFileId(null)
    setSearchText('')
    setKindFilter('all')
    setError('')
    setFoldersLoadError('')
    setFilesListError('')
  }, [customerId, token])

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      const next = new Set<number>()
      for (const folder of folders) {
        if (prev.has(folder.id) || !prev.size) {
          next.add(folder.id)
        }
      }
      return next
    })
  }, [folders])

  const loadFolders = useCallback(
    async (signal?: AbortSignal) => {
      if (!token?.trim()) {
        setFolders([])
        setFoldersLoadError('')
        return
      }
      setFoldersLoadError('')
      try {
        const rows = await listStorageFolders(token, storageFolderScope, { signal })
        setFolders(rows)
      } catch (e) {
        if (isAbortError(e)) {
          return
        }
        setFolders([])
        setFoldersLoadError(
          e instanceof Error ? e.message : '폴더 목록을 불러오지 못했습니다. 폴더 기능 없이 파일만 표시합니다.',
        )
      }
    },
    [storageFolderScope, token],
  )

  const loadQuota = useCallback(
    async (signal?: AbortSignal) => {
      if (!token?.trim()) {
        setQuota(null)
        setQuotaLoading(false)
        return
      }
      setQuotaLoading(true)
      try {
        const q = await getPersonalStorageQuota(token, { signal })
        setQuota(q)
      } catch (e) {
        if (isAbortError(e)) {
          return
        }
        setQuota(null)
      } finally {
        setQuotaLoading(false)
      }
    },
    [token],
  )

  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!token?.trim()) {
        setFiles([])
        return
      }
      const rows = await listStorageFiles(
        token,
        { customerId },
        { signal },
      )
      setFiles(rows)
    },
    [customerId, token],
  )

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    const controller = new AbortController()
    void loadQuota(controller.signal)
    return () => controller.abort()
  }, [loadQuota, token])

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    const controller = new AbortController()
    void loadFolders(controller.signal).catch((e) => {
      if (isAbortError(e)) {
        return
      }
      setError(e instanceof Error ? e.message : '폴더 목록을 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [loadFolders, token])

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setFilesListError('')
    void loadFiles(controller.signal)
      .catch((e) => {
        if (isAbortError(e)) {
          return
        }
        setFilesListError(e instanceof Error ? e.message : '파일 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [loadFiles, token])

  useEffect(() => {
    if (selectedFolderId != null && !folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null)
    }
  }, [folders, selectedFolderId])

  useEffect(() => {
    if (selectedFileId != null && !files.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(null)
    }
  }, [files, selectedFileId])

  const openCreateFolderDialog = useCallback(() => {
    setCreateFolderName('')
    setCreateFolderOpen(true)
  }, [])

  const submitCreateFolder = useCallback(async () => {
    if (!token?.trim() || submitting) {
      return
    }
    const name = normalizeName(createFolderName, FOLDER_NAME_MAX_LENGTH)
    if (!isValidFolderName(name) || name === '전체') {
      setError('폴더 이름은 12자 이내(특수문자 제외)로 입력해 주세요.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createStorageFolder(token, name, storageFolderScope)
      setCreateFolderOpen(false)
      setCreateFolderName('')
      await loadFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : '폴더 생성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [createFolderName, loadFolders, storageFolderScope, submitting, token])

  const validateStoragePickerFile = useCallback((file: File): string | null => {
    const normalizedName = normalizeName(file.name, FILE_NAME_MAX_LENGTH)
    const mimeType = guessContentType(file)
    if (!isValidFileName(normalizedName)) {
      return '파일 이름 형식이 올바르지 않습니다.'
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return 'JPG, PNG, PDF, XLS, XLSX, CSV만 업로드할 수 있습니다.'
    }
    if (file.size < 1) {
      return '빈 파일은 업로드할 수 없습니다.'
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return '파일 크기는 25MB 이하여야 합니다.'
    }
    return null
  }, [])

  const uploadFiles = useCallback(
    async (selectedFiles: File[] | FileList | null) => {
      if (!token?.trim() || uploading || !selectedFiles?.length) {
        return
      }
      setUploading(true)
      setError('')
      const uploads = Array.isArray(selectedFiles) ? selectedFiles : Array.from(selectedFiles)
      let failCount = 0
      for (const file of uploads) {
        const normalizedName = normalizeName(file.name, FILE_NAME_MAX_LENGTH)
        const mimeType = guessContentType(file)
        if (!isValidFileName(normalizedName) || !ALLOWED_MIME.has(mimeType) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
          failCount += 1
          continue
        }
        let stagedObjectKey: string | null = null
        let uploadFileId: number | null = null
        try {
          const presign = await presignStorageFile(token, {
            fileName: normalizedName,
            contentType: mimeType,
            sizeBytes: file.size,
            customerId,
          })
          uploadFileId = presign.fileId
          stagedObjectKey = presign.objectKey
          const put = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': mimeType,
              ...(presign.putHeaders ?? {}),
            },
            body: file,
          })
          if (!put.ok) {
            throw new Error('업로드 실패')
          }
          await saveStorageFile(token, {
            fileId: presign.fileId,
            fileName: normalizedName,
            displayName: normalizedName,
            objectKey: presign.objectKey,
            fileUrl: presign.fileUrl,
            size: file.size,
            mimeType,
            folderId: selectedFolderId,
            customerId,
          })
          stagedObjectKey = null
          uploadFileId = null
        } catch {
          failCount += 1
          if (uploadFileId != null) {
            try {
              await revokeStorageStagedUpload(token, stagedObjectKey ?? '', {
                customerId,
                fileId: uploadFileId,
              })
            } catch {
              try {
                await markStorageUploadFailed(token, uploadFileId)
              } catch {
                /* orphan cron */
              }
            }
          }
        }
      }
      await Promise.all([loadFiles(), loadQuota()])
      setUploading(false)
      if (failCount > 0) {
        setError(`${failCount}개 파일 업로드에 실패했습니다.`)
      }
    },
    [customerId, loadFiles, loadQuota, selectedFolderId, token, uploading],
  )

  const openRenameFileDialog = useCallback((file: StorageFileRow) => {
    setRenameTarget({ kind: 'file', file, value: file.displayName })
  }, [])

  const openRenameFolderDialog = useCallback((folder: StorageFolderRow) => {
    setRenameTarget({ kind: 'folder', folder, value: folder.name })
  }, [])

  const submitRename = useCallback(async () => {
    if (!token?.trim() || !renameTarget || submitting) {
      return
    }
    const value =
      renameTarget.kind === 'file'
        ? normalizeName(renameTarget.value, FILE_NAME_MAX_LENGTH)
        : normalizeName(renameTarget.value, FOLDER_NAME_MAX_LENGTH)

    const valid = renameTarget.kind === 'file' ? isValidFileName(value) : isValidFolderName(value)
    if (!valid || value === '전체') {
      setError('이름 형식이 올바르지 않습니다.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (renameTarget.kind === 'file') {
        const updated = await renameStorageFile(token, renameTarget.file.id, value)
        setFiles((prev) => prev.map((file) => (file.id === updated.id ? updated : file)))
      } else {
        await renameStorageFolder(token, renameTarget.folder.id, value)
        await loadFolders()
      }
      setRenameTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '이름 변경에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [loadFolders, renameTarget, submitting, token])

  const submitDelete = useCallback(async () => {
    if (!token?.trim() || !deleteTarget || submitting) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (deleteTarget.kind === 'file') {
        await deleteStorageFile(token, deleteTarget.file.id)
        setFiles((prev) => prev.filter((file) => file.id !== deleteTarget.file.id))
        await loadQuota()
      } else {
        await deleteStorageFolder(token, deleteTarget.folder.id)
        if (selectedFolderId === deleteTarget.folder.id) {
          setSelectedFolderId(null)
        }
        await loadFolders()
      }
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [deleteTarget, loadFolders, loadQuota, selectedFolderId, submitting, token])

  const openFile = useCallback(
    async (file: StorageFileRow) => {
      if (!token?.trim()) {
        return
      }
      try {
        await openStorageFile(token, file.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '파일 열기에 실패했습니다.')
      }
    },
    [token],
  )

  const quotaPercent = useMemo(() => {
    if (!quota) {
      return null
    }
    const percent = calculateStoragePercent(quota.usedBytes, quota.limitBytes)
    const safePercent = Math.min(Math.max(percent, 0), 100)
    return {
      text: percent.toFixed(1),
      safe: safePercent,
    }
  }, [quota])

  return (
    <div className="storage-workspace page-shell">
      {headerSlot}
      <div className="storage-workspace__header">
        {title?.trim() ? <h1 className="storage-workspace__title">{title}</h1> : null}
        {subtitle ? <p className="storage-workspace__subtitle">{subtitle}</p> : null}
        <p className="storage-workspace__quota" role="status">
          {quotaLoading ? (
            <>개인 저장공간 사용량 불러오는 중…</>
          ) : quota ? (
            <>
              개인 저장소 사용량 {formatStorageMb(quota.usedBytes)} MB / {formatStorageMb(quota.limitBytes)} MB (
              {quotaPercent?.text ?? '0.0'}%)
              {quota.pendingUploadBytes != null && quota.pendingUploadBytes > 0
                ? ` (업로드 진행 예약 ${formatStorageMb(quota.pendingUploadBytes)} MB)`
                : ''}
              {customerId != null ? ' (고객 파일·내 저장공간 합산)' : ''}
              <span className="storage-bar" aria-hidden="true">
                <span className="storage-bar-fill" style={{ width: `${quotaPercent?.safe ?? 0}%` }} />
              </span>
            </>
          ) : (
            <>개인 저장공간 용량 정보를 불러오지 못했습니다.</>
          )}
        </p>
      </div>

      <StorageToolbar
        isMobile={isMobile}
        folderOptions={folderOptions}
        selectedFolderId={selectedFolderId}
        folderPickerOpen={folderPickerOpen}
        onOpenFolderPicker={() => setFolderPickerOpen(true)}
        onCloseFolderPicker={() => setFolderPickerOpen(false)}
        onSelectFolder={(folderId) => setSelectedFolderId(folderId)}
        onOpenCreateFolder={openCreateFolderDialog}
        validateUploadFile={validateStoragePickerFile}
        onUploadFiles={(selectedFiles) => {
          void uploadFiles(selectedFiles)
        }}
        onUploadInvalidBatch={(failures) => {
          if (failures.length) {
            setError(`${failures.length}개 파일이 형식·용량·이름 규칙에 맞지 않습니다.`)
          }
        }}
        uploading={uploading}
      />

      <div className="storage-workspace__filters" role="search">
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="파일명 검색"
          className="storage-workspace__search"
        />
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as 'all' | 'image' | 'pdf' | 'spreadsheet')}
          className="storage-workspace__kind-filter"
          aria-label="파일 종류 필터"
        >
          <option value="all">전체 형식</option>
          <option value="image">이미지</option>
          <option value="pdf">PDF</option>
          <option value="spreadsheet">엑셀/CSV</option>
        </select>
        {(searchText.trim() || kindFilter !== 'all' || selectedFolderId !== null) ? (
          <button
            type="button"
            className="storage-workspace__filter-reset"
            onClick={() => {
              setSearchText('')
              setKindFilter('all')
              setSelectedFolderId(null)
            }}
          >
            필터 초기화
          </button>
        ) : null}
      </div>

      <div className="storage-workspace__summary">
        표시 {filteredFiles.length}개 / 전체 {files.length}개 · 폴더 {folders.length}개
        {selectedFolderId !== null ? ` · 선택 폴더: ${folders.find((folder) => folder.id === selectedFolderId)?.name ?? '폴더'}` : ''}
      </div>

      {foldersLoadError ? (
        <p className="storage-workspace__folder-warning" role="status">
          {foldersLoadError}
        </p>
      ) : null}
      {error ? <p className="storage-workspace__error">{error}</p> : null}

      <StorageFileList
        folders={folders}
        files={filteredFiles}
        loading={loading}
        listFetchError={filesListError}
        selectedFileId={selectedFileId}
        expandedFolderIds={expandedFolderIds}
        onToggleFolder={(folderId) => {
          setExpandedFolderIds((prev) => {
            const next = new Set(prev)
            if (next.has(folderId)) {
              next.delete(folderId)
            } else {
              next.add(folderId)
            }
            return next
          })
        }}
        onSelectFile={setSelectedFileId}
        onOpen={(file) => {
          void openFile(file)
        }}
        downloadLinksByFileId={fileDownloadLinks}
        downloadLinkFailedIds={fileDownloadFailedIds}
        onRename={openRenameFileDialog}
        onDelete={(file) => setDeleteTarget({ kind: 'file', file })}
        onRenameFolder={openRenameFolderDialog}
        onDeleteFolder={(folder) => setDeleteTarget({ kind: 'folder', folder })}
      />

      <StorageRenameDialog
        open={createFolderOpen}
        title="폴더 생성"
        value={createFolderName}
        loading={submitting}
        onChange={setCreateFolderName}
        onClose={() => setCreateFolderOpen(false)}
        onSubmit={() => {
          void submitCreateFolder()
        }}
      />

      <StorageRenameDialog
        open={renameTarget != null}
        title={renameTarget?.kind === 'file' ? '파일 이름 변경' : '폴더 이름 변경'}
        value={renameTarget?.value ?? ''}
        loading={submitting}
        onChange={(value) => {
          setRenameTarget((prev) => (prev ? { ...prev, value } : prev))
        }}
        onClose={() => setRenameTarget(null)}
        onSubmit={() => {
          void submitRename()
        }}
      />

      <StorageDeleteDialog
        open={deleteTarget != null}
        title={deleteTarget?.kind === 'file' ? '파일 삭제' : '폴더 삭제'}
        description={
          deleteTarget?.kind === 'file'
            ? `"${deleteTarget.file.displayName}" 파일을 삭제합니다.`
            : `"${deleteTarget?.folder.name}" 폴더를 삭제합니다.`
        }
        loading={submitting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          void submitDelete()
        }}
      />
    </div>
  )
}
