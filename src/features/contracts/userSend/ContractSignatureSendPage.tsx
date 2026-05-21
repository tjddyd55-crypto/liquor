/**
 * 전자서명 발송 — USER / GA_STAFF. 관리자 템플릿은 /admin/contract-signatures 에서만 관리.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ReactElement, type KeyboardEvent, type ChangeEventHandler } from 'react'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import '../../pdf-engine/pdf-engine.css'
import '../testConsole/contract-signature-console.css'
import './contract-signature-send-mobile.css'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import { EvidenceStatusPanel } from '../testConsole/components/EvidenceStatusPanel'
import { SendSessionPanel } from '../testConsole/components/SendSessionPanel'
import type { CreateSendSessionResult, SendSessionDetail } from '../testConsole/contractSignatureTestConsoleClient'
import {
  createUserContractSendSession,
  getUserContractSendSessionDetail,
  listUserContractTemplates,
  listUserContractTemplateConfirmationFields,
  getContractCustomerSearchValidationMessage,
  searchCustomersForContractSend,
  CONTRACT_SEND_CONFIRMATION_MAX_ITEMS,
  CONTRACT_SEND_CONFIRMATION_MAX_LABEL_LEN,
  CONTRACT_SEND_ATTACHMENTS_MAX,
  uploadUserContractSendAttachment,
  type UserContractCustomerSearchHit,
  type UserContractTemplateItem,
  type UserContractConfirmationFieldRow,
} from './contractSignatureSendClient'
import { SendAttachmentFileInput } from './SendAttachmentFileInput'
import { ConfirmationOnlySendFieldsSection } from './ConfirmationOnlySendFieldsSection'

/**
 * 모바일 발송 단계에서 초록색(contract-mobile-step--completed)은
 * 「현재 선택한 고객·템플릿으로 이미 만들어진 발송 세션」에만 붙어야 한다.
 * 세션 id만 보고 완료 처리하면 이전 맥락 세션이 남아 3·4단계가 전부 완료로 보인다.
 */
function contractSendSessionDetailMatchesPick(
  detail: SendSessionDetail | null,
  customerId: number | undefined,
  templateId: string | null,
): boolean {
  if (!detail || customerId == null || templateId == null || templateId === '') {
    return false
  }
  if (detail.customerId !== customerId) {
    return false
  }
  return detail.documents.some((d) => d.templateId === templateId)
}

const MOBILE_FLOW_MQ = '(max-width: 768px)'

const ATTACHMENT_FILE_ACCEPT = '.pdf,image/jpeg,image/png,image/webp,application/pdf'

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

const ALLOWED_ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

function sniffContractSendAttachmentMime(file: File): string {
  const raw = (file.type || '').trim().toLowerCase()
  if (raw) {
    return raw
  }
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (n.endsWith('.png')) {
    return 'image/png'
  }
  if (n.endsWith('.webp')) {
    return 'image/webp'
  }
  return ''
}

function validateContractSendAttachmentFile(file: File): { ok: true; mime: string } | { ok: false; message: string } {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: '첨부파일은 파일당 최대 20MB까지 업로드할 수 있습니다.' }
  }
  const mime = sniffContractSendAttachmentMime(file)
  if (!ALLOWED_ATTACHMENT_MIMES.has(mime)) {
    return { ok: false, message: 'PDF 또는 이미지 파일만 첨부할 수 있습니다.' }
  }
  return { ok: true, mime }
}

function mapAttachmentUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) {
      return '첨부파일은 파일당 최대 20MB까지 업로드할 수 있습니다.'
    }
    const m = err.message.trim()
    if (/너무 큽|20\s*MB|413/i.test(m)) {
      return '첨부파일은 파일당 최대 20MB까지 업로드할 수 있습니다.'
    }
    if (/pdf|이미지|mime|형식|invalid|허용/i.test(m) || err.code === 'attachment_file_invalid') {
      return 'PDF 또는 이미지 파일만 첨부할 수 있습니다.'
    }
    if (m) {
      return '첨부파일 업로드에 실패했습니다. 다시 시도해 주세요.'
    }
  }
  return '첨부파일 업로드에 실패했습니다. 다시 시도해 주세요.'
}

function runPickRowKeyboardAction(e: KeyboardEvent, run: () => void) {
  if (e.key !== 'Enter' && e.key !== ' ') {
    return
  }
  e.preventDefault()
  run()
}

function validateConfirmationOnlyFieldValues(
  fields: UserContractConfirmationFieldRow[],
  values: Record<string, string>,
): string | null {
  for (const f of fields) {
    if (f.inputRole !== 'sender') {
      continue
    }
    if (!f.required) {
      continue
    }
    const raw = values[f.fieldKey]
    if (raw == null || String(raw).trim() === '') {
      return `「${f.label}」항목은 필수입니다.`
    }
  }
  return null
}

type SendAttachmentDraftUploadStatus = 'uploading' | 'done' | 'error'

type SendAttachmentDraftRow = {
  key: string
  fileId: string
  displayFilename: string
  mimeType: string
  sizeBytes: number
  required: boolean
  uploadStatus: SendAttachmentDraftUploadStatus
  error?: string | null
}

function formatAttachmentBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—'
  }
  if (n < 1024) {
    return `${Math.round(n)}B`
  }
  if (n < 1024 * 1024) {
    const kb = n / 1024
    return `${kb >= 10240 ? Math.round(kb).toString() : kb.toFixed(1)}KB`
  }
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

function attachmentKindLabel(mime: string): string {
  const m = (mime || '').toLowerCase()
  if (m.includes('pdf')) {
    return 'PDF'
  }
  if (m.startsWith('image/')) {
    return '이미지'
  }
  return '파일'
}

