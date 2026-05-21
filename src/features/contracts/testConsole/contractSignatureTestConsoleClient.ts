/**
 * 전자서명 테스트 콘솔 — 기존 관리자 계약 API만 어댑트. 비즈니스 로직 복사 없음.
 */
import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import {
  getAdminPdfTemplate,
  getPdfTemplate,
  listAdminPdfTemplates,
  listPdfTemplates,
} from '../../pdf-engine/api/pdfTemplateApi'
import type { PdfTemplateDetail, PdfTemplateSummary } from '../../pdf-engine/types'
import { searchCustomers } from '../../customers/api/customersApi'
import type { CustomerRecord } from '../../customers/domain/types'

export type ContractTemplateMode = 'coordinate_pdf' | 'confirmation_only'

export type ContractTemplateListItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  status: string
  version: number
  templateMode: ContractTemplateMode
  pdfTemplateId: number | null
  pdfEngineTitle: string | null
  pageCount: number | null
  gaId: number | null
  createdAt: string
  updatedAt: string
  /** contract_document_instances 건수(발송 이력 판단) */
  documentInstanceCount: number
  /** contract_package_items 건수 */
  packageItemCount: number
}

export type ContractFieldInputSettingRow = {
  fieldKey: string
  label: string
  fieldType: string
  required: boolean
  placementCount: number
  inputRole: 'customer' | 'sender' | 'fixed'
  fixedValue: string | null
}

export type ContractTemplateDetail = {
  id: string
  title: string
  description: string | null
  category: string | null
  status: string
  version: number
  templateMode: ContractTemplateMode
  pdfTemplateId: number | null
  pdfFileId: string | null
  pdfFilePath: string | null
  pdfHash: string | null
  pageCount: number | null
  gaId: number | null
  contractTemplateFieldsCount: number
  /** 연결 PDF 필드별 입력 방식(전자서명 템플릿 기준) */
  fieldInputSettings: ContractFieldInputSettingRow[]
  pdfEngine: {
    id: number
    title: string
    storageKey: string
    pageCount: number | null
    isActive: boolean
  } | null
  createdAt: string
  updatedAt: string
}

export type ContractSendConfirmationItem = {
  id: string
  label: string
  required: boolean
  sortOrder: number
  checked: boolean
  checkedAt: string | null
}

export type CreateSendSessionResult = {
  id: string
  linkCode: string
  customerId: number
  status: string
  maskedPhone: string
  documentCount: number
  createdAt: string
  confirmationItems?: { id: string; label: string; required: boolean }[]
}

export type SendSessionAttachmentDetail = {
  id: string
  displayFilename: string
  mimeType: string | null
  required: boolean
  sortOrder: number
  viewed: boolean
  viewedAt: string | null
  confirmed: boolean
  confirmedAt: string | null
}

export type SendSessionEvidence = {
  documentInstanceId: string
  documentTitle: string | null
  status: string
  completedAt: string | null
  evidenceHash: string | null
  evidenceHashPrefix: string | null
  identityProvider: string
  identityLevel: string
  otpVerifiedAt: string | null
  signedAt: string | null
  hasSignatureFile: boolean
  hasSignedPdfFile: boolean
  hasSignedPdfHash: boolean
} | null

export type SendSessionDocumentDetail = {
  id: string
  templateId: string
  templateVersion: number
  titleSnapshot: string
  status: string
  sortOrder: number
  originalPdfHash: string | null
  createdAt: string
  completedAt: string | null
  evidence: SendSessionEvidence
}

export type SendSessionDetail = {
  id: string
  linkCode: string
  customerId: number
  /** FC 내역·상세에서만 채움 */
  customerName?: string | null
  customerCode?: string | null
  /** 세션에 연결된 템플릿 모드 (confirmation_only 등) */
  templateMode?: string | null
  packageId: string | null
  status: string
  maskedPhone: string
  identitySessionId: string | null
  identityStatus?: string | null
  identityVerifiedAt?: string | null
  openedAt?: string | null
  expiredAt?: string | null
  sentByUserId: string | null
  sentAt: string | null
  createdAt: string
  completedAt: string | null
  documents: SendSessionDocumentDetail[]
  /** 고객 확인 체크 항목(발송 시 정의·완료 후 체크 이력) */
  confirmationItems?: ContractSendConfirmationItem[]
  /** 발송 시 첨부한 참고 문서(고객 열람·확인 이력) */
  sendSessionAttachments?: SendSessionAttachmentDetail[]
}

