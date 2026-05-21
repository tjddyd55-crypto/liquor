import { useCallback, useEffect, useState } from 'react'
import { isRichTextEmpty } from '../../../../components/rich-text/richText'
import { useAuth } from '../../../auth/AuthProvider'
import { deleteStorageFile, listStorageFiles } from '../../../storage/api/storageApi'
import {
  createLocalCustomerNewsImageAttachment,
  uploadCustomerNewsAllAttachment,
  validateCustomerNewsAllImage,
  type AllNewsAttachmentDraft,
} from '../../model/customerNewsAllAttachmentUpload'
import {
  createCustomerNews,
  deleteCustomerNews,
  listAgentCustomerNews,
  type AgentCustomerNewsItem,
} from '../../api/claimRequestsApi'
import ClaimRequestsAllNewsMobileView from './ClaimRequestsAllNewsMobileView'

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function collectNewsObjectKeys(item: AgentCustomerNewsItem): string[] {
  const keys = new Set<string>()
  for (const attachment of item.attachments ?? []) {
    const objectKey = String(attachment.objectKey ?? '').trim()
    if (objectKey) {
      keys.add(objectKey)
    }
  }
  return Array.from(keys)
}

async function deleteAllNewsSourceFiles(token: string, item: AgentCustomerNewsItem): Promise<number> {
  const objectKeys = collectNewsObjectKeys(item)
  if (objectKeys.length === 0) {
    return 0
  }
  const files = await listStorageFiles(token, { customerId: null })
  const targetFiles = files.filter((file) => {
    const key = String(file.objectKey ?? '').trim()
    return key && objectKeys.includes(key)
  })
  let deletedCount = 0
  for (const file of targetFiles) {
    await deleteStorageFile(token, file.id)
    deletedCount += 1
  }
  return deletedCount
}

export default function ClaimRequestsAllNewsMobileStandalone() {
  const { token } = useAuth()
  const [history, setHistory] = useState<AgentCustomerNewsItem[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<AllNewsAttachmentDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const loadHistory = useCallback(async () => {
    if (!token) {
      setHistory([])
      return
    }
    setLoading(true)
    try {
      const rows = await listAgentCustomerNews(token, { scope: 'all' })
      setHistory(rows)
    } catch (loadError) {
      setHistory([])
      setError(loadError instanceof Error ? loadError.message : '전체소식지를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    return () => {
      attachments.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
    }
  }, [attachments])

  const handleFilesSelected = (files: FileList | File[]) => {
    setError('')
    const next: AllNewsAttachmentDraft[] = []
    for (const file of Array.from(files)) {
      const validationMessage = validateCustomerNewsAllImage(file)
      const item = createLocalCustomerNewsImageAttachment(file)
      if (validationMessage) {
        next.push({ ...item, status: 'failed', errorMessage: validationMessage })
      } else {
        next.push(item)
      }
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next])
    }
  }

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.localId === localId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((item) => item.localId !== localId)
    })
  }

  const handleSend = async () => {
    if (!token) {
      return
    }
    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (isRichTextEmpty(nextContent)) {
      setError('전체소식지 내용을 입력해 주세요.')
      return
    }
    const blocked = attachments.find((item) => item.status === 'failed')
    if (blocked) {
      setError('실패한 첨부파일을 삭제한 뒤 다시 발송해 주세요.')
      return
    }
    setActionBusy(true)
    setError('')
    setResult('')
    try {
      const uploaded: AllNewsAttachmentDraft[] = []
      for (const item of attachments) {
        if (item.status === 'completed' && item.cdnUrl && item.objectKey) {
          uploaded.push(item)
          continue
        }
        setAttachments((prev) =>
          prev.map((row) => (row.localId === item.localId ? { ...row, status: 'uploading' } : row)),
        )
        const next = await uploadCustomerNewsAllAttachment(token, item)
        uploaded.push(next)
        setAttachments((prev) => prev.map((row) => (row.localId === item.localId ? next : row)))
      }

      const created = await createCustomerNews(token, {
        title: nextTitle || '전체소식지',
        content: nextContent,
        scope: 'all',
        targetCustomerId: null,
        sendPush: true,
        attachments: uploaded.map((item, index) => ({
          kind: item.kind,
          url: item.cdnUrl ?? '',
          objectKey: item.objectKey,
          fileName: item.file.name || `news-attachment-${index + 1}`,
          mimeType: item.mimeType ?? item.file.type,
          size: item.sizeBytes ?? item.file.size,
          sortOrder: index,
        })),
      })
      setResult(`전체소식지 발송 완료: ${created.id}`)
      attachments.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
      setTitle('')
      setContent('')
      setAttachments([])
      await loadHistory()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '전체소식지 발송에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDeleteNews = async (item: AgentCustomerNewsItem) => {
    if (!token) {
      return
    }
    if (
      !window.confirm(
        '이 소식지를 완전히 삭제할까요? 첨부 이미지/파일도 삭제되며 복구할 수 없습니다.',
      )
    ) {
      return
    }
    setDeletingId(item.id)
    setError('')
    setResult('')
    try {
      await deleteCustomerNews(token, item.id)
      let deletedFileCount = 0
      try {
        deletedFileCount = await deleteAllNewsSourceFiles(token, item)
      } catch {
        deletedFileCount = 0
      }
      setHistory((prev) => prev.filter((row) => row.id !== item.id))
      setResult(
        deletedFileCount > 0
          ? `소식지를 삭제했습니다. (저장공간 메타데이터 ${deletedFileCount}건 정리)`
          : '소식지를 삭제했습니다.',
      )
      await loadHistory()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '소식지 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <ClaimRequestsAllNewsMobileView
      title={title}
      content={content}
      attachments={attachments}
      history={history}
      loading={loading}
      actionBusy={actionBusy}
      deletingId={deletingId}
      resultMessage={result}
      errorMessage={error}
      onTitleChange={setTitle}
      onContentChange={setContent}
      onFilesSelected={handleFilesSelected}
      onRemoveAttachment={handleRemoveAttachment}
      onSend={() => void handleSend()}
      onDeleteNews={(item) => void handleDeleteNews(item)}
      formatDateTime={formatDateTime}
    />
  )
}
