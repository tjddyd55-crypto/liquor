/**
 * gov_support_profile_memos 행 매핑·검증 상수.
 * @module governmentProfileMemos
 */

export const GOV_PROFILE_MEMO_MAX_LENGTH = 2000

/**
 * @param {Record<string, unknown>} row
 */
export function mapGovSupportProfileMemoRow(row) {
  const createdAt = row.created_at
  const updatedAt = row.updated_at
  const archivedAt = row.archived_at
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    ownerUserId: String(row.owner_user_id ?? ''),
    content: String(row.content ?? ''),
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
 * @param {unknown} raw
 * @returns {{ ok: true, content: string } | { ok: false, status: number, message: string }}
 */
export function normalizeGovProfileMemoContent(raw) {
  const content = raw != null ? String(raw).trim() : ''
  if (!content) {
    return { ok: false, status: 400, message: '메모 내용을 입력해 주세요.' }
  }
  if (content.length > GOV_PROFILE_MEMO_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `메모는 ${GOV_PROFILE_MEMO_MAX_LENGTH}자 이하로 입력해 주세요.`,
    }
  }
  return { ok: true, content }
}