function tenantQs(tenantGaId: number | null, isSuper: boolean): string {
  if (!isSuper || tenantGaId == null || !Number.isFinite(tenantGaId)) {
    return ''
  }
  const q = new URLSearchParams()
  q.set('tenant_ga_id', String(tenantGaId))
  return `?${q.toString()}`
}

function tenantBody(tenantGaId: number | null, isSuper: boolean): Record<string, number> {
  if (!isSuper || tenantGaId == null || !Number.isFinite(tenantGaId)) {
    return {}
  }
  return { tenant_ga_id: tenantGaId }
}

export async function listPdfTemplatesForContractTest(
  token: string,
  role: string | undefined,
): Promise<{ templates: PdfTemplateSummary[]; source: 'admin' | 'user' }> {
  if (role === 'SUPER_ADMIN') {
    const { templates } = await listAdminPdfTemplates(token)
    return { templates, source: 'admin' }
  }
  const { templates } = await listPdfTemplates(token)
  return { templates, source: 'user' }
}

export async function getPdfTemplateDetailForContractTest(
  token: string,
  role: string | undefined,
  id: number,
): Promise<PdfTemplateDetail> {
  if (role === 'SUPER_ADMIN') {
    return getAdminPdfTemplate(token, id)
  }
  return getPdfTemplate(token, id)
}

export function countPdfFieldStats(detail: PdfTemplateDetail): {
  fieldCount: number
  signatureCount: number
} {
  const fields = detail.fields ?? []
  let signatureCount = 0
  for (const f of fields) {
    const ft = (f as { fieldType?: string }).fieldType
    if (ft === 'signature') {
      signatureCount += 1
    }
  }
  return { fieldCount: fields.length, signatureCount }
}

export async function listContractTemplates(
  token: string,
  role: string | undefined,
  tenantGaId: number | null,
): Promise<ContractTemplateListItem[]> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ templates?: ContractTemplateListItem[] }>(
    `/api/admin/contracts/templates${qs}`,
    { method: 'GET', token },
  )
  const raw = body as { templates?: ContractTemplateListItem[] }
  if (!raw?.templates || !Array.isArray(raw.templates)) {
    throw new ApiError('계약 템플릿 목록 응답 형식이 올바르지 않습니다.', 500)
  }
  return raw.templates.map((t) => ({
    ...t,
    templateMode: t.templateMode === 'confirmation_only' ? 'confirmation_only' : 'coordinate_pdf',
    documentInstanceCount: Number((t as ContractTemplateListItem).documentInstanceCount ?? 0),
    packageItemCount: Number((t as ContractTemplateListItem).packageItemCount ?? 0),
  }))
}

export async function fetchContractTemplateDetail(
  token: string,
  role: string | undefined,
  templateId: string,
  tenantGaId: number | null,
): Promise<ContractTemplateDetail> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ template?: ContractTemplateDetail }>(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}${qs}`,
    { method: 'GET', token },
  )
  const tpl = (body as { template?: ContractTemplateDetail }).template
  if (!tpl?.id) {
    throw new ApiError('계약 템플릿 상세 응답이 올바르지 않습니다.', 500)
  }
  return {
    ...tpl,
    templateMode: tpl.templateMode === 'confirmation_only' ? 'confirmation_only' : 'coordinate_pdf',
    fieldInputSettings: Array.isArray(tpl.fieldInputSettings) ? tpl.fieldInputSettings : [],
  }
}

export async function patchContractTemplateFieldInputSettings(
  token: string,
  role: string | undefined,
  templateId: string,
  payload: { fieldSettings: Array<{ fieldKey: string; inputRole: string; fixedValue?: string | null }> },
  tenantGaId: number | null,
): Promise<void> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  await apiRequest(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/field-input-settings${qs}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ fieldSettings: payload.fieldSettings, ...tenantBody(tenantGaId, isSuper) }),
    },
  )
}

export async function patchContractTemplate(
  token: string,
  role: string | undefined,
  templateId: string,
  payload: { title?: string; description?: string | null },
  tenantGaId: number | null,
): Promise<void> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  await apiRequest(`/api/admin/contracts/templates/${encodeURIComponent(templateId)}${qs}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ ...payload, ...tenantBody(tenantGaId, isSuper) }),
  })
}

