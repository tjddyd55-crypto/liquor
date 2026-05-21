import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SignatureModal } from '../../consent/components/SignatureModal'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import '../../consent/consent.css'
import './contract-public-sign.css'
import {
  ApiError,
  fetchContractPublicDocumentDetail,
  formatContractPublicActionError,
  formatContractPublicCompleteError,
  postContractPublicDocumentComplete,
  postContractPublicDocumentSign,
  postContractPublicDocumentValues,
  resolveContractRenderedPdfAbsUrl,
  resolveContractSignedPdfAbsUrl,
  type ContractDocumentDetailPayload,
  type ContractPublicValueInput,
  type ContractSendSessionAttachmentPublic,
} from './contractPublicClient'
import { PublicPdfPreviewModal } from './components/PublicPdfPreviewModal'
import { ContractAttachmentReviewModal } from './components/ContractAttachmentReviewModal'
import { resolveApiUrl } from '../../../lib/apiClient'

type PublicStepStatus = 'pending' | 'active' | 'complete' | 'skipped'

/** 완료된 문서이거나 서버가 다운로드를 막지 않는 경우 signed-pdf 링크를 노출한다. */
function publicSignedPdfHrefEnabled(d: ContractDocumentDetailPayload): boolean {
  if (d.document.status === 'completed') {
    return true
  }
  return d.signedPdfDownloadAvailable !== false
}

function PublicSignedPdfAnchor({
  href,
  downloadName,
  variant,
  className = '',
  children,
}: {
  href: string
  downloadName: string
  variant: 'primary' | 'secondary'
  className?: string
  children: string
}) {
  const cls =
    variant === 'primary'
      ? `button button--primary button--full ${className}`.trim()
      : `button button--secondary button--full ${className}`.trim()
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={downloadName}
      className={cls}
    >
      {children}
    </a>
  )
}

type PublicStepSlice = {
  key: string
  hasWork: boolean
  isComplete: boolean
  status: PublicStepStatus
  isActive: boolean
}

function publicStepCardClassNameByStatus(status: PublicStepStatus): string {
  const base = 'contract-public-sign-page__card contract-public-sign-page__step-card contract-public-sign-page__step-anchor'
  if (status === 'complete') {
    return `${base} contract-public-sign-page__step-card--completed`
  }
  if (status === 'active') {
    return `${base} contract-public-sign-page__step-card--active`
  }
  return `${base} contract-public-sign-page__step-card--locked`
}

function mergePublicStepCardStatus(a: PublicStepSlice, b: PublicStepSlice): PublicStepStatus {
  const done = (s: PublicStepSlice) => !s.hasWork || s.isComplete
  if (!a.hasWork && !b.hasWork) {
    return 'skipped'
  }
  if (done(a) && done(b)) {
    return 'complete'
  }
  if (a.status === 'active' || b.status === 'active') {
    return 'active'
  }
  if (a.status === 'pending' || b.status === 'pending') {
    return 'pending'
  }
  return 'pending'
}

function requiredCustomerInputFieldCount(detail: ContractDocumentDetailPayload): number {
  return detail.fields.filter(
    (f) =>
      !f.hideFromCustomerInput && !f.readOnlyCustomerUi && f.fieldType !== 'signature' && f.required,
  ).length
}

function requiredConfirmationItemCount(detail: ContractDocumentDetailPayload): number {
  return (detail.confirmationItems ?? []).filter((c) => c.required).length
}

function requiredAttachmentCount(detail: ContractDocumentDetailPayload): number {
  return (detail.sendSessionAttachments ?? []).filter((a) => a.required).length
}

/** coordinate_pdf 공개 화면에서 고객이 서명할 수 있는 슬롯(.hide / readOnly 제외). API에 슬롯이 안 내려오면 길이 0. */
function coordinatePdfCustomerSignatureTargets(detail: ContractDocumentDetailPayload) {
  return detail.fields.filter(
    (f) => f.fieldType === 'signature' && !f.hideFromCustomerInput && !f.readOnlyCustomerUi,
  )
}

function markFirstActiveSlice(chain: PublicStepSlice[]) {
  for (const s of chain) {
    s.isActive = s.status === 'active'
  }
  let seen = false
  for (const s of chain) {
    if (s.status !== 'active') {
      continue
    }
    if (seen) {
      s.status = 'pending'
      s.isActive = false
    } else {
      s.isActive = true
      seen = true
    }
  }
}

/** coordinate_pdf: 입력·확인·첨부는 없으면 skipped; 전자서명 단계는 항상 필수(손사인 정책). */
function buildCoordinatePdfStepState(
  detail: ContractDocumentDetailPayload,
  drafts: Record<string, string | boolean>,
  confirmationChecks: Record<string, boolean>,
  finalPreviewConfirmed: boolean,
  /** 좌표형 3단계 완료에 포함: 서명 저장과 별도로 진술 체크 필요 */
  signAck: boolean,
): {
  input: PublicStepSlice
  checks: PublicStepSlice
  attachments: PublicStepSlice
  signature: PublicStepSlice
  finalReview: PublicStepSlice
  submit: PublicStepSlice
} {
  const docCompleted = detail.document.status === 'completed'

  const inputHasWork = requiredCustomerInputFieldCount(detail) > 0
  const inputComplete = docCompleted || (inputHasWork && allNonSignatureRequiredFilled(detail, drafts))

  const checksHasWork = requiredConfirmationItemCount(detail) > 0
  const checksComplete = docCompleted || (checksHasWork && allSessionConfirmationsChecked(detail, confirmationChecks))

  const attHasWork = requiredAttachmentCount(detail) > 0
  const attComplete = docCompleted || (attHasWork && allRequiredAttachmentsConfirmed(detail))

  /** 손사인 필수 정책: 슬롯 유무와 관계없이 서명 단계는 skipped 하지 않는다. */
  const sigHasWork = true
  const sigSignedComplete = signatureRequirementsComplete(detail)
  const sigComplete = docCompleted || (sigSignedComplete && signAck)

  const finalHasWork = true
  const finalComplete = docCompleted || finalPreviewConfirmed

  const submitHasWork = true
  const submitComplete = docCompleted

  const inputSkipped = !inputHasWork
  const checksSkipped = !checksHasWork
  const attSkipped = !attHasWork

  const gateAfterInput = inputSkipped || inputComplete
  const gateAfterChecks = gateAfterInput && (checksSkipped || checksComplete)
  const gateAfterAtt = gateAfterChecks && (attSkipped || attComplete)
  const gateAfterSig = gateAfterAtt && sigComplete
  const gateAfterFinal = gateAfterSig && finalComplete

  const input: PublicStepSlice = {
    key: 'input',
    hasWork: inputHasWork,
    isComplete: inputComplete,
    status: 'pending',
    isActive: false,
  }
  if (inputSkipped) {
    input.status = 'skipped'
  } else if (inputComplete) {
    input.status = 'complete'
  } else {
    input.status = 'active'
  }

  const checks: PublicStepSlice = {
    key: 'confirmation_checks',
    hasWork: checksHasWork,
    isComplete: checksComplete,
    status: 'pending',
    isActive: false,
  }
  if (checksSkipped) {
    checks.status = 'skipped'
  } else if (!gateAfterInput) {
    checks.status = 'pending'
  } else if (checksComplete) {
    checks.status = 'complete'
  } else {
    checks.status = 'active'
  }

  const attachments: PublicStepSlice = {
    key: 'attachments',
    hasWork: attHasWork,
    isComplete: attComplete,
    status: 'pending',
    isActive: false,
  }
  if (attSkipped) {
    attachments.status = 'skipped'
  } else if (!gateAfterChecks) {
    attachments.status = 'pending'
  } else if (attComplete) {
    attachments.status = 'complete'
  } else {
    attachments.status = 'active'
  }

  const signature: PublicStepSlice = {
    key: 'signature',
    hasWork: sigHasWork,
    isComplete: sigComplete,
    status: 'pending',
    isActive: false,
  }
  if (!gateAfterAtt) {
    signature.status = 'pending'
  } else if (sigComplete) {
    signature.status = 'complete'
  } else {
    signature.status = 'active'
  }

  const finalReview: PublicStepSlice = {
    key: 'final_review',
    hasWork: finalHasWork,
    isComplete: finalComplete,
    status: 'pending',
    isActive: false,
  }
  if (!gateAfterSig) {
    finalReview.status = 'pending'
  } else if (finalComplete) {
    finalReview.status = 'complete'
  } else {
    finalReview.status = 'active'
  }

  const submit: PublicStepSlice = {
    key: 'submit',
    hasWork: submitHasWork,
    isComplete: submitComplete,
    status: 'pending',
    isActive: false,
  }
  if (docCompleted) {
    submit.status = 'complete'
  } else if (!gateAfterFinal) {
    submit.status = 'pending'
  } else {
    submit.status = 'active'
  }

  const chain = [input, checks, attachments, signature, finalReview, submit]
  markFirstActiveSlice(chain)

  return { input, checks, attachments, signature, finalReview, submit }
}

function normalizeConfirmationInputRole(role: unknown): 'sender' | 'customer' {
  return role === 'customer' ? 'customer' : 'sender'
}

