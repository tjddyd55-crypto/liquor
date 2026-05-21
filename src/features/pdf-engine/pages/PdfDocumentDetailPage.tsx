/**
 * 사용자용 문서 상세 — PC/모바일 분리 뷰 + 실시간 PDF 오버레이 미리보기.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { FormButton } from '../../../components/form'
import Modal from '../../../components/ui/Modal'
import { ApiError, resolveAbsoluteApiUrl } from '../../../lib/apiClient'
import { useAuth } from '../../auth/AuthProvider'
import { getCustomerById, searchCustomers } from '../../customers/api/customersApi'
import { listCustomerCars, type CustomerCarRecord } from '../../customers/api/customerCarsApi'
import type { CustomerRecord } from '../../customers/domain/types'
import {
  fetchPdfTemplateFile,
  getPdfIssuance,
  getPdfTemplate,
  renderPdfTemplate,
  requestPdfRenderPreviewUrl,
} from '../api/pdfTemplateApi'
import { mergedInitialValues, splitPdfSnapshot } from '../components/PdfTemplateForm'
import PdfDocumentApplicantPCView from './pdf-document/PdfDocumentApplicantPCView'
import PdfDocumentApplicantMobileView from './pdf-document/PdfDocumentApplicantMobileView'
import type {
  PdfDocumentApplicantViewProps,
  PdfSelectedCustomerSummary,
} from './pdf-document/pdfDocumentApplicantViewProps'
import { clampApplicantFontSizePt } from '../lib/pdfApplicantTypography'
import {
  applyCustomerDataToPdfValues,
  normalizePdfFieldDataMapping,
  overwriteCarMappedPdfValuesFromCustomer,
} from '../lib/resolvePdfFieldValue'
import { hasCarMappedFields } from '../lib/hasCarMappedFields'
import { customerWithSelectedCar, sortCustomerCarsForPicker } from '../lib/customerPdfCarOverlay'
import type { PdfFieldSpec, PdfInputRole, PdfTemplateSummary } from '../types'
import { DEFAULT_PDF_FIELD_DATA_MAPPING } from '../types'
import { usePdfDocumentsWorkspacePaths } from '../utils/pdfCustomerWorkspacePaths'
import { buildPdfIssuanceDisplayFilename } from '../utils/pdfIssuanceFilename'
import '../pdf-engine.css'

function coercePdfFieldSpecForForm(f: PdfFieldSpec & { id?: number }): PdfFieldSpec {
  const rest = { ...f } as PdfFieldSpec & { id?: number }
  delete rest.id
  const inputRole: PdfInputRole =
    rest.fieldType === 'signature'
      ? 'customer'
      : rest.inputRole === 'sender' || rest.inputRole === 'disabled' || rest.inputRole === 'customer'
        ? rest.inputRole
        : 'customer'
  return {
    ...rest,
    inputRole,
    dataMapping: normalizePdfFieldDataMapping(rest.dataMapping ?? DEFAULT_PDF_FIELD_DATA_MAPPING),
  }
}

function pickFontSnapshotsFromIssuance(
  fields: PdfFieldSpec[],
  snapFonts: Record<string, number>,
): Record<string, number> {
  const textKeys = new Set(
    fields.filter((f) => f.fieldType === 'text' || f.fieldType === 'textarea').map((f) => f.fieldKey),
  )
  const out: Record<string, number> = {}
  for (const [k0, v0] of Object.entries(snapFonts)) {
    const k = String(k0)
    if (!textKeys.has(k)) continue
    const n = Number(v0)
    if (!Number.isFinite(n) || n <= 0) continue
    out[k] = clampApplicantFontSizePt(n)
  }
  return out
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; template: PdfTemplateSummary; fields: PdfFieldSpec[] }

type SourcePrefillState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; values: Record<string, string> }

/** fetch 응답 Blob 이 빈 타입이어도 뷰어·다운로드가 PDF 로 인식하도록 고정한다. */
function coercePdfBlob(blob: Blob): Blob {
  if (blob && blob.type === 'application/pdf') return blob
  return new Blob([blob], { type: 'application/pdf' })
}

