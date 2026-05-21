/**
 * 발급 이력 레포지토리.
 *
 * 책임: `pdf_issuances` 테이블에 대한 CRUD 만 담당. SQL 은 이 파일 바깥으로 나가지 않는다.
 *
 * 스코핑 원칙:
 *   - 사용자 개인 조회는 `userId` 로만 제한.
 *   - GA 내 관리자 조회(후속 PR)는 `gaId` 로만 제한.
 *   - SUPER_ADMIN 전체 조회는 어떤 필터도 없이 허용.
 *   이 3 가지 쿼리가 한 함수로 합쳐지면 실수로 스코프를 비우는 버그가 쉽게 생긴다 →
 *   명시적으로 별도 함수로 분리한다.
 */

/**
 * @typedef {{
 *   id: number,
 *   template_id: number | null,
 *   user_id: string | null,
 *   ga_id: number | null,
 *   template_code: string,
 *   template_title: string,
 *   storage_key: string,
 *   values_snapshot: Record<string, string>,
 *   byte_length: number,
 *   created_at: string,
 * }} IssuanceRow
 */

/**
 * 한 건 저장. 중복 방지 제약은 없다 — 동일 템플릿/값으로 여러 번 발급해도 각기 남는다
 * (사용자가 "같은 문서를 두 번 출력" 한 이력 자체가 유의미).
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   templateId: number | null,
 *   userId: string | null,
 *   gaId: number | null,
 *   templateCode: string,
 *   templateTitle: string,
 *   storageKey: string,
 *   valuesSnapshot: Record<string, string>,
 *   byteLength: number,
 * }} input
 * @returns {Promise<IssuanceRow>}
 */
export async function createIssuance(pool, input) {
  const { rows } = await pool.query(
    `INSERT INTO pdf_issuances
       (template_id, user_id, ga_id, template_code, template_title,
        storage_key, values_snapshot, byte_length)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, template_id, user_id, ga_id, template_code, template_title,
               storage_key, values_snapshot, byte_length, created_at`,
    [
      input.templateId ?? null,
      input.userId ?? null,
      input.gaId ?? null,
      input.templateCode,
      input.templateTitle,
      input.storageKey,
      JSON.stringify(input.valuesSnapshot ?? {}),
      input.byteLength,
    ],
  )
  return rows[0]
}

/**
 * 사용자 개인 이력.
 *
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ limit?: number }} [options]
 */
export async function listIssuancesByUser(pool, userId, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  const { rows } = await pool.query(
    `SELECT id, template_id, user_id, ga_id, template_code, template_title,
            storage_key, values_snapshot, byte_length, created_at
       FROM pdf_issuances
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  )
  return rows
}

/**
 * 관리자(SUPER_ADMIN) 전체 이력. 정렬은 최신순.
 *
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} [options]
 */
export async function listIssuancesAll(pool, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
  const { rows } = await pool.query(
    `SELECT id, template_id, user_id, ga_id, template_code, template_title,
            storage_key, values_snapshot, byte_length, created_at
       FROM pdf_issuances
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  )
  return rows
}

/**
 * 단건 조회. 다운로드 라우트에서 소유자 검증과 함께 쓴다.
 *
 * @param {import('pg').Pool} pool
 * @param {number} id
 */
export async function getIssuanceById(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, template_id, user_id, ga_id, template_code, template_title,
            storage_key, values_snapshot, byte_length, created_at
       FROM pdf_issuances
      WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}
