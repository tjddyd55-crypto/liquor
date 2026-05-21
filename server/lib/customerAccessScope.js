/** @typedef {'none' | 'own' | 'tenant' | 'assigned'} CustomerAccessResolved */

/**
 * JWT·레거시 role 기준으로 고객 API 스코프를 정한다.
 * @param {object} p
 * @param {unknown} p.legacyReqRole SUPER_ADMIN 등
 * @param {unknown} p.customerAccessJwt
 * @param {unknown} p.tenantDbIdJwt number | string
 */
export function resolveCustomerApiAccessScope(p) {
  const roleNorm = typeof p.legacyReqRole === 'string' ? p.legacyReqRole.trim().toUpperCase() : ''

  /** @type {CustomerAccessResolved} */
  let access = 'own'
  const rawJwt = p.customerAccessJwt
  const rawJwtStr = typeof rawJwt === 'string' ? rawJwt.trim().toLowerCase() : ''

  if (rawJwtStr === 'none' || rawJwtStr === 'own' || rawJwtStr === 'tenant' || rawJwtStr === 'assigned') {
    access = /** @type {CustomerAccessResolved} */ (rawJwtStr)
  } else if (roleNorm === 'SUPER_ADMIN') {
    access = 'tenant'
  } else if (roleNorm === 'USER') {
    access = 'own'
  } else {
    access = 'tenant'
  }

  const tidRaw = p.tenantDbIdJwt
  let tenantDbId = null
  if (tidRaw !== undefined && tidRaw !== null && tidRaw !== '') {
    const n = typeof tidRaw === 'number' ? tidRaw : Number(String(tidRaw).trim())
    if (Number.isSafeInteger(n) && n >= 1) {
      tenantDbId = n
    }
  }

  return {
    /** 설계상 JWT가 비어 레거시로 내려온 사용자는 tenant 스코프가 있어도 tenant_id 매칭이 어렵다면 own으로 보수 처리한다. */
    access,
    tenantDbId,
    legacyRoleUpper: roleNorm,
  }
}

/**
 * @param {{
 *   access: CustomerAccessResolved
 *   userId: string
 *   gaId: number
 *   tenantDbId: number | null
 * }} p
 */
export function buildCustomerRowVisibilityWhere(p) {
  const alias = 'c'
  const params = []
  let i = 1

  const gaParam = `$${i}`
  params.push(p.gaId)
  i += 1

  /** @type {string[]} */
  const parts = [`${alias}.ga_id = ${gaParam}`, `${alias}.deleted_at IS NULL`]

  if (p.access === 'none') {
    return { clause: '(FALSE)', params: [] }
  }
  if (p.access === 'assigned') {
    return { clause: `(FALSE)`, params: [] }
  }
  if (p.access === 'own') {
    const uParam = `$${i}`
    params.push(String(p.userId))
    parts.push(`COALESCE(${alias}.owner_user_id, ${alias}.user_id) = ${uParam}`)
    return { clause: parts.join(' AND '), params }
  }
  if (p.access === 'tenant') {
    if (p.tenantDbId != null && Number.isSafeInteger(p.tenantDbId) && p.tenantDbId >= 1) {
      const tid = `$${i}`
      params.push(p.tenantDbId)
      parts.push(`(${alias}.tenant_id IS NOT DISTINCT FROM ${tid} OR ${alias}.tenant_id IS NULL)`)
    }
    return { clause: parts.join(' AND '), params }
  }
  parts.push(`COALESCE(${alias}.owner_user_id, ${alias}.user_id) = $${i}`)
  params.push(String(p.userId))
  return { clause: parts.join(' AND '), params }
}
