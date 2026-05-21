import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StorageDeleteDialog from '../../storage/components/StorageDeleteDialog'
import StorageFileList from '../../storage/components/StorageFileList'
import StorageRenameDialog from '../../storage/components/StorageRenameDialog'
import type { StorageFileDownloadLinkEntry, StorageFileRow } from '../../storage/api/storageApi'
import {
  GOVERNMENT_PROFILE_FILE_ALLOWED_MIME,
  GOVERNMENT_PROFILE_FILE_MAX_BYTES,
  GOVERNMENT_PROFILE_FILE_NAME_MAX,
} from '../constants/governmentProfileFiles.config'
import {
  deleteGovProfileFile,
  fetchGovProfileFiles,
  getGovProfileFileDownloadUrl,
  govProfileFileToStorageRow,
  patchGovProfileFile,
  presignGovProfileFile,
  saveGovProfileFile,
  type GovStorageFileRow,
} from '../api/governmentProfileFilesApi'
import GovernmentProfileStorageToolbar from './GovernmentProfileStorageToolbar'

const FILE_NAME_REGEX = /^[A-Za-z0-9._\-() \u3131-\u318e\uac00-\ud7a3]+$/

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  )
}

function normalizeName(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GOVERNMENT_PROFILE_FILE_NAME_MAX)
}

function isValidFileName(raw: string): boolean {
  const value = normalizeName(raw)
  return Boolean(value) && FILE_NAME_REGEX.test(value)
}

function guessContentType(file: File): string {
  if (file.type && GOVERNMENT_PROFILE_FILE_ALLOWED_MIME.has(file.type)) {
    return file.type
  }
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.csv')) return 'text/csv'
  return file.type || 'application/octet-stream'
}

function storageFileKind(file: StorageFileRow): 'image' | 'pdf' | 'spreadsheet' | 'other' {
  const mime = String(file.mimeType ?? '').toLowerCase()
  const name = String(file.fileName || file.displayName || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return 'spreadsheet'
  }
  return 'other'
}

function resolveGovFileId(file: StorageFileRow): string {
  const ext = file as GovStorageFileRow
  return String(ext.govFileId ?? file.id)
}

type GovernmentProfileStorageWorkspaceProps = {
  token: string
  profileId: string
  variant: 'pc' | 'mobile'
}

