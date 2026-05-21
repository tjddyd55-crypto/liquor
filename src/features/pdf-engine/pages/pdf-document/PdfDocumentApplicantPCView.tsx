/**
 * 사용자 PDF 신청 페이지 — 데스크톱: 좌측 폼 + 우측 PDF 오버레이 미리보기.
 */
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PdfApplicantPreviewStack,
  DEFAULT_APPLICANT_SIDE_PREVIEW_SCALE,
  type ApplicantSidePreviewScale,
} from '../../components/PdfApplicantPreviewStack'
import { PdfApplicantFormPanel } from '../../components/PdfApplicantFormPanel'
import type { PdfDocumentApplicantViewProps } from './pdfDocumentApplicantViewProps'

export default function PdfDocumentApplicantPCView(props: PdfDocumentApplicantViewProps) {
  const {
    template,
    fields,
    pdfBuffer,
    values,
    fontOverrides,
    focusedFieldKey,
    prefillBanner,
    submitting,
    workspaceCustomerId,
    workspaceCustomerLabel,
    selectedCustomer,
    effectiveCustomerId,
    loadCustomerButtonLabel,
    customerLoadHint,
    loadingCustomerData,
    overwriteCustomerOnLoad,
    onToggleOverwriteCustomerOnLoad,
    onLoadCustomerData,
    showCustomerSearch,
    onShowCustomerSearch,
    onHideCustomerSearch,
    customerSearchQuery,
    onCustomerSearchQueryChange,
    customerSearchBusy,
    customerSearchError,
    customerSearchResults,
    onCustomerSearchSubmit,
    onSelectSearchedCustomer,
    onClearSelectedCustomer,
    documentsListPath,
    onChangeValues,
    onChangeFontOverrides,
    onFocusedFieldChange,
    onSubmitApplicant,
    pdfCarPicker,
  } = props

  const previewPaneRef = useRef<HTMLDivElement | null>(null)
  const [sidePreviewScale, setSidePreviewScale] = useState<ApplicantSidePreviewScale>(
    DEFAULT_APPLICANT_SIDE_PREVIEW_SCALE,
  )

  const Z_STEP = 0.1
  const clampMult = (m: number) => Math.round(Math.min(2, Math.max(0.5, m)) * 10) / 10

  const bumpZoom = useCallback((delta: number) => {
    setSidePreviewScale((prev) => {
      const base = prev.mode === 'manual' ? prev.multiplier : 1
      return { mode: 'manual', multiplier: clampMult(base + delta) }
    })
  }, [])

  const resetFit = useCallback(() => {
    setSidePreviewScale(DEFAULT_APPLICANT_SIDE_PREVIEW_SCALE)
  }, [])

  const setManual100 = useCallback(() => {
    setSidePreviewScale({ mode: 'manual', multiplier: 1 })
  }, [])

  const zoomLabel = sidePreviewScale.mode === 'fit' ? '맞춤' : `${Math.round(sidePreviewScale.multiplier * 100)}%`
  const atMin = sidePreviewScale.mode === 'manual' && sidePreviewScale.multiplier <= 0.5
  const atMax = sidePreviewScale.mode === 'manual' && sidePreviewScale.multiplier >= 2

  return (
    <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--pc page--with-back">
      <div className="pdf-engine-page__toolbar">
        <Link to={documentsListPath} className="pdf-engine-editor__btn">
          ← 문서 목록
        </Link>
      </div>
      {prefillBanner}
      <div className="pdf-document-detail-page__split pdf-document-detail-page__split--pc-sticky">
        <section className="pdf-document-detail-page__form-col" aria-label="신청서 입력">
          <PdfApplicantFormPanel
            title={template.title}
            description={template.description}
            fields={fields}
            values={values}
            fontOverrides={fontOverrides}
            submitting={submitting}
            focusedFieldKey={focusedFieldKey}
            onChangeValues={onChangeValues}
            onChangeFontOverrides={onChangeFontOverrides}
            onFocusedFieldChange={onFocusedFieldChange}
            onSubmit={onSubmitApplicant}
            submitLabel="결과보기"
            workspaceCustomerId={workspaceCustomerId}
            workspaceCustomerLabel={workspaceCustomerLabel}
            selectedCustomer={selectedCustomer}
            effectiveCustomerId={effectiveCustomerId}
            loadCustomerButtonLabel={loadCustomerButtonLabel}
            customerLoadHint={customerLoadHint}
            loadingCustomerData={loadingCustomerData}
            overwriteCustomerOnLoad={overwriteCustomerOnLoad}
            onToggleOverwriteCustomerOnLoad={onToggleOverwriteCustomerOnLoad}
            onLoadCustomerData={onLoadCustomerData}
            showCustomerSearch={showCustomerSearch}
            onShowCustomerSearch={onShowCustomerSearch}
            onHideCustomerSearch={onHideCustomerSearch}
            customerSearchQuery={customerSearchQuery}
            onCustomerSearchQueryChange={onCustomerSearchQueryChange}
            customerSearchBusy={customerSearchBusy}
            customerSearchError={customerSearchError}
            customerSearchResults={customerSearchResults}
            onCustomerSearchSubmit={onCustomerSearchSubmit}
            onSelectSearchedCustomer={onSelectSearchedCustomer}
            onClearSelectedCustomer={onClearSelectedCustomer}
            pdfCarPicker={pdfCarPicker}
          />
        </section>
        <section className="pdf-document-detail-page__preview-col" aria-label="PDF 미리보기">
          <div className="pdf-document-detail-page__preview-head">
            <h3 className="pdf-document-detail-page__preview-title">미리보기</h3>
            <div className="pdf-applicant-side-zoom" role="toolbar" aria-label="작성 미리보기 확대·축소">
              <button
                type="button"
                className={`pdf-applicant-side-zoom__btn${sidePreviewScale.mode === 'fit' ? ' pdf-applicant-side-zoom__btn--active' : ''}`}
                onClick={resetFit}
              >
                맞춤
              </button>
              <button
                type="button"
                className="pdf-applicant-side-zoom__btn"
                onClick={() => bumpZoom(-Z_STEP)}
                disabled={atMin}
                aria-label="축소"
              >
                −
              </button>
              <span
                className={`pdf-applicant-side-zoom__label${sidePreviewScale.mode === 'manual' ? ' pdf-applicant-side-zoom__label--manual' : ''}`}
              >
                {zoomLabel}
              </span>
              <button
                type="button"
                className="pdf-applicant-side-zoom__btn"
                onClick={() => bumpZoom(Z_STEP)}
                disabled={atMax}
                aria-label="확대"
              >
                +
              </button>
              <button
                type="button"
                className="pdf-applicant-side-zoom__btn"
                onClick={setManual100}
                title="맞춤 크기 대비 100% 배율로 보기"
              >
                100%
              </button>
            </div>
          </div>
          <div ref={previewPaneRef} className="pdf-document-detail-page__preview-scroll">
            <PdfApplicantPreviewStack
              previewContainerRef={previewPaneRef}
              sidePreviewScale={sidePreviewScale}
              pdfBuffer={pdfBuffer}
              fields={fields}
              values={values}
              fontSizeOverrides={fontOverrides}
              highlightedFieldKey={focusedFieldKey}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
