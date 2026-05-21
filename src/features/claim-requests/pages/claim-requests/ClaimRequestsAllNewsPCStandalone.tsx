import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FileUploader from '../../../../components/common/FileUploader'
import { StatusMessage } from '../../../../components/feedback'
import { FormButton, FormInput, FormTextarea } from '../../../../components/form'
import { fetchMe } from '../../../auth/authApi'
import { useAuth } from '../../../auth/AuthProvider'
import CustomerAppNewsPhonePreview from '../../components/CustomerAppNewsPhonePreview'
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
  updateCustomerNews,
  type AgentCustomerNewsItem,
} from '../../api/claimRequestsApi'
import { buildSlideDraftsFromActiveHomeItem } from '../../model/customerNewsHomeSlideDrafts'
import { deleteStorageFile, listStorageFiles } from '../../../storage/api/storageApi'
import { buildCustomerNewsGalleryUrls } from '../../../customer-app/model/buildCustomerNewsGalleryUrls'
import ClaimRequestsPagePCView from './ClaimRequestsPagePCView'
import './ClaimRequestsAllNewsPCStandalone.css'

const ATTACHMENT_STATUS_LABEL: Record<AllNewsAttachmentDraft['status'], string> = {
  pending: '대기',
  uploading: '업로드 중',
  completed: '완료',
  failed: '실패',
}

