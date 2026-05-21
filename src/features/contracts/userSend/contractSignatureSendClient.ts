import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import type {
  CreateSendSessionResult,
  SendSessionDetail,
} from '../testConsole/contractSignatureTestConsoleClient'

export const CONTRACT_SEND_CONFIRMATION_MAX_ITEMS = 10
export const CONTRACT_SEND_CONFIRMATION_MAX_LABEL_LEN = 200

export type ContractSenderFieldDef = {
  fieldKey: string
  label: string
  required: boolean
  fieldType: string
  orderIndex: number
  options?: unknown
}

export type ContractTemplateMode = 'coordinate_pdf' | 'confirmation_only'

export type UserContractConfirmationFieldRow = {
  id: string
  fieldKey: string
  label: string
  inputType: 'text' | 'textarea' | 'number' | 'date'
  inputRole: 'sender' | 'customer'
  required: boolean
  sortOrder: number
  placeholder: string | null
  helpText: string | null
}

function coerceUserConfirmationInputType(raw: unknown): UserContractConfirmationFieldRow['inputType'] {
  const it = String(raw ?? 'text').trim()
  if (it === 'textarea' || it === 'number' || it === 'date' || it === 'text') {
    return it
  }
  return 'text'
}

function coerceUserConfirmationInputRole(raw: unknown): UserContractConfirmationFieldRow['inputRole'] {
  const role = String(raw ?? 'sender').trim()
  return role === 'customer' ? 'customer' : 'sender'
}

function coerceUserConfirmationField(raw: Record<string, unknown>): UserContractConfirmationFieldRow {
  return {
    id: String(raw.id ?? ''),
    fieldKey: String(raw.fieldKey ?? raw.field_key ?? ''),
    label: String(raw.label ?? ''),
    inputType: coerceUserConfirmationInputType(raw.inputType ?? raw.input_type),
    inputRole: coerceUserConfirmationInputRole(raw.inputRole ?? raw.input_role),
    required: Boolean(raw.required),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    placeholder: raw.placeholder != null ? String(raw.placeholder) : null,
    helpText:
      raw.helpText != null
        ? String(raw.helpText)
        : raw.help_text != null
          ? String(raw.help_text)
          : null,
  }
}

export type UserContractTemplateItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  status: string
  version: number
  /** 서버 기본값 coordinate_pdf */
  templateMode: ContractTemplateMode
  pdfTemplateId: number | null
  pdfEngineTitle: string | null
  pdfFieldCount: number
  signatureFieldCount: number
  /** 설계사가 발송 전에 채워야 하는 PDF 필드(서버가 연결된 PDF 기준으로 계산) */
  senderFieldsForSend: ContractSenderFieldDef[]
  sendable: boolean
}

export type UserContractCustomerSearchHit = {
  id: number
  name: string
  customerCode: string | null
  maskedPhone: string
  hasPhone: boolean
}

/** 이름 등: 2글자 이상, 숫자만: 4자리 이상일 때만 API 검색에 적합 */
export function isContractCustomerSearchQueryReady(raw: string): boolean {
  const q = raw.trim()
  if (!q) {
    return false
  }
  if (/^\d+$/.test(q)) {
    return q.length >= 4
  }
  return q.length >= 2
}

/** 검색 버튼 클릭 시 노출할 유효성 메시지(통과 시 null) */
export function getContractCustomerSearchValidationMessage(raw: string): string | null {
  const q = raw.trim()
  if (!q) {
    return '고객 이름, 전화번호 일부 또는 고객번호를 입력해 검색하세요.'
  }
  if (/^\d+$/.test(q) && q.length < 4) {
    return '전화번호 또는 고객번호는 4자리 이상 입력해주세요.'
  }
  if (!/^\d+$/.test(q) && q.length < 2) {
    return '검색어를 2글자 이상 입력해주세요.'
  }
  return null
}

export const CONTRACT_SEND_ATTACHMENTS_MAX = 20

