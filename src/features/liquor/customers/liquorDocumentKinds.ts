/** 전자문서 종류 상수 */

export type LiquorFutureDocumentKind =
  | 'support_contract_agreement'
  | 'loan_agreement'
  | 'goods_support_confirmation'
  | 'item_install_confirmation'
  | 'item_recovery_confirmation'
  | 'repayment_confirmation'
  | 'deposit_confirmation'
  | 'uploaded_pdf_template'

/** 현재 liquor_customer_files schema에 존재하는 kind */
export type LiquorStoredDocumentKind =
  | 'business_registration'
  | 'id_card'
  | 'liquor_license'
  | 'bankbook_copy'
  | 'support_contract'
  | 'loan_agreement'
  | 'goods_support_confirmation'
  | 'repayment_confirmation'
  | 'deposit_slip'
  | 'store_photo'
  | 'install_photo'
  | 'other'

export const LIQUOR_FUTURE_DOCUMENT_KIND_LABELS: Record<LiquorFutureDocumentKind, string> = {
  support_contract_agreement: '지원계약서',
  loan_agreement: '차용증',
  goods_support_confirmation: '물품지원 확인서',
  item_install_confirmation: '설치 확인서',
  item_recovery_confirmation: '회수 확인서',
  repayment_confirmation: '상환확인서',
  deposit_confirmation: '입금확인서',
  uploaded_pdf_template: '기존 양식',
}

export const LIQUOR_FUTURE_TO_STORED_KIND: Partial<Record<LiquorFutureDocumentKind, LiquorStoredDocumentKind>> = {
  support_contract_agreement: 'support_contract',
  loan_agreement: 'loan_agreement',
  goods_support_confirmation: 'goods_support_confirmation',
  item_install_confirmation: 'install_photo',
  item_recovery_confirmation: 'other',
  repayment_confirmation: 'repayment_confirmation',
  deposit_confirmation: 'deposit_slip',
}

export type LiquorDocumentSourceType = 'uploaded_pdf' | 'generated_document'
