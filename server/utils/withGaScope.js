/**
 * SELECT/UPDATE/DELETE SQL에 테넌트 ga_id 조건을 안전하게 붙입니다.
 * 값은 플레이스홀더($n)로만 바인딩합니다 (문자열 삽입 금지).
 *
 * @param {string} baseQuery SQL (세미콜론 없이)
 * @param {{ gaId?: unknown, ga_id?: unknown }} user Express req.user
 * @param {number} nextParamIndex 다음에 쓸 $ 인덱스 (1부터)
 * @returns {{ sql: string, gaId: number, paramIndex: number }}
 */
export function withGaScope(baseQuery, user, nextParamIndex) {
  const raw = user?.gaId ?? user?.ga_id
  const gaId = Number(raw)
  if (!user || !Number.isInteger(gaId) || gaId < 1) {
    throw new Error('GA 정보 없음')
  }
  const q = String(baseQuery).trimEnd()
  const hasWhere = /\bwhere\b/i.test(q)
  const frag = hasWhere
    ? ` AND ga_id = $${nextParamIndex}::int`
    : ` WHERE ga_id = $${nextParamIndex}::int`
  return { sql: `${q}${frag}`, gaId, paramIndex: nextParamIndex }
}
