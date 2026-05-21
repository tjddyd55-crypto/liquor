/**
 * GA 피보험자 ↔ CRM 고객명 정확 일치 매칭용 고객별 예외값(alias).
 * contains / startsWith / fuzzy / 괄호 제거 비교 금지 — trim 만 허용.
 */

export const MAX_GA_MATCH_ALIASES = 20
export const MAX_GA_MATCH_ALIAS_LENGTH = 100

/** @param {unknown} value */
export function normalizeGaExactMatchValue(value) {
  return String(value ?? '').trim()
}

/**
 * 텍스트 입력(줄바꿈·쉼표) 또는 문자열 배열을 파싱한다.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseGaMatchAliasInput(raw) {
  const chunks = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      chunks.push(String(item ?? ''))
    }
  } else {
    chunks.push(String(raw ?? ''))
  }
  const parts = []
  for (const chunk of chunks) {
    for (const piece of chunk.split(/[\n,]/)) {
      const t = piece.trim()
      if (t) parts.push(t)
    }
  }
  const seen = new Set()
  const out = []
  for (const p of parts) {
    if (p.length > MAX_GA_MATCH_ALIAS_LENGTH) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= MAX_GA_MATCH_ALIASES) break
  }
  return out
}

/**
 * 저장용 alias 목록 — 고객명과 동일한 값·중복 제거.
 *
 * @param {unknown} rawAliases
 * @param {string} customerName
 * @returns {string[]}
 */
export function sanitizeGaMatchAliasesForSave(rawAliases, customerName) {
  const nameNorm = normalizeGaExactMatchValue(customerName)
  const parsed = Array.isArray(rawAliases)
    ? parseGaMatchAliasInput(rawAliases)
    : parseGaMatchAliasInput(rawAliases)
  const seen = new Set()
  const out = []
  for (const a of parsed) {
    const n = normalizeGaExactMatchValue(a)
    if (!n || n === nameNorm) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= MAX_GA_MATCH_ALIASES) break
  }
  return out
}

/**
 * @param {string} customerName
 * @param {string[]} aliases
 * @returns {Set<string>}
 */
export function buildGaNameExactMatchSet(customerName, aliases) {
  const nameNorm = normalizeGaExactMatchValue(customerName)
  const set = new Set()
  if (nameNorm) set.add(nameNorm)
  for (const a of aliases ?? []) {
    const n = normalizeGaExactMatchValue(a)
    if (!n || n === nameNorm) continue
    set.add(n)
  }
  return set
}

/**
 * 업로드 피보험자 값이 고객명 또는 예외값과 정확 일치하는지.
 *
 * @param {string} customerName
 * @param {string[]} aliases
 * @param {unknown} uploadedInsuredValue
 */
export function gaInsuredValueMatchesCustomer(customerName, aliases, uploadedInsuredValue) {
  const uploaded = normalizeGaExactMatchValue(uploadedInsuredValue)
  if (!uploaded) return false
  return buildGaNameExactMatchSet(customerName, aliases).has(uploaded)
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number} gaId
 * @param {number} customerId
 * @returns {Promise<string[]>}
 */
export async function listGaCustomerMatchAliases(executor, gaId, customerId) {
  const { rows } = await executor.query(
    `
    SELECT alias_value
    FROM ga_customer_match_aliases
    WHERE ga_id = $1 AND customer_id = $2
    ORDER BY alias_value ASC
    `,
    [gaId, customerId],
  )
  return rows.map((r) => String(r.alias_value))
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 * @param {number} customerId
 * @param {string[]} aliases
 * @returns {Promise<string[]>}
 */
export async function replaceGaCustomerMatchAliases(pool, gaId, customerId, aliases) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM ga_customer_match_aliases WHERE ga_id = $1 AND customer_id = $2`, [
      gaId,
      customerId,
    ])
    for (const alias of aliases) {
      await client.query(
        `
        INSERT INTO ga_customer_match_aliases (ga_id, customer_id, alias_value)
        VALUES ($1, $2, $3)
        `,
        [gaId, customerId, alias],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  return listGaCustomerMatchAliases(pool, gaId, customerId)
}
