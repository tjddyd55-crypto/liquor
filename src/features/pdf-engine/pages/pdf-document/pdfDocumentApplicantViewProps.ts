import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { CustomerCarRecord } from '../../../customers/api/customerCarsApi'
import type { PdfFieldSpec, PdfTemplateSummary } from '../../types'

export type PdfSelectedCustomerSummary = {
  id: number
  name: string
  phone?: string
}

/** 자동차 관련 매핑이 있는 템플릿만 전달된다. 차량 선택·오버레이 동기화에 사용한다. */
export type PdfApplicantCarPickerUi = {
  cars: CustomerCarRecord[]
  selectedCarId: number | null
  onSelectCarId: (carId: number | null) => void
}

export type PdfDocumentApplicantViewProps = {
  template: PdfTemplateSummary
  fields: PdfFieldSpec[]
  pdfBuffer: ArrayBuffer | null
  values: Record<string, string>
  fontOverrides: Record<string, number>
  focusedFieldKey: string | null
  prefillBanner: ReactNode | null
  submitting: boolean
  workspaceCustomerId: number | null
  workspaceCustomerLabel: string | null
  selectedCustomer: PdfSelectedCustomerSummary | null
  effectiveCustomerId: number | null
  loadCustomerButtonLabel: string
  customerLoadHint: string | null
  loadingCustomerData: boolean
  overwriteCustomerOnLoad: boolean
  onToggleOverwriteCustomerOnLoad: () => void
  onLoadCustomerData: () => void
  showCustomerSearch: boolean
  onShowCustomerSearch: () => void
  onHideCustomerSearch: () => void
  customerSearchQuery: string
  onCustomerSearchQueryChange: (query: string) => void
  customerSearchBusy: boolean
  customerSearchError: string | null
  customerSearchResults: PdfSelectedCustomerSummary[]
  onCustomerSearchSubmit: () => void
  onSelectSearchedCustomer: (customer: PdfSelectedCustomerSummary) => void
  onClearSelectedCustomer: () => void
  /** ← 문서 목록 링크 (고객 작업 영역 embed 시 `/customers/.../application-documents`) */
  documentsListPath: string
  onChangeValues: Dispatch<SetStateAction<Record<string, string>>>
  onChangeFontOverrides: Dispatch<SetStateAction<Record<string, number>>>
  onFocusedFieldChange: (key: string | null) => void
  onSubmitApplicant: (
    values: Record<string, string>,
    fontOverrides: Record<string, number>,
  ) => Promise<void> | void

  pdfCarPicker: PdfApplicantCarPickerUi | null
}
