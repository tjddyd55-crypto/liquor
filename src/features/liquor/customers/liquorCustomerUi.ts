/**
 * 주류 CRM 고객 UI 헬퍼.
 */
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'

export function isLiquorIndustryTemplate(template: CustomerIndustryTemplate): boolean {
  return template.meta.industryCode === 'liquor'
}

export const LIQUOR_PARTY_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  business: '사업장',
}

export const LIQUOR_SUPPORT_TYPE_LABELS: Record<string, string> = {
  liquor_loan: '주류대출금',
  cash_support: '현금지원금',
  goods_support: '물품지원',
  mixed: '복합지원',
  other: '기타',
}

export const LIQUOR_CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: '작성중',
  pending_contract: '계약대기',
  support_completed: '지원완료',
  repaying: '상환중',
  repaid: '상환완료',
  overdue: '연체',
  collection_required: '회수필요',
  terminated: '해지',
}

export const LIQUOR_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: '거래중',
  paused: '거래중지',
  closed: '거래종료',
}

export const LIQUOR_ITEM_KIND_LABELS: Record<string, string> = {
  refrigerator: '냉장고',
  upright_freezer: '수직냉동고',
  ice_maker: '제빙기',
  horizontal_stocker: '수평스토커',
  signboard: '간판',
  display_shelf: '진열대',
  other: '기타',
}

export const LIQUOR_DOCUMENT_KIND_LABELS: Record<string, string> = {
  business_registration: '사업자등록증',
  id_card: '신분증',
  liquor_license: '영업허가증',
  bankbook_copy: '통장사본',
  support_contract: '지원계약서',
  loan_agreement: '차용증',
  goods_support_confirmation: '물품지원 확인서',
  repayment_confirmation: '상환확인서',
  deposit_slip: '입금증',
  store_photo: '매장사진',
  install_photo: '물품설치사진',
  other: '기타자료',
}

export function formatLiquorWon(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ko-KR')}원`
}

export const LIQUOR_CONTACT_ROLE_OPTIONS = [
  '대표자',
  '운영 담당자',
  '결제 담당자',
  '서류 담당자',
  '전자서명 수신자',
  '기타',
] as const

export const LIQUOR_FILE_LINK_TARGET_LABELS: Record<string, string> = {
  customer: '고객 전체',
  support_contract: '지원계약',
  repayment: '상환내역',
  support_item: '지원물품',
  other: '기타',
}

export const LIQUOR_FILE_LINK_TARGET_OPTIONS = [
  'customer',
  'support_contract',
  'repayment',
  'support_item',
  'other',
] as const

export const LIQUOR_REPAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: '현금',
  bank_transfer: '계좌이체',
  card: '카드',
  sales_offset: '매출차감',
  goods_return: '물품반납',
  other: '기타',
}

export const LIQUOR_REPAYMENT_METHOD_OPTIONS = [
  'cash',
  'bank_transfer',
  'card',
  'sales_offset',
  'goods_return',
  'other',
] as const
