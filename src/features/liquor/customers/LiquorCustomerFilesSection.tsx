import { useMemo, useRef, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import {
  deleteLiquorCustomerFile,
  getLiquorCustomerFileDownloadUrl,
  mapLiquorCustomerFile,
  uploadLiquorCustomerFile,
  type LiquorCustomerFile,
  type LiquorFileLinkTarget,
} from './liquorCustomerFileClient'
import {
  LIQUOR_DOCUMENT_KIND_LABELS,
  LIQUOR_FILE_LINK_TARGET_LABELS,
  LIQUOR_FILE_LINK_TARGET_OPTIONS,
} from './liquorCustomerUi'

type Props = {
  customerId: number
  token: string
  files: Array<Record<string, unknown>>
  contracts: Array<Record<string, unknown>>
  repayments: Array<Record<string, unknown>>
  supportItems: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(raw: string): string {
  if (!raw) return '—'
  return raw.slice(0, 16).replace('T', ' ')
}

function linkTargetLabel(file: LiquorCustomerFile): string {
  if (file.supportContractId) return `${LIQUOR_FILE_LINK_TARGET_LABELS.support_contract} #${file.supportContractId}`
  if (file.repaymentId) return `${LIQUOR_FILE_LINK_TARGET_LABELS.repayment} #${file.repaymentId}`
  if (file.supportItemId) return `${LIQUOR_FILE_LINK_TARGET_LABELS.support_item} #${file.supportItemId}`
  return LIQUOR_FILE_LINK_TARGET_LABELS.customer
}

export function LiquorCustomerFilesSection({
  customerId,
  token,
  files,
  contracts,
  repayments,
  supportItems,
  onChanged,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mapped = useMemo(() => files.map(mapLiquorCustomerFile), [files])

  const [documentKind, setDocumentKind] = useState('other')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [linkTarget, setLinkTarget] = useState<LiquorFileLinkTarget>('customer')
  const [targetId, setTargetId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const targetOptions = useMemo(() => {
    if (linkTarget === 'support_contract') {
      return contracts.map((c) => ({
        id: Number(c.id),
        label: String(c.contract_name ?? c.contractName ?? `계약 #${c.id}`),
      }))
    }
    if (linkTarget === 'repayment') {
      return repayments.map((r) => ({
        id: Number(r.id),
        label: `상환 #${r.id} · ${String(r.repaid_on ?? r.repaidOn ?? '').slice(0, 10)} · ${Number(r.amount ?? 0).toLocaleString('ko-KR')}원`,
      }))
    }
    if (linkTarget === 'support_item') {
      return supportItems.map((i) => ({
        id: Number(i.id),
        label: String(i.model_name ?? i.modelName ?? `물품 #${i.id}`),
      }))
    }
    return []
  }, [linkTarget, contracts, repayments, supportItems])

  const resetForm = () => {
    setTitle('')
    setMemo('')
    setSelectedFile(null)
    setTargetId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ tone: 'err', text: '업로드할 파일을 선택해 주세요.' })
      return
    }
    if (['support_contract', 'repayment', 'support_item'].includes(linkTarget) && !targetId) {
      setMessage({ tone: 'err', text: '연결 대상을 선택해 주세요.' })
      return
    }
    setUploading(true)
    setMessage(null)
    setProgress('업로드 중…')
    try {
      await uploadLiquorCustomerFile(
        token,
        customerId,
        selectedFile,
        {
          documentKind,
          title: title.trim(),
          memo: memo.trim(),
          linkTarget,
          targetId: targetId ? Number(targetId) : null,
        },
        setProgress,
      )
      setMessage({ tone: 'ok', text: '첨부문서가 등록되었습니다.' })
      resetForm()
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '업로드에 실패했습니다.' })
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  const handleOpen = async (file: LiquorCustomerFile) => {
    setOpeningId(file.id)
    setMessage(null)
    try {
      const { downloadUrl } = await getLiquorCustomerFileDownloadUrl(token, customerId, file.id)
      if (!downloadUrl) throw new Error('다운로드 URL을 받지 못했습니다.')
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '파일 열람에 실패했습니다.' })
    } finally {
      setOpeningId(null)
    }
  }

  const handleDelete = async (file: LiquorCustomerFile) => {
    const label = file.title.trim() || file.fileName || '이 첨부문서'
    const ok = await confirm({
      title: '첨부문서 삭제',
      message: `${label}을(를) 삭제할까요? 삭제 후에는 복구할 수 없습니다.`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(file.id)
    setMessage(null)
    try {
      await deleteLiquorCustomerFile(token, customerId, file.id)
      setMessage({ tone: 'ok', text: '첨부문서가 삭제되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '삭제에 실패했습니다.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="liquor-customer-panel__section">
      {confirmDialog}
      {message ? (
        <p
          className={
            message.tone === 'ok'
              ? 'liquor-customer-file__msg liquor-customer-file__msg--ok'
              : 'liquor-customer-file__msg liquor-customer-file__msg--err'
          }
        >
          {message.text}
        </p>
      ) : null}

      <ul className="liquor-customer-file__list">
        {mapped.map((f) => (
          <li key={f.id} className="liquor-customer-file">
            <div className="liquor-customer-file__header">
              <div className="liquor-customer-file__summary">
                <span className="liquor-customer-file__kind">
                  {LIQUOR_DOCUMENT_KIND_LABELS[f.documentKind] ?? f.documentKind}
                </span>
                <span className="liquor-customer-file__title">{f.title.trim() || f.fileName || '(제목 없음)'}</span>
                <span className="liquor-customer-file__meta">
                  {f.fileName} · {formatFileSize(f.fileSize)} · {linkTargetLabel(f)}
                </span>
                <span className="liquor-customer-file__meta">
                  {formatDateTime(f.createdAt)}
                  {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
                </span>
                {f.memo.trim() ? <span className="liquor-customer-file__memo">{f.memo.trim()}</span> : null}
              </div>
              <div className="liquor-customer-file__toolbar">
                <FormButton type="button" disabled={openingId === f.id} onClick={() => void handleOpen(f)}>
                  {openingId === f.id ? '열기 중…' : '열람/다운로드'}
                </FormButton>
                <FormButton type="button" disabled={deletingId === f.id} onClick={() => void handleDelete(f)}>
                  {deletingId === f.id ? '삭제 중…' : '삭제'}
                </FormButton>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {mapped.length === 0 ? <p className="liquor-customer-panel__muted">등록된 첨부문서가 없습니다.</p> : null}

      <div className="liquor-customer-file__upload">
        <h3 className="liquor-customer-file__upload-title">첨부문서 업로드</h3>
        <div className="liquor-customer-form-grid">
          <label className="liquor-customer-file__field">
            문서 종류
            <FormSelect value={documentKind} onChange={(e) => setDocumentKind(e.target.value)}>
              {Object.entries(LIQUOR_DOCUMENT_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="liquor-customer-file__field">
            연결 대상
            <FormSelect
              value={linkTarget}
              onChange={(e) => {
                setLinkTarget(e.target.value as LiquorFileLinkTarget)
                setTargetId('')
              }}
            >
              {LIQUOR_FILE_LINK_TARGET_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {LIQUOR_FILE_LINK_TARGET_LABELS[value]}
                </option>
              ))}
            </FormSelect>
          </label>
          {['support_contract', 'repayment', 'support_item'].includes(linkTarget) ? (
            <label className="liquor-customer-file__field liquor-customer-file__field--wide">
              {LIQUOR_FILE_LINK_TARGET_LABELS[linkTarget]} 선택
              <FormSelect value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">선택</option>
                {targetOptions.map((opt) => (
                  <option key={opt.id} value={String(opt.id)}>
                    {opt.label}
                  </option>
                ))}
              </FormSelect>
            </label>
          ) : null}
          <label className="liquor-customer-file__field">
            제목
            <FormInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="문서 제목" />
          </label>
          <label className="liquor-customer-file__field liquor-customer-file__field--wide">
            설명
            <FormTextarea value={memo} rows={2} onChange={(e) => setMemo(e.target.value)} placeholder="설명 (선택)" />
          </label>
          <label className="liquor-customer-file__field liquor-customer-file__field--wide">
            파일
            <FormInput
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <span className="liquor-customer-panel__muted">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </span>
            ) : null}
          </label>
        </div>
        {progress ? <p className="liquor-customer-panel__muted">{progress}</p> : null}
        <div className="liquor-customer-file__actions">
          <FormButton type="button" disabled={uploading} onClick={() => void handleUpload()}>
            {uploading ? '업로드 중…' : '업로드'}
          </FormButton>
        </div>
      </div>
    </div>
  )
}
