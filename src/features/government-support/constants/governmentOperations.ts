export const GOVERNMENT_NOTICE_CATEGORIES = [
  { value: 'general', label: '일반' },
  { value: 'important', label: '중요' },
  { value: 'deadline', label: '마감 안내' },
  { value: 'document', label: '서류 안내' },
  { value: 'system', label: '시스템 안내' },
] as const

export const GOVERNMENT_NOTICE_STATUSES = [
  { value: 'draft', label: '임시저장' },
  { value: 'published', label: '공개' },
  { value: 'archived', label: '보관' },
] as const

export const GOVERNMENT_RESOURCE_CATEGORIES = [
  { value: 'form', label: '신청 서식' },
  { value: 'example', label: '작성 예시' },
  { value: 'guide', label: '안내문' },
  { value: 'manual', label: '매뉴얼' },
  { value: 'other', label: '기타' },
] as const

export const GOVERNMENT_RESOURCE_STATUSES = [
  { value: 'draft', label: '임시저장' },
  { value: 'published', label: '공개' },
  { value: 'archived', label: '보관' },
] as const

export const GOVERNMENT_SCOPE_OPTIONS = [
  { value: 'agency', label: '대행사' },
  { value: 'global', label: '전체' },
] as const

export function labelForNoticeCategory(value: string): string {
  return GOVERNMENT_NOTICE_CATEGORIES.find((o) => o.value === value)?.label ?? value
}

export function labelForResourceCategory(value: string): string {
  return GOVERNMENT_RESOURCE_CATEGORIES.find((o) => o.value === value)?.label ?? value
}

export function labelForStatus(value: string): string {
  return GOVERNMENT_NOTICE_STATUSES.find((o) => o.value === value)?.label ?? value
}

export function formatOpsDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR')
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