export async function uploadUserContractSendAttachment(
  token: string,
  customerId: number,
  file: File,
): Promise<{
  fileId: string
  displayFilename: string
  contentHash: string
  mimeType: string
  sizeBytes: number
}> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('customerId', String(customerId))
  const resolvedUrl = resolveApiUrl('/api/contracts/send-sessions/attachment-upload')
  const res = await fetch(resolvedUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.trim()}` },
    body: fd,
  })
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    fileId?: string
    displayFilename?: string
    contentHash?: string
    mimeType?: string
    sizeBytes?: number
    message?: string
  }
  if (!res.ok || !payload.ok || !payload.fileId) {
    const msg =
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : '첨부 파일 업로드에 실패했습니다.'
    throw new ApiError(msg, res.status || 500)
  }
  return {
    fileId: String(payload.fileId),
    displayFilename: String(payload.displayFilename ?? file.name),
    contentHash: String(payload.contentHash ?? ''),
    mimeType: String(payload.mimeType ?? file.type ?? ''),
    sizeBytes: Number(payload.sizeBytes ?? file.size),
  }
}

export async function listUserContractTemplates(
  token: string,
): Promise<UserContractTemplateItem[]> {
  const body = await apiRequest<{ templates?: UserContractTemplateItem[] }>(
    '/api/contracts/templates',
    { method: 'GET', token },
  )
  const raw = body as { templates?: UserContractTemplateItem[] }
  if (!raw?.templates || !Array.isArray(raw.templates)) {
    throw new ApiError('템플릿 목록 응답 형식이 올바르지 않습니다.', 500)
  }
  return raw.templates.map((row) => ({
    ...row,
    templateMode: row.templateMode === 'confirmation_only' ? 'confirmation_only' : 'coordinate_pdf',
    senderFieldsForSend: Array.isArray(row.senderFieldsForSend) ? row.senderFieldsForSend : [],
  }))
}

/**
 * confirmation_only 템플릿의 확인서 항목 정의 조회(발송 화면 전용, 읽기 전용).
 * coordinate_pdf 템플릿이면 서버가 409를 반환한다.
 */
export async function listUserContractTemplateConfirmationFields(
  token: string,
  templateId: string,
): Promise<UserContractConfirmationFieldRow[]> {
  const body = await apiRequest<{ fields?: unknown[] }>(
    `/api/contracts/templates/${encodeURIComponent(templateId)}/confirmation-fields`,
    { method: 'GET', token },
  )
  const raw = body as { fields?: unknown[] }
  if (!raw?.fields || !Array.isArray(raw.fields)) {
    throw new ApiError('확인 항목 목록 응답 형식이 올바르지 않습니다.', 500)
  }
  return raw.fields.map((f) => coerceUserConfirmationField(f as Record<string, unknown>))
}

function dedupeContractSendHitsById(
  rows: UserContractCustomerSearchHit[],
): UserContractCustomerSearchHit[] {
  const seen = new Set<number>()
  const out: UserContractCustomerSearchHit[] = []
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue
    }
    seen.add(row.id)
    out.push(row)
  }
  return out
}

export async function searchCustomersForContractSend(
  token: string,
  q: string,
): Promise<UserContractCustomerSearchHit[]> {
  if (!isContractCustomerSearchQueryReady(q)) {
    return []
  }
  const trimmed = q.trim()
  const qs = new URLSearchParams()
  qs.set('q', trimmed)
  const body = await apiRequest<{ customers?: UserContractCustomerSearchHit[] }>(
    `/api/contracts/customers/search?${qs.toString()}`,
    { method: 'GET', token },
  )
  const raw = body as { customers?: UserContractCustomerSearchHit[] }
  if (!raw?.customers || !Array.isArray(raw.customers)) {
    throw new ApiError('고객 검색 응답 형식이 올바르지 않습니다.', 500)
  }
  return dedupeContractSendHitsById(raw.customers)
}

export async function createUserContractSendSession(
  token: string,
  params: {
    customerId: number
    templateIds: string[]
    /** fieldKey → 값 (단일 템플릿 발송 시 평면 맵). */
    senderInputValues?: Record<string, unknown>
    /** @deprecated senderInputValues 사용 */
    senderFieldValues?: Record<string, Record<string, unknown>>
    /** 고객 공개 화면에서 전자서명 전 확인받을 체크 문구(PDF 필드 아님). */
    confirmationItems?: { label: string; required?: boolean }[]
    /** confirmation_only: field_key → 표시값(서버에서 정의·필수 검증). */
    confirmationFieldValues?: Record<string, string>
    /** 첨부 참고 문서(fileId는 업로드 API로 발급) */
    attachments?: { fileId: string; required?: boolean }[]
  },
): Promise<CreateSendSessionResult> {
  const body = await apiRequest<{
    sendSession?: CreateSendSessionResult
    confirmationItems?: { id: string; label: string; required: boolean }[]
  }>('/api/contracts/send-sessions', {
    method: 'POST',
    token,
    body: JSON.stringify({
      customerId: params.customerId,
      templateIds: params.templateIds,
      senderInputValues: params.senderInputValues ?? params.senderFieldValues,
      confirmationItems: params.confirmationItems,
      confirmationFieldValues: params.confirmationFieldValues,
      attachments: params.attachments,
    }),
  })
  const s = body.sendSession
  if (!s?.id || !s.linkCode) {
    throw new ApiError('발송 세션 생성 응답이 올바르지 않습니다.', 500)
  }
  if (body.confirmationItems && Array.isArray(body.confirmationItems)) {
    s.confirmationItems = body.confirmationItems
  }
  return s
}

export async function getUserContractSendSessionDetail(
  token: string,
  sendSessionId: string,
): Promise<SendSessionDetail> {
  const body = await apiRequest<{ sendSession?: SendSessionDetail }>(
    `/api/contracts/send-sessions/${encodeURIComponent(sendSessionId)}`,
    { method: 'GET', token },
  )
  const s = body.sendSession
  if (!s?.id || !s.linkCode) {
    throw new ApiError('발송 세션 상세 응답이 올바르지 않습니다.', 500)
  }
  if (!Array.isArray(s.confirmationItems)) {
    s.confirmationItems = []
  }
  if (!Array.isArray(s.sendSessionAttachments)) {
    s.sendSessionAttachments = []
  }
  return s
}
