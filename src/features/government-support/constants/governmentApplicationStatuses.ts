/** 신청/청약 진행상태 — 코드 상수 (빌더 없음) */
export const GOVERNMENT_APPLICATION_STATUSES = [
  '상담 접수',
  '정보 확인 중',
  '상품 검토',
  '접수 가능',
  '전자문서 발송',
  '전자서명 완료',
  '서류 요청',
  '서류 수집 중',
  '서류 검토',
  '접수 준비',
  '접수 완료',
  '보완 요청',
  '심사 중',
  '승인',
  '부결',
  '수임료 청구',
  '수임료 완료',
  '종료',
] as const

export type GovernmentApplicationStatus = (typeof GOVERNMENT_APPLICATION_STATUSES)[number]

export const GOVERNMENT_DOCUMENT_STATUSES = [
  '요청 전',
  '요청 완료',
  '제출 완료',
  '검토 완료',
  '보완 필요',
  '최종 완료',
] as const

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

export const GOVERNMENT_SCHEDULE_KINDS = [
  '상담 예정일',
  '접수 예정일',
  '서류 제출 마감일',
  '보완 마감일',
  '심사 예정일',
  '결과 확인 예정일',
  '수임료 청구 예정일',
] as const