function splitConfirmationFields(detail: ContractDocumentDetailPayload) {
  const rows = (detail.confirmationFields ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const senderFields = rows.filter((row) => normalizeConfirmationInputRole(row.inputRole) === 'sender')
  const customerFields = rows.filter((row) => normalizeConfirmationInputRole(row.inputRole) === 'customer')
  return { senderFields, customerFields }
}

function confirmationCustomerRequiredFieldsComplete(detail: ContractDocumentDetailPayload): boolean {
  const { customerFields } = splitConfirmationFields(detail)
  return customerFields.every((row) => {
    if (!row.required) {
      return true
    }
    return String(row.valueText ?? '').trim().length > 0
  })
}

function confirmationContentStepComplete(detail: ContractDocumentDetailPayload): boolean {
  const { senderFields } = splitConfirmationFields(detail)
  const senderAcknowledged = senderFields.length === 0 || detail.confirmationContentAcknowledged === true
  return senderAcknowledged && confirmationCustomerRequiredFieldsComplete(detail)
}

/** confirmation_only 전용 단계(내용 확인/입력·체크·첨부/서명/최종) */
function buildConfirmationOnlyStepState(
  detail: ContractDocumentDetailPayload,
  contentComplete: boolean,
  confirmationChecks: Record<string, boolean>,
): {
  content: PublicStepSlice
  checks: PublicStepSlice
  attachments: PublicStepSlice
  signature: PublicStepSlice
  final: PublicStepSlice
} {
  const docCompleted = detail.document.status === 'completed'
  const { senderFields, customerFields } = splitConfirmationFields(detail)

  const contentHasWork = senderFields.length > 0 || customerFields.length > 0
  const content: PublicStepSlice = {
    key: 'content',
    hasWork: contentHasWork,
    isComplete: docCompleted || contentComplete,
    status: 'pending',
    isActive: false,
  }
  if (!contentHasWork) {
    content.status = 'skipped'
  } else if (content.isComplete) {
    content.status = 'complete'
  } else {
    content.status = 'active'
  }

  const checksHasWork = requiredConfirmationItemCount(detail) > 0
  const checksComplete = docCompleted || (checksHasWork && allSessionConfirmationsChecked(detail, confirmationChecks))

  const attHasWork = requiredAttachmentCount(detail) > 0
  const attComplete = docCompleted || (attHasWork && allRequiredAttachmentsConfirmed(detail))

  const sigHasWork = true
  const sigComplete = Boolean(detail.confirmationSignature?.exists)

  const checksSkipped = !checksHasWork
  const attSkipped = !attHasWork

  const checks: PublicStepSlice = {
    key: 'co_checks',
    hasWork: checksHasWork,
    isComplete: checksComplete,
    status: checksSkipped ? 'skipped' : checksComplete ? 'complete' : 'active',
    isActive: false,
  }
  const attachments: PublicStepSlice = {
    key: 'co_attachments',
    hasWork: attHasWork,
    isComplete: attComplete,
    status: 'pending',
    isActive: false,
  }

  if (attSkipped) {
    attachments.status = 'skipped'
  } else if ((checksSkipped || checksComplete) && (content.status === 'complete' || content.status === 'skipped')) {
    attachments.status = attComplete ? 'complete' : 'active'
  } else {
    attachments.status = 'pending'
  }

  if (content.status !== 'complete' && content.status !== 'skipped') {
    checks.status = checksSkipped ? 'skipped' : 'pending'
    attachments.status = attSkipped ? 'skipped' : 'pending'
  } else if (!checksSkipped && !checksComplete) {
    checks.status = 'active'
    attachments.status = attSkipped ? 'skipped' : 'pending'
  }

  const signature: PublicStepSlice = {
    key: 'co_signature',
    hasWork: sigHasWork,
    isComplete: sigComplete,
    status: 'pending',
    isActive: false,
  }
  const afterConfirm =
    (content.status === 'complete' || content.status === 'skipped') &&
    (checksSkipped || checksComplete) &&
    (attSkipped || attComplete)
  if (!afterConfirm) {
    signature.status = 'pending'
  } else if (sigComplete) {
    signature.status = 'complete'
  } else {
    signature.status = 'active'
  }

  const final: PublicStepSlice = {
    key: 'co_final',
    hasWork: true,
    isComplete: docCompleted,
    status: 'pending',
    isActive: false,
  }
  if (docCompleted) {
    final.status = 'complete'
  } else if (sigComplete && detail.completionAvailable) {
    final.status = 'active'
  } else if (sigComplete) {
    final.status = 'pending'
  } else {
    final.status = 'pending'
  }

  const chain = [content, checks, attachments, signature, final]
  markFirstActiveSlice(chain)

  return { content, checks, attachments, signature, final }
}

function scrollToPublicStepElement(el: HTMLElement | null | undefined) {
  if (!el) {
    return
  }
  const focusTarget = () => {
    const focusEl = el.querySelector<HTMLElement>('[data-public-step-focus="true"]')
    const t = focusEl ?? el
    if (!focusEl && t.getAttribute('tabindex') == null) {
      t.setAttribute('tabindex', '-1')
    }
    t.focus({ preventScroll: true })
  }
  window.requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.requestAnimationFrame(focusTarget)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(blob)
  })
}

/** confirmation_only 전용; 서버 field_key 와 동일 */
const CONFIRMATION_SIGNATURE_FIELD_ID = 'confirmation_signature'

function buildDraftsFromDetail(d: ContractDocumentDetailPayload): Record<string, string | boolean> {
  const next: Record<string, string | boolean> = {}
  for (const f of d.fields) {
    if (f.hideFromCustomerInput) {
      continue
    }
    if (f.fieldType === 'signature') {
      continue
    }
    if (f.fieldType === 'checkbox') {
      next[f.id] = f.publicValue?.kind === 'checkbox' ? f.publicValue.checked : false
      continue
    }
    if (f.fieldType === 'radio') {
      const v = f.publicValue?.kind === 'radio' ? f.publicValue.value : ''
      next[f.id] = v || (typeof f.suggestedDefault === 'string' ? f.suggestedDefault : '')
      continue
    }
    const pv = f.publicValue?.kind === 'text' ? f.publicValue.value : ''
    const fallback = typeof f.suggestedDefault === 'string' ? f.suggestedDefault : ''
    next[f.id] = pv || fallback
  }
  return next
}

/** 서버 재조회 후에도 사용자가 이미 편집한 텍스트·선택·체크 값은 유지한다. */
function mergeDraftsFromDetail(
  prev: Record<string, string | boolean>,
  detail: ContractDocumentDetailPayload,
): Record<string, string | boolean> {
  const fromServer = buildDraftsFromDetail(detail)
  const next: Record<string, string | boolean> = { ...fromServer }
  for (const f of detail.fields) {
    if (f.hideFromCustomerInput) {
      continue
    }
    if (f.fieldType === 'signature') {
      continue
    }
    if (Object.prototype.hasOwnProperty.call(prev, f.id)) {
      next[f.id] = prev[f.id]
    }
  }
  return next
}

function sortFields(d: ContractDocumentDetailPayload) {
  return d.fields.slice().sort((a, b) => a.orderIndex - b.orderIndex)
}

function isRequiredSatisfied(
  f: ContractDocumentDetailPayload['fields'][number],
  drafts: Record<string, string | boolean>,
): boolean {
  if (f.readOnlyCustomerUi) {
    return true
  }
  if (!f.required) {
    return true
  }
  if (f.fieldType === 'signature') {
    return f.publicValue?.kind === 'signature' ? f.publicValue.signed : false
  }
  if (f.fieldType === 'checkbox') {
    return Boolean(drafts[f.id])
  }
  if (f.fieldType === 'radio') {
    return String(drafts[f.id] ?? '').trim().length > 0
  }
  return String(drafts[f.id] ?? '').trim().length > 0
}

function allRequiredFilled(detail: ContractDocumentDetailPayload, drafts: Record<string, string | boolean>) {
  return detail.fields.every((f) => isRequiredSatisfied(f, drafts))
}

/** 서명 필드를 제외한 필수 항목 충족 여부(1단계 완료). */
function allNonSignatureRequiredFilled(
  detail: ContractDocumentDetailPayload,
  drafts: Record<string, string | boolean>,
) {
  return detail.fields.every((f) => {
    if (f.fieldType === 'signature') {
      return true
    }
    if (f.hideFromCustomerInput) {
      return true
    }
    return isRequiredSatisfied(f, drafts)
  })
}

function allSessionConfirmationsChecked(
  detail: ContractDocumentDetailPayload,
  checks: Record<string, boolean>,
) {
  const items = detail.confirmationItems ?? []
  if (items.length === 0) {
    return true
  }
  for (const c of items) {
    if (!c.required) {
      continue
    }
    if (!checks[c.id]) {
      return false
    }
  }
  return true
}

function allRequiredAttachmentsConfirmed(detail: ContractDocumentDetailPayload) {
  const atts = detail.sendSessionAttachments ?? []
  for (const a of atts) {
    if (a.required && !a.confirmed) {
      return false
    }
  }
  return true
}

/**
 * coordinate_pdf 3단계(전자서명) 완료. 고객 노출 서명 슬롯이 없으면 false(공집합 every 금지·데이터 미설정).
 * 노출 슬롯이 있으면 required와 무관하게 모두 signed 여야 완료.
 */
function signatureRequirementsComplete(detail: ContractDocumentDetailPayload): boolean {
  const targets = coordinatePdfCustomerSignatureTargets(detail)
  if (targets.length === 0) {
    return false
  }
  return targets.every((f) => f.publicValue?.kind === 'signature' && f.publicValue.signed)
}

