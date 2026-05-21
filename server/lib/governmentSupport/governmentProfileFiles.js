/**
 * gov_support_profile_files 행 매핑·검증.
 * @module governmentProfileFiles
 */

export const GOV_PROFILE_FILE_MAX_BYTES = 25 * 1024 * 1024
export const GOV_PROFILE_FILE_NAME_MAX = 120
export const GOV_PROFILE_FILE_DESCRIPTION_MAX = 2000
export const GOV_PROFILE_FILE_CATEGORY_MAX = 80

export const GOV_PROFILE_FILE_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
])

export const GOV_PROFILE_FILE_BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/x-msdos-program',
  'application/x-executable',
])

const FILE_NAME_REGEX = /^[A-Za-z0-9._\-() \u3131-\u318e\uac00-\ud7a3]+$/

/**
 * @param {unknown} raw
 */
export function normalizeGovProfileFileName(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GOV_PROFILE_FILE_NAME_MAX)
}

/**
 * @param {unknown} raw
 */
export function isValidGovProfileFileName(raw) {
  const value = normalizeGovProfileFileName(raw)
  return Boolean(value) && FILE_NAME_REGEX.test(value)
}

/**
 * @param {unknown} raw
 */
export function resolveGovProfileFileContentType(raw) {
  return String(raw ?? '')
    .trim()
    .split(';')[0]
    .trim()
    .toLowerCase()
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapGovSupportProfileFileRow(row) {
  const createdAt = row.created_at
  const updatedAt = row.updated_at
  const archivedAt = row.archived_at
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    ownerUserId: String(row.owner_user_id ?? ''),
    fileName: String(row.file_name ?? ''),
    fileKey: String(row.file_key ?? ''),
    fileSize: Number(row.file_size ?? 0),
    mimeType: String(row.mime_type ?? ''),
    category: String(row.category ?? ''),
    description: String(row.description ?? ''),
    uploadStatus: String(row.upload_status ?? 'active'),
    createdByUserId: row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    updatedByUserId: row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString()
        : createdAt != null
          ? String(createdAt)
          : new Date().toISOString(),
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : updatedAt != null
          ? String(updatedAt)
          : new Date().toISOString(),
    archivedAt:
      archivedAt instanceof Date
        ? archivedAt.toISOString()
        : archivedAt != null
          ? String(archivedAt)
          : null,
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 */
export function parseGovProfileFilePatchBody(body) {
  const b = body ?? {}
  /** @type {{ fileName?: string, description?: string, category?: string }} */
  const patch = {}
  if (b.fileName != null || b.file_name != null || b.displayName != null) {
    const fileName = normalizeGovProfileFileName(b.fileName ?? b.file_name ?? b.displayName)
    if (!isValidGovProfileFileName(fileName)) {
      return { ok: false, status: 400, message: '파일 이름이 올바르지 않습니다.' }
    }
    patch.fileName = fileName
  }
  if (b.description != null) {
    const description = String(b.description ?? '').trim().slice(0, GOV_PROFILE_FILE_DESCRIPTION_MAX)
    patch.description = description
  }
  if (b.category != null) {
    const category = String(b.category ?? '').trim().slice(0, GOV_PROFILE_FILE_CATEGORY_MAX)
    patch.category = category
  }
  if (!patch.fileName && b.description == null && b.category == null) {
    return { ok: false, status: 400, message: '수정할 필드가 없습니다.' }
  }
  return { ok: true, patch }
}