export async function createContractTemplateFromPdfTemplate(
  token: string,
  role: string | undefined,
  params: { pdfTemplateId: number; pdfTitle: string; tenantGaId: number | null },
): Promise<string> {
  const isSuper = role === 'SUPER_ADMIN'
  const baseTitle = String(params.pdfTitle ?? '').trim() || '계약서'
  const title = `${baseTitle} 전자서명 템플릿`
  const body = await apiRequest<{ data?: { id?: string } }>(`/api/admin/contracts/templates`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      title,
      pdfTemplateId: params.pdfTemplateId,
      templateMode: 'coordinate_pdf',
      status: 'draft',
      description: '전자서명 관리에서 선택한 PDF 템플릿으로 생성됨',
      ...tenantBody(params.tenantGaId, isSuper),
    }),
  })
  const id = (body as { data?: { id?: string } })?.data?.id
  if (!id || typeof id !== 'string') {
    throw new ApiError('계약 템플릿 생성 응답에 id가 없습니다.', 500)
  }
  return id
}

/** 무좌표 전자확인서용 템플릿 초안 생성(PDF 없음). */
export async function createConfirmationOnlyContractTemplate(
  token: string,
  role: string | undefined,
  params: { title: string; description?: string | null; tenantGaId: number | null },
): Promise<string> {
  const isSuper = role === 'SUPER_ADMIN'
  const title = String(params.title ?? '').trim()
  if (!title) {
    throw new ApiError('제목을 입력하세요.', 400)
  }
  const body = await apiRequest<{ data?: { id?: string } }>(`/api/admin/contracts/templates`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      title,
      templateMode: 'confirmation_only',
      status: 'draft',
      description: params.description ?? '무좌표 전자확인서 템플릿',
      ...tenantBody(params.tenantGaId, isSuper),
    }),
  })
  const id = (body as { data?: { id?: string } })?.data?.id
  if (!id || typeof id !== 'string') {
    throw new ApiError('계약 템플릿 생성 응답에 id가 없습니다.', 500)
  }
  return id
}

export async function setContractTemplateStatus(
  token: string,
  role: string | undefined,
  templateId: string,
  status: 'draft' | 'active' | 'archived',
  tenantGaId: number | null,
): Promise<void> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  await apiRequest(`/api/admin/contracts/templates/${encodeURIComponent(templateId)}/status${qs}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status, ...tenantBody(tenantGaId, isSuper) }),
  })
}

/** @deprecated setContractTemplateStatus(..., 'active') 사용 권장 */
export async function activateContractTemplate(
  token: string,
  role: string | undefined,
  templateId: string,
  tenantGaId: number | null,
): Promise<void> {
  await setContractTemplateStatus(token, role, templateId, 'active', tenantGaId)
}

export async function deleteContractTemplate(
  token: string,
  role: string | undefined,
  templateId: string,
  tenantGaId: number | null,
): Promise<void> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  await apiRequest(`/api/admin/contracts/templates/${encodeURIComponent(templateId)}${qs}`, {
    method: 'DELETE',
    token,
  })
}

export async function duplicateContractTemplate(
  token: string,
  role: string | undefined,
  templateId: string,
  tenantGaId: number | null,
): Promise<string> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ data?: { id?: string } }>(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/duplicate${qs}`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(tenantBody(tenantGaId, isSuper)),
    },
  )
  const id = (body as { data?: { id?: string } }).data?.id
  if (!id) {
    throw new ApiError('복제 응답에 id가 없습니다.', 500)
  }
  return id
}

export async function searchCustomersForContractTest(
  token: string,
  q: string,
  role: string | undefined,
  scopeGaId: number | null,
): Promise<CustomerRecord[]> {
  if (role === 'SUPER_ADMIN') {
    return searchCustomers(token, q, { scopeGaId })
  }
  return searchCustomers(token, q)
}

export async function createContractSendSession(
  token: string,
  role: string | undefined,
  params: {
    customerId: number
    templateIds: string[]
    tenantGaId: number | null
    senderInputValues?: Record<string, unknown>
  },
): Promise<CreateSendSessionResult> {
  const isSuper = role === 'SUPER_ADMIN'
  const body = await apiRequest<{ sendSession?: CreateSendSessionResult }>(
    `/api/admin/contracts/send-sessions`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        customerId: params.customerId,
        templateIds: params.templateIds,
        ...(params.senderInputValues && Object.keys(params.senderInputValues).length > 0
          ? { senderInputValues: params.senderInputValues }
          : {}),
        ...tenantBody(params.tenantGaId, isSuper),
      }),
    },
  )
  const s = (body as { sendSession?: CreateSendSessionResult }).sendSession
  if (!s?.id || !s.linkCode) {
    throw new ApiError('발송 세션 생성 응답이 올바르지 않습니다.', 500)
  }
  return s
}

