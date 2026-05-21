/**
 * R2 객체 키: insurer/{gaId}/{category}/{yyyy}/{mm}/{companySlug}/{uuid}_{filename}
 *
 * category 확장 예: documents, marketing 등 — 상수 추가 후 presign·assert 경로를 함께 반영할 것.
 */
export const INSURER_R2_CATEGORY = Object.freeze({
  NEWS: 'news',
  LOSS_ADJUSTER: 'loss-adjuster',
  // DOCUMENTS: 'documents',
  // MARKETING: 'marketing',
})

/** 현재 업로드 파이프라인에서 사용하는 세그먼트 (소식 첨부 전용) */
export const INSURER_R2_ACTIVE_CATEGORY = INSURER_R2_CATEGORY.NEWS