export default function ContractSignDocumentPage() {
  const { linkCode: linkCodeParam, documentInstanceId: docIdParam } = useParams<{
    linkCode: string
    documentInstanceId: string
  }>()
  const linkCode = String(linkCodeParam ?? '').trim()
  const documentInstanceId = String(docIdParam ?? '').trim()
  const paramsInvalid = !linkCode || !documentInstanceId

  const publicSignedPdfHref = useMemo(
    () => (paramsInvalid ? '' : resolveContractSignedPdfAbsUrl(linkCode, documentInstanceId)),
    [paramsInvalid, linkCode, documentInstanceId],
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ContractDocumentDetailPayload | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>({})
  /** 필드별 마지막 적용 dataUrl — refetch 후에도 클라이언트에서 서명 초안 연속성 표시에 사용 */
  const [signatureDrafts, setSignatureDrafts] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [signAck, setSignAck] = useState(false)
  const [sigModalField, setSigModalField] = useState<{ id: string; label: string } | null>(null)
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false)
  const [contractPreviewLoadNonce, setContractPreviewLoadNonce] = useState(0)
  const [finalReviewOpen, setFinalReviewOpen] = useState(false)
  const [finalReviewLoadNonce, setFinalReviewLoadNonce] = useState(0)
  const [finalPreviewConfirmed, setFinalPreviewConfirmed] = useState(false)
  const [finalSubmitAcknowledged, setFinalSubmitAcknowledged] = useState(false)
  const [confirmationChecks, setConfirmationChecks] = useState<Record<string, boolean>>({})
  const [attachmentModal, setAttachmentModal] = useState<ContractSendSessionAttachmentPublic | null>(null)
  const [attachmentModalNonce, setAttachmentModalNonce] = useState(0)
  const [successOpen, setSuccessOpen] = useState(false)
  const [completeResult, setCompleteResult] = useState<{
    evidenceSummary: ContractDocumentDetailPayload['evidenceSummary']
    signedPdfDownloadPath?: string
    signedPdfDownloadAvailable?: boolean
    completedAt?: string
  } | null>(null)
  const [coSignatureObjectUrl, setCoSignatureObjectUrl] = useState<string | null>(null)
  const [coFinalAck, setCoFinalAck] = useState(false)
  const [confirmationContentAcknowledged, setConfirmationContentAcknowledged] = useState(false)

  const confirmationChecksRef = useRef<Record<string, boolean>>({})
  const draftsRef = useRef<Record<string, string | boolean>>({})
  const finalPreviewConfirmedRef = useRef(false)
  const signAckRef = useRef(false)

  const coRefContentSection = useRef<HTMLDivElement | null>(null)
  const coRefConfirmChecksSection = useRef<HTMLDivElement | null>(null)
  const coRefConfirmAttachSection = useRef<HTMLDivElement | null>(null)
  const coRefSignatureCard = useRef<HTMLDivElement | null>(null)
  const coRefFinalCard = useRef<HTMLDivElement | null>(null)
  const coRefCompletedDownloads = useRef<HTMLDivElement | null>(null)

  const pdfRefStep1 = useRef<HTMLDivElement | null>(null)
  const pdfRefStep2Checks = useRef<HTMLDivElement | null>(null)
  const pdfRefStep2Attach = useRef<HTMLDivElement | null>(null)
  const pdfRefStep3 = useRef<HTMLDivElement | null>(null)
  const pdfRefStep4 = useRef<HTMLDivElement | null>(null)
  const pdfRefStep5 = useRef<HTMLDivElement | null>(null)
  const pdfRefCompletedPanel = useRef<HTMLDivElement | null>(null)

  const reloadDetail = useCallback(
    async (
      isCancelled?: () => boolean,
    ): Promise<
      { detail: ContractDocumentDetailPayload; drafts: Record<string, string | boolean> } | undefined
    > => {
      const d = await fetchContractPublicDocumentDetail(linkCode, documentInstanceId)
      if (isCancelled?.()) {
        return undefined
      }
      setDetail(d)
      let merged: Record<string, string | boolean> = {}
      setDrafts((prev) => {
        merged = mergeDraftsFromDetail(prev, d)
        return merged
      })
      await Promise.resolve()
      if (isCancelled?.()) {
        return undefined
      }
      draftsRef.current = merged
      return { detail: d, drafts: merged }
    },
    [linkCode, documentInstanceId],
  )

  const scrollToNextPublicStep = useCallback(
    (
      d: ContractDocumentDetailPayload,
      draftsSnapshot: Record<string, string | boolean>,
      checksOverride?: Record<string, boolean>,
    ) => {
      const checksMap = checksOverride ?? confirmationChecksRef.current
      const mode = d.templateMode ?? 'coordinate_pdf'
      if (mode === 'confirmation_only') {
        if (d.document.status === 'completed') {
          scrollToPublicStepElement(coRefCompletedDownloads.current)
          return
        }
        const st = buildConfirmationOnlyStepState(d, confirmationContentStepComplete(d), checksMap)
        if (st.content.isActive) {
          scrollToPublicStepElement(coRefContentSection.current)
        } else if (st.checks.isActive) {
          scrollToPublicStepElement(coRefConfirmChecksSection.current)
        } else if (st.attachments.isActive) {
          scrollToPublicStepElement(coRefConfirmAttachSection.current)
        } else if (st.signature.isActive) {
          scrollToPublicStepElement(coRefSignatureCard.current)
        } else if (st.final.isActive) {
          scrollToPublicStepElement(coRefFinalCard.current)
        }
        return
      }
      const st = buildCoordinatePdfStepState(
        d,
        draftsSnapshot,
        checksMap,
        finalPreviewConfirmedRef.current,
        signAckRef.current,
      )
      if (d.document.status === 'completed') {
        scrollToPublicStepElement(pdfRefCompletedPanel.current)
        return
      }
      if (st.input.isActive) {
        scrollToPublicStepElement(pdfRefStep1.current)
      } else if (st.checks.isActive) {
        scrollToPublicStepElement(pdfRefStep2Checks.current)
      } else if (st.attachments.isActive) {
        scrollToPublicStepElement(pdfRefStep2Attach.current)
      } else if (st.signature.isActive) {
        scrollToPublicStepElement(pdfRefStep3.current)
      } else if (st.finalReview.isActive) {
        scrollToPublicStepElement(pdfRefStep4.current)
      } else if (st.submit.isActive) {
        scrollToPublicStepElement(pdfRefStep5.current)
      }
    },
    [],
  )

  useEffect(() => {
    signAckRef.current = signAck
  }, [signAck])

  /** 좌표형: 진술 체크 해제 시 최종 확인·전송 동의 상태를 남기지 않는다. */
  useEffect(() => {
    if (signAck) {
      return
    }
    if (detail?.document.status === 'completed') {
      return
    }
    setFinalPreviewConfirmed(false)
    setFinalSubmitAcknowledged(false)
    finalPreviewConfirmedRef.current = false
    setFinalReviewOpen(false)
  }, [signAck, detail?.document.status])

  const scrollAfterAttachmentPatch = useCallback(
    (nextDetail: ContractDocumentDetailPayload) => {
      const mergedDrafts = mergeDraftsFromDetail(draftsRef.current, nextDetail)
      scrollToNextPublicStep(nextDetail, mergedDrafts)
    },
    [scrollToNextPublicStep],
  )

  useEffect(() => {
    confirmationChecksRef.current = confirmationChecks
  }, [confirmationChecks])

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  useEffect(() => {
    finalPreviewConfirmedRef.current = finalPreviewConfirmed
  }, [finalPreviewConfirmed])

  const confirmationItemsSig = useMemo(
    () =>
      JSON.stringify(
        (detail?.confirmationItems ?? []).map((c) => ({
          id: c.id,
          checked: c.checked,
        })),
      ),
    [detail?.confirmationItems],
  )

  useEffect(() => {
    if (!detail) {
      return
    }
    const items = detail.confirmationItems ?? []
    setConfirmationChecks((prev) => {
      const next: Record<string, boolean> = {}
      for (const c of items) {
        if (Object.prototype.hasOwnProperty.call(prev, c.id)) {
          next[c.id] = Boolean(prev[c.id])
        } else {
          next[c.id] = Boolean(c.checked)
        }
      }
      return next
    })
  }, [detail, confirmationItemsSig])

  useEffect(() => {
    if (!detail || (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
      return
    }
    setConfirmationContentAcknowledged(detail.confirmationContentAcknowledged === true)
  }, [detail])

  useEffect(() => {
    const mode = detail?.templateMode ?? 'coordinate_pdf'
    const previewPath = detail?.confirmationSignature?.previewUrl
    const hasSig = Boolean(detail?.confirmationSignature?.exists && previewPath)
    if (mode !== 'confirmation_only' || !hasSig || !previewPath) {
      setCoSignatureObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const ac = new AbortController()
    void (async () => {
      try {
        const res = await fetch(resolveApiUrl(previewPath), { credentials: 'include', signal: ac.signal })
        if (!res.ok) {
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setCoSignatureObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        if (!ac.signal.aborted) {
          setCoSignatureObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
          })
        }
      }
    })()
    return () => {
      ac.abort()
    }
  }, [detail?.templateMode, detail?.confirmationSignature?.exists, detail?.confirmationSignature?.previewUrl])

  useEffect(() => {
    setSignatureDrafts({})
    setSignAck(false)
    signAckRef.current = false
    setFinalPreviewConfirmed(false)
    setFinalSubmitAcknowledged(false)
    setConfirmationChecks({})
    setCoFinalAck(false)
    setConfirmationContentAcknowledged(false)
    setCoSignatureObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [linkCode, documentInstanceId])

  useEffect(() => {
    if (paramsInvalid) {
      return
    }
    let cancelled = false
    const isCancelled = () => cancelled

    void (async () => {
      await Promise.resolve()
      if (cancelled) {
        return
      }
      setLoading(true)
      setError('')
      try {
        await reloadDetail(isCancelled)
        if (!cancelled) {
          setActionError('')
        }
      } catch (e) {
        if (cancelled) {
          return
        }
        setDetail(null)
        setDrafts({})
        setSignatureDrafts({})
        if (e instanceof ApiError && e.status === 403) {
          setError('계약서 수신번호 인증이 필요합니다. 목록 화면에서 인증을 완료해 주세요.')
          return
        }
        if (e instanceof ApiError && e.status === 404) {
          setError('문서를 찾을 수 없습니다.')
          return
        }
        setError(e instanceof ApiError ? e.message : '문서를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [linkCode, documentInstanceId, paramsInvalid, reloadDetail])

  const sortedFields = useMemo(() => (detail ? sortFields(detail) : []), [detail])
  const sortedSessionAttachments = useMemo(() => {
    const raw = detail?.sendSessionAttachments ?? []
    return raw.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }, [detail?.sendSessionAttachments])
  const agreementFields = useMemo(
    () => sortedFields.filter((f) => f.fieldType === 'checkbox' && !f.hideFromCustomerInput),
    [sortedFields],
  )
  const inputFields = useMemo(
    () =>
      sortedFields.filter(
        (f) =>
          (f.fieldType === 'text' || f.fieldType === 'textarea' || f.fieldType === 'radio') &&
          !f.hideFromCustomerInput,
      ),
    [sortedFields],
  )
  const signatureFields = useMemo(() => sortedFields.filter((f) => f.fieldType === 'signature'), [sortedFields])

  const sessionChecksComplete = detail ? allSessionConfirmationsChecked(detail, confirmationChecks) : false
  const attachmentsConfirmationComplete = detail ? allRequiredAttachmentsConfirmed(detail) : false
  const confirmationStepComplete = sessionChecksComplete && attachmentsConfirmationComplete

  const coordinateStepState = useMemo(() => {
    if (!detail || (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only') {
      return null
    }
    return buildCoordinatePdfStepState(detail, drafts, confirmationChecks, finalPreviewConfirmed, signAck)
  }, [detail, drafts, confirmationChecks, finalPreviewConfirmed, signAck])

  const confirmationStepState = useMemo(() => {
    if (!detail || (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
      return null
    }
    return buildConfirmationOnlyStepState(detail, confirmationContentStepComplete(detail), confirmationChecks)
  }, [detail, confirmationChecks])

  const confirmationContentComplete =
    detail && (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only'
      ? confirmationContentStepComplete(detail)
      : false

  const canSign =
    detail && (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only'
      ? confirmationContentComplete && confirmationStepComplete
      : Boolean(
          coordinateStepState &&
            (!coordinateStepState.input.hasWork || coordinateStepState.input.isComplete) &&
            (!coordinateStepState.checks.hasWork || coordinateStepState.checks.isComplete) &&
            (!coordinateStepState.attachments.hasWork || coordinateStepState.attachments.isComplete),
        )

  const basicsComplete = detail ? allRequiredFilled(detail, drafts) : false
  const isStep3Complete =
    detail == null
      ? false
      : (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only'
        ? Boolean(detail.confirmationSignature?.exists)
        : Boolean(coordinateStepState?.signature.isComplete)

  const pdfCard2Status: PublicStepStatus =
    coordinateStepState != null
      ? mergePublicStepCardStatus(coordinateStepState.checks, coordinateStepState.attachments)
      : 'pending'
  const coordinateStep2Locked = Boolean(
    coordinateStepState?.input.hasWork && !coordinateStepState.input.isComplete,
  )
  const coordinateStep3Locked = Boolean(coordinateStepState?.signature.status === 'pending')
  const coordinateStep4Locked = Boolean(coordinateStepState?.finalReview.status === 'pending')
  const coordinateStep5Locked = Boolean(coordinateStepState?.submit.status === 'pending')

  const handleCoordinateSignAckChange = useCallback((checked: boolean) => {
    signAckRef.current = checked
    setSignAck(checked)
    if (!checked || !detail || (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only') {
      return
    }
    window.requestAnimationFrame(() => {
      const merged = mergeDraftsFromDetail(draftsRef.current, detail)
      const st = buildCoordinatePdfStepState(
        detail,
        merged,
        confirmationChecksRef.current,
        finalPreviewConfirmedRef.current,
        true,
      )
      if (st.finalReview.isActive) {
        scrollToPublicStepElement(pdfRefStep4.current)
      }
    })
  }, [detail])

  const coConfirmCardStatus: PublicStepStatus =
    confirmationStepState == null
      ? 'pending'
      : confirmationStepState.checks.status === 'active' || confirmationStepState.attachments.status === 'active'
        ? 'active'
        : confirmationStepState.checks.status === 'pending' || confirmationStepState.attachments.status === 'pending'
          ? 'pending'
          : confirmationStepState.checks.status === 'skipped' || confirmationStepState.attachments.status === 'skipped'
            ? 'skipped'
            : 'complete'

  const canSubmitSend =
    Boolean(detail && detail.canEdit !== false && detail.document.status !== 'completed') &&
    canSign &&
    isStep3Complete &&
    finalPreviewConfirmed &&
    finalSubmitAcknowledged

  const buildCustomerValuePayload = (): ContractPublicValueInput[] => {
    if (!detail) {
      return []
    }
    const values: ContractPublicValueInput[] = []
    for (const f of detail.fields) {
      if (f.fieldType === 'signature') {
        continue
      }
      if (f.readOnlyCustomerUi) {
        continue
      }
      const raw = drafts[f.id]
      if (f.fieldType === 'checkbox') {
        values.push({ fieldId: f.id, fieldKey: f.fieldKey, value: Boolean(raw) })
        continue
      }
      values.push({ fieldId: f.id, fieldKey: f.fieldKey, value: raw == null ? '' : String(raw) })
    }
    return values
  }

  const buildConfirmationOnlyCustomerValuePayload = (): Record<string, string> => {
    if (!detail || (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
      return {}
    }
    const payload: Record<string, string> = {}
    const { customerFields } = splitConfirmationFields(detail)
    for (const row of customerFields) {
      payload[row.fieldKey] = String(row.valueText ?? '')
    }
    return payload
  }

  const openSignatureModal = (id: string, label: string) => {
    const editable = detail ? detail.canEdit !== false && detail.document.status !== 'completed' : false
    if (detail && (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only') {
      if (!editable || !confirmationContentComplete || !confirmationStepComplete || !signAck) {
        return
      }
    } else if (
      !editable ||
      !coordinateStepState ||
      coordinateStepState.signature.status === 'pending' ||
      !canSign
    ) {
      return
    }
    setContractPreviewOpen(false)
    setFinalReviewOpen(false)
    setActionError('')
    setSigModalField({ id, label })
  }

  const onSaveValues = async () => {
    if (!detail || detail.canEdit === false) {
      return
    }
    setActionError('')
    setSaving(true)
    try {
      await postContractPublicDocumentValues(linkCode, documentInstanceId, buildCustomerValuePayload())
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
    } catch (e) {
      setActionError(formatContractPublicActionError(e, 'values'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveConfirmationOnlyContent = async () => {
    if (!detail || detail.canEdit === false || (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
      return
    }
    setActionError('')
    setSaving(true)
    try {
      await postContractPublicDocumentValues(linkCode, documentInstanceId, [], {
        confirmationFieldValues: buildConfirmationOnlyCustomerValuePayload(),
        confirmationContentAcknowledged,
      })
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
    } catch (e) {
      setActionError(formatContractPublicActionError(e, 'values'))
    } finally {
      setSaving(false)
    }
  }

  /** 단계 완료 조건 아님 — 현재 입력을 서버에 반영한 뒤 입력 반영본 PDF 미리보기만 연다. */
  const onOpenContractPreview = async () => {
    if (!detail || detail.canEdit === false) {
      return
    }
    setActionError('')
    setSaving(true)
    try {
      await postContractPublicDocumentValues(linkCode, documentInstanceId, buildCustomerValuePayload())
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
    } catch (e) {
      setActionError(formatContractPublicActionError(e, 'values'))
      return
    } finally {
      setSaving(false)
    }
    setSigModalField(null)
    setContractPreviewLoadNonce((n) => n + 1)
    setContractPreviewOpen(true)
  }

  const onOpenFinalReview = async () => {
    if (!detail || detail.canEdit === false) {
      return
    }
    if (!canSign) {
      setActionError('필수 정보 입력과 2단계(고객 확인 체크·첨부자료 확인)를 모두 완료한 뒤 최종 문서 확인을 진행해 주세요.')
      return
    }
    if (!isStep3Complete) {
      setActionError('전자서명(3단계)을 완료한 뒤 최종 문서 확인을 진행해 주세요.')
      return
    }
    if (!basicsComplete) {
      setActionError('필수 입력·전자서명을 모두 완료한 뒤 최종 확인을 진행해 주세요.')
      return
    }
    setActionError('')
    setSaving(true)
    try {
      await postContractPublicDocumentValues(linkCode, documentInstanceId, buildCustomerValuePayload())
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
    } catch (e) {
      setActionError(formatContractPublicActionError(e, 'values'))
      return
    } finally {
      setSaving(false)
    }
    setSigModalField(null)
    setFinalReviewLoadNonce((n) => n + 1)
    setFinalReviewOpen(true)
  }

  const onComplete = async () => {
    if (!detail || detail.canEdit === false) {
      return
    }
    if (!canSubmitSend) {
      setActionError('최종 문서 확인과 전송 동의를 완료해 주세요.')
      return
    }
    setActionError('')
    setSaving(true)
    try {
      const data = await postContractPublicDocumentComplete(linkCode, documentInstanceId, {
        acknowledgeElectronicContract: true,
        finalPreviewConfirmed: true,
        finalSubmitAcknowledged: true,
        ...(detail.confirmationItems?.length
          ? {
              confirmationCheckedItemIds: Object.entries(confirmationChecks)
                .filter(([, v]) => v)
                .map(([id]) => id),
            }
          : {}),
      })
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
      const ev = data.evidenceSummary
      const completedAt = ev?.completedAt ?? ev?.signedAt ?? new Date().toISOString()
      setCompleteResult({
        evidenceSummary: ev,
        signedPdfDownloadPath: data.signedPdfDownloadPath,
        signedPdfDownloadAvailable: data.signedPdfDownloadAvailable,
        completedAt,
      })
      setSuccessOpen(true)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const pack = e.data as { evidence?: { evidenceHashPrefix?: string | null } | null } | undefined
        const prefix = pack?.evidence?.evidenceHashPrefix
        setActionError(prefix ? `${e.message} (증빙 해시 일부: ${prefix})` : e.message)
      } else {
        setActionError(formatContractPublicCompleteError(e))
      }
    } finally {
      setSaving(false)
    }
  }

  const onConfirmationComplete = async () => {
    if (!detail || detail.canEdit === false) {
      return
    }
    if (!detail.completionAvailable) {
      setActionError('필수 확인서 항목·고객 확인·첨부 확인·전자서명을 모두 마친 뒤 진행해 주세요.')
      return
    }
    if (!coFinalAck) {
      setActionError('최종 완료 안내에 동의해 주세요.')
      return
    }
    setActionError('')
    setSaving(true)
    try {
      const hasConfItems = (detail.confirmationItems?.length ?? 0) > 0
      const data = await postContractPublicDocumentComplete(linkCode, documentInstanceId, {
        acknowledgeElectronicContract: true,
        /** 무좌표 전자확인서는 좌표형 최종 미리보기 단계가 없어 서버에서 이 값을 요구하지 않는다. */
        finalPreviewConfirmed: true,
        finalSubmitAcknowledged: true,
        ...(hasConfItems
          ? {
              confirmationCheckedItemIds: Object.entries(confirmationChecks)
                .filter(([, v]) => v)
                .map(([id]) => id),
            }
          : {}),
      })
      setCoFinalAck(false)
      const pack = await reloadDetail()
      if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
      const ev = data.evidenceSummary
      const completedAt =
        (typeof data.completedAt === 'string' ? data.completedAt : undefined) ??
        ev?.completedAt ??
        ev?.signedAt ??
        new Date().toISOString()
      setCompleteResult({
        evidenceSummary: ev,
        signedPdfDownloadPath: data.signedPdfDownloadPath,
        signedPdfDownloadAvailable: data.signedPdfDownloadAvailable,
        completedAt,
      })
      setSuccessOpen(true)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const pack = e.data as { evidence?: { evidenceHashPrefix?: string | null } | null } | undefined
        const prefix = pack?.evidence?.evidenceHashPrefix
        setActionError(prefix ? `${e.message} (증빙 해시 일부: ${prefix})` : e.message)
      } else {
        setActionError(formatContractPublicCompleteError(e))
      }
    } finally {
      setSaving(false)
    }
  }

  const persistConfirmationOnlyChecks = useCallback(
    async (checks: Record<string, boolean>) => {
      if (!detail || (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
        return
      }
      setActionError('')
      setSaving(true)
      try {
        const confirmationCheckedItemIds = Object.entries(checks)
          .filter(([, v]) => v)
          .map(([id]) => id)
        await postContractPublicDocumentValues(linkCode, documentInstanceId, [], {
          confirmationCheckedItemIds,
        })
        const pack = await reloadDetail()
        if (pack) scrollToNextPublicStep(pack.detail, pack.drafts, checks)
      } catch (e) {
        setActionError(formatContractPublicActionError(e, 'values'))
      } finally {
        setSaving(false)
      }
    },
    [detail, linkCode, documentInstanceId, reloadDetail, scrollToNextPublicStep],
  )

  const inputRenderedPdfSrc = !paramsInvalid ? resolveContractRenderedPdfAbsUrl(linkCode, documentInstanceId, 'input') : ''
  const finalRenderedPdfSrc = !paramsInvalid ? resolveContractRenderedPdfAbsUrl(linkCode, documentInstanceId, 'final') : ''

  let body: ReactNode
  if (paramsInvalid) {
    body = (
      <div className="contract-public-sign-page__panel-danger-soft">
        <p className="text-sm">링크가 올바르지 않습니다.</p>
        <Link
          className="contract-public-sign-page__link contract-public-sign-page__link--after-block"
          to={linkCode ? `/contracts/sign/${encodeURIComponent(linkCode)}` : '/'}
        >
          목록으로
        </Link>
      </div>
    )
  } else if (loading) {
    body = <p className="contract-public-sign-page__loading">불러오는 중…</p>
  } else if (error || !detail) {
    body = (
      <div className="contract-public-sign-page__panel-danger-soft">
        <p className="text-sm">{error || '문서를 표시할 수 없습니다.'}</p>
        <Link className="contract-public-sign-page__link contract-public-sign-page__link--after-block" to={`/contracts/sign/${encodeURIComponent(linkCode)}`}>
          목록으로
        </Link>
      </div>
    )
  } else {
    const canEdit = detail.canEdit !== false && detail.document.status !== 'completed'
    const statusLabel =
      detail.document.status === 'completed'
        ? '전송 완료'
        : detail.document.status === 'signed'
          ? '전자서명 저장됨 (최종 전송 전)'
          : detail.document.status === 'signing'
            ? '작성·서명 진행 중'
            : detail.document.status

    const isConfirmationOnly = (detail.templateMode ?? 'coordinate_pdf') === 'confirmation_only'
    const finalReviewComplete = detail.document.status === 'completed' || finalPreviewConfirmed
    const sortedConfFields = isConfirmationOnly
      ? (detail.confirmationFields ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.fieldKey.localeCompare(b.fieldKey))
      : []

    if (isConfirmationOnly) {
      if (detail.document.status === 'completed') {
        const coSignedOk = publicSignedPdfHrefEnabled(detail) && Boolean(publicSignedPdfHref)
        body = (
          <div className="contract-public-sign-page__stack">
            <div className="contract-public-sign-page__card">
              <p className="contract-public-sign-page__card-title">{detail.document.title || '문서'}</p>
              <p className="contract-public-sign-page__meta">
                {detail.document.required ? '필수 문서' : '선택 문서'} · {statusLabel}
              </p>
              <p className="contract-public-sign-page__caption">무좌표 전자확인서</p>
            </div>
            <div
              ref={coRefCompletedDownloads}
              className="contract-public-sign-page__panel-success contract-public-sign-page__step-anchor"
            >
              <p className="contract-public-sign-page__panel-success-title">전자확인서가 완료되었습니다.</p>
              <p className="contract-public-sign-page__notice">
                아래에서 <strong>완료 확인서 PDF</strong>를 저장할 수 있습니다. 이 문서는 확인·서명이 반영된 최종 확인서입니다.
              </p>
              <p className="contract-public-sign-page__notice contract-public-sign-page__notice--secondary">
                <strong>증빙 PDF</strong>는 본인확인·확인 항목·첨부·서명·해시 등 감사 기록을 담은 별도 문서이며, 고객 화면이 아니라 담당자 발송 내역에서 내려받을 수 있습니다.
              </p>
              {coSignedOk ? (
                <PublicSignedPdfAnchor
                  href={publicSignedPdfHref}
                  downloadName="완료 확인서.pdf"
                  variant="secondary"
                  className="mt-4"
                >
                  완료 확인서 PDF 다운로드
                </PublicSignedPdfAnchor>
              ) : (
                <p className="contract-public-sign-page__panel-success-note mt-4">
                  완료 확인서 파일을 불러오는 중입니다. 잠시 후 다시 시도하거나 목록에서 새로고침해 주세요.
                </p>
              )}
            </div>
            <Link
              className="contract-public-sign-page__link contract-public-sign-page__link--after-block"
              to={`/contracts/sign/${encodeURIComponent(linkCode)}`}
            >
              ← 문서 목록
            </Link>
          </div>
        )
      } else {
        body = (
        <div className="contract-public-sign-page__stack">
          <div className="contract-public-sign-page__card">
            <p className="contract-public-sign-page__card-title">{detail.document.title || '문서'}</p>
            <p className="contract-public-sign-page__meta">
              {detail.document.required ? '필수 문서' : '선택 문서'} · {statusLabel}
            </p>
            <p className="contract-public-sign-page__caption">무좌표 전자확인서</p>
          </div>

          <p className="contract-public-sign-page__notice">{detail.notice}</p>
          {actionError ? <div className="contract-public-sign-page__panel-danger">{actionError}</div> : null}

          <div
            ref={coRefContentSection}
            className={publicStepCardClassNameByStatus(confirmationStepState?.content.status ?? 'pending')}
          >
            <p className="contract-public-sign-page__card-title">1단계. 확인서 내용 작성/확인</p>
            <p className="contract-public-sign-page__notice mt-2">
              발송자 입력 내용은 읽기 전용으로 확인하고, 고객 입력 항목은 직접 작성 후 저장해 주세요.
            </p>
            {(() => {
              const senderFields = sortedConfFields.filter((row) => normalizeConfirmationInputRole(row.inputRole) === 'sender')
              const customerFields = sortedConfFields.filter(
                (row) => normalizeConfirmationInputRole(row.inputRole) === 'customer',
              )
              return (
                <div className="mt-4 space-y-4">
                  {senderFields.length > 0 ? (
                    <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight space-y-3">
                      <p className="contract-public-sign-page__section-label">발송자가 입력한 내용</p>
                      {senderFields.map((row) => {
                        const raw = String(row.valueText ?? '').trim()
                        const display = raw.length > 0 ? raw : '입력 없음'
                        const isTa = String(row.inputType ?? '').toLowerCase() === 'textarea'
                        return (
                          <div key={`sender-${row.fieldKey}`} className="space-y-1">
                            <p className="contract-public-sign-page__field-label">
                              {row.label || row.fieldKey}
                              {row.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                            </p>
                            <p
                              className={`text-sm text-[var(--text-main)] contract-public-sign-page__confirmation-value contract-public-sign-page__confirmation-readonly${
                                isTa ? ' contract-public-sign-page__confirmation-value--multiline' : ''
                              }`}
                            >
                              {display}
                            </p>
                            {row.helpText ? <p className="contract-public-sign-page__caption">{row.helpText}</p> : null}
                          </div>
                        )
                      })}
                      <label className="contract-public-sign-page__label-row">
                        <FormInput
                          type="checkbox"
                          checked={confirmationContentAcknowledged}
                          disabled={!canEdit || saving}
                          onChange={(ev) => setConfirmationContentAcknowledged(ev.target.checked)}
                          className="mt-0.5"
                        />
                        <span>위 내용을 확인했습니다.</span>
                      </label>
                    </div>
                  ) : null}

                  {customerFields.length > 0 ? (
                    <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight space-y-3">
                      <p className="contract-public-sign-page__section-label">고객이 직접 입력할 내용</p>
                      {customerFields.map((row) => {
                        const valueText = String(row.valueText ?? '')
                        const normalizedType = String(row.inputType ?? 'text').toLowerCase()
                        return (
                          <div key={`customer-${row.fieldKey}`} className="space-y-1">
                            <p className="contract-public-sign-page__field-label">
                              {row.label || row.fieldKey}
                              {row.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                            </p>
                            {normalizedType === 'textarea' ? (
                              <FormTextarea
                                disabled={!canEdit || saving}
                                value={valueText}
                                onChange={(ev) =>
                                  setDetail((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          confirmationFields: (prev.confirmationFields ?? []).map((field) =>
                                            field.fieldKey === row.fieldKey ? { ...field, valueText: ev.target.value } : field,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                rows={4}
                                className="w-full text-sm"
                              />
                            ) : (
                              <FormInput
                                type={normalizedType === 'date' ? 'date' : normalizedType === 'number' ? 'number' : 'text'}
                                disabled={!canEdit || saving}
                                value={valueText}
                                onChange={(ev) =>
                                  setDetail((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          confirmationFields: (prev.confirmationFields ?? []).map((field) =>
                                            field.fieldKey === row.fieldKey ? { ...field, valueText: ev.target.value } : field,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                className="w-full text-sm"
                              />
                            )}
                            {row.helpText ? <p className="contract-public-sign-page__caption">{row.helpText}</p> : null}
                          </div>
                        )
                      })}
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        fullWidth
                        loading={saving}
                        disabled={!canEdit}
                        onClick={() => void onSaveConfirmationOnlyContent()}
                      >
                        확인서 입력 저장
                      </FormButton>
                    </div>
                  ) : null}

                  {senderFields.length === 0 && customerFields.length === 0 ? (
                    <p className="contract-public-sign-page__notice">표시할 확인 항목이 없습니다.</p>
                  ) : null}
                </div>
              )
            })()}
            {confirmationStepState?.content.status === 'complete' ? (
              <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">1단계 완료</p>
            ) : confirmationStepState?.content.status === 'skipped' ? (
              <p className="contract-public-sign-page__notice contract-public-sign-page__step-status">
                확인서 입력/확인 항목이 없습니다.
              </p>
            ) : (
              <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">
                필수 customer 입력 저장과 sender 내용 확인을 완료해 주세요.
              </p>
            )}
          </div>

          <p className="contract-public-sign-page__notice">
            1단계와 필수 확인 절차를 마친 뒤 전자서명을 남기고, 안내에 따라 최종 완료하면 완료 확인서 PDF를 받을 수 있습니다.
          </p>

          <div className={publicStepCardClassNameByStatus(coConfirmCardStatus)}>
            <p className="contract-public-sign-page__card-title">확인 사항</p>
            <p className="contract-public-sign-page__notice mt-2">
              아래 항목에 동의하고, 필요 시 첨부자료를 열람·확인해 주세요.
            </p>

            <div
              ref={coRefConfirmChecksSection}
              className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4 space-y-3"
            >
              <p className="contract-public-sign-page__section-label">고객 확인 체크</p>
              {(detail.confirmationItems?.length ?? 0) > 0 ? (
                (detail.confirmationItems ?? []).map((c) => (
                  <label key={c.id} className="contract-public-sign-page__label-row">
                    <FormInput
                      type="checkbox"
                      disabled={!canEdit || saving}
                      checked={Boolean(confirmationChecks[c.id])}
                      onChange={(ev) => {
                        setConfirmationChecks((prev) => {
                          const next = { ...prev, [c.id]: ev.target.checked }
                          void persistConfirmationOnlyChecks(next)
                          return next
                        })
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      {c.label}
                      {c.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                    </span>
                  </label>
                ))
              ) : (
                <p className="contract-public-sign-page__notice">등록된 고객 확인 체크 문구가 없습니다.</p>
              )}
            </div>

            {sortedSessionAttachments.length > 0 ? (
              <div
                ref={coRefConfirmAttachSection}
                className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4 space-y-3"
              >
                <p className="contract-public-sign-page__section-label">첨부자료</p>
                <ol className="contract-public-sign-page__attachment-list space-y-4">
                  {sortedSessionAttachments.map((a, idx) => (
                    <li key={a.id} className="contract-public-sign-page__attachment-item">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[var(--text-main)] contract-public-sign-page__confirmation-value">
                          {idx + 1}. {a.displayFilename}
                        </span>
                        {a.required ? (
                          <span className="contract-public-sign-page__badge contract-public-sign-page__badge--required">
                            필수
                          </span>
                        ) : null}
                        {a.confirmed ? (
                          <span className="contract-public-sign-page__badge contract-public-sign-page__badge--ok">
                            확인 완료
                          </span>
                        ) : (
                          <span className="contract-public-sign-page__badge contract-public-sign-page__badge--pending">
                            미확인
                          </span>
                        )}
                      </div>
                      {!a.confirmed ? (
                        <p className="contract-public-sign-page__caption mt-1">열람 후 확인 버튼을 눌러주세요.</p>
                      ) : (
                        <p className="contract-public-sign-page__status-ok mt-1 text-sm">
                          {a.displayFilename} 문서를 확인했습니다.
                        </p>
                      )}
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        className="mt-2"
                        disabled={!canEdit || saving}
                        onClick={() => {
                          setActionError('')
                          setAttachmentModal(a)
                          setAttachmentModalNonce((n) => n + 1)
                        }}
                      >
                        {a.confirmed ? '다시 보기' : '열기'}
                      </FormButton>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {sortedSessionAttachments.length > 0 ? (
              <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4">
                <p className="contract-public-sign-page__section-label">
                  {attachmentsConfirmationComplete ? '첨부자료 확인 내역' : '첨부자료 확인 필요'}
                </p>
                {attachmentsConfirmationComplete ? (
                  <ol className="contract-public-sign-page__compact-list mt-2 space-y-1">
                    {sortedSessionAttachments.map((a, idx) => (
                      <li key={`co-sum-ok-${a.id}`} className="text-sm text-[var(--text-main)]">
                        {idx + 1}. {a.displayFilename} 문서를 확인했습니다.
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="contract-public-sign-page__compact-list mt-2 space-y-1">
                    {sortedSessionAttachments.map((a, idx) => (
                      <li key={`co-sum-pending-${a.id}`} className="text-sm contract-public-sign-page__status-pending">
                        {idx + 1}. {a.displayFilename}
                        {a.confirmed ? ` 문서를 확인했습니다.` : ' 확인 필요'}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            {coConfirmCardStatus === 'complete' ? (
              <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">
                필수 확인을 마쳤습니다
              </p>
            ) : coConfirmCardStatus === 'skipped' ? (
              <p className="contract-public-sign-page__notice contract-public-sign-page__step-status">
                필수 고객 확인·첨부 항목이 없습니다.
              </p>
            ) : (
              <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">
                {!confirmationContentComplete
                  ? '1단계(확인서 내용 작성/확인)를 먼저 완료해 주세요.'
                  : !sessionChecksComplete
                  ? '필수 확인 항목을 모두 체크해 주세요.'
                  : !attachmentsConfirmationComplete
                    ? '필수 첨부자료를 모두 열람·확인해 주세요.'
                    : '확인을 완료해 주세요.'}
              </p>
            )}
          </div>

          <div
            ref={coRefSignatureCard}
            className={`${publicStepCardClassNameByStatus(
              confirmationStepState?.signature.status ?? 'pending',
            )} contract-public-sign-page__co-sign-card`}
          >
            <p className="contract-public-sign-page__card-title">전자서명</p>
            {!confirmationContentComplete || !confirmationStepComplete ? (
              <p className="contract-public-sign-page__notice mt-2">
                1단계(내용 작성/확인)와 필수 확인·첨부 확인을 마친 뒤 서명할 수 있습니다.
              </p>
            ) : (
              <>
                <p className="contract-public-sign-page__notice mt-2">
                  아래 진술에 동의한 뒤 서명을 진행해 주세요. 서명 저장 후 최종 완료 단계로 진행할 수 있습니다.
                </p>
                {detail.confirmationSignature?.exists && coSignatureObjectUrl ? (
                  <div className="mt-4">
                    <p className="contract-public-sign-page__status-ok text-sm">서명이 저장되었습니다.</p>
                    <img
                      src={coSignatureObjectUrl}
                      alt="저장된 전자서명"
                      className="contract-public-sign-page__co-signature-img"
                    />
                  </div>
                ) : null}
                {canEdit ? (
                  <>
                    <label className="contract-public-sign-page__label-row mt-4">
                      <FormInput
                        type="checkbox"
                        checked={signAck}
                          disabled={!confirmationContentComplete || !confirmationStepComplete || saving}
                        onChange={(ev) => setSignAck(ev.target.checked)}
                        className="mt-0.5"
                      />
                      <span>본인은 위 전자확인서가 본인에게 발송된 문서임을 확인하고, 전자서명합니다.</span>
                    </label>
                    <FormButton
                      htmlType="button"
                      variant="primary"
                      fullWidth
                      className="mt-4 contract-public-sign-page__co-sign-cta"
                      disabled={saving || !signAck || !confirmationContentComplete || !confirmationStepComplete}
                      onClick={() => openSignatureModal(CONFIRMATION_SIGNATURE_FIELD_ID, '전자서명')}
                    >
                      {detail.confirmationSignature?.exists ? '다시 서명하기' : '서명하기'}
                    </FormButton>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="contract-public-sign-page__co-final-section">
            <div
              ref={coRefFinalCard}
              className={publicStepCardClassNameByStatus(confirmationStepState?.final.status ?? 'pending')}
            >
              <p className="contract-public-sign-page__card-title">최종 완료</p>
              <p className="contract-public-sign-page__notice mt-2">
                확인서 내용·첨부·고객 확인 체크 및 전자서명을 모두 마쳤다면 동의 후 최종 완료를 눌러 주세요.
              </p>
              <label className="contract-public-sign-page__label-row mt-4">
                <FormInput
                  type="checkbox"
                  checked={coFinalAck}
                  disabled={!canEdit || saving || !detail.completionAvailable}
                  onChange={(ev) => setCoFinalAck(ev.target.checked)}
                  className="mt-0.5"
                />
                <span>위 내용을 확인했으며 전자확인서 절차를 최종 완료합니다.</span>
              </label>
              <FormButton
                htmlType="button"
                variant="primary"
                fullWidth
                className="mt-4 contract-public-sign-page__co-final-cta"
                disabled={saving || !canEdit || !detail.completionAvailable || !coFinalAck}
                loading={saving}
                onClick={() => void onConfirmationComplete()}
              >
                최종 완료
              </FormButton>
              {canEdit && !detail.completionAvailable ? (
                <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status mt-2">
                  필수 확인서 값·고객 확인·첨부 확인·전자서명이 모두 완료되어야 합니다.
                </p>
              ) : null}
            </div>
          </div>

          <ContractAttachmentReviewModal
            open={attachmentModal != null && !paramsInvalid}
            onClose={() => setAttachmentModal(null)}
            linkCode={linkCode}
            attachment={attachmentModal}
            loadNonce={attachmentModalNonce}
            onActionError={(msg) => setActionError(msg)}
            onConfirmed={(row) => {
              setDetail((prev) => {
                if (!prev?.sendSessionAttachments?.length) {
                  return prev
                }
                const next = {
                  ...prev,
                  sendSessionAttachments: prev.sendSessionAttachments.map((at) =>
                    at.id === row.attachmentId
                      ? {
                          ...at,
                          viewed: row.viewed,
                          confirmed: row.confirmed,
                          confirmedAt: row.confirmedAt,
                        }
                      : at,
                  ),
                }
                window.requestAnimationFrame(() => scrollAfterAttachmentPatch(next))
                return next
              })
              setAttachmentModal((prev) =>
                prev && prev.id === row.attachmentId
                  ? {
                      ...prev,
                      viewed: row.viewed,
                      confirmed: row.confirmed,
                      confirmedAt: row.confirmedAt,
                    }
                  : prev,
              )
            }}
          />

          <SignatureModal
            open={sigModalField != null}
            padResetKey={
              sigModalField
                ? `${sigModalField.id}:${signatureDrafts[String(sigModalField.id)] ? 'has' : 'none'}`
                : undefined
            }
            title="전자서명 입력"
            description="손가락 또는 마우스로 서명하세요."
            saveLabel="서명 저장"
            onClose={() => setSigModalField(null)}
            onSave={async (blob) => {
              if (!sigModalField || !detail) {
                return
              }
              if (!signAck) {
                throw new Error('전자서명 진술에 동의해 주세요.')
              }
              const dataUrl = await blobToDataUrl(blob)
              const signatureKey = String(sigModalField.id)
              await postContractPublicDocumentSign(linkCode, documentInstanceId, {
                signatureImageData: dataUrl,
                fieldId: sigModalField.id,
                electronicSignAcknowledged: true,
              })
              setSignatureDrafts((prev) => ({ ...prev, [signatureKey]: dataUrl }))
              const pack = await reloadDetail()
              if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
            }}
          />

          <Link
            className="contract-public-sign-page__link contract-public-sign-page__link--after-block"
            to={`/contracts/sign/${encodeURIComponent(linkCode)}`}
          >
            ← 문서 목록
          </Link>
        </div>
      )
      }
    } else {
      body = (
      <div className="contract-public-sign-page__stack">
        <div className="contract-public-sign-page__card">
          <p className="contract-public-sign-page__card-title">{detail.document.title || '문서'}</p>
          <p className="contract-public-sign-page__meta">
            {detail.document.required ? '필수 문서' : '선택 문서'} · {statusLabel}
          </p>
          {detail.pdfTemplate ? (
            <p className="contract-public-sign-page__caption">
              템플릿: {detail.pdfTemplate.title} ({detail.pdfTemplate.pageCount}페이지)
            </p>
          ) : null}
        </div>

        {detail.document.status === 'completed' && detail.evidenceSummary ? (
          <div
            ref={pdfRefCompletedPanel}
            className="contract-public-sign-page__panel-success contract-public-sign-page__step-anchor"
          >
            <p className="contract-public-sign-page__panel-success-title">전자서명이 전송되었습니다.</p>
            <p>인증 방식: {detail.evidenceSummary.authenticationLabel}</p>
            {detail.evidenceSummary.completedAt ? <p>완료 시각: {detail.evidenceSummary.completedAt}</p> : null}
            {!detail.evidenceSummary.completedAt && detail.evidenceSummary.signedAt ? (
              <p>서명 시각: {detail.evidenceSummary.signedAt}</p>
            ) : null}
            {detail.evidenceSummary.evidenceHashPrefix ? (
              <p className="contract-public-sign-page__panel-success-note">
                증빙 기록(해시 일부): {detail.evidenceSummary.evidenceHashPrefix}
              </p>
            ) : null}
            {(() => {
              const can = publicSignedPdfHrefEnabled(detail) && Boolean(publicSignedPdfHref)
              return can ? (
                <PublicSignedPdfAnchor
                  href={publicSignedPdfHref}
                  downloadName="완료 계약서.pdf"
                  variant="secondary"
                  className="mt-4"
                >
                  완료 계약서 PDF 다운로드
                </PublicSignedPdfAnchor>
              ) : (
                <p className="contract-public-sign-page__panel-success-note">
                  완료 계약서 PDF를 불러오는 중입니다. 담당자 화면에서 증빙 상태를 확인할 수 있습니다.
                </p>
              )
            })()}
          </div>
        ) : null}

        <p className="contract-public-sign-page__notice">{detail.notice}</p>

        {actionError ? <div className="contract-public-sign-page__panel-danger">{actionError}</div> : null}

        {canEdit && detail.fields.length > 0 ? (
          <FormButton
            htmlType="button"
            variant="secondary"
            fullWidth
            className="mt-2"
            loading={saving}
            onClick={() => void onOpenContractPreview()}
          >
            계약서 미리보기
          </FormButton>
        ) : null}
        {canEdit && detail.fields.length > 0 ? (
          <p className="contract-public-sign-page__notice text-sm mt-1">
            현재까지 입력한 내용이 반영된 계약서를 엽니다. 단계 완료와 무관하게 확인용으로만 사용할 수 있습니다.
          </p>
        ) : null}

        {detail.fields.length > 0 ? (
          <>
            <div
              ref={pdfRefStep1}
              className={publicStepCardClassNameByStatus(coordinateStepState?.input.status ?? 'pending')}
            >
              <p className="contract-public-sign-page__card-title">1단계. 필수 정보 입력</p>
              <p className="contract-public-sign-page__notice mt-2">
                계약서에 직접 입력하실 항목을 작성해 주세요.
              </p>
              <div className="mt-4 space-y-4">
                {agreementFields.length > 0 ? (
                  <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight space-y-3">
                    <p className="contract-public-sign-page__section-label">확인·동의</p>
                    {agreementFields.map((f) => {
                      const checked = Boolean(drafts[f.id])
                      return (
                        <label key={f.id} className="contract-public-sign-page__label-row">
                          <FormInput
                            type="checkbox"
                            disabled={!canEdit}
                            checked={checked}
                            onChange={(ev) => {
                              setDrafts((prev) => ({ ...prev, [f.id]: ev.target.checked }))
                              setFinalPreviewConfirmed(false)
                              setFinalSubmitAcknowledged(false)
                            }}
                            className="mt-0.5"
                          />
                          <span>
                            {f.label || f.fieldKey}
                            {f.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ) : null}

                {inputFields.length > 0 ? (
                  <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight space-y-3">
                    <p className="contract-public-sign-page__section-label">문서 입력</p>
                    {inputFields.map((f) => {
                      if (f.fieldType === 'radio') {
                        const opts = Array.isArray(f.options) ? f.options.map((x) => String(x)) : []
                        const cur = String(drafts[f.id] ?? '')
                        return (
                          <div key={f.id} className="space-y-1">
                            <p className="contract-public-sign-page__field-label">
                              {f.label || f.fieldKey}
                              {f.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                            </p>
                            <FormSelect
                              disabled={!canEdit}
                              value={cur}
                              options={[{ value: '', label: '선택' }, ...opts.map((o) => ({ value: o, label: o }))]}
                              onChange={(ev) => {
                                setDrafts((prev) => ({ ...prev, [f.id]: ev.target.value }))
                                setFinalPreviewConfirmed(false)
                                setFinalSubmitAcknowledged(false)
                              }}
                              className="w-full"
                            />
                          </div>
                        )
                      }
                      const isTextarea = f.fieldType === 'textarea'
                      const tv = String(drafts[f.id] ?? '')
                      return (
                        <div key={f.id} className="space-y-1">
                          <p className="contract-public-sign-page__field-label">
                            {f.label || f.fieldKey}
                            {f.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                          </p>
                          {isTextarea ? (
                            <FormTextarea
                              disabled={!canEdit}
                              value={tv}
                              onChange={(ev) => {
                                setDrafts((prev) => ({ ...prev, [f.id]: ev.target.value }))
                                setFinalPreviewConfirmed(false)
                                setFinalSubmitAcknowledged(false)
                              }}
                              rows={4}
                              className="w-full text-sm"
                            />
                          ) : (
                            <FormInput
                              type="text"
                              disabled={!canEdit}
                              value={tv}
                              onChange={(ev) => {
                                setDrafts((prev) => ({ ...prev, [f.id]: ev.target.value }))
                                setFinalPreviewConfirmed(false)
                                setFinalSubmitAcknowledged(false)
                              }}
                              className="w-full text-sm"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {canEdit ? (
                  <FormButton htmlType="button" variant="secondary" fullWidth loading={saving} onClick={() => void onSaveValues()}>
                    임시저장
                  </FormButton>
                ) : null}
              </div>
              {coordinateStepState?.input.status === 'complete' ? (
                <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">1단계 완료</p>
              ) : coordinateStepState?.input.status === 'skipped' ? (
                <p className="contract-public-sign-page__notice contract-public-sign-page__step-status">
                  고객 입력 필수 항목이 없습니다.
                </p>
              ) : (
                <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">
                  필수 항목을 입력해 주세요
                </p>
              )}
            </div>

            <div className={publicStepCardClassNameByStatus(pdfCard2Status)}>
              <p className="contract-public-sign-page__card-title">2단계. 고객 확인 항목</p>
              <p className="contract-public-sign-page__notice mt-2">
                아래 내용을 확인해야 전자서명을 진행할 수 있습니다.
              </p>
              {coordinateStep2Locked ? (
                <p className="contract-public-sign-page__notice mt-3">1단계 문서 입력을 완료하면 진행할 수 있습니다.</p>
              ) : null}

              <div
                ref={pdfRefStep2Checks}
                className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4 space-y-3"
              >
                <p className="contract-public-sign-page__section-label">고객 확인 체크 항목</p>
                {(detail.confirmationItems?.length ?? 0) > 0 ? (
                  (detail.confirmationItems ?? []).map((c) => (
                    <label key={c.id} className="contract-public-sign-page__label-row">
                      <FormInput
                          type="checkbox"
                          disabled={!canEdit || coordinateStep2Locked}
                          checked={Boolean(confirmationChecks[c.id])}
                          onChange={(ev) => {
                            setConfirmationChecks((prev) => ({ ...prev, [c.id]: ev.target.checked }))
                            setFinalPreviewConfirmed(false)
                            setFinalSubmitAcknowledged(false)
                          }}
                          className="mt-0.5"
                        />
                      <span>
                        {c.label}
                        {c.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="contract-public-sign-page__notice">이 문서 발송에 별도 고객 확인 체크 문구가 없습니다.</p>
                )}
              </div>

              {sortedSessionAttachments.length > 0 ? (
                <div
                  ref={pdfRefStep2Attach}
                  className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4 space-y-3"
                >
                  <p className="contract-public-sign-page__section-label">첨부자료 확인</p>
                  <ol className="contract-public-sign-page__attachment-list space-y-4">
                    {sortedSessionAttachments.map((a, idx) => (
                      <li key={a.id} className="contract-public-sign-page__attachment-item">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-[var(--text-main)]">
                            {idx + 1}. {a.displayFilename}
                          </span>
                          {a.required ? (
                            <span className="contract-public-sign-page__badge contract-public-sign-page__badge--required">
                              필수
                            </span>
                          ) : null}
                          {a.confirmed ? (
                            <span className="contract-public-sign-page__badge contract-public-sign-page__badge--ok">확인 완료</span>
                          ) : (
                            <span className="contract-public-sign-page__badge contract-public-sign-page__badge--pending">미확인</span>
                          )}
                        </div>
                        {!a.confirmed ? (
                          <p className="contract-public-sign-page__caption mt-1">열람 후 확인 버튼을 눌러주세요.</p>
                        ) : (
                          <p className="contract-public-sign-page__status-ok mt-1 text-sm">
                            {a.displayFilename} 문서를 확인했습니다.
                          </p>
                        )}
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          className="mt-2"
                          disabled={!canEdit || coordinateStep2Locked}
                          onClick={() => {
                            setActionError('')
                            setAttachmentModal(a)
                            setAttachmentModalNonce((n) => n + 1)
                          }}
                        >
                          {a.confirmed ? '다시 보기' : '열기'}
                        </FormButton>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {sortedSessionAttachments.length > 0 ? (
                <div className="contract-public-sign-page__subsection contract-public-sign-page__subsection--tight mt-4">
                  <p className="contract-public-sign-page__section-label">
                    {attachmentsConfirmationComplete ? '첨부자료 확인 내역' : '첨부자료 확인 필요'}
                  </p>
                  {attachmentsConfirmationComplete ? (
                    <ol className="contract-public-sign-page__compact-list mt-2 space-y-1">
                      {sortedSessionAttachments.map((a, idx) => (
                        <li key={`sum-ok-${a.id}`} className="text-sm text-[var(--text-main)]">
                          {idx + 1}. {a.displayFilename} 문서를 확인했습니다.
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <ol className="contract-public-sign-page__compact-list mt-2 space-y-1">
                      {sortedSessionAttachments.map((a, idx) => (
                        <li key={`sum-pending-${a.id}`} className="text-sm contract-public-sign-page__status-pending">
                          {idx + 1}. {a.displayFilename}
                          {a.confirmed ? ` 문서를 확인했습니다.` : ' 확인 필요'}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}

              {pdfCard2Status === 'complete' ? (
                <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">2단계 완료</p>
              ) : pdfCard2Status === 'skipped' ? (
                <p className="contract-public-sign-page__notice contract-public-sign-page__step-status">
                  필수 고객 확인·첨부 항목이 없습니다.
                </p>
              ) : (
                <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">
                  {!sessionChecksComplete
                    ? '필수 확인 항목을 모두 체크해 주세요.'
                    : !attachmentsConfirmationComplete
                      ? '필수 첨부자료를 모두 열람하고 확인해 주세요.'
                      : '확인을 완료해 주세요.'}
                </p>
              )}
            </div>

            <div
              ref={pdfRefStep3}
              className={publicStepCardClassNameByStatus(coordinateStepState?.signature.status ?? 'pending')}
            >
              <p className="contract-public-sign-page__card-title">3단계. 전자서명</p>
              <p className="contract-public-sign-page__notice mt-2">
                계약서에 사용할 전자서명을 입력해주세요.
              </p>
              {coordinateStep3Locked ? (
                <p className="contract-public-sign-page__notice mt-3">
                  고객 확인 항목을 완료하면 전자서명을 진행할 수 있습니다.
                </p>
              ) : null}
              {signatureFields.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {signatureFields.map((f) => {
                    const signed = f.publicValue?.kind === 'signature' ? f.publicValue.signed : false
                    return (
                      <div key={f.id} className="contract-public-sign-page__sig-row space-y-2">
                        <p className="text-sm text-[var(--text-main)]">
                          {f.label || f.fieldKey}
                          {f.required ? <span className="contract-public-sign-page__required"> *</span> : null}
                          {signed ? (
                            <span className="contract-public-sign-page__success-inline">
                              · 전자서명이 저장되었습니다
                            </span>
                          ) : null}
                        </p>
                        {!canEdit ? null : signed ? (
                          <>
                            <label className="contract-public-sign-page__label-row">
                              <FormInput
                                type="checkbox"
                                checked={signAck}
                                disabled={coordinateStep3Locked}
                                onChange={(ev) => handleCoordinateSignAckChange(ev.target.checked)}
                                className="mt-0.5"
                              />
                              <span>본인은 본 계약서가 본인에게 발송된 문서임을 확인하고, 전자서명합니다.</span>
                            </label>
                            <FormButton
                              htmlType="button"
                              variant={canSign ? 'primary' : 'secondary'}
                              fullWidth
                              disabled={saving || !signAck || !canSign || coordinateStep3Locked}
                              onClick={() => openSignatureModal(f.id, f.label || f.fieldKey)}
                            >
                              다시 서명하기
                            </FormButton>
                          </>
                        ) : (
                          <>
                            <label className="contract-public-sign-page__label-row">
                              <FormInput
                                type="checkbox"
                                checked={signAck}
                                disabled={coordinateStep3Locked}
                                onChange={(ev) => handleCoordinateSignAckChange(ev.target.checked)}
                                className="mt-0.5"
                              />
                              <span>본인은 본 계약서가 본인에게 발송된 문서임을 확인하고, 전자서명합니다.</span>
                            </label>
                            <FormButton
                              htmlType="button"
                              variant={canSign ? 'primary' : 'secondary'}
                              fullWidth
                              disabled={saving || !signAck || !canSign || coordinateStep3Locked}
                              onClick={() => openSignatureModal(f.id, f.label || f.fieldKey)}
                            >
                              전자서명하기
                            </FormButton>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="contract-public-sign-page__notice mt-3">이 문서에는 별도의 전자서명란이 없습니다.</p>
              )}
              {coordinateStepState?.signature.status === 'complete' ? (
                <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">3단계 완료</p>
              ) : coordinateStepState?.signature.status === 'skipped' ? (
                <p className="contract-public-sign-page__notice contract-public-sign-page__step-status">
                  서명란이 없어 이 단계는 생략됩니다.
                </p>
              ) : (
                <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">전자서명 진행 중</p>
              )}
            </div>

            <div
              ref={pdfRefStep4}
              className={publicStepCardClassNameByStatus(coordinateStepState?.finalReview.status ?? 'pending')}
            >
              <p className="contract-public-sign-page__card-title">4단계. 최종 문서 확인</p>
              <p className="contract-public-sign-page__notice mt-2">
                고객 입력값, 발송자 입력값, 고정 출력값 및 전자서명이 모두 반영된 최종 계약서를 확인해 주세요.
              </p>
              {coordinateStep4Locked ? (
                <p className="contract-public-sign-page__notice mt-3">전자서명을 완료하면 최종 문서를 확인할 수 있습니다.</p>
              ) : null}
              <FormButton
                htmlType="button"
                variant={isStep3Complete && canSign ? 'primary' : 'secondary'}
                fullWidth
                className="mt-4"
                disabled={!canEdit || saving || !isStep3Complete || !canSign}
                onClick={() => void onOpenFinalReview()}
              >
                최종 문서 보기
              </FormButton>
              {finalReviewComplete ? (
                <p className="contract-public-sign-page__status-ok contract-public-sign-page__step-status">최종 문서 확인 완료</p>
              ) : (
                <p className="contract-public-sign-page__status-pending contract-public-sign-page__step-status">미확인</p>
              )}
            </div>

            {canEdit ? (
              <div
                ref={pdfRefStep5}
                className={publicStepCardClassNameByStatus(coordinateStepState?.submit.status ?? 'pending')}
              >
                <p className="contract-public-sign-page__card-title">5단계. 완료 및 전송</p>
                <p className="contract-public-sign-page__notice mt-2">
                  최종 문서를 확인하셨다면 아래 내용에 동의한 뒤 전송을 완료해 주세요.
                </p>
                {coordinateStep5Locked ? (
                  <p className="contract-public-sign-page__notice mt-3">
                    최종 문서 확인을 완료하면 전송 단계로 진행할 수 있습니다.
                  </p>
                ) : null}
                <label className="contract-public-sign-page__label-row mt-4">
                  <FormInput
                    type="checkbox"
                    checked={finalSubmitAcknowledged}
                    disabled={!finalPreviewConfirmed || coordinateStep5Locked}
                    onChange={(ev) => setFinalSubmitAcknowledged(ev.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    본인은 위 문서의 내용을 충분히 확인하였으며, 입력한 내용과 전자서명이 본인의 의사에 따라 직접
                    작성·서명된 것임을 확인하고, 본 전자서명 문서를 제출하는 데 동의합니다.
                  </span>
                </label>
                <FormButton
                  htmlType="button"
                  variant="primary"
                  fullWidth
                  className="mt-4"
                  loading={saving}
                  disabled={!canSubmitSend}
                  onClick={() => void onComplete()}
                >
                  전체 완료 및 전송
                </FormButton>
              </div>
            ) : null}
          </>
        ) : null}

        <Link className="contract-public-sign-page__link contract-public-sign-page__link--after-block" to={`/contracts/sign/${encodeURIComponent(linkCode)}`}>
          ← 문서 목록
        </Link>

        <PublicPdfPreviewModal
          open={contractPreviewOpen}
          onClose={() => setContractPreviewOpen(false)}
          title="계약서 미리보기"
          subtitle="현재까지 저장된 내용이 반영된 계약서입니다. 확인 후 닫기만 하시면 됩니다."
          pdfUrl={inputRenderedPdfSrc}
          initialPdfBytes={null}
          pageCount={Math.max(1, detail.pdfTemplate?.pageCount ?? 1)}
          initialPageNo={1}
          documentInstanceId={documentInstanceId}
          loadNonce={contractPreviewLoadNonce}
          footerSlot={
            <FormButton htmlType="button" variant="primary" fullWidth onClick={() => setContractPreviewOpen(false)}>
              닫기
            </FormButton>
          }
        />

        <PublicPdfPreviewModal
          open={finalReviewOpen}
          onClose={() => setFinalReviewOpen(false)}
          title="최종 문서 확인"
          subtitle="입력하신 내용과 전자서명이 올바르게 반영되었는지 확인해주세요."
          pdfUrl={finalRenderedPdfSrc}
          initialPdfBytes={null}
          pageCount={Math.max(1, detail.pdfTemplate?.pageCount ?? 1)}
          initialPageNo={1}
          documentInstanceId={documentInstanceId}
          loadNonce={finalReviewLoadNonce}
          footerSlot={
            <div className="contract-public-sign-page__footer-actions">
              <FormButton
                htmlType="button"
                variant="primary"
                fullWidth
                onClick={() => {
                  setFinalPreviewConfirmed(true)
                  finalPreviewConfirmedRef.current = true
                  setFinalSubmitAcknowledged(false)
                  setFinalReviewOpen(false)
                  window.requestAnimationFrame(() => {
                    if (detail && (detail.templateMode ?? 'coordinate_pdf') !== 'confirmation_only') {
                      scrollToNextPublicStep(detail, mergeDraftsFromDetail(draftsRef.current, detail))
                    }
                  })
                }}
              >
                확인했습니다
              </FormButton>
            </div>
          }
        />

        <ContractAttachmentReviewModal
          open={attachmentModal != null && !paramsInvalid}
          onClose={() => setAttachmentModal(null)}
          linkCode={linkCode}
          attachment={attachmentModal}
          loadNonce={attachmentModalNonce}
          onActionError={(msg) => setActionError(msg)}
          onConfirmed={(row) => {
            setDetail((prev) => {
              if (!prev?.sendSessionAttachments?.length) {
                return prev
              }
              const next = {
                ...prev,
                sendSessionAttachments: prev.sendSessionAttachments.map((a) =>
                  a.id === row.attachmentId
                    ? {
                        ...a,
                        viewed: row.viewed,
                        confirmed: row.confirmed,
                        confirmedAt: row.confirmedAt,
                      }
                    : a,
                ),
              }
              window.requestAnimationFrame(() => scrollAfterAttachmentPatch(next))
              return next
            })
            setAttachmentModal((prev) =>
              prev && prev.id === row.attachmentId
                ? {
                    ...prev,
                    viewed: row.viewed,
                    confirmed: row.confirmed,
                    confirmedAt: row.confirmedAt,
                  }
                : prev,
            )
          }}
        />

        <SignatureModal
          open={sigModalField != null}
          padResetKey={
            sigModalField
              ? `${sigModalField.id}:${signatureDrafts[String(sigModalField.id)] ? 'has' : 'none'}`
              : undefined
          }
          title="전자서명 입력"
          description="손가락 또는 마우스로 서명하세요."
          saveLabel="서명 적용"
          onClose={() => setSigModalField(null)}
          onSave={async (blob) => {
            if (!sigModalField || !detail) {
              return
            }
            if (!signAck) {
              throw new Error('전자서명 진술에 동의해 주세요.')
            }
            const dataUrl = await blobToDataUrl(blob)
            const signatureKey = String(sigModalField.id)
            await postContractPublicDocumentSign(linkCode, documentInstanceId, {
              signatureImageData: dataUrl,
              fieldId: sigModalField.id,
              electronicSignAcknowledged: true,
            })
            setSignatureDrafts((prev) => ({ ...prev, [signatureKey]: dataUrl }))
            const pack = await reloadDetail()
            if (pack) scrollToNextPublicStep(pack.detail, pack.drafts)
          }}
        />

      </div>
    )
    }
  }

  const successIsConfirmation = (detail?.templateMode ?? 'coordinate_pdf') === 'confirmation_only'

  return (
    <div className="contract-public-sign-page">
      <div className="contract-public-sign-page__inner">
        <h1 className="contract-public-sign-page__h1">계약서 문서</h1>
        {body}
        {successOpen && completeResult && detail ? (
          <div
            className="contract-public-sign-page__success-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={successIsConfirmation ? '전자확인서 완료' : '전송 완료'}
          >
            <div className="contract-public-sign-page__success-dialog">
              <h2 className="contract-public-sign-page__success-dialog-title">
                {successIsConfirmation ? '전자확인서가 완료되었습니다.' : '전자서명이 전송되었습니다.'}
              </h2>
              <p className="contract-public-sign-page__success-dialog-lead">
                문서명: <span className="font-medium">{detail.document.title || '문서'}</span>
              </p>
              {completeResult.completedAt ? <p>완료 시각: {completeResult.completedAt}</p> : null}
              {completeResult.evidenceSummary?.evidenceHashPrefix ? (
                <p className="contract-public-sign-page__success-dialog-muted">
                  증빙번호(해시 일부): {completeResult.evidenceSummary.evidenceHashPrefix}
                </p>
              ) : null}
              <p className="contract-public-sign-page__success-dialog-muted">
                {successIsConfirmation
                  ? '완료 확인서 PDF(최종 확인·서명 문서)와 증빙 PDF(감사 기록)가 저장되었습니다. 완료 확인서 PDF는 아래에서 내려받을 수 있으며, 증빙 PDF는 담당자 발송 내역에서 내려받을 수 있습니다.'
                  : '담당자가 완료된 전자서명 문서를 확인할 수 있습니다. 이 화면은 닫으셔도 됩니다. 카카오톡으로 돌아가려면 상단 닫기 버튼을 눌러주세요.'}
              </p>
              <div className="contract-public-sign-page__success-dialog-actions">
                {(() => {
                  const canDl =
                    Boolean(publicSignedPdfHref) &&
                    (publicSignedPdfHrefEnabled(detail) || completeResult != null)
                  return canDl ? (
                    <PublicSignedPdfAnchor
                      href={publicSignedPdfHref}
                      downloadName={successIsConfirmation ? '완료 확인서.pdf' : '완료 계약서.pdf'}
                      variant="primary"
                    >
                      {successIsConfirmation ? '완료 확인서 PDF 다운로드' : '완료 계약서 PDF 다운로드'}
                    </PublicSignedPdfAnchor>
                  ) : (
                    <p className="contract-public-sign-page__success-dialog-muted">
                      {successIsConfirmation
                        ? '완료 확인서 PDF 링크를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
                        : '완료 계약서 PDF 링크를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
                    </p>
                  )
                })()}
                <FormButton
                  htmlType="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setSuccessOpen(false)
                    window.close()
                  }}
                >
                  닫기
                </FormButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
