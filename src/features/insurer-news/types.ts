/**
 * 원수사 소식지 도메인 타입.
 * UI에는 보험사명 중심, 코드(insurerCode)는 내부 식별·스토리지 경로용.
 */

export type NewsletterPublishStatus = 'DRAFT' | 'PUBLISHED'
export type NewsChannel = 'INSURER' | 'LOSS_ADJUSTER'

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed'

/** 보험사 요약 (GA 스코프 목록용) */
export interface InsurerSummary {
  /** 내부 코드 — 스토리지 경로 segment, UI 비노출 권장 */
  insurerCode: string
  insurerName: string
  /** URL 경로용 — 동일 이름이어도 GA 내에서 유일 */
  insurerSlug: string
  gaCode: string
  newsletterCount: number
  lastPublishedAt: string | null
}

/** 첨부 (이미지 / 파일 — PDF 등 다운로드용) */
export interface NewsletterAttachment {
  id: string
  kind: 'image' | 'file'
  url: string
  fileName: string
  sortOrder: number
  objectKey?: string
  mimeType?: string
  size?: number
}

/** 목록·카드용 소식지 행 */
export interface NewsletterItem {
  id: string
  gaCode: string
  insurerCode: string
  insurerName: string
  insurerSlug: string
  newsChannel?: NewsChannel
  publisherId?: string
  title: string
  summary: string
  heroImageUrl: string | null
  publishedAt: string
  status: NewsletterPublishStatus
  hasImages: boolean
  hasPdf: boolean
  hasTextBody: boolean
  /** 고객 소식지(claim-requests) 전용 — 삭제 시 대상 고객 검증용 */
  customerNewsScope?: 'all' | 'personal'
  targetCustomerId?: number | null
}

/** 상세 본문 */
export interface NewsletterDetail extends NewsletterItem {
  bodyText: string
  attachments: NewsletterAttachment[]
}

/** 업로드 큐 아이템 (폼 상태) */
export interface LocalAttachmentDraft {
  localId: string
  file: File
  kind: 'image' | 'file'
  previewUrl: string | null
  status: UploadStatus
  errorMessage?: string
  /** 기존 첨부 수정 시 서버 id */
  existingAttachmentId?: string
  /** R2 업로드 완료 후 CDN URL (저장용) */
  cdnUrl?: string
  objectKey?: string
  mimeType?: string
  sizeBytes?: number
}
