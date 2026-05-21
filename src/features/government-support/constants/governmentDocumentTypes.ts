/** 정부지원 서류 종류 (서류관리 탭) */
export const GOVERNMENT_DOCUMENT_TYPES = [
  '사업자등록증',
  '부가세 신고자료',
  '소득금액증명원',
  '국세 완납증명서',
  '지방세 완납증명서',
  '통장 사본',
  '임대차계약서',
  '기타 서류',
] as const

export const GOVERNMENT_DOCUMENT_STATUSES = [
  '요청 전',
  '요청 완료',
  '제출 완료',
  '검토 완료',
  '보완 필요',
  '최종 완료',
] as const

export const GOVERNMENT_SCHEDULE_TYPES = [
  '상담 예정일',
  '접수 예정일',
  '서류 제출 마감일',
  '보완 마감일',
  '심사 예정일',
  '결과 확인 예정일',
  '수임료 청구 예정일',
] as const
