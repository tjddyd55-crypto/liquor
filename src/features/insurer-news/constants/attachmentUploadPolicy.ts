/**
 * 서버 `registerInsurerNewsApi.js`의 ALLOWED_UPLOAD_MIME / maxBytesForMime 과 반드시 동기화할 것.
 * R2 비용·악성 업로드 완화를 위해 단일 상한을 엄격히 적용합니다.
 */
export const INSURER_NEWS_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const INSURER_NEWS_MAX_PDF_BYTES = 10 * 1024 * 1024

export const INSURER_NEWS_ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const INSURER_NEWS_ALLOWED_PDF_MIME = ['application/pdf'] as const
