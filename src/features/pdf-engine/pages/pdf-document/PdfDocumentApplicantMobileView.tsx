/**
 * 사용자 PDF 신청 페이지 — 모바일: 입력 폼 + 고정 미리보기 버튼 / 전체화면 오버레이.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormButton } from '../../../../components/form'
import Modal from '../../../../components/ui/Modal'
import { PdfApplicantPreviewStack, type PdfApplicantPreviewHandle } from '../../components/PdfApplicantPreviewStack'
import { PdfApplicantFormPanel } from '../../components/PdfApplicantFormPanel'
import type { PdfDocumentApplicantViewProps } from './pdfDocumentApplicantViewProps'

export default function PdfDocumentApplicantMobileView(props: PdfDocumentApplicantViewProps) {
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

  const previewRef = useRef<PdfApplicantPreviewHandle | null>(null)
  const [livePreviewOpen, setLivePreviewOpen] = useState(false)

  useEffect(() => {
    if (!livePreviewOpen || !focusedFieldKey) return
    previewRef.current?.scrollToField(focusedFieldKey)
  }, [livePreviewOpen, focusedFieldKey, values])

  return (
    <main className="insurance-dark-forms pdf-engine-page pdf-document-detail-page pdf-document-detail-page--mobile page--with-back">
      <div className="pdf-engine-page__toolbar">
        <Link to={documentsListPath} className="pdf-engine-editor__btn">
          ← 문서 목록
        </Link>
      </div>
      {prefillBanner}
      <section className="pdf-document-detail-page__mobile-form" aria-label="신청서 입력">
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
      <div className="pdf-document-detail-page__mobile-preview-dock">
        <FormButton
          htmlType="button"
          variant="secondary"
          className="pdf-document-detail-page__mobile-preview-btn"
          onClick={() => setLivePreviewOpen(true)}
        >
          미리보기
        </FormButton>
      </div>
      <Modal
        open={livePreviewOpen}
        onClose={() => setLivePreviewOpen(false)}
        ariaLabel="PDF 입력 미리보기"
        panelClassName="pdf-document-detail-page__live-preview-modal"
      >
        <div className="pdf-document-detail-page__live-preview-inner">
          <header className="pdf-document-detail-page__live-preview-header">
            <h3>입력 미리보기</h3>
            <FormButton htmlType="button" variant="secondary" onClick={() => setLivePreviewOpen(false)}>
              닫기
            </FormButton>
          </header>
          <div className="pdf-document-detail-page__live-preview-body">
            <PdfApplicantPreviewStack
              ref={previewRef}
              pdfBuffer={pdfBuffer}
              fields={fields}
              values={values}
              fontSizeOverrides={fontOverrides}
              highlightedFieldKey={focusedFieldKey}
            />
          </div>
        </div>
      </Modal>
    </main>
  )
}
