/**
 * 공지/자료실 운영 상수.
 * @module governmentOperationsConstants
 */

export const GOVERNMENT_SCOPE_AGENCY = 'agency'
export const GOVERNMENT_SCOPE_GLOBAL = 'global'

export const GOVERNMENT_NOTICE_CATEGORIES = Object.freeze([
  'general',
  'important',
  'deadline',
  'document',
  'system',
])

export const GOVERNMENT_NOTICE_STATUSES = Object.freeze(['draft', 'published', 'archived'])

export const GOVERNMENT_RESOURCE_CATEGORIES = Object.freeze([
  'form',
  'example',
  'guide',
  'manual',
  'other',
])

export const GOVERNMENT_RESOURCE_STATUSES = Object.freeze(['draft', 'published', 'archived'])

export const GOVERNMENT_NOTICE_CATEGORY_SET = new Set(GOVERNMENT_NOTICE_CATEGORIES)
export const GOVERNMENT_NOTICE_STATUS_SET = new Set(GOVERNMENT_NOTICE_STATUSES)
export const GOVERNMENT_RESOURCE_CATEGORY_SET = new Set(GOVERNMENT_RESOURCE_CATEGORIES)
export const GOVERNMENT_RESOURCE_STATUS_SET = new Set(GOVERNMENT_RESOURCE_STATUSES)
export const GOVERNMENT_SCOPE_TYPE_SET = new Set([GOVERNMENT_SCOPE_AGENCY, GOVERNMENT_SCOPE_GLOBAL])

/** @param {unknown} raw */
export function parseNoticeCategory(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_NOTICE_CATEGORY_SET.has(v) ? v : 'general'
}

/** @param {unknown} raw */
export function parseNoticeStatus(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_NOTICE_STATUS_SET.has(v) ? v : 'draft'
}

/** @param {unknown} raw */
export function parseResourceCategory(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_RESOURCE_CATEGORY_SET.has(v) ? v : 'other'
}

/** @param {unknown} raw */
export function parseResourceStatus(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_RESOURCE_STATUS_SET.has(v) ? v : 'draft'
}

/** @param {unknown} raw */
export function parseScopeType(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_SCOPE_TYPE_SET.has(v) ? v : GOVERNMENT_SCOPE_AGENCY
}

export const GOVERNMENT_RESOURCE_ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'application/x-hwp',
  'application/haansofthwp',
  'image/png',
  'image/jpeg',
  'image/webp',
])

export const GOVERNMENT_RESOURCE_MAX_BYTES = 50 * 1024 * 1024
