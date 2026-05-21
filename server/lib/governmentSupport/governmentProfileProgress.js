/**
 * gov_support_profile_progress_events 행 매핑·검증.
 * @module governmentProfileProgress
 */

export const GOV_PROFILE_PROGRESS_CONTENT_MAX = 20000
export const GOV_PROFILE_PROGRESS_TITLE_MAX = 200

/**
 * @param {Record<string, unknown>} row
 */
export function mapGovSupportProfileProgressEventRow(row) {
  const createdAt = row.created_at
  const updatedAt = row.updated_at
  const archivedAt = row.archived_at
  const eventDate = row.event_date
  const eventYmd =
    eventDate instanceof Date
      ? eventDate.toISOString().slice(0, 10)
      : eventDate != null
        ? String(eventDate).slice(0, 10)
        : null
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    ownerUserId: String(row.owner_user_id ?? ''),
    status: String(row.status ?? ''),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    eventDate: eventYmd,
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
 * @param {unknown} rawDate
 * @param {{ allowEmpty?: boolean }} [opts]
 */
export function normalizeGovProfileProgressEventDate(rawDate, opts = {}) {
  const { allowEmpty = false } = opts
  let eventDate = rawDate != null ? String(rawDate).trim() : ''
  if (!eventDate) {
    if (allowEmpty) {
      return { ok: true, eventDate: null }
    }
    eventDate = new Date().toISOString().slice(0, 10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return { ok: false, status: 400, message: '진행 일자는 YYYY-MM-DD 형식이어야 합니다.' }
  }
  return { ok: true, eventDate }
}

/**
 * @param {unknown} raw
 */
export function normalizeGovProfileProgressContent(raw) {
  const content = raw != null ? String(raw).trim() : ''
  if (!content) {
    return { ok: false, status: 400, message: '처리 메모를 입력해 주세요.' }
  }
  if (content.length > GOV_PROFILE_PROGRESS_CONTENT_MAX) {
    return {
      ok: false,
      status: 400,
      message: `처리 메모는 ${GOV_PROFILE_PROGRESS_CONTENT_MAX}자 이하로 입력해 주세요.`,
    }
  }
  return { ok: true, content }
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @param {{ requireContent?: boolean; requireStatus?: boolean }} [opts]
 */
export function parseGovProfileProgressPatchBody(body, opts = {}) {
  const { requireContent = false, requireStatus = false } = opts
  const b = body ?? {}
  /** @type {{ content?: string, eventDate?: string|null, status?: string, title?: string }} */
  const patch = {}

  const hasContent = b.content != null || b.body != null || b.memo != null
  if (hasContent) {
    const normalized = normalizeGovProfileProgressContent(b.content ?? b.body ?? b.memo)
    if (!normalized.ok) return normalized
    patch.content = normalized.content
  } else if (requireContent) {
    return { ok: false, status: 400, message: '처리 메모를 입력해 주세요.' }
  }

  const hasDate = b.eventDate != null || b.event_date != null
  if (hasDate) {
    const dateNorm = normalizeGovProfileProgressEventDate(b.eventDate ?? b.event_date)
    if (!dateNorm.ok) return dateNorm
    patch.eventDate = dateNorm.eventDate
  } else if (requireContent || requireStatus) {
    const dateNorm = normalizeGovProfileProgressEventDate(null)
    if (!dateNorm.ok) return dateNorm
    patch.eventDate = dateNorm.eventDate
  }

  const hasStatus = b.status != null || b.progressStatus != null || b.progress_status != null
  if (hasStatus) {
    const status = String(b.status ?? b.progressStatus ?? b.progress_status ?? '').trim()
    if (!status) {
      return { ok: false, status: 400, message: '접수 상태를 선택해 주세요.' }
    }
    patch.status = status
  } else if (requireStatus) {
    return { ok: false, status: 400, message: '접수 상태를 선택해 주세요.' }
  }

  if (b.title != null) {
    const title = String(b.title ?? '').trim()
    if (title.length > GOV_PROFILE_PROGRESS_TITLE_MAX) {
      return {
        ok: false,
        status: 400,
        message: `제목은 ${GOV_PROFILE_PROGRESS_TITLE_MAX}자 이하로 입력해 주세요.`,
      }
    }
    patch.title = title
  }

  if (!requireContent && !requireStatus && !hasContent && !hasDate && !hasStatus && b.title == null) {
    return { ok: false, status: 400, message: '수정할 필드가 없습니다.' }
  }

  return { ok: true, patch }
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} profileId
 * @param {string} status
 */
export async function syncGovProfileProgressStatus(pool, profileId, status) {
  if (!status.trim()) return
  await pool.query(
    `UPDATE gov_support_profiles SET progress_status = $2, updated_at = NOW() WHERE id = $1::bigint`,
    [profileId, status],
  )
}