export async function getContractSendSessionDetail(
  token: string,
  role: string | undefined,
  sendSessionId: string,
  tenantGaId: number | null,
): Promise<SendSessionDetail> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ sendSession?: SendSessionDetail }>(
    `/api/admin/contracts/send-sessions/${encodeURIComponent(sendSessionId)}${qs}`,
    { method: 'GET', token },
  )
  const s = (body as { sendSession?: SendSessionDetail }).sendSession
  if (!s?.id) {
    throw new ApiError('발송 세션 상세 응답이 올바르지 않습니다.', 500)
  }
  if (!Array.isArray(s.confirmationItems)) {
    s.confirmationItems = []
  }
  return s
}

/** 담당자용 완료 PDF 다운로드 URL (storageKey 미노출) */
export function buildStaffSignedPdfAbsUrl(sendSessionId: string, documentInstanceId: string): string {
  return resolveApiUrl(
    `/api/contracts/send-sessions/${encodeURIComponent(sendSessionId)}/documents/${encodeURIComponent(documentInstanceId)}/signed-pdf`,
  )
}

/** 발송 세션 단위 증빙 PDF (Bearer 인증) */
export function buildStaffEvidencePdfAbsUrl(sendSessionId: string): string {
  return resolveApiUrl(`/api/contracts/send-sessions/${encodeURIComponent(sendSessionId)}/evidence.pdf`)
}

export type ContractPdfDownloadResult = { ok: true } | { ok: false; message: string }

/** Content-Disposition 헤더에서 파일명 추출 (filename* UTF-8 우선) */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (header == null || String(header).trim() === '') {
    return null
  }
  const h = String(header)
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;\n]+)/i.exec(h)
  if (star?.[1]) {
    try {
      let v = star[1].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      return decodeURIComponent(v)
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(h)
  if (quoted?.[1]) {
    return quoted[1]
  }
  const plain = /filename=([^;\s]+)/i.exec(h)
  if (plain?.[1]) {
    return plain[1].replace(/^["']|["']$/g, '')
  }
  return null
}

async function readPdfDownloadErrorMessage(res: Response, generic5xx?: string): Promise<string> {
  const ct = (res.headers.get('Content-Type') ?? '').toLowerCase()
  if (ct.includes('application/json')) {
    try {
      const j = (await res.json()) as { message?: unknown }
      if (typeof j?.message === 'string' && j.message.trim() !== '') {
        return j.message.trim()
      }
    } catch {
      /* ignore */
    }
  }
  if (res.status === 401) {
    return '로그인이 필요합니다.'
  }
  if (res.status === 403) {
    return '다운로드 권한이 없습니다.'
  }
  if (res.status === 404) {
    return '파일을 찾을 수 없습니다.'
  }
  if (res.status >= 500 && generic5xx) {
    return generic5xx
  }
  return '다운로드에 실패했습니다.'
}

async function downloadAuthorizedPdf(
  url: string,
  token: string,
  fallbackFilename: string,
  options?: { generic5xx?: string },
): Promise<ContractPdfDownloadResult> {
  const auth = token.trim()
  if (!auth) {
    return { ok: false, message: '로그인이 필요합니다.' }
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } })
  const fname = parseContentDispositionFilename(res.headers.get('Content-Disposition')) ?? fallbackFilename
  if (!res.ok) {
    const message = await readPdfDownloadErrorMessage(res, options?.generic5xx)
    return { ok: false, message }
  }
  const blob = await res.blob()
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = fname
  a.click()
  URL.revokeObjectURL(u)
  return { ok: true }
}

export async function downloadStaffSignedPdfFile(
  token: string,
  sendSessionId: string,
  documentInstanceId: string,
): Promise<ContractPdfDownloadResult> {
  return downloadAuthorizedPdf(
    buildStaffSignedPdfAbsUrl(sendSessionId, documentInstanceId),
    token,
    'signed-contract.pdf',
  )
}

/** 완료 세션 기준 증빙 PDF (서버 즉시 생성) */
export async function downloadStaffEvidencePdfFile(
  token: string,
  sendSessionId: string,
): Promise<ContractPdfDownloadResult> {
  return downloadAuthorizedPdf(buildStaffEvidencePdfAbsUrl(sendSessionId), token, 'evidence.pdf', {
    generic5xx: '증빙 PDF 생성 중 오류가 발생했습니다.',
  })
}