/** Blob → 브라우저 다운로드. File 로 감싸 저장 대화상자·일부 PDF 뷰어의 기본 파일명을 정렬한다. */
function triggerDownload(blob: Blob, filename: string): void {
  const safeName = filename.trim() || 'document.pdf'
  const typed = blob.type?.includes('pdf') ? blob : new Blob([blob], { type: 'application/pdf' })
  const file = new File([typed], safeName, { type: 'application/pdf' })
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = safeName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export default function PdfDocumentDetailPage() {
  const { id: idParam, customerId: routeCustomerId } = useParams<{ id?: string; customerId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = Number(idParam)
  const { token, user } = useAuth()
  const { listPath, historyPath } = usePdfDocumentsWorkspacePaths()

  const issuerParam = searchParams.get('issuerCustomerName')
  const workspaceCustomerIdFromRoute = useMemo(() => {
    const n = Number(routeCustomerId)
    return Number.isInteger(n) && n >= 1 ? n : null
  }, [routeCustomerId])

  const issuerCustomerLabel = useMemo(() => {
    if (!issuerParam?.trim()) return ''
    try {
      return decodeURIComponent(issuerParam.trim())
    } catch {
      return issuerParam.trim()
    }
  }, [issuerParam])

  const sourceIssuanceId = useMemo(() => {
    const raw = searchParams.get('sourceIssuanceId')
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 1 ? n : null
  }, [searchParams])

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [submitting, setSubmitting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewValues, setPreviewValues] = useState<Record<string, string> | null>(null)
  const [previewFonts, setPreviewFonts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [sourcePrefill, setSourcePrefill] = useState<SourcePrefillState>({ kind: 'none' })
  const [fallbackCustomerLabel, setFallbackCustomerLabel] = useState('')

  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null)
  const [applicantValues, setApplicantValues] = useState<Record<string, string>>({})
  const [fontOverrides, setFontOverrides] = useState<Record<string, number>>({})
  const [focusedFieldKey, setFocusedFieldKey] = useState<string | null>(null)
  const [loadingCustomerData, setLoadingCustomerData] = useState(false)
  const [overwriteCustomerOnLoad, setOverwriteCustomerOnLoad] = useState(false)
  const [customerLoadHint, setCustomerLoadHint] = useState<string | null>(null)
  const [cachedCustomer, setCachedCustomer] = useState<CustomerRecord | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<PdfSelectedCustomerSummary | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false)
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null)
  const [customerSearchResults, setCustomerSearchResults] = useState<PdfSelectedCustomerSummary[]>([])
  const [pdfCustomerCars, setPdfCustomerCars] = useState<CustomerCarRecord[]>([])
  const [selectedPdfCarId, setSelectedPdfCarId] = useState<number | null>(null)

  const hasCarPdfMapping = state.status === 'ready' && hasCarMappedFields(state.fields)

  const pdfCarsSignature = useMemo(
    () => pdfCustomerCars.map((c) => `${c.id}:${c.carNumber}:${c.carModel}:${c.carYear}:${c.renewalDate ?? ''}`).join('|'),
    [pdfCustomerCars],
  )

  const pdfOverlayCarRecord = useMemo(() => {
    if (!hasCarPdfMapping || pdfCustomerCars.length === 0) {
      return null
    }
    if (selectedPdfCarId != null) {
      return pdfCustomerCars.find((c) => c.id === selectedPdfCarId) ?? pdfCustomerCars[0] ?? null
    }
    return pdfCustomerCars[0] ?? null
  }, [hasCarPdfMapping, pdfCustomerCars, selectedPdfCarId])

  const effectiveCustomerId = useMemo(
    () => selectedCustomer?.id ?? workspaceCustomerIdFromRoute ?? null,
    [selectedCustomer, workspaceCustomerIdFromRoute],
  )

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewValues(null)
    setPreviewFonts({})
    setPreviewError(null)
    setPreviewUrl(null)
  }

  useEffect(() => {
    if (!token?.trim()) {
      setFallbackCustomerLabel('')
      return
    }
    if (issuerCustomerLabel.trim()) {
      setFallbackCustomerLabel('')
      return
    }
    if (workspaceCustomerIdFromRoute == null) {
      setFallbackCustomerLabel('')
      return
    }
    let cancelled = false
    getCustomerById(token, workspaceCustomerIdFromRoute)
      .then((row) => {
        if (cancelled) return
        const name = row?.name?.trim()
        setFallbackCustomerLabel(name ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setFallbackCustomerLabel('')
      })
    return () => {
      cancelled = true
    }
  }, [issuerCustomerLabel, token, workspaceCustomerIdFromRoute])

  useEffect(() => {
    if (!token?.trim()) return
    if (!Number.isInteger(templateId) || templateId < 1) {
      setState({ status: 'error', message: '잘못된 문서 주소입니다.' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    getPdfTemplate(token, templateId)
      .then((res) => {
        if (cancelled) return
        setState({ status: 'ready', template: res.template, fields: res.fields.map(coercePdfFieldSpecForForm) })
      })
      .catch((e) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: e instanceof ApiError ? e.message : '문서를 불러오지 못했습니다.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [token, templateId])

  useEffect(() => {
    if (!token?.trim() || state.status !== 'ready') {
      setPdfBuffer(null)
      return
    }
    let cancelled = false
    fetchPdfTemplateFile(token, templateId)
      .then((buf) => {
        if (!cancelled) setPdfBuffer(buf)
      })
      .catch(() => {
        if (!cancelled) setPdfBuffer(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, state.status, templateId])

  useEffect(() => {
    if (!token?.trim()) return
    if (state.status !== 'ready') return
    if (sourceIssuanceId == null) {
      setSourcePrefill({ kind: 'none' })
      return
    }
    let cancelled = false
    setSourcePrefill({ kind: 'loading' })
    getPdfIssuance(token, sourceIssuanceId)
      .then((res) => {
        if (cancelled) return
        const tid = res.issuance.templateId
        if (tid == null || tid !== templateId) {
          setSourcePrefill({
            kind: 'error',
            message:
              '선택한 발급 이력의 템플릿과 현재 문서가 일치하지 않습니다. 목록에서 다시 선택해 주세요.',
          })
          return
        }
        setSourcePrefill({ kind: 'ready', values: res.issuance.valuesSnapshot })
      })
      .catch((e) => {
        if (cancelled) return
        setSourcePrefill({
          kind: 'error',
          message:
            e instanceof ApiError
              ? e.message
              : '과거 발급 입력값을 불러오지 못했습니다.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [token, state.status, templateId, sourceIssuanceId])

  useEffect(() => {
    if (state.status !== 'ready') return
    if (sourceIssuanceId != null && sourcePrefill.kind !== 'ready') return
    const issuanceSnapshot = sourcePrefill.kind === 'ready' ? sourcePrefill.values : null
    const { fontSizes: snapFsRaw } =
      issuanceSnapshot != null ? splitPdfSnapshot(issuanceSnapshot) : { fontSizes: {} as Record<string, number> }
    const mergedVals = mergedInitialValues(state.fields, issuanceSnapshot)
    setApplicantValues(mergedVals)
    setFontOverrides(pickFontSnapshotsFromIssuance(state.fields, snapFsRaw))
    setFocusedFieldKey(null)
  }, [
    templateId,
    state.status === 'ready' ? state.template.id : 0,
    sourceIssuanceId,
    sourcePrefill.kind,
  ])

  useEffect(() => {
    if (!token?.trim() || !hasCarPdfMapping || effectiveCustomerId == null) {
      setPdfCustomerCars([])
      setSelectedPdfCarId(null)
      return
    }
    let cancelled = false
    listCustomerCars(token, effectiveCustomerId)
      .then((rows) => {
        if (cancelled) {
          return
        }
        const sorted = sortCustomerCarsForPicker(rows)
        setPdfCustomerCars(sorted)
        setSelectedPdfCarId((prev) => {
          if (prev != null && sorted.some((c) => c.id === prev)) {
            return prev
          }
          return sorted[0]?.id ?? null
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPdfCustomerCars([])
          setSelectedPdfCarId(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, hasCarPdfMapping, effectiveCustomerId])

  /** 자동차 매핑 로드 후 — 선택 차량 기준 차량 매핑 필드 동기화(미리보기·생성은 applicantValues 따라감). */
  useEffect(() => {
    if (state.status !== 'ready') {
      return
    }
    const fields = state.fields
    if (!hasCarMappedFields(fields) || cachedCustomer == null) {
      return
    }
    const merged = customerWithSelectedCar(cachedCustomer, pdfOverlayCarRecord)
    setApplicantValues((prev) => overwriteCarMappedPdfValuesFromCustomer(fields, prev, merged))
  }, [
    state.status === 'ready' ? state.template.id : 0,
    cachedCustomer?.id,
    hasCarPdfMapping,
    pdfCarsSignature,
    pdfOverlayCarRecord?.id ?? -1,
    selectedPdfCarId,
  ])

  const displayCustomerLabel = issuerCustomerLabel.trim() || fallbackCustomerLabel.trim()

  const workspaceCustomerLabel = displayCustomerLabel.trim() || null

  const loadCustomerButtonLabel = useMemo(() => {
    if (selectedCustomer) return '선택 고객 데이터 불러오기'
    if (workspaceCustomerIdFromRoute != null) return '현재 고객 데이터 불러오기'
    return '고객 검색해서 불러오기'
  }, [selectedCustomer, workspaceCustomerIdFromRoute])

  const effectiveCustomerLabelForFilename = useMemo(() => {
    if (selectedCustomer?.name?.trim()) return selectedCustomer.name.trim()
    return displayCustomerLabel.trim()
  }, [selectedCustomer, displayCustomerLabel])

  const resultPdfFilename = useMemo(() => {
    if (state.status !== 'ready') return '고객_신청서.pdf'
    return buildPdfIssuanceDisplayFilename({
      customerLabel: effectiveCustomerLabelForFilename || undefined,
      templateTitle: state.template.title,
      templateCode: state.template.code,
    })
  }, [state, effectiveCustomerLabelForFilename])

  const scopeGaId = user?.gaId ?? null

  const handleCustomerSearchSubmit = useCallback(async () => {
    if (!token?.trim()) return
    const q = customerSearchQuery.trim()
    if (!q) {
      setCustomerSearchError('검색어를 입력해 주세요.')
      return
    }
    setCustomerSearchBusy(true)
    setCustomerSearchError(null)
    try {
      const rows = await searchCustomers(token, q, {
        scopeGaId: scopeGaId != null && Number(scopeGaId) > 0 ? Number(scopeGaId) : null,
      })
      setCustomerSearchResults(
        rows.map((row) => ({
          id: row.id,
          name: row.name?.trim() || `고객 #${row.id}`,
          phone: (row.phone || row.phoneNumber || '').trim() || undefined,
        })),
      )
    } catch (e) {
      setCustomerSearchResults([])
      setCustomerSearchError(
        e instanceof ApiError ? e.message : '고객 검색에 실패했습니다.',
      )
    } finally {
      setCustomerSearchBusy(false)
    }
  }, [token, customerSearchQuery, scopeGaId])

  const handleSelectSearchedCustomer = useCallback((customer: PdfSelectedCustomerSummary) => {
    setSelectedCustomer(customer)
    setCachedCustomer(null)
    setShowCustomerSearch(false)
    setCustomerSearchError(null)
    setCustomerLoadHint(null)
  }, [])

  const handleClearSelectedCustomer = useCallback(() => {
    setSelectedCustomer(null)
    setCachedCustomer(null)
    setCustomerLoadHint(null)
  }, [])

  const handleLoadCustomerData = useCallback(async () => {
    if (!token?.trim()) return
    if (effectiveCustomerId == null) {
      setShowCustomerSearch(true)
      setCustomerLoadHint('고객을 검색해서 선택한 뒤 데이터를 불러올 수 있습니다.')
      return
    }
    if (state.status !== 'ready') return
    setLoadingCustomerData(true)
    setCustomerLoadHint(null)
    try {
      const customer =
        cachedCustomer?.id === effectiveCustomerId
          ? cachedCustomer
          : await getCustomerById(token, effectiveCustomerId)
      if (!customer) {
        setCustomerLoadHint('고객 정보를 찾을 수 없습니다.')
        return
      }
      setCachedCustomer(customer)
      const fields = state.fields
      const useCarMerge = hasCarMappedFields(fields)
      let overlayCarResolved: CustomerCarRecord | null = null
      if (useCarMerge) {
        const rawCars = await listCustomerCars(token, effectiveCustomerId)
        const sorted = sortCustomerCarsForPicker(rawCars)
        setPdfCustomerCars(sorted)
        const keep = selectedPdfCarId != null && sorted.some((c) => c.id === selectedPdfCarId)
        const sid = keep ? selectedPdfCarId : sorted[0]?.id ?? null
        setSelectedPdfCarId(sid)
        overlayCarResolved = sid != null ? sorted.find((c) => c.id === sid) ?? null : null
      }

      const customerForPdf = useCarMerge
        ? customerWithSelectedCar(customer, overlayCarResolved)
        : customer

      setApplicantValues((prev) =>
        applyCustomerDataToPdfValues(fields, prev, customerForPdf, {
          overwriteMode: overwriteCustomerOnLoad,
        }),
      )
      const mappedCount = state.fields.filter(
        (f) =>
          f.dataMapping.dataSourceType === 'customer' &&
          f.dataMapping.customerFieldKey &&
          (f.fieldType === 'text' || f.fieldType === 'textarea'),
      ).length
      setCustomerLoadHint(
        mappedCount > 0
          ? `매핑된 ${mappedCount}개 항목에 고객 정보를 반영했습니다.`
          : '고객 데이터 매핑이 설정된 텍스트 필드가 없습니다.',
      )
    } catch (e) {
      setCustomerLoadHint(
        e instanceof ApiError ? e.message : '고객 데이터를 불러오지 못했습니다.',
      )
    } finally {
      setLoadingCustomerData(false)
    }
  }, [
    token,
    effectiveCustomerId,
    state,
    cachedCustomer,
    overwriteCustomerOnLoad,
    selectedPdfCarId,
  ])

  const handleSubmitApplicant = useCallback(
    async (values: Record<string, string>, persistFonts: Record<string, number>) => {
      if (!token || state.status !== 'ready') return
      const previewFilename = buildPdfIssuanceDisplayFilename({
        customerLabel: effectiveCustomerLabelForFilename || undefined,
        templateTitle: state.template.title,
        templateCode: state.template.code,
      })
      setSubmitting(true)
      try {
        const { previewUrl: relUrl } = await requestPdfRenderPreviewUrl(token, templateId, values, {
          fontSizes: Object.keys(persistFonts).length > 0 ? persistFonts : undefined,
          displayFilename: previewFilename,
          customerId: effectiveCustomerId ?? undefined,
          overwriteCustomerMapping: overwriteCustomerOnLoad,
        })
        setPreviewUrl(resolveAbsoluteApiUrl(relUrl))
        setPreviewValues(values)
        setPreviewFonts(persistFonts)
        setPreviewError(null)
        setPreviewOpen(true)
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'PDF 생성에 실패했습니다.'
        throw new Error(message)
      } finally {
        setSubmitting(false)
      }
    },
    [token, templateId, state, effectiveCustomerLabelForFilename, effectiveCustomerId, overwriteCustomerOnLoad],
  )

  const handleSaveFromPreview = async () => {
    if (!token || state.status !== 'ready' || !previewValues) return
    setSaving(true)
    setPreviewError(null)
    try {
      const blobRaw = await renderPdfTemplate(token, templateId, previewValues, {
        fontSizes: Object.keys(previewFonts).length > 0 ? previewFonts : undefined,
        customerId: effectiveCustomerId ?? undefined,
        overwriteCustomerMapping: overwriteCustomerOnLoad,
      })
      triggerDownload(coercePdfBlob(blobRaw), resultPdfFilename)
      closePreview()
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'PDF 저장에 실패했습니다.'
      setPreviewError(message)
    } finally {
      setSaving(false)
    }
  }

  const prefillBanner = useMemo<ReactNode>(
    () =>
      sourcePrefill.kind === 'ready' ? (
        <div className="pdf-engine-prefill-banner" role="status">
          과거 작성한 신청서에서 불러온 내용입니다. 수정 후 다시 출력하면 새 발급 이력으로 저장됩니다.
        </div>
      ) : null,
    [sourcePrefill.kind],
  )

  const applicantViewProps = useMemo<PdfDocumentApplicantViewProps | null>(() => {
    if (state.status !== 'ready') return null
    return {
      template: state.template,
      fields: state.fields,
      pdfBuffer,
      values: applicantValues,
      fontOverrides,
      focusedFieldKey,
      prefillBanner,
      submitting,
      workspaceCustomerId: workspaceCustomerIdFromRoute,
      workspaceCustomerLabel,
      selectedCustomer,
      effectiveCustomerId,
      loadCustomerButtonLabel,
      customerLoadHint,
      loadingCustomerData,
      overwriteCustomerOnLoad,
      onToggleOverwriteCustomerOnLoad: () => setOverwriteCustomerOnLoad((v) => !v),
      onLoadCustomerData: handleLoadCustomerData,
      showCustomerSearch,
      onShowCustomerSearch: () => setShowCustomerSearch(true),
      onHideCustomerSearch: () => {
        setShowCustomerSearch(false)
        setCustomerSearchError(null)
      },
      customerSearchQuery,
      onCustomerSearchQueryChange: setCustomerSearchQuery,
      customerSearchBusy,
      customerSearchError,
      customerSearchResults,
      onCustomerSearchSubmit: handleCustomerSearchSubmit,
      onSelectSearchedCustomer: handleSelectSearchedCustomer,
      onClearSelectedCustomer: handleClearSelectedCustomer,
      documentsListPath: listPath,
      onChangeValues: setApplicantValues,
      onChangeFontOverrides: setFontOverrides,
      onFocusedFieldChange: setFocusedFieldKey,
      onSubmitApplicant: handleSubmitApplicant,
      pdfCarPicker:
        hasCarPdfMapping ?
          {
            cars: pdfCustomerCars,
            selectedCarId: selectedPdfCarId,
            onSelectCarId: setSelectedPdfCarId,
          }
        : null,
    }
  }, [
    state,
    pdfBuffer,
    applicantValues,
    fontOverrides,
    focusedFieldKey,
    prefillBanner,
    submitting,
    listPath,
    handleSubmitApplicant,
    workspaceCustomerIdFromRoute,
    workspaceCustomerLabel,
    selectedCustomer,
    effectiveCustomerId,
    loadCustomerButtonLabel,
    customerLoadHint,
    loadingCustomerData,
    overwriteCustomerOnLoad,
    handleLoadCustomerData,
    showCustomerSearch,
    customerSearchQuery,
    customerSearchBusy,
    customerSearchError,
    customerSearchResults,
    handleCustomerSearchSubmit,
    handleSelectSearchedCustomer,
    handleClearSelectedCustomer,
    hasCarPdfMapping,
    pdfCustomerCars,
    selectedPdfCarId,
  ])

  if (state.status === 'loading') {
    return (
      <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--pc page--with-back">
        <p className="pdf-engine-page__hint">문서를 불러오는 중…</p>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--pc page--with-back">
        <div className="pdf-engine-page__error">{state.message}</div>
        <div className="pdf-engine-page__toolbar">
          <Link to={listPath} className="pdf-engine-editor__btn">
            ← 문서 목록
          </Link>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="pdf-engine-editor__btn"
            onClick={() => navigate(0)}
          >
            다시 시도
          </FormButton>
        </div>
      </main>
    )
  }

  if (
    state.status === 'ready' &&
    sourceIssuanceId != null &&
    sourcePrefill.kind === 'loading'
  ) {
    return (
      <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--mobile page--with-back">
        <div className="pdf-engine-page__toolbar">
          <Link to={listPath} className="pdf-engine-editor__btn">
            ← 문서 목록
          </Link>
        </div>
        <p className="pdf-engine-page__hint">과거 작성한 신청서에서 입력값을 불러오는 중…</p>
      </main>
    )
  }

  if (
    state.status === 'ready' &&
    sourceIssuanceId != null &&
    sourcePrefill.kind === 'error'
  ) {
    return (
      <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--mobile page--with-back">
        <div className="pdf-engine-page__toolbar">
          <Link to={listPath} className="pdf-engine-editor__btn">
            ← 문서 목록
          </Link>
          <Link to={historyPath} className="pdf-engine-editor__btn">
            과거 작성 목록
          </Link>
        </div>
        <div className="pdf-engine-page__error">{sourcePrefill.message}</div>
        <div className="pdf-engine-page__toolbar">
          <FormButton
            htmlType="button"
            variant="secondary"
            className="pdf-engine-editor__btn"
            onClick={() => navigate(0)}
          >
            다시 시도
          </FormButton>
        </div>
      </main>
    )
  }

  if (!applicantViewProps) {
    return null
  }

  return (
    <>
      <ResponsiveLayout<PdfDocumentApplicantViewProps>
        PC={PdfDocumentApplicantPCView}
        Mobile={PdfDocumentApplicantMobileView}
        viewProps={applicantViewProps}
      />
      <Modal
        open={previewOpen}
        onClose={() => {
          if (saving) return
          closePreview()
        }}
        ariaLabel={`PDF 결과 미리보기 · ${resultPdfFilename}`}
        panelClassName="pdf-engine-preview-modal"
      >
        <div className="pdf-engine-preview">
          <header className="pdf-engine-preview__header">
            <h3>결과 미리보기</h3>
            <div
              className="pdf-engine-preview__filename-chip"
              title={resultPdfFilename}
              aria-label={`발급 PDF 파일명 ${resultPdfFilename}`}
            >
              {resultPdfFilename}
            </div>
            <p className="pdf-engine-preview__subtitle">
              미리보기는 서버 인라인 URL로 열립니다. 저장·뷰어 내부 다운로드 파일명은 위와 같이 맞춰집니다.
            </p>
          </header>
          {previewError ? <div className="pdf-engine-page__error">{previewError}</div> : null}
          <div className="pdf-engine-preview__frame-wrap">
            {previewUrl ? (
              <iframe title={resultPdfFilename} src={previewUrl} className="pdf-engine-preview__frame" />
            ) : (
              <p className="pdf-engine-page__hint">미리보기 파일을 준비하지 못했습니다.</p>
            )}
          </div>
          <div className="pdf-engine-preview__actions">
            <FormButton
              htmlType="button"
              variant="secondary"
              className="pdf-engine-editor__btn"
              onClick={closePreview}
              disabled={saving}
            >
              수정하기
            </FormButton>
            <FormButton
              htmlType="button"
              variant="primary"
              className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
              onClick={handleSaveFromPreview}
              disabled={saving || !previewValues}
            >
              {saving ? '저장 중…' : '저장하기'}
            </FormButton>
          </div>
        </div>
      </Modal>
    </>
  )
}
