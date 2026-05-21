/**
 * gov_support_profile_consultations 행 매핑·검증.
 * 보험 customer_consultations(body, consultation_date) 대응.
 * @module governmentProfileConsultations
 */

export const GOV_PROFILE_CONSULTATION_BODY_MAX = 20000

/**
 * @param {Record<string, unknown>} row
 */
export function mapGovSupportProfileConsultationRow(row) {
  const createdAt = row.created_at
  const updatedAt = row.updated_at
  const archivedAt = row.archived_at
  const consultedAt = row.consulted_at
  const consultedYmd =
    consultedAt instanceof Date
      ? consultedAt.toISOString().slice(0, 10)
      : consultedAt != null
        ? String(consultedAt).slice(0, 10)
        : null
  const content = String(row.content ?? '')
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    ownerUserId: String(row.owner_user_id ?? ''),
    consultationType: String(row.consultation_type ?? ''),
    title: String(row.title ?? ''),
    content,
    /** 보험 UI 호환 — CustomerConsultationRow.body */
    body: content,
    status: String(row.status ?? ''),
    consultedAt: consultedYmd,
    /** 보험 UI 호환 — CustomerConsultationRow.consultationDate */
    consultationDate: consultedYmd,
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
 * @param {unknown} rawBody
 * @returns {{ ok: true, content: string } | { ok: false, status: number, message: string }}
 */
export function normalizeGovProfileConsultationContent(rawBody) {
  const content = rawBody != null ? String(rawBody).trim() : ''
  if (!content) {
    return { ok: false, status: 400, message: '상담 내용을 입력해 주세요.' }
  }
  if (content.length > GOV_PROFILE_CONSULTATION_BODY_MAX) {
    return {
      ok: false,
      status: 400,
      message: `상담 내용은 ${GOV_PROFILE_CONSULTATION_BODY_MAX}자 이하로 입력해 주세요.`,
    }
  }
  return { ok: true, content }
}

/**
 * @param {unknown} rawDate
 * @param {{ allowEmpty?: boolean }} [opts]
 */
export function normalizeGovProfileConsultationDate(rawDate, opts = {}) {
  const { allowEmpty = false } = opts
  let consultDate = rawDate != null ? String(rawDate).trim() : ''
  if (!consultDate) {
    if (allowEmpty) {
      return { ok: true, consultedAt: null }
    }
    consultDate = new Date().toISOString().slice(0, 10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(consultDate)) {
    return { ok: false, status: 400, message: '상담 일자는 YYYY-MM-DD 형식이어야 합니다.' }
  }
  return { ok: true, consultedAt: consultDate }
}

/**
 * POST/PATCH body에서 상담 필드 추출.
 * @param {Record<string, unknown>|null|undefined} body
 * @param {{ requireContent?: boolean }} [opts]
 */
export function parseGovProfileConsultationPatchBody(body, opts = {}) {
  const { requireContent = false } = opts
  const b = body ?? {}
  const hasContent = b.body != null || b.content != null
  const hasDate =
    b.consultationDate != null || b.consultation_date != null || b.consultedAt != null || b.consulted_at != null

  /** @type {{ content?: string, consultedAt?: string|null, consultationType?: string, title?: string, status?: string }} */
  const patch = {}

  if (hasContent) {
    const normalized = normalizeGovProfileConsultationContent(b.body ?? b.content)
    if (!normalized.ok) {
      return normalized
    }
    patch.content = normalized.content
  } else if (requireContent) {
    return { ok: false, status: 400, message: '상담 내용을 입력해 주세요.' }
  }

  if (hasDate) {
    const dateNorm = normalizeGovProfileConsultationDate(
      b.consultationDate ?? b.consultation_date ?? b.consultedAt ?? b.consulted_at,
      { allowEmpty: false },
    )
    if (!dateNorm.ok) {
      return dateNorm
    }
    patch.consultedAt = dateNorm.consultedAt
  } else if (requireContent) {
    const dateNorm = normalizeGovProfileConsultationDate(null)
    if (!dateNorm.ok) {
      return dateNorm
    }
    patch.consultedAt = dateNorm.consultedAt
  }

  if (b.consultationType != null || b.consultation_type != null) {
    patch.consultationType = String(b.consultationType ?? b.consultation_type ?? '').trim()
  }
  if (b.title != null) {
    patch.title = String(b.title ?? '').trim()
  }
  if (b.status != null) {
    patch.status = String(b.status ?? '').trim()
  }

  if (!requireContent && !hasContent && !hasDate && patch.consultationType == null && patch.title == null && patch.status == null) {
    return { ok: false, status: 400, message: '수정할 필드가 없습니다.' }
  }

  return { ok: true, patch }
}
