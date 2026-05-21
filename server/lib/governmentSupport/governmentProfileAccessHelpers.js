/**
 * 프로필 하위 리소스 접근 시 owner_user_id 기준 검증용 조회.
 * @module governmentProfileAccessHelpers
 */

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} profileId
 */
export async function loadGovernmentProfileAccessRow(pool, profileId) {
  const r = await pool.query(
    `SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint LIMIT 1`,
    [profileId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} priorLoanId
 */
export async function loadProfileAccessRowByPriorLoanId(pool, priorLoanId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id
    FROM gov_support_prior_loans l
    INNER JOIN gov_support_profiles p ON p.id = l.profile_id
    WHERE l.id = $1::bigint
    LIMIT 1
    `,
    [priorLoanId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} caseId
 */
export async function loadProfileAccessRowByApplicationCaseId(pool, caseId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id
    FROM gov_support_application_cases c
    INNER JOIN gov_support_profiles p ON p.id = c.profile_id
    WHERE c.id = $1::bigint
    LIMIT 1
    `,
    [caseId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} docId
 */
export async function loadProfileAccessRowByDocumentId(pool, docId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id
    FROM gov_support_document_items d
    INNER JOIN gov_support_profiles p ON p.id = d.profile_id
    WHERE d.id = $1::bigint
    LIMIT 1
    `,
    [docId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} memoId
 */
export async function loadProfileAccessRowByMemoId(pool, memoId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id, m.archived_at
    FROM gov_support_profile_memos m
    INNER JOIN gov_support_profiles p ON p.id = m.profile_id
    WHERE m.id = $1::bigint
    LIMIT 1
    `,
    [memoId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} consultationId
 */
export async function loadProfileAccessRowByConsultationId(pool, consultationId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id, c.archived_at
    FROM gov_support_profile_consultations c
    INNER JOIN gov_support_profiles p ON p.id = c.profile_id
    WHERE c.id = $1::bigint
    LIMIT 1
    `,
    [consultationId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} progressId
 */
export async function loadProfileAccessRowByProgressEventId(pool, progressId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id, e.archived_at
    FROM gov_support_profile_progress_events e
    INNER JOIN gov_support_profiles p ON p.id = e.profile_id
    WHERE e.id = $1::bigint
    LIMIT 1
    `,
    [progressId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string} fileId
 */
export async function loadProfileAccessRowByFileId(pool, fileId) {
  const r = await pool.query(
    `
    SELECT p.tenant_id, p.owner_user_id, f.archived_at, f.upload_status, f.profile_id, f.file_key, f.file_size
    FROM gov_support_profile_files f
    INNER JOIN gov_support_profiles p ON p.id = f.profile_id
    WHERE f.id = $1::bigint
    LIMIT 1
    `,
    [fileId],
  )
  return r.rows[0] ?? null
}
