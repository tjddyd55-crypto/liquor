/**
 * 테넌트 가입 코드(Industry + Tenant Registration Code) 검증·정규화.
 * 스태프용 코드는 이번 MVP 범위 밖(default_* 는 agent/own/agent 전용 플로우).
 */

/** @typedef {{ ok: true, row: object, gaId: number, tenantDbId: number }} TenantRegOk */
/** @typedef {{ ok: false, status: number, message: string }} TenantRegErr */

/**
 * 가입 폼 코드 정규화(대문자·공백 제거).
 * @param {unknown} raw
 */
export function normalizeTenantRegistrationCodeRaw(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/**
 * 업종 코드(소문자).
 * @param {unknown} raw
 */
export function normalizeIndustryCodeParam(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/**
 * tenant_registration_codes + tenant/industry 상태 검증(가입 코드 경로 공용).
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {{ industryCodeNorm: string, registrationCodeNorm: string }} p
 * @returns {Promise<TenantRegOk | TenantRegErr>}
 */
export async function evaluateTenantRegistrationCodeForSignup(exec, p) {
  const industryCodeNorm = String(p.industryCodeNorm ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  const registrationCodeNorm = normalizeTenantRegistrationCodeRaw(p.registrationCodeNorm)

  if (!industryCodeNorm) {
    return { ok: false, status: 400, message: '업종 정보가 필요합니다.' }
  }
  if (!registrationCodeNorm || registrationCodeNorm.length < 3) {
    return { ok: false, status: 400, message: '유효한 가입 코드를 입력해 주세요.' }
  }

  const q = await exec.query(
    `
    SELECT
      rc.id,
      rc.code,
      rc.tenant_id,
      rc.industry_code AS rc_industry_code,
      rc.default_membership_type,
      rc.default_customer_access,
      rc.default_role,
      rc.status AS rc_status,
      rc.expires_at,
      rc.max_uses,
      rc.used_count,
      t.id AS tenant_pk,
      t.status AS tenant_status,
      t.legacy_ga_id AS tenant_legacy_ga_id,
      t.name AS tenant_name,
      t.industry_id AS tenant_industry_id,
      ic.code AS actual_industry_code
    FROM tenant_registration_codes rc
    INNER JOIN tenants t ON t.id = rc.tenant_id
    INNER JOIN industries ic ON ic.id = t.industry_id
    WHERE rc.code = $1
      AND rc.status = 'active'
    LIMIT 1
    `,
    [registrationCodeNorm],
  )

  const row = q.rows[0]
  if (!row) {
    return { ok: false, status: 400, message: '유효하지 않거나 비활성화된 가입 코드입니다.' }
  }

  const actualIc = String(row.actual_industry_code ?? '')
    .trim()
    .toLowerCase()
  if (actualIc !== industryCodeNorm) {
    return {
      ok: false,
      status: 400,
      message: '이 가입 코드는 현재 업종의 코드가 아닙니다.',
    }
  }

  const rcIc = String(row.rc_industry_code ?? '')
    .trim()
    .toLowerCase()
  if (rcIc !== industryCodeNorm || rcIc !== actualIc) {
    return {
      ok: false,
      status: 400,
      message: '이 가입 코드는 현재 업종의 코드가 아닙니다.',
    }
  }

  const tenantStatus = String(row.tenant_status ?? '').trim().toLowerCase()
  if (tenantStatus !== 'active') {
    return { ok: false, status: 400, message: '가입 코드에 연결된 테넌트가 비활성 상태입니다.' }
  }

  const exp = row.expires_at ? new Date(row.expires_at) : null
  if (exp && Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
    return { ok: false, status: 400, message: '만료된 가입 코드입니다.' }
  }

  const maxUses = row.max_uses != null ? Number(row.max_uses) : null
  const usedCount = Number(row.used_count ?? 0) || 0
  if (maxUses != null && Number.isFinite(maxUses) && maxUses >= 0 && usedCount >= maxUses) {
    return {
      ok: false,
      status: 400,
      message: '가입 코드 사용 가능 횟수를 초과했습니다.',
    }
  }

  const gaRaw = row.tenant_legacy_ga_id
  const gaId = typeof gaRaw === 'number' && Number.isInteger(gaRaw) && gaRaw > 0 ? gaRaw : Number.parseInt(String(gaRaw ?? ''), 10)
  if (!Number.isInteger(gaId) || gaId < 1) {
    return {
      ok: false,
      status: 400,
      message: '테넌트에 GA 조직 연결이 없어 가입을 진행할 수 없습니다. 관리자에게 문의하세요.',
    }
  }

  const gaChk = await exec.query(
    `
    SELECT id, status FROM ga_companies
    WHERE id = $1 AND COALESCE(is_deleted, FALSE) IS NOT TRUE
    LIMIT 1
    `,
    [gaId],
  )
  const g0 = gaChk.rows[0]
  if (!g0 || String(g0.status ?? '').toLowerCase() !== 'active') {
    return { ok: false, status: 400, message: '가입 코드에 연결된 조직을 사용할 수 없습니다.' }
  }

  const tenantDbId = Number(row.tenant_pk)
  if (!Number.isSafeInteger(tenantDbId) || tenantDbId < 1) {
    return { ok: false, status: 500, message: '테넌트 정보를 확인할 수 없습니다.' }
  }

  return { ok: true, row, gaId, tenantDbId }
}

/**
 * 가입 성공 시 used_count 증가(레이스 줄이려면 호출 시 트랜잭션·FOR UPDATE 선호).
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number | string | bigint} codeRowId
 * @returns {Promise<{ incremented: boolean }>}
 */
export async function incrementTenantRegistrationUsedCount(exec, codeRowId) {
  const id = typeof codeRowId === 'bigint' ? Number(codeRowId) : Number(codeRowId)
  const r = await exec.query(
    `
    UPDATE tenant_registration_codes rc
    SET used_count = used_count + 1,
        updated_at = NOW()
    WHERE rc.id = $1
      AND rc.status = 'active'
      AND (rc.max_uses IS NULL OR rc.used_count < rc.max_uses)
      AND (rc.expires_at IS NULL OR rc.expires_at > NOW())
    RETURNING rc.id
    `,
    [id],
  )
  return { incremented: (r.rowCount ?? 0) > 0 }
}