function newsRowTime(iso: string | null | undefined): number {
  if (!iso) {
    return 0
  }
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** 고객앱 홈에 쓰는 활성 세트: scope all 중 updatedAt 최신 1건 */
function pickActiveHomeNewsItem(rows: AgentCustomerNewsItem[]): AgentCustomerNewsItem | null {
  const all = rows.filter((row) => row.scope === 'all')
  if (all.length === 0) {
    return null
  }
  return [...all].sort((a, b) => newsRowTime(b.updatedAt) - newsRowTime(a.updatedAt))[0]
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

export default function ClaimRequestsAllNewsPCStandalone() {
  const { token, user } = useAuth()
  const [agentMePhone, setAgentMePhone] = useState<string | null>(null)
  const [history, setHistory] = useState<AgentCustomerNewsItem[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<AllNewsAttachmentDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const draftSourceRef = useRef<string>('__init__')

  const loadHistory = useCallback(async () => {
    if (!token) {
      setHistory([])
      return
    }
    setLoading(true)
    try {
      const rows = await listAgentCustomerNews(token, { scope: 'all' })
      setHistory(rows)
    } catch (loadErr) {
      setHistory([])
      setError(loadErr instanceof Error ? loadErr.message : '고객앱 홈 메시지를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const activeHomeItem = useMemo(() => pickActiveHomeNewsItem(history), [history])

  useEffect(() => {
    if (loading) {
      return
    }
    const fp = activeHomeItem ? `${activeHomeItem.id}:${activeHomeItem.updatedAt ?? ''}` : '__none__'
    if (fp === draftSourceRef.current) {
      return
    }
    draftSourceRef.current = fp

    setAttachments((prev) => {
      for (const item of prev) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      }
      return activeHomeItem ? buildSlideDraftsFromActiveHomeItem(activeHomeItem) : []
    })
    if (!activeHomeItem) {
      setTitle('')
      setDescription('')
    } else {
      setTitle(activeHomeItem.title ?? '')
      setDescription(activeHomeItem.content ?? '')
    }
  }, [loading, activeHomeItem])

  useEffect(() => {
    if (!token) {
      setAgentMePhone(null)
      return
    }
    let cancelled = false
    void fetchMe(token)
      .then((me) => {
        if (!cancelled) {
          const raw = String(me.phone_number ?? '').trim()
          setAgentMePhone(raw || null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentMePhone(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    return () => {
      attachments.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
    }
  }, [attachments])

  const draftImageUrls = useMemo(
    () =>
      attachments
        .filter(
          (row) => row.kind === 'image' && row.status !== 'failed' && (row.previewUrl || row.cdnUrl),
        )
        .map((row) => (row.previewUrl || row.cdnUrl || '').trim())
        .filter(Boolean),
    [attachments],
  )

  const activeGalleryUrls = useMemo(() => {
    if (!activeHomeItem) {
      return []
    }
    return buildCustomerNewsGalleryUrls({
      heroImageUrl: activeHomeItem.heroImageUrl,
      attachments: activeHomeItem.attachments,
    })
  }, [activeHomeItem])

  const phonePreviewUrls = useMemo(() => {
    if (draftImageUrls.length > 0) {
      return draftImageUrls
    }
    return activeGalleryUrls
  }, [draftImageUrls, activeGalleryUrls])

  const validateImageFile = useCallback((file: File): string | null => validateCustomerNewsAllImage(file), [])

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

  const handleApply = async () => {
    if (!token?.trim()) {
      return
    }
    const nextTitle = title.trim()
    const nextBody = description.trim()
    if (!nextBody) {
      setError('설명을 입력해 주세요.')
      return
    }
    const blocked = attachments.find((item) => item.status === 'failed')
    if (blocked) {
      setError('실패한 이미지 항목을 삭제한 뒤 다시 시도해 주세요.')
      return
    }

    setActionBusy(true)
    setError('')
    setResult('')
    try {
      const uploaded: AllNewsAttachmentDraft[] = []
      for (const item of attachments) {
        if (item.kind !== 'image') {
          continue
        }
        if (item.status === 'completed' && item.cdnUrl) {
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

      const imagePayload = uploaded
        .filter((item) => item.kind === 'image' && item.cdnUrl)
        .map((item, index) => ({
          kind: 'image' as const,
          url: item.cdnUrl ?? '',
          objectKey: item.objectKey,
          fileName: item.file.name || `news-image-${index + 1}`,
          mimeType: item.mimeType ?? item.file.type,
          size: item.sizeBytes ?? item.file.size,
          sortOrder: index,
        }))

      const editingId = activeHomeItem?.id?.trim()
      if (editingId) {
        await updateCustomerNews(token, editingId, {
          title: nextTitle || '고객 메시지',
          content: nextBody,
          sendPush: true,
          attachments: imagePayload,
        })
      } else {
        await createCustomerNews(token, {
          title: nextTitle || '고객 메시지',
          content: nextBody,
          scope: 'all',
          targetCustomerId: null,
          sendPush: true,
          attachments: imagePayload,
        })
      }

      draftSourceRef.current = ''
      attachments.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
      setAttachments([])
      await loadHistory()
      setResult('고객앱 홈에 반영되었습니다.')
    } catch (applyErr) {
      setError(applyErr instanceof Error ? applyErr.message : '적용에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDeleteActiveHome = async () => {
    if (!token?.trim() || !activeHomeItem) {
      return
    }
    if (
      !window.confirm(
        '고객앱 홈에 표시 중인 메시지·이미지를 삭제할까요? 저장소에 올린 파일도 정리합니다.',
      )
    ) {
      return
    }
    setDeleteBusy(true)
    setError('')
    setResult('')
    try {
      await deleteCustomerNews(token, activeHomeItem.id)
      try {
        await deleteAllNewsSourceFiles(token, activeHomeItem)
      } catch {
        // 스토리지 정리 실패 시에도 게시글 삭제 결과는 유지
      }
      draftSourceRef.current = ''
      setAttachments([])
      await loadHistory()
      setResult('고객앱 홈 메시지를 삭제했습니다.')
    } catch (delErr) {
      setError(delErr instanceof Error ? delErr.message : '삭제에 실패했습니다.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <ClaimRequestsPagePCView>
      <section className="claim-requests-all-news-pc insurer-news-page">
        <StatusMessage message={error} tone="error" />
        <div className="customer-news-all-layout claim-requests-all-news-pc__layout">
          <CustomerAppNewsPhonePreview
            agentName={user?.displayName?.trim() || '담당 설계사'}
            agentPhoneRaw={agentMePhone}
            imageUrls={phonePreviewUrls}
            showHomeChrome
          />
          <div className="customer-news-all-layout__main claim-requests-all-news-pc__main">
            <header className="page-header claim-requests-all-news-pc__header">
              <h2>고객앱 홈 슬라이드</h2>
              <p className="claim-requests-all-news-pc__lede insurer-news-muted">
                수정 중인 홈 슬라이드 세트 1개입니다. 제목·설명·이미지를 바꾼 뒤 저장하면 같은 세트가 고객앱 홈에
                반영됩니다.
              </p>
            </header>

            {loading ? <p className="insurer-news-muted claim-requests-all-news-pc__loading">불러오는 중…</p> : null}

            <form
              className="auth-card card claim-requests-all-news-pc__form"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="field">
                <span className="field__label">제목</span>
                <FormInput
                  className="admin-form-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="고객에게 보일 제목(선택)"
                />
              </label>
              <label className="field">
                <span className="field__label">설명</span>
                <FormTextarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={8}
                  className="admin-form-input"
                  style={{ height: 'auto', minHeight: 160, paddingTop: 12, paddingBottom: 12 }}
                  placeholder="고객에게 전달할 내용을 입력하세요."
                />
              </label>
              <div className="field">
                <span className="field__label">이미지</span>
                <FileUploader
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  validateFile={validateImageFile}
                  onFiles={handleFilesSelected}
                  disabled={actionBusy}
                  primaryHint="여러 장을 한 세트로 올릴 수 있습니다. 드래그하거나 클릭하여 선택하세요."
                  hintLines={['고객앱 홈에서 세트 전체가 슬라이드로 표시됩니다.', 'JPG · PNG · WEBP · GIF (각 최대 10MB)']}
                />
                <ul className="claim-requests-all-news-pc__file-list" aria-label="이 세트 이미지 목록">
                  {attachments.map((row) => (
                    <li key={row.localId} className="claim-requests-all-news-pc__file-row">
                      <span className="claim-requests-all-news-pc__file-name">{row.file.name || '(이름 없음)'}</span>
                      <span
                        className={`claim-requests-all-news-pc__file-status${
                          row.status === 'failed' ? ' claim-requests-all-news-pc__file-status--err' : ''
                        }`}
                      >
                        {ATTACHMENT_STATUS_LABEL[row.status] ?? row.status}
                        {row.errorMessage ? ` — ${row.errorMessage}` : ''}
                      </span>
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        className="button button--secondary"
                        onClick={() => handleRemoveAttachment(row.localId)}
                        disabled={actionBusy}
                      >
                        제거
                      </FormButton>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="claim-requests-all-news-pc__form-actions">
                <FormButton
                  htmlType="button"
                  variant="primary"
                  onClick={() => void handleApply()}
                  loading={actionBusy}
                >
                  고객앱에 적용
                </FormButton>
                {activeHomeItem ? (
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    onClick={() => void handleDeleteActiveHome()}
                    loading={deleteBusy}
                    disabled={actionBusy}
                  >
                    홈 슬라이드 전체 삭제
                  </FormButton>
                ) : null}
              </div>
            </form>

            {result ? (
              <p className="claim-requests-all-news-pc__result text-xs text-[var(--text-secondary)]">{result}</p>
            ) : null}
          </div>
        </div>
      </section>
    </ClaimRequestsPagePCView>
  )
}
