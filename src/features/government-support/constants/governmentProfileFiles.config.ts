/** 정부지원 사업장 첨부 — 보험 StorageWorkspace 와 동일 MIME/용량 */
export const GOVERNMENT_PROFILE_FILE_MAX_BYTES = 25 * 1024 * 1024
export const GOVERNMENT_PROFILE_FILE_NAME_MAX = 120

export const GOVERNMENT_PROFILE_FILE_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
])
