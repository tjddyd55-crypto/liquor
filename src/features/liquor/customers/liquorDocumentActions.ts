/**
 * 전자문서/전자서명 액션 정의.
 */
import type { LiquorDocumentSourceType, LiquorFutureDocumentKind } from './liquorDocumentKinds'

export type LiquorDocumentEntityType = 'support_item' | 'support_contract' | 'repayment'

export type LiquorDocumentActionId =
  | 'generate_goods_support_confirmation'
  | 'generate_item_install_confirmation'
  | 'generate_item_recovery_confirmation'
  | 'generate_support_contract'
  | 'generate_loan_agreement'
  | 'generate_repayment_confirmation'
  | 'generate_deposit_confirmation'
  | 'send_uploaded_pdf_template'
  | 'view_linked_documents'

export type LiquorDocumentActionDef = {
  id: LiquorDocumentActionId
  label: string
  sourceType: LiquorDocumentSourceType | 'navigation'
  documentKind?: LiquorFutureDocumentKind
  actionType?: 'choose_template' | 'view_files'
  /** 운영 UI에 표시할지 여부 (미연결 기능은 false) */
  available: boolean
}

export const LIQUOR_SUPPORT_ITEM_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_goods_support_confirmation',
    label: '물품지원 확인서',
    sourceType: 'generated_document',
    documentKind: 'goods_support_confirmation',
    available: false,
  },
  {
    id: 'generate_item_install_confirmation',
    label: '설치 확인서',
    sourceType: 'generated_document',
    documentKind: 'item_install_confirmation',
    available: false,
  },
  {
    id: 'generate_item_recovery_confirmation',
    label: '회수 확인서',
    sourceType: 'generated_document',
    documentKind: 'item_recovery_confirmation',
    available: false,
  },
  {
    id: 'send_uploaded_pdf_template',
    label: '기존 양식으로 전자서명',
    sourceType: 'uploaded_pdf',
    actionType: 'choose_template',
    available: false,
  },
  {
    id: 'view_linked_documents',
    label: '관련 문서 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    available: true,
  },
]

export const LIQUOR_SUPPORT_CONTRACT_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_support_contract',
    label: '지원계약서',
    sourceType: 'generated_document',
    documentKind: 'support_contract_agreement',
    available: false,
  },
  {
    id: 'generate_loan_agreement',
    label: '차용증',
    sourceType: 'generated_document',
    documentKind: 'loan_agreement',
    available: false,
  },
  {
    id: 'send_uploaded_pdf_template',
    label: '기존 양식으로 전자서명',
    sourceType: 'uploaded_pdf',
    actionType: 'choose_template',
    available: false,
  },
  {
    id: 'view_linked_documents',
    label: '관련 문서 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    available: true,
  },
]

export const LIQUOR_REPAYMENT_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_repayment_confirmation',
    label: '상환확인서',
    sourceType: 'generated_document',
    documentKind: 'repayment_confirmation',
    available: false,
  },
  {
    id: 'generate_deposit_confirmation',
    label: '입금확인서',
    sourceType: 'generated_document',
    documentKind: 'deposit_confirmation',
    available: false,
  },
  {
    id: 'view_linked_documents',
    label: '관련 문서 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    available: true,
  },
]

export function documentActionsForEntity(entityType: LiquorDocumentEntityType): LiquorDocumentActionDef[] {
  if (entityType === 'support_item') return LIQUOR_SUPPORT_ITEM_DOCUMENT_ACTIONS
  if (entityType === 'support_contract') return LIQUOR_SUPPORT_CONTRACT_DOCUMENT_ACTIONS
  return LIQUOR_REPAYMENT_DOCUMENT_ACTIONS
}

/** 운영 화면에 표시할 액션만 반환 */
export function visibleDocumentActionsForEntity(entityType: LiquorDocumentEntityType): LiquorDocumentActionDef[] {
  return documentActionsForEntity(entityType).filter((a) => a.available)
}