export default function GovernmentProfileStorageWorkspace({
  token,
  profileId,
  variant,
}: GovernmentProfileStorageWorkspaceProps) {
  const isMobile = variant === 'mobile'
  const [files, setFiles] = useState<StorageFileRow[]>([])
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'pdf' | 'spreadsheet'>('all')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [filesListError, setFilesListError] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ file: StorageFileRow; value: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StorageFileRow | null>(null)

  const filteredFiles = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return files.filter((file) => {
      if (kindFilter !== 'all' && storageFileKind(file) !== kindFilter) return false
      if (!query) return true
      const haystack = `${file.displayName ?? ''} ${file.fileName ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [files, kindFilter, searchText])

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
    if (!token?.trim() || !profileId) {
      fileDownloadLinksRef.current = {}
      setFileDownloadLinks({})
      setFileDownloadFailedIds(new Set())
      return
    }
    let cancelled = false
    const run = async () => {
      const now = Date.now()
      const next: Record<number, StorageFileDownloadLinkEntry> = {}
      const failed = new Set<number>()
      for (const file of filteredFiles) {
        const cached = fileDownloadLinksRef.current[file.id]
        if (cached && now - cached.createdAt < FILE_DOWNLOAD_TTL_MS) {
          next[file.id] = cached
          continue
        }
        try {
          const href = await getGovProfileFileDownloadUrl(token, profileId, resolveGovFileId(file))
          if (cancelled) return
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
  }, [token, profileId, filteredFileIdsKey, filteredFiles])

  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!token?.trim() || !profileId) {
        setFiles([])
        return
      }
      if (signal?.aborted) return
      const rows = await fetchGovProfileFiles(token, profileId)
      if (signal?.aborted) return
      setFiles(rows.map((r) => govProfileFileToStorageRow(r) as StorageFileRow))
    },
    [profileId, token],
  )

  useEffect(() => {
    setFiles([])
    setSelectedFileId(null)
    setSearchText('')
    setKindFilter('all')
    setError('')
    setFilesListError('')
  }, [profileId, token])

  useEffect(() => {
    if (!token?.trim() || !profileId) return
    const controller = new AbortController()
    setLoading(true)
    setFilesListError('')
    void loadFiles(controller.signal)
      .catch((e) => {
        if (isAbortError(e)) return
        setFilesListError(e instanceof Error ? e.message : '파일 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loadFiles, profileId, token])

  useEffect(() => {
    if (selectedFileId != null && !files.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(null)
    }
  }, [files, selectedFileId])

  const validateStoragePickerFile = useCallback((file: File): string | null => {
    const normalizedName = normalizeName(file.name)
    const mimeType = guessContentType(file)
    if (!isValidFileName(normalizedName)) return '파일 이름 형식이 올바르지 않습니다.'
    if (!GOVERNMENT_PROFILE_FILE_ALLOWED_MIME.has(mimeType)) {
      return 'JPG, PNG, PDF, XLS, XLSX, CSV만 업로드할 수 있습니다.'
    }
    if (file.size < 1) return '빈 파일은 업로드할 수 없습니다.'
    if (file.size > GOVERNMENT_PROFILE_FILE_MAX_BYTES) return '파일 크기는 25MB 이하여야 합니다.'
    return null
  }, [])

  const uploadFiles = useCallback(
    async (selectedFiles: File[] | FileList | null) => {
      if (!token?.trim() || !profileId || uploading || !selectedFiles?.length) return
      setUploading(true)
      setError('')
      const uploads = Array.isArray(selectedFiles) ? selectedFiles : Array.from(selectedFiles)
      let failCount = 0
      for (const file of uploads) {
        const normalizedName = normalizeName(file.name)
        const mimeType = guessContentType(file)
        if (!isValidFileName(normalizedName) || !GOVERNMENT_PROFILE_FILE_ALLOWED_MIME.has(mimeType) || file.size < 1 || file.size > GOVERNMENT_PROFILE_FILE_MAX_BYTES) {
          failCount += 1
          continue
        }
        let stagedFileId: string | null = null
        try {
          const presign = await presignGovProfileFile(token, profileId, {
            fileName: normalizedName,
            contentType: mimeType,
            sizeBytes: file.size,
          })
          stagedFileId = presign.fileId
          const put = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': mimeType,
              ...(presign.putHeaders ?? {}),
            },
            body: file,
          })
          if (!put.ok) throw new Error('업로드 실패')
          await saveGovProfileFile(token, profileId, {
            fileId: presign.fileId,
            objectKey: presign.objectKey,
            fileName: normalizedName,
            size: file.size,
            mimeType,
          })
          stagedFileId = null
        } catch {
          failCount += 1
          if (stagedFileId) {
            try {
              await deleteGovProfileFile(token, profileId, stagedFileId)
            } catch {
              /* ignore */
            }
          }
        }
      }
      await loadFiles()
      setUploading(false)
      if (failCount > 0) setError(`${failCount}개 파일 업로드에 실패했습니다.`)
    },
    [loadFiles, profileId, token, uploading],
  )

  const submitRename = useCallback(async () => {
    if (!token?.trim() || !profileId || !renameTarget || submitting) return
    const value = normalizeName(renameTarget.value)
    if (!isValidFileName(value)) {
      setError('이름 형식이 올바르지 않습니다.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const updated = await patchGovProfileFile(token, profileId, resolveGovFileId(renameTarget.file), {
        fileName: value,
      })
      const row = govProfileFileToStorageRow(updated) as StorageFileRow
      setFiles((prev) => prev.map((file) => (file.id === row.id ? row : file)))
      setRenameTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '이름 변경에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [profileId, renameTarget, submitting, token])

  const submitDelete = useCallback(async () => {
    if (!token?.trim() || !profileId || !deleteTarget || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await deleteGovProfileFile(token, profileId, resolveGovFileId(deleteTarget))
      setFiles((prev) => prev.filter((file) => file.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [deleteTarget, profileId, submitting, token])

  const openFile = useCallback(
    async (file: StorageFileRow) => {
      if (!token?.trim()) return
      try {
        const href =
          fileDownloadLinksRef.current[file.id]?.href ??
          (await getGovProfileFileDownloadUrl(token, profileId, resolveGovFileId(file)))
        window.open(href, '_blank', 'noopener,noreferrer')
      } catch (e) {
        setError(e instanceof Error ? e.message : '파일 열기에 실패했습니다.')
      }
    },
    [profileId, token],
  )

  return (
    <div className="storage-workspace page-shell">
      <div className="storage-workspace__header">
        <p className="storage-workspace__quota" role="status">
          사업장 서류/첨부 {files.length}개
        </p>
      </div>

      <GovernmentProfileStorageToolbar
        isMobile={isMobile}
        validateUploadFile={validateStoragePickerFile}
        onUploadFiles={(selected) => {
          void uploadFiles(selected)
        }}
        onUploadInvalidBatch={(failures) => {
          if (failures.length) setError(`${failures.length}개 파일이 형식·용량·이름 규칙에 맞지 않습니다.`)
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
        {(searchText.trim() || kindFilter !== 'all') && (
          <button
            type="button"
            className="storage-workspace__filter-reset"
            onClick={() => {
              setSearchText('')
              setKindFilter('all')
            }}
          >
            필터 초기화
          </button>
        )}
      </div>

      <div className="storage-workspace__summary">표시 {filteredFiles.length}개 / 전체 {files.length}개</div>

      {error ? <p className="storage-workspace__error">{error}</p> : null}

      <StorageFileList
        folders={[]}
        files={filteredFiles}
        loading={loading}
        listFetchError={filesListError}
        selectedFileId={selectedFileId}
        expandedFolderIds={new Set()}
        onToggleFolder={() => {}}
        onSelectFile={setSelectedFileId}
        onOpen={(file) => {
          void openFile(file)
        }}
        downloadLinksByFileId={fileDownloadLinks}
        downloadLinkFailedIds={fileDownloadFailedIds}
        onRename={(file) => setRenameTarget({ file, value: file.displayName })}
        onDelete={(file) => setDeleteTarget(file)}
        onRenameFolder={() => {}}
        onDeleteFolder={() => {}}
      />

      <StorageRenameDialog
        open={renameTarget != null}
        title="파일 이름 변경"
        value={renameTarget?.value ?? ''}
        onChange={(value) => {
          if (renameTarget) setRenameTarget({ ...renameTarget, value })
        }}
        onClose={() => setRenameTarget(null)}
        onSubmit={() => {
          void submitRename()
        }}
        loading={submitting}
      />

      <StorageDeleteDialog
        open={deleteTarget != null}
        title="파일 삭제"
        description={deleteTarget ? `「${deleteTarget.displayName}」 파일을 삭제하시겠습니까?` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          void submitDelete()
        }}
        loading={submitting}
      />
    </div>
  )
}