function mobileStepShell(
  opts: {
    title: string
    desc?: string | null
    active: boolean
    completed: boolean
    locked: boolean
  },
  children: ReactNode,
): ReactElement {
  const { title, desc, active, completed, locked } = opts
  /* locked이면 진행 중/완료 배지·스타일이 동시에 켜지지 않도록 active를 잠긴다 */
  const visualActive = active && !locked
  const visualCompleted = completed && !visualActive

  const cls = [
    'contract-mobile-step',
    locked ? 'contract-mobile-step--locked' : '',
    visualCompleted ? 'contract-mobile-step--completed' : '',
    visualActive ? 'contract-mobile-step--active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const badgeCls = visualCompleted
    ? 'contract-mobile-step__badge contract-mobile-step__badge--done'
    : visualActive
      ? 'contract-mobile-step__badge contract-mobile-step__badge--active'
      : 'contract-mobile-step__badge contract-mobile-step__badge--locked'

  const badgeText = visualCompleted ? '완료' : visualActive ? '진행 중' : '대기'

  return (
    <section className={cls}>
      <div className="contract-mobile-step__head">
        <h2 className="contract-mobile-step__title">{title}</h2>
        <span className={badgeCls}>{badgeText}</span>
      </div>
      {desc ? <p className="contract-mobile-step__desc">{desc}</p> : null}
      {children}
    </section>
  )
}

export default function ContractSignatureSendPage() {
  const { token } = useAuth()
  const t = token?.trim() ?? ''
  const isMobileFlow = useMediaQuery(MOBILE_FLOW_MQ)
  const customerSearchInputRef = useRef<HTMLInputElement>(null)

  const [bootError, setBootError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<UserContractTemplateItem[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerHits, setCustomerHits] = useState<UserContractCustomerSearchHit[]>([])
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false)
  const [customerSearchExecuted, setCustomerSearchExecuted] = useState(false)
  const [customerSearchValidationError, setCustomerSearchValidationError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<UserContractCustomerSearchHit | null>(null)

  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<CreateSendSessionResult | null>(null)
  const [sessionDetail, setSessionDetail] = useState<SendSessionDetail | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [senderVals, setSenderVals] = useState<Record<string, string | boolean>>({})
  const [confirmationDrafts, setConfirmationDrafts] = useState<{ key: string; label: string }[]>([])
  const [attachmentDrafts, setAttachmentDrafts] = useState<SendAttachmentDraftRow[]>([])
  const [attachmentUploadBusy, setAttachmentUploadBusy] = useState(false)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)

  const [confirmationTemplateFields, setConfirmationTemplateFields] = useState<UserContractConfirmationFieldRow[]>([])
  const [confirmationFieldsLoading, setConfirmationFieldsLoading] = useState(false)
  const [confirmationFieldsError, setConfirmationFieldsError] = useState<string | null>(null)
  const [confirmationFieldValues, setConfirmationFieldValues] = useState<Record<string, string>>({})

  useEffect(() => {
    setAttachmentDrafts([])
  }, [selectedCustomer?.id])

  /**
   * 고객·템플릿이 바뀌면 이전 발송 세션 상태는 무효다.
   * 확인서(confirmation_only) 발송 후 좌표형 계약서 템플릿으로 바꿀 때 등에
   * sessionDetail/lastCreated 가 남아 3·4단계가 완료/초록으로 보이는 회귀를 막는다.
   */
  useEffect(() => {
    setLastCreated(null)
    setSessionDetail(null)
    setSendError(null)
    setSendBusy(false)
    setEvidenceLoading(false)
  }, [selectedCustomer?.id, selectedTemplateId])

  const reloadTemplates = useCallback(async () => {
    if (!t) {
      return
    }
    setBootError(null)
    try {
      const list = await listUserContractTemplates(t)
      setTemplates(list)
    } catch (e) {
      setBootError(e instanceof ApiError ? e.message : '템플릿 목록을 불러오지 못했습니다.')
    }
  }, [t])

  useEffect(() => {
    void reloadTemplates()
  }, [reloadTemplates])

  const executeCustomerSearch = useCallback(async () => {
    if (!t) {
      return
    }
    const rawFromDom = customerSearchInputRef.current?.value
    const effectiveQuery = typeof rawFromDom === 'string' ? rawFromDom : customerQuery
    const validationMsg = getContractCustomerSearchValidationMessage(effectiveQuery)
    if (validationMsg) {
      setCustomerSearchValidationError(validationMsg)
      setCustomerHits([])
      setCustomerSearchExecuted(false)
      if (effectiveQuery !== customerQuery) {
        setCustomerQuery(effectiveQuery)
      }
      return
    }
    const trimmed = effectiveQuery.trim()
    if (trimmed !== customerQuery) {
      setCustomerQuery(trimmed)
    }
    setCustomerSearchValidationError(null)
    setCustomerSearchBusy(true)
    try {
      const hits = await searchCustomersForContractSend(t, trimmed)
      setCustomerHits(hits)
      setCustomerSearchExecuted(true)
    } catch (e) {
      setCustomerHits([])
      setCustomerSearchExecuted(true)
      setCustomerSearchValidationError(e instanceof ApiError ? e.message : '고객 검색 중 오류가 발생했습니다.')
    } finally {
      setCustomerSearchBusy(false)
    }
  }, [t, customerQuery])

  const clearCustomerSelection = useCallback(() => {
    setSelectedCustomer(null)
  }, [])

  const focusSearchAndClearCustomer = useCallback(() => {
    setSelectedCustomer(null)
    customerSearchInputRef.current?.focus()
  }, [])

  /** 모바일: 다른 고객 검색 — 선택·결과·검색어 초기화 후 입력 포커스 */
  const resetMobileCustomerSearchFlow = useCallback(() => {
    setSelectedCustomer(null)
    setCustomerHits([])
    setCustomerSearchExecuted(false)
    setCustomerQuery('')
    setCustomerSearchValidationError(null)
    window.setTimeout(() => customerSearchInputRef.current?.focus(), 0)
  }, [])

  const refreshSessionDetail = useCallback(async () => {
    const sid = sessionDetail?.id ?? lastCreated?.id
    if (!t || !sid) {
      return
    }
    setEvidenceLoading(true)
    try {
      const next = await getUserContractSendSessionDetail(t, sid)
      setSessionDetail(next)
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : '세션 상태를 불러오지 못했습니다.')
    } finally {
      setEvidenceLoading(false)
    }
  }, [t, sessionDetail?.id, lastCreated?.id])

  useEffect(() => {
    setSenderVals({})
    setConfirmationDrafts([])
    setAttachmentDrafts([])
  }, [selectedTemplateId])

  useEffect(() => {
    if (!t || !selectedTemplateId) {
      setConfirmationTemplateFields([])
      setConfirmationFieldValues({})
      setConfirmationFieldsError(null)
      setConfirmationFieldsLoading(false)
      return
    }
    const tpl = templates.find((x) => x.id === selectedTemplateId)
    if (!tpl || tpl.templateMode !== 'confirmation_only') {
      setConfirmationTemplateFields([])
      setConfirmationFieldValues({})
      setConfirmationFieldsError(null)
      setConfirmationFieldsLoading(false)
      return
    }
    let cancelled = false
    setConfirmationFieldsLoading(true)
    setConfirmationFieldsError(null)
    void listUserContractTemplateConfirmationFields(t, selectedTemplateId)
      .then((rows) => {
        if (cancelled) {
          return
        }
        setConfirmationTemplateFields(rows)
        setConfirmationFieldValues((prev) => {
          const next: Record<string, string> = {}
          for (const f of rows) {
            next[f.fieldKey] = prev[f.fieldKey] ?? ''
          }
          return next
        })
      })
      .catch((e) => {
        if (cancelled) {
          return
        }
        setConfirmationTemplateFields([])
        setConfirmationFieldsError(e instanceof ApiError ? e.message : '확인 항목을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) {
          setConfirmationFieldsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [t, selectedTemplateId, templates])

  const senderPrefillSatisfied = (tpl: UserContractTemplateItem | null | undefined): boolean => {
    const defs = tpl?.senderFieldsForSend
    if (!defs || defs.length === 0) {
      return true
    }
    for (const d of defs) {
      if (!d.required) {
        continue
      }
      const v = senderVals[d.fieldKey]
      if (d.fieldType === 'checkbox') {
        if (!v) {
          return false
        }
        continue
      }
      if (String(v ?? '').trim() === '') {
        return false
      }
    }
    return true
  }

  const confirmationDraftValidationMessage = (() => {
    if (confirmationDrafts.length === 0) {
      return null
    }
    if (confirmationDrafts.length > CONTRACT_SEND_CONFIRMATION_MAX_ITEMS) {
      return `확인 항목은 최대 ${CONTRACT_SEND_CONFIRMATION_MAX_ITEMS}개까지 추가할 수 있습니다.`
    }
    const nonEmpty = confirmationDrafts.filter((d) => d.label.trim() !== '')
    if (nonEmpty.length !== confirmationDrafts.length) {
      return '확인 항목 문구를 모두 입력하거나 빈 행을 삭제해 주세요.'
    }
    const lower = nonEmpty.map((d) => d.label.trim().toLowerCase())
    if (new Set(lower).size !== lower.length) {
      return '중복된 확인 문구가 있습니다.'
    }
    for (const d of nonEmpty) {
      if (d.label.trim().length > CONTRACT_SEND_CONFIRMATION_MAX_LABEL_LEN) {
        return `확인 항목 문구는 ${CONTRACT_SEND_CONFIRMATION_MAX_LABEL_LEN}자 이내입니다.`
      }
    }
    return null
  })()

  const selectedTpl = templates.find((x) => x.id === selectedTemplateId)
  const confirmationOnlySelected = selectedTpl?.templateMode === 'confirmation_only'
  const confirmationSenderTemplateFields = useMemo(
    () => confirmationTemplateFields.filter((f) => f.inputRole === 'sender'),
    [confirmationTemplateFields],
  )
  const confirmationOnlyValuesMessage =
    confirmationOnlySelected && confirmationTemplateFields.length > 0
      ? validateConfirmationOnlyFieldValues(confirmationTemplateFields, confirmationFieldValues)
      : null

  /** confirmation_only 발송 API용(6단계에서 버튼 활성화 시 그대로 전달). 좌표형은 undefined. */
  const confirmationFieldValuesPayload = useMemo((): Record<string, string> | undefined => {
    if (!confirmationOnlySelected || confirmationSenderTemplateFields.length === 0) {
      return undefined
    }
    return Object.fromEntries(
      confirmationSenderTemplateFields.map((f) => [
        f.fieldKey,
        confirmationFieldValues[f.fieldKey] == null ? '' : String(confirmationFieldValues[f.fieldKey]),
      ]),
    )
  }, [confirmationOnlySelected, confirmationSenderTemplateFields, confirmationFieldValues])

  const canSend =
    Boolean(selectedTemplateId) &&
    selectedTpl != null &&
    selectedCustomer != null &&
    selectedCustomer.hasPhone &&
    String(selectedTpl.status) === 'active' &&
    senderPrefillSatisfied(selectedTpl) &&
    confirmationDraftValidationMessage == null &&
    (confirmationOnlySelected
      ? confirmationTemplateFields.length > 0 && confirmationOnlyValuesMessage == null
      : true)

  const attachmentPipelineBlocksSend =
    attachmentUploadBusy ||
    attachmentDrafts.some((a) => a.uploadStatus === 'uploading' || a.uploadStatus === 'error')

  const effectiveCanSend = canSend && !attachmentPipelineBlocksSend

  const attachmentSendBlockHint = (() => {
    if (!attachmentPipelineBlocksSend) {
      return null
    }
    const hasUploading =
      attachmentUploadBusy || attachmentDrafts.some((a) => a.uploadStatus === 'uploading')
    if (hasUploading) {
      return '첨부파일 업로드가 완료된 뒤 발송할 수 있습니다.'
    }
    return '업로드 실패한 첨부파일을 삭제하거나 다시 추가해 주세요.'
  })()

  const onCreateSendSession = async () => {
    if (!t || !selectedTemplateId || !selectedCustomer?.hasPhone) {
      return
    }
    setSendBusy(true)
    setSendError(null)
    try {
      const senderDefs = selectedTpl?.senderFieldsForSend ?? []
      const senderInputValues =
        senderDefs.length > 0
          ? Object.fromEntries(
              senderDefs.map((d) => {
                const raw = senderVals[d.fieldKey]
                if (d.fieldType === 'checkbox') {
                  return [d.fieldKey, Boolean(raw)]
                }
                return [d.fieldKey, raw == null ? '' : String(raw)]
              }),
            )
          : undefined
      const readyAttachments = attachmentDrafts.filter(
        (a) => a.uploadStatus === 'done' && String(a.fileId).trim() !== '',
      )
      const created = await createUserContractSendSession(t, {
        customerId: selectedCustomer.id,
        templateIds: [selectedTemplateId],
        senderInputValues,
        confirmationFieldValues: confirmationFieldValuesPayload,
        confirmationItems:
          confirmationDrafts.length > 0
            ? confirmationDrafts.map((d) => ({ label: d.label.trim(), required: true as const }))
            : undefined,
        attachments:
          readyAttachments.length > 0
            ? readyAttachments.map((a) => ({ fileId: a.fileId, required: a.required }))
            : undefined,
      })
      setLastCreated(created)
      const next = await getUserContractSendSessionDetail(t, created.id)
      setSessionDetail(next)
      setAttachmentDrafts([])
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : '발송 세션 생성에 실패했습니다.')
    } finally {
      setSendBusy(false)
    }
  }

  const inactiveTemplateHint =
    selectedTpl != null && String(selectedTpl.status) !== 'active' ? 'active 템플릿만 발송할 수 있습니다.' : null

  const sendSessionPanelHint =
    attachmentSendBlockHint ||
    (selectedCustomer == null
      ? '고객을 먼저 선택해 주세요.'
      : inactiveTemplateHint ||
        (!senderPrefillSatisfied(selectedTpl ?? undefined) ? '발송 전 입력값의 필수 항목을 모두 채워 주세요.' : null) ||
        confirmationDraftValidationMessage ||
        (confirmationOnlySelected
          ? confirmationTemplateFields.length === 0
            ? '이 템플릿에 등록된 확인서 항목이 없어 발송할 수 없습니다. 관리자 화면에서 항목을 추가해 주세요.'
            : '무좌표 전자확인서는 공개 링크에서 내용 확인까지 지원합니다. 고객 전자서명·최종 완료는 이후 단계에서 제공됩니다.'
          : null) ||
        (selectedCustomer != null && !selectedCustomer.hasPhone
          ? '선택한 고객에 유효한 휴대폰번호가 없습니다.'
          : null) ||
        (selectedTemplateId == null ? '전자서명 템플릿을 선택해 주세요.' : null))

  const scopedSendSessionDetail = useMemo((): SendSessionDetail | null => {
    if (!contractSendSessionDetailMatchesPick(sessionDetail, selectedCustomer?.id, selectedTemplateId)) {
      return null
    }
    return sessionDetail
  }, [sessionDetail, selectedCustomer?.id, selectedTemplateId])

  const scopedLastCreated = useMemo((): CreateSendSessionResult | null => {
    if (!lastCreated || !scopedSendSessionDetail) {
      return null
    }
    if (lastCreated.id !== scopedSendSessionDetail.id) {
      return null
    }
    if (lastCreated.customerId !== scopedSendSessionDetail.customerId) {
      return null
    }
    return lastCreated
  }, [lastCreated, scopedSendSessionDetail])

  const step1Complete = Boolean(selectedCustomer)
  /** 모바일 «2. 템플릿»·데스크톱 공통: 템플릿 선택 + active + 휴대폰 유효 */
  const templatePickComplete = Boolean(
    selectedTemplateId &&
      selectedTpl != null &&
      String(selectedTpl.status) === 'active' &&
      selectedCustomer?.hasPhone,
  )
  const step2Complete = templatePickComplete

  /** 좌표형에서만 confirmationDrafts 로 «고객 확인 문구» 단계가 생긴다. 행이 0이면 스킵. */
  const customerConfirmDraftsApply = Boolean(
    selectedCustomer &&
      selectedTemplateId &&
      selectedTpl &&
      selectedTpl.templateMode !== 'confirmation_only' &&
      confirmationDrafts.length > 0,
  )
  const customerConfirmDraftsStepSkipped = !customerConfirmDraftsApply
  const customerConfirmDraftsStepComplete =
    !customerConfirmDraftsApply || confirmationDraftValidationMessage == null

  const confirmationOnlyReady =
    !confirmationOnlySelected ||
    (confirmationTemplateFields.length > 0 &&
      confirmationOnlyValuesMessage == null &&
      !confirmationFieldsLoading &&
      !confirmationFieldsError)

  const senderPrereqBlocked =
    (selectedTpl?.senderFieldsForSend ?? []).length > 0 && !senderPrefillSatisfied(selectedTpl ?? undefined)

  const currentSendSessionCreated = Boolean(scopedSendSessionDetail)

  /** 첨부는 선택 사항 — 업로드 진행/실패로 발송이 막힐 때만 단계 카드가 진행 중으로 표시 */
  const attachmentStepActive =
    !currentSendSessionCreated &&
    Boolean(selectedCustomer) &&
    Boolean(selectedTemplateId) &&
    attachmentPipelineBlocksSend

  const step3Ready =
    step1Complete &&
    templatePickComplete &&
    (customerConfirmDraftsStepSkipped || customerConfirmDraftsStepComplete) &&
    confirmationOnlyReady &&
    !senderPrereqBlocked &&
    !attachmentPipelineBlocksSend

  /** 하위 호환: numbered «3. 발송 세션» 완료 = 현재 맥락 세션 생성됨 */
  const step3Complete = currentSendSessionCreated

  const step1Active = !step1Complete
  const step2Active = step1Complete && !templatePickComplete
  /** 3단계: 준비가 끝났고 아직 세션이 없을 때만 진행 중 */
  const step3Active = step3Ready && !currentSendSessionCreated
  /** 4단계: 세션 생성 후에만 진행 중(3과 동시 active 금지) */
  const step4Active = currentSendSessionCreated

  const processPickedAttachmentFiles = async (files: File[]) => {
    if (files.length === 0) {
      return
    }
    setSendError(null)

    if (!t.trim()) {
      setSendError('로그인 후 다시 시도해 주세요.')
      return
    }
    if (!selectedCustomer) {
      setSendError('고객을 선택한 뒤 첨부파일을 추가할 수 있습니다.')
      return
    }
    if (!selectedTemplateId) {
      setSendError('전자서명 템플릿을 선택한 뒤 첨부파일을 추가할 수 있습니다.')
      return
    }

    for (const file of files) {
      const checked = validateContractSendAttachmentFile(file)
      if (!checked.ok) {
        if (import.meta.env.DEV) {
          console.warn('[contract attachments] validation failed', {
            name: file.name,
            message: checked.message,
          })
        }
        setAttachmentDrafts((prev) => {
          if (prev.length >= CONTRACT_SEND_ATTACHMENTS_MAX) {
            return prev
          }
          return [
            ...prev,
            {
              key: `att_${crypto.randomUUID()}`,
              fileId: '',
              displayFilename: file.name,
              mimeType: sniffContractSendAttachmentMime(file) || file.type || 'application/octet-stream',
              sizeBytes: file.size,
              required: true,
              uploadStatus: 'error',
              error: checked.message,
            },
          ]
        })
        continue
      }

      const key = `att_${crypto.randomUUID()}`
      let blocked = false
      setAttachmentDrafts((prev) => {
        if (prev.length >= CONTRACT_SEND_ATTACHMENTS_MAX) {
          blocked = true
          return prev
        }
        return [
          ...prev,
          {
            key,
            fileId: '',
            displayFilename: file.name,
            mimeType: checked.mime,
            sizeBytes: file.size,
            required: true,
            uploadStatus: 'uploading',
          },
        ]
      })
      if (blocked) {
        setSendError(`첨부는 최대 ${CONTRACT_SEND_ATTACHMENTS_MAX}개까지 추가할 수 있습니다.`)
        break
      }
      setAttachmentUploadBusy(true)
      try {
        const up = await uploadUserContractSendAttachment(t, selectedCustomer.id, file)
        setAttachmentDrafts((prev) =>
          prev.map((x) =>
            x.key === key
              ? {
                  ...x,
                  fileId: up.fileId,
                  displayFilename: up.displayFilename,
                  mimeType: up.mimeType,
                  sizeBytes: up.sizeBytes,
                  uploadStatus: 'done' as const,
                  error: null,
                }
              : x,
          ),
        )
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[contract-send] attachment upload failed', err)
        }
        const msg = mapAttachmentUploadError(err)
        setSendError(msg)
        setAttachmentDrafts((prev) =>
          prev.map((x) => (x.key === key ? { ...x, uploadStatus: 'error' as const, error: msg } : x)),
        )
      } finally {
        setAttachmentUploadBusy(false)
      }
    }
  }

  const handleAttachmentFileInputChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const input = e.currentTarget
    const picked = Array.from(input.files ?? [])
    input.value = ''
    if (import.meta.env.DEV && picked.length > 0) {
      console.log(
        '[contract attachments] file input changed',
        picked.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      )
    }
    void processPickedAttachmentFiles(picked)
  }

  const renderSendAttachmentSection = (layout: 'desktop' | 'mobile') => {
    const isMobile = layout === 'mobile'
    const rowClass =
      'contract-signature-send-attach-row' + (isMobile ? ' contract-signature-send-attach-row--mobile' : '')

    if (!selectedTemplateId) {
      return (
        <p className="contract-signature-console__hint contract-signature-send-attach--disabled">
          전자서명 템플릿을 선택하면 첨부자료를 추가할 수 있습니다.
        </p>
      )
    }

    if (!selectedCustomer) {
      return (
        <p className="contract-signature-console__hint contract-signature-send-attach--disabled">
          고객을 선택한 뒤 첨부파일을 추가할 수 있습니다.
        </p>
      )
    }

    const addDisabled =
      !t ||
      attachmentUploadBusy ||
      attachmentDrafts.length >= CONTRACT_SEND_ATTACHMENTS_MAX

    return (
      <>
        <SendAttachmentFileInput
          ref={attachmentFileInputRef}
          accept={ATTACHMENT_FILE_ACCEPT}
          multiple
          disabled={Boolean(addDisabled)}
          className="contract-signature-send-attach-file-input"
          onChange={handleAttachmentFileInputChange}
        />
        {isMobile ? null : (
          <>
            <p className="contract-signature-console__body-text" style={{ margin: '0 0 8px' }}>
              고객이 전자서명 전에 확인해야 할 참고자료를 첨부할 수 있습니다.
            </p>
            <p className="contract-signature-console__hint" style={{ margin: '0 0 12px' }}>
              첨부자료는 고객 화면의 「고객 확인 항목」 단계에서 열람되며, 고객이 모달 하단의 「이 첨부자료를 확인했습니다」 버튼을
              눌러야 확인 완료됩니다.
            </p>
          </>
        )}
        <div className={isMobile ? 'contract-signature-send-attach-list' : 'space-y-2 mt-2'}>
          {attachmentDrafts.map((row) => {
            const summaryLine = [
              attachmentKindLabel(row.mimeType),
              formatAttachmentBytes(row.sizeBytes),
              '필수 확인',
            ].join(' · ')
            return (
              <div key={row.key} className={rowClass}>
                <div className="contract-signature-send-attach-row__main">
                  <div className="contract-signature-send-attach-row__name">{row.displayFilename}</div>
                  <div className="contract-signature-send-attach-row__meta">{summaryLine}</div>
                  <div className="contract-signature-send-attach-row__status" role="status">
                    {row.uploadStatus === 'uploading' ? (
                      <>상태: 업로드 중…</>
                    ) : row.uploadStatus === 'done' ? (
                      <>상태: 업로드 완료</>
                    ) : (
                      <span className="contract-signature-console__inline-warning">
                        업로드 실패: {row.error ?? '알 수 없는 오류'}
                      </span>
                    )}
                  </div>
                </div>
                {isMobile ? (
                  <div className="contract-signature-send-attach-row__remove">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={!t || row.uploadStatus === 'uploading'}
                      onClick={() => setAttachmentDrafts((prev) => prev.filter((x) => x.key !== row.key))}
                    >
                      삭제
                    </FormButton>
                  </div>
                ) : (
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    size="sm"
                    disabled={!t || row.uploadStatus === 'uploading'}
                    onClick={() => setAttachmentDrafts((prev) => prev.filter((x) => x.key !== row.key))}
                  >
                    삭제
                  </FormButton>
                )}
              </div>
            )
          })}
        </div>
        <div className={isMobile ? 'contract-signature-send-attach-actions' : 'contract-signature-console__btn-row'} style={isMobile ? undefined : { marginTop: 12 }}>
          <FormButton
            htmlType="button"
            variant="secondary"
            size="sm"
            fullWidth={isMobile}
            disabled={addDisabled}
            onClick={() => attachmentFileInputRef.current?.click()}
          >
            + 첨부파일 추가
          </FormButton>
        </div>
        {attachmentDrafts.length >= CONTRACT_SEND_ATTACHMENTS_MAX ? (
          <p className="contract-signature-console__inline-warning" role="status" style={{ marginTop: 8 }}>
            첨부는 최대 {CONTRACT_SEND_ATTACHMENTS_MAX}개까지 추가할 수 있습니다.
          </p>
        ) : (
          <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
            PDF 또는 이미지(JPEG, PNG, WebP)만 업로드할 수 있습니다. (파일당 최대 20MB)
          </p>
        )}
        {isMobile ? (
          <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
            고객 화면에서 첨부를 열람한 뒤 확인을 완료해야 전자서명 단계로 넘어갈 수 있습니다.
          </p>
        ) : null}
      </>
    )
  }

  const mainClass =
    'insurance-dark-forms contract-signature-console' +
    (isMobileFlow ? ' contract-signature-flow--mobile' : '')

  const senderFields = selectedTpl?.senderFieldsForSend ?? []

  if (isMobileFlow) {
    return (
      <main className={mainClass}>
        <div className="contract-signature-console__container">
          <h1 className="contract-signature-console__title">전자서명 발송</h1>
          <p className="contract-signature-console__lead">
            본인에게 등록된 고객을 선택하고, 관리자가 활성화한 전자서명 템플릿으로 링크를 발송합니다. 휴대폰 번호는
            고객 정보에서만 읽으며 임의 입력·전송은 할 수 없습니다.
          </p>

          {bootError ? (
            <div className="contract-signature-console__alert--danger" role="alert">
              {bootError}
            </div>
          ) : null}

          {mobileStepShell(
            {
              title: '1. 내 고객 검색',
              desc: selectedCustomer
                ? '선택한 고객에게 전자서명을 발송합니다.'
                : '전자서명을 발송할 고객을 검색해 선택하세요.',
              active: step1Active,
              completed: step1Complete,
              locked: false,
            },
            selectedCustomer ? (
              <div className="contract-send-mobile-selected-customer">
                <p className="contract-send-mobile-selected-customer__heading">선택 고객</p>
                <div className="contract-send-mobile-selected-customer__body">
                  <span className="contract-send-mobile-selected-customer__name">{selectedCustomer.name}</span>
                  <span className="contract-send-mobile-selected-customer__line">
                    고객 ID: {selectedCustomer.id}
                    {selectedCustomer.customerCode?.trim() ? ` · 고객번호 ${selectedCustomer.customerCode}` : ''}
                  </span>
                  <span className="contract-send-mobile-selected-customer__line">
                    {selectedCustomer.hasPhone ? selectedCustomer.maskedPhone : '휴대폰 —'}
                  </span>
                  {!selectedCustomer.hasPhone ? (
                    <span className="contract-send-mobile-selected-customer__warn" role="status">
                      유효한 휴대폰 번호가 없어 발송할 수 없습니다.
                    </span>
                  ) : null}
                </div>
                <div className="contract-send-mobile-selected-customer__actions">
                  <FormButton htmlType="button" variant="secondary" size="sm" disabled={!t} onClick={clearCustomerSelection}>
                    선택 해제
                  </FormButton>
                  <FormButton htmlType="button" variant="secondary" size="sm" disabled={!t} onClick={resetMobileCustomerSearchFlow}>
                    다른 고객 검색
                  </FormButton>
                </div>
              </div>
            ) : (
              <>
                <div className="contract-mobile-search-row">
                  <div className="contract-mobile-search-input-wrap">
                    <FormInput
                      ref={customerSearchInputRef}
                      type="search"
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value)
                        setCustomerSearchValidationError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void executeCustomerSearch()
                        }
                      }}
                      placeholder="이름 · 전화번호 일부 · 고객번호"
                      disabled={!t}
                    />
                  </div>
                  <FormButton
                    htmlType="button"
                    variant="primary"
                    size="sm"
                    fullWidth
                    disabled={!t || customerSearchBusy}
                    onClick={() => void executeCustomerSearch()}
                    className="contract-mobile-search-submit"
                  >
                    {customerSearchBusy ? '검색 중…' : '검색'}
                  </FormButton>
                </div>
                {customerSearchValidationError ? (
                  <p className="contract-signature-console__inline-warning" role="status">
                    {customerSearchValidationError}
                  </p>
                ) : null}

                {!customerSearchExecuted && !customerSearchValidationError ? (
                  <p className="contract-signature-console__hint contract-signature-console__hint--flush">
                    고객 이름, 전화번호 일부 또는 고객번호를 입력해 검색하세요.
                  </p>
                ) : null}

                {customerSearchExecuted ? (
                  <div className="contract-send-mobile-customer-result-list" role="list">
                    {customerHits.length === 0 ? (
                      <p className="contract-signature-console__hint">검색 결과가 없습니다.</p>
                    ) : (
                      customerHits.map((c) => (
                        /* eslint-disable-next-line no-restricted-syntax -- 모바일 검색 결과 카드: BEM 전용 네이티브 button */
                        <button
                          key={c.id}
                          type="button"
                          role="listitem"
                          className="contract-send-mobile-customer-result-card"
                          disabled={!t}
                          onClick={() => {
                            if (!t) {
                              return
                            }
                            setSelectedCustomer(c)
                          }}
                          onKeyDown={(e) => {
                            if (!t) {
                              return
                            }
                            runPickRowKeyboardAction(e, () => setSelectedCustomer(c))
                          }}
                        >
                          <span className="contract-send-mobile-customer-result-card__name">{c.name}</span>
                          <span className="contract-send-mobile-customer-result-card__meta">
                            {c.customerCode?.trim()
                              ? `고객번호 ${c.customerCode} · 고객 ID ${c.id}`
                              : `고객 ID: ${c.id}`}
                          </span>
                          <span className="contract-send-mobile-customer-result-card__meta">
                            {c.hasPhone ? c.maskedPhone : '휴대폰 —'}
                          </span>
                          {!c.hasPhone ? (
                            <span className="contract-send-mobile-customer-result-card__warning" role="status">
                              유효한 휴대폰 번호 없음
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </>
            ),
          )}

          {mobileStepShell(
            {
              title: '2. 전자서명 템플릿 선택',
              desc: selectedCustomer == null ? '먼저 고객을 검색해 선택해 주세요.' : null,
              active: step2Active,
              completed: step2Complete,
              locked: !step1Complete,
            },
            selectedCustomer == null ? null : (
              <div className="contract-send-mobile-template-list" role="list">
                {templates.map((row) => {
                  const isConfOnly = row.templateMode === 'confirmation_only'
                  const noSig = !isConfOnly && row.signatureFieldCount < 1
                  const inactive = String(row.status) !== 'active'
                  const selected = selectedTemplateId === row.id
                  return (
                    /* eslint-disable-next-line no-restricted-syntax -- 모바일 템플릿 선택 카드: BEM 전용 네이티브 button */
                    <button
                      key={row.id}
                      type="button"
                      role="listitem"
                      className={
                        'contract-send-mobile-template-card' +
                        (selected ? ' contract-send-mobile-template-card--selected' : '')
                      }
                      disabled={!t || inactive}
                      onClick={() => setSelectedTemplateId(row.id)}
                    >
                      <span className="contract-send-mobile-template-card__title">{row.title}</span>
                      <span className="contract-send-mobile-template-card__mode">
                        {isConfOnly ? '무좌표 전자확인서' : '좌표 기반 PDF'}
                      </span>
                      <span className="contract-send-mobile-template-card__pdf">
                        PDF: {isConfOnly ? '무좌표 확인서' : row.pdfEngineTitle ?? '—'}
                      </span>
                      <span className="contract-send-mobile-template-card__stats">
                        {isConfOnly
                          ? '확인서 항목 템플릿'
                          : `필드 ${row.pdfFieldCount}개 · 서명 필드 ${row.signatureFieldCount}개`}
                      </span>
                      {inactive ? (
                        <span className="contract-send-mobile-template-card__warning" role="status">
                          비활성 템플릿은 발송할 수 없습니다.
                        </span>
                      ) : null}
                      {noSig ? (
                        <span className="contract-send-mobile-template-card__warning" role="status">
                          서명 필드가 없어 손사인 테스트가 제한될 수 있습니다.
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ),
          )}

          {selectedCustomer && selectedTemplateId && senderFields.length > 0
            ? mobileStepShell(
                {
                  title: '발송 전 입력값',
                  desc: '고객에게 보내기 전에 계약서에 들어갈 값을 입력해주세요.',
                  active:
                    templatePickComplete &&
                    senderFields.length > 0 &&
                    senderPrereqBlocked &&
                    !currentSendSessionCreated,
                  completed: false,
                  locked: !selectedCustomer || !selectedTemplateId,
                },
                <div className="contract-send-mobile-sender-fields">
                  {senderFields.map((d) => {
                    const fk = d.fieldKey
                    if (d.fieldType === 'checkbox') {
                      return (
                        <label key={fk} className="contract-send-mobile-sender-fields__checkbox-row">
                          <FormInput
                            type="checkbox"
                            checked={Boolean(senderVals[fk])}
                            onChange={(ev) => setSenderVals((prev) => ({ ...prev, [fk]: ev.target.checked }))}
                          />
                          <span className="contract-send-mobile-sender-fields__checkbox-label">
                            {d.label || fk}
                            {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                          </span>
                        </label>
                      )
                    }
                    if (d.fieldType === 'radio') {
                      const rawOpts = Array.isArray(d.options) ? d.options : []
                      const opts = rawOpts.map((x) => String(x))
                      const cur = String(senderVals[fk] ?? '')
                      return (
                        <div key={fk} className="contract-send-mobile-sender-fields__field">
                          <p className="contract-send-mobile-sender-fields__hint">
                            {d.label || fk}
                            {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                          </p>
                          <div className="contract-send-mobile-sender-fields__select-wrap">
                            <FormSelect
                              value={cur}
                              options={[{ value: '', label: '선택' }, ...opts.map((o) => ({ value: o, label: o }))]}
                              onChange={(ev) => setSenderVals((prev) => ({ ...prev, [fk]: ev.target.value }))}
                            />
                          </div>
                        </div>
                      )
                    }
                    const tv = String(senderVals[fk] ?? '')
                    const multiline = d.fieldType === 'textarea'
                    return (
                      <label key={fk} className="contract-send-mobile-sender-fields__field-label">
                        <span className="contract-send-mobile-sender-fields__hint">
                          {d.label || fk}
                          {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                        </span>
                        {multiline ? (
                          <FormTextarea
                            className="contract-send-mobile-sender-fields__control pdf-engine-form__textarea"
                            rows={4}
                            value={tv}
                            onChange={(e) => setSenderVals((prev) => ({ ...prev, [fk]: e.target.value }))}
                          />
                        ) : (
                          <FormInput
                            className="contract-send-mobile-sender-fields__control"
                            type="text"
                            value={tv}
                            onChange={(e) => setSenderVals((prev) => ({ ...prev, [fk]: e.target.value }))}
                          />
                        )}
                      </label>
                    )
                  })}
                </div>,
              )
            : null}

          {selectedCustomer && selectedTemplateId && selectedTpl?.templateMode === 'confirmation_only'
            ? mobileStepShell(
                {
                  title: '확인서 항목 입력',
                  desc: '전자확인서 항목을 입력한 뒤 발송하면 고객이 공개 링크에서 내용을 확인할 수 있습니다.',
                  active:
                    templatePickComplete &&
                    confirmationOnlySelected &&
                    !confirmationOnlyReady &&
                    !currentSendSessionCreated,
                  completed: false,
                  locked: !selectedCustomer || !selectedTemplateId,
                },
                <ConfirmationOnlySendFieldsSection
                  fields={confirmationTemplateFields}
                  values={confirmationFieldValues}
                  onChange={(fk, v) => setConfirmationFieldValues((p) => ({ ...p, [fk]: v }))}
                  loading={confirmationFieldsLoading}
                  loadError={confirmationFieldsError}
                  validationMessage={confirmationOnlyValuesMessage}
                  disabled={!t}
                  mobileSendLayout
                />,
              )
            : null}

          {selectedCustomer && selectedTemplateId && confirmationDrafts.length > 0
            ? mobileStepShell(
                {
                  title: '고객 확인 항목',
                  desc: '이 템플릿에는 아래 확인 항목이 포함됩니다. 수정은 관리자 전자서명 템플릿 설정 화면에서 합니다.',
                  active:
                    customerConfirmDraftsApply &&
                    !customerConfirmDraftsStepComplete &&
                    !currentSendSessionCreated,
                  completed: false,
                  locked: false,
                },
                <ul className="contract-mobile-readonly-list">
                  {confirmationDrafts
                    .filter((row) => row.label.trim() !== '')
                    .map((row) => (
                      <li key={row.key}>{row.label.trim()}</li>
                    ))}
                </ul>,
              )
            : null}

          {mobileStepShell(
            {
              title: '2-3. 첨부자료',
              desc: selectedTemplateId
                ? '고객이 전자서명 전에 확인할 자료를 첨부하세요.'
                : '전자서명 템플릿을 선택하면 첨부자료를 추가할 수 있습니다.',
              active: attachmentStepActive,
              completed: false,
              locked: !selectedTemplateId,
            },
            renderSendAttachmentSection('mobile'),
          )}

          {mobileStepShell(
            {
              title: '3. 발송 세션 생성',
              desc: null,
              active: step3Active,
              completed: step3Complete,
              locked: !step3Ready,
            },
            <>
              {selectedCustomer && selectedTpl && String(selectedTpl.status) === 'active' ? (
                <div className="contract-mobile-summary">
                  <div className="contract-mobile-summary__label">발송 요약</div>
                  <div>{selectedCustomer.name}</div>
                  <div className="contract-signature-console__hint">{selectedCustomer.maskedPhone}</div>
                  <div className="contract-signature-console__hint" style={{ marginTop: 6 }}>
                    템플릿: {selectedTpl.title}
                  </div>
                </div>
              ) : null}
              <SendSessionPanel
                busy={sendBusy}
                lastCreated={scopedLastCreated}
                onCreate={() => void onCreateSendSession()}
                canSend={effectiveCanSend}
                inactiveTemplateHint={effectiveCanSend ? null : sendSessionPanelHint}
                detail={scopedSendSessionDetail}
                onRefresh={() => void refreshSessionDetail()}
                error={sendError}
                staffAuthToken={t}
                layout="mobile"
              />
            </>,
          )}

          {mobileStepShell(
            {
              title: '4. 상태 · evidence',
              desc: null,
              active: step4Active,
              /** 결과 확인 단계는 완료(초록)가 아니라 진행 중·대기만 사용 */
              completed: false,
              locked: !currentSendSessionCreated,
            },
            <EvidenceStatusPanel
              detail={scopedSendSessionDetail}
              loading={evidenceLoading}
              onRefresh={() => void refreshSessionDetail()}
              layout="mobile"
            />,
          )}
        </div>
      </main>
    )
  }

  return (
    <main className={mainClass}>
      <div className="contract-signature-console__container">
        <h1 className="contract-signature-console__title">전자서명 발송</h1>
        <p className="contract-signature-console__lead">
          본인에게 등록된 고객을 선택하고, 관리자가 활성화한 전자서명 템플릿으로 링크를 발송합니다. 휴대폰 번호는 고객
          정보에서만 읽으며 임의 입력·전송은 할 수 없습니다.
        </p>

        {bootError ? (
          <div className="contract-signature-console__alert--danger" role="alert">
            {bootError}
          </div>
        ) : null}

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">1. 내 고객 검색</h2>
          <p className="contract-signature-console__body-text" style={{ margin: '0 0 6px' }}>
            전자서명을 발송할 고객을 검색해 선택하세요.
          </p>
          <p className="contract-signature-console__hint" style={{ marginTop: 0 }}>
            고객 이름, 전화번호 일부 또는 고객번호를 입력해 검색하세요.
          </p>
          <div className="contract-signature-console__search-row" style={{ marginBottom: 8, alignItems: 'stretch' }}>
            <FormInput
              ref={customerSearchInputRef}
              type="search"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value)
                setCustomerSearchValidationError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void executeCustomerSearch()
                }
              }}
              placeholder="이름 · 전화번호 일부 · 고객번호"
              disabled={!t}
              className="max-w-md flex-1 min-w-[200px]"
            />
            <FormButton
              htmlType="button"
              variant="primary"
              size="sm"
              disabled={!t || customerSearchBusy}
              onClick={() => void executeCustomerSearch()}
            >
              {customerSearchBusy ? '검색 중…' : '검색'}
            </FormButton>
          </div>
          {customerSearchValidationError ? (
            <p className="contract-signature-console__inline-warning" role="status">
              {customerSearchValidationError}
            </p>
          ) : null}

          {selectedCustomer ? (
            <div className="contract-signature-console__selected-card" style={{ marginTop: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>선택 고객</div>
              <div className="contract-signature-console__body-text" style={{ fontSize: '0.9375rem' }}>
                {selectedCustomer.name}
              </div>
              <div className="contract-signature-console__hint" style={{ marginTop: 6 }}>
                고객 ID: {selectedCustomer.id}
                {selectedCustomer.customerCode?.trim() ? ` · 고객번호: ${selectedCustomer.customerCode}` : ''}
              </div>
              <div className="contract-signature-console__hint">휴대폰: {selectedCustomer.hasPhone ? selectedCustomer.maskedPhone : '—'}</div>
              {!selectedCustomer.hasPhone ? (
                <div className="contract-signature-console__hint--warning" style={{ marginTop: 4 }}>
                  유효한 휴대폰 번호가 없어 발송할 수 없습니다.
                </div>
              ) : null}
              <div className="contract-signature-console__btn-row">
                <FormButton htmlType="button" variant="secondary" size="sm" disabled={!t} onClick={clearCustomerSelection}>
                  선택 해제
                </FormButton>
                <FormButton htmlType="button" variant="secondary" size="sm" disabled={!t} onClick={focusSearchAndClearCustomer}>
                  다른 고객 검색
                </FormButton>
              </div>
            </div>
          ) : null}

          {customerSearchExecuted ? (
            <div className="contract-signature-console__scroll-x">
              <table className="pdf-engine-table contract-signature-console__table--compact contract-signature-console__pick-table">
                <thead>
                  <tr>
                    <th>선택</th>
                    <th>이름</th>
                    <th>고객번호 · ID</th>
                    <th>휴대폰(마스킹)</th>
                  </tr>
                </thead>
                <tbody>
                  {customerHits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="contract-signature-console__empty-state-text" style={{ padding: '0.75rem' }}>
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    customerHits.map((c) => {
                      const sel = selectedCustomer?.id === c.id
                      const customerPickInteractive = Boolean(t)
                      return (
                      <tr
                        key={c.id}
                        className={
                          'contract-pick-row' +
                          (sel ? ' contract-pick-row--selected' : '') +
                          (customerPickInteractive ? ' contract-pick-row--interactive' : '')
                        }
                        onClick={() => {
                          if (!t) {
                            return
                          }
                          setSelectedCustomer(c)
                        }}
                        onKeyDown={(e) => {
                          if (!t) {
                            return
                          }
                          runPickRowKeyboardAction(e, () => setSelectedCustomer(c))
                        }}
                        tabIndex={customerPickInteractive ? 0 : undefined}
                      >
                        <td>
                          <FormInput
                            type="radio"
                            name="cust-pick"
                            checked={sel}
                            value={String(c.id)}
                            disabled={!t}
                            onChange={() => setSelectedCustomer(c)}
                            onClick={(ev) => ev.stopPropagation()}
                          />
                        </td>
                        <td>{c.name}</td>
                        <td>
                          {c.customerCode?.trim() ? (
                            <>
                              {c.customerCode}
                              <span className="contract-signature-console__hint"> (ID {c.id})</span>
                            </>
                          ) : (
                            <span>고객 ID: {c.id}</span>
                          )}
                        </td>
                        <td>
                          {c.hasPhone ? c.maskedPhone : '—'}
                          {!c.hasPhone ? <div className="contract-signature-console__hint--warning">번호 없음</div> : null}
                        </td>
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : !customerSearchValidationError ? (
            <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
              「검색」을 누르면 본인에게 등록된 고객만 결과로 표시됩니다. 휴대폰 번호는 마스킹만 표시됩니다.
            </p>
          ) : null}
        </section>

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">2. 전자서명 템플릿 (active)</h2>
          {selectedCustomer == null ? <p className="contract-signature-console__hint">고객을 선택하면 템플릿을 고를 수 있습니다.</p> : null}
          <div className="contract-signature-console__scroll-x">
            <table className="pdf-engine-table contract-signature-console__table--compact contract-signature-console__pick-table">
              <thead>
                <tr>
                  <th>선택</th>
                  <th>템플릿명</th>
                  <th>PDF명</th>
                  <th>필드 수</th>
                  <th>서명 필드</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((row) => {
                  const isConfOnly = row.templateMode === 'confirmation_only'
                  const noSig = !isConfOnly && row.signatureFieldCount < 1
                  const inactive = String(row.status) !== 'active'
                  const sel = selectedTemplateId === row.id
                  const tplRowInteractive = Boolean(t && selectedCustomer != null && !inactive)
                  return (
                    <tr
                      key={row.id}
                      className={
                        'contract-pick-row' +
                        (sel ? ' contract-pick-row--selected' : '') +
                        (inactive ? ' contract-pick-row--inactive' : '') +
                        (tplRowInteractive ? ' contract-pick-row--interactive' : '')
                      }
                      onClick={() => {
                        if (!t || selectedCustomer == null || inactive) {
                          return
                        }
                        setSelectedTemplateId(row.id)
                      }}
                      onKeyDown={(e) => {
                        if (!tplRowInteractive) {
                          return
                        }
                        runPickRowKeyboardAction(e, () => setSelectedTemplateId(row.id))
                      }}
                      tabIndex={tplRowInteractive ? 0 : undefined}
                    >
                      <td>
                        <FormInput
                          type="radio"
                          name="tpl-pick"
                          checked={sel}
                          value={row.id}
                          disabled={!t || selectedCustomer == null || inactive}
                          onChange={() => setSelectedTemplateId(row.id)}
                          onClick={(ev) => ev.stopPropagation()}
                        />
                      </td>
                      <td>
                        {row.title}
                        {inactive ? (
                          <div className="contract-signature-console__hint--warning">비활성 템플릿은 발송할 수 없습니다.</div>
                        ) : null}
                        {noSig ? (
                          <div className="contract-signature-console__hint--warning">
                            signature 필드 없음 — 손사인 단계가 제한될 수 있습니다.
                          </div>
                        ) : null}
                        {isConfOnly ? (
                          <div className="contract-signature-console__hint">무좌표 확인서(확인 항목만)</div>
                        ) : null}
                      </td>
                      <td>{isConfOnly ? '—' : row.pdfEngineTitle ?? '—'}</td>
                      <td>{isConfOnly ? '—' : row.pdfFieldCount}</td>
                      <td>{isConfOnly ? '—' : row.signatureFieldCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCustomer && selectedTemplateId && senderFields.length > 0 ? (
          <section className="contract-signature-console__section">
            <h2 className="contract-signature-console__section-title">2-1. 발송 전 입력값</h2>
            <p className="contract-signature-console__hint">
              고객에게 보내기 전에 계약서에 들어갈 값을 입력해주세요. 이 값은 고객이 수정할 수 없습니다.
            </p>
            <div className="mt-4 space-y-4">
              {senderFields.map((d) => {
                const fk = d.fieldKey
                if (d.fieldType === 'checkbox') {
                  return (
                    <label key={fk} className="contract-public-sign-page__label-row flex items-start gap-2">
                      <FormInput
                        type="checkbox"
                        checked={Boolean(senderVals[fk])}
                        onChange={(ev) => setSenderVals((prev) => ({ ...prev, [fk]: ev.target.checked }))}
                      />
                      <span>
                        {d.label || fk}
                        {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                      </span>
                    </label>
                  )
                }
                if (d.fieldType === 'radio') {
                  const rawOpts = Array.isArray(d.options) ? d.options : []
                  const opts = rawOpts.map((x) => String(x))
                  const cur = String(senderVals[fk] ?? '')
                  return (
                    <div key={fk} className="space-y-1">
                      <p className="contract-signature-console__hint" style={{ marginBottom: 4 }}>
                        {d.label || fk}
                        {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                      </p>
                      <FormSelect
                        value={cur}
                        options={[{ value: '', label: '선택' }, ...opts.map((o) => ({ value: o, label: o }))]}
                        onChange={(ev) => setSenderVals((prev) => ({ ...prev, [fk]: ev.target.value }))}
                      />
                    </div>
                  )
                }
                const tv = String(senderVals[fk] ?? '')
                const multiline = d.fieldType === 'textarea'
                return (
                  <label key={fk} className="block space-y-1">
                    <span className="contract-signature-console__hint">
                      {d.label || fk}
                      {d.required ? <span className="contract-signature-console__hint--warning"> *</span> : null}
                    </span>
                    {multiline ? (
                      <FormTextarea
                        className="pdf-engine-form__textarea w-full max-w-xl text-sm"
                        rows={4}
                        value={tv}
                        onChange={(e) => setSenderVals((prev) => ({ ...prev, [fk]: e.target.value }))}
                      />
                    ) : (
                      <FormInput
                        type="text"
                        className="max-w-xl"
                        value={tv}
                        onChange={(e) => setSenderVals((prev) => ({ ...prev, [fk]: e.target.value }))}
                      />
                    )}
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}

        {selectedCustomer && selectedTemplateId && selectedTpl?.templateMode === 'confirmation_only' ? (
          <section className="contract-signature-console__section">
            <h2 className="contract-signature-console__section-title">2-1b. 확인서 항목 입력 (무좌표)</h2>
            <ConfirmationOnlySendFieldsSection
              fields={confirmationTemplateFields}
              values={confirmationFieldValues}
              onChange={(fk, v) => setConfirmationFieldValues((p) => ({ ...p, [fk]: v }))}
              loading={confirmationFieldsLoading}
              loadError={confirmationFieldsError}
              validationMessage={confirmationOnlyValuesMessage}
              disabled={!t}
            />
          </section>
        ) : null}

        {selectedCustomer && selectedTemplateId && selectedTpl?.templateMode !== 'confirmation_only' ? (
          <section className="contract-signature-console__section">
            <h2 className="contract-signature-console__section-title">2-2. 고객 확인 체크 항목</h2>
            <p className="contract-signature-console__body-text" style={{ margin: '0 0 8px' }}>
              고객이 전자서명 전에 확인해야 할 내용을 체크 항목으로 추가할 수 있습니다.
            </p>
            <div className="space-y-3 mt-2">
              {confirmationDrafts.map((row) => (
                <div key={row.key} className="flex flex-wrap items-start gap-2">
                  <FormInput
                    type="text"
                    className="flex-1 min-w-[200px] max-w-xl"
                    value={row.label}
                    placeholder="예: 본인임을 확인했습니다."
                    disabled={!t}
                    onChange={(e) => {
                      const v = e.target.value
                      setConfirmationDrafts((prev) => prev.map((x) => (x.key === row.key ? { ...x, label: v } : x)))
                    }}
                  />
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    size="sm"
                    disabled={!t}
                    onClick={() => setConfirmationDrafts((prev) => prev.filter((x) => x.key !== row.key))}
                  >
                    삭제
                  </FormButton>
                </div>
              ))}
            </div>
            <div className="contract-signature-console__btn-row" style={{ marginTop: 12 }}>
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                disabled={!t || !selectedTemplateId || confirmationDrafts.length >= CONTRACT_SEND_CONFIRMATION_MAX_ITEMS}
                onClick={() =>
                  setConfirmationDrafts((prev) => [...prev, { key: `ccdraft_${crypto.randomUUID()}`, label: '' }])
                }
              >
                + 체크 항목 추가
              </FormButton>
            </div>
            {confirmationDraftValidationMessage ? (
              <p className="contract-signature-console__inline-warning" role="status" style={{ marginTop: 8 }}>
                {confirmationDraftValidationMessage}
              </p>
            ) : (
              <p className="contract-signature-console__hint" style={{ marginTop: 8 }}>
                선택 사항입니다. 추가 시 고객이 모두 체크해야 다음 단계로 진행할 수 있습니다.
              </p>
            )}
          </section>
        ) : null}

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">2-3. 첨부자료</h2>
          {renderSendAttachmentSection('desktop')}
        </section>

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">3. 발송 세션</h2>
          <SendSessionPanel
            busy={sendBusy}
            lastCreated={scopedLastCreated}
            onCreate={() => void onCreateSendSession()}
            canSend={effectiveCanSend}
            inactiveTemplateHint={effectiveCanSend ? null : sendSessionPanelHint}
            detail={scopedSendSessionDetail}
            onRefresh={() => void refreshSessionDetail()}
            error={sendError}
            staffAuthToken={t}
          />
        </section>

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">4. 상태 · evidence</h2>
          <EvidenceStatusPanel
            detail={scopedSendSessionDetail}
            loading={evidenceLoading}
            onRefresh={() => void refreshSessionDetail()}
          />
        </section>
      </div>
    </main>
  )
}
