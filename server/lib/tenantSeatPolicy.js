/**
 * 테넌트 좌석(seat)·라이선스 정책 — 멤버십 활성화·신규 지정 검증 및 집계.
 * tenant_admin 행정 역할은 좌석에 포함하지 않는다(staff/user 만 집계).
 */

/**
 * @param {unknown} raw
 * @returns {number | null} null = 무제한(레거시)
 */
export function parseSeatLimitColumn(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim())
        : Number(raw)
  if (!Number.isSafeInteger(n) || n < 1) return null
  return n
}

/**
 * DB license_policy JSONB → 양수 정수 정책만 추출(null = 무제한)
 * @param {unknown} raw
 */
export function parseLicensePolicyFromRow(raw) {
  const po =
    raw != null && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    maxConcurrentSessionsPerUser: pickPositiveInt(
      po.max_concurrent_sessions_per_user ?? po.maxConcurrentSessionsPerUser,
    ),
    maxRegisteredDevicesPerUser: pickPositiveInt(
      po.max_registered_devices_per_user ?? po.maxRegisteredDevicesPerUser,
    ),
  }
}

/**
 * API 편집 PATCH 본문 → 저장용 JSON 객체
 * @param {unknown} raw
 */
export function normalizeLicensePolicyInput(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { max_concurrent_sessions_per_user: null, max_registered_devices_per_user: null }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const po = /** @type {Record<string, unknown>} */ (raw)
  const maxS = pickPositiveIntOrNull(po.maxConcurrentSessionsPerUser ?? po.max_concurrent_sessions_per_user)
  const maxD = pickPositiveIntOrNull(po.maxRegisteredDevicesPerUser ?? po.max_registered_devices_per_user)
  const out = {
    max_concurrent_sessions_per_user: maxS,
    max_registered_devices_per_user: maxD,
  }
  return Object.values(out).every((x) => x === null || x === undefined) ? {} : stripNullDeep(out)
}

function stripNullDeep(obj) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return out
}

function pickPositiveInt(raw) {
  const n = pickPositiveIntOrNull(raw)
  return n
}

/** @returns {number | null} — null 허용(키 생략) */
function pickPositiveIntOrNull(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number(raw)
  if (!Number.isSafeInteger(n) || n < 1) return null
  return n
}

/**
 * PATCH license_policy 부분 업데이트. null/빈 문자열은 해당 키 삭제(무제한).
 * @param {unknown} currentRaw
 * @param {unknown} patchRaw
 * @returns {{ ok: true; merged: Record<string, unknown> } | { ok: false; message: string }}
 */
export function mergeLicensePolicyForPatch(currentRaw, patchRaw) {
  const base =
    currentRaw != null && typeof currentRaw === 'object' && !Array.isArray(currentRaw)
      ? { .../** @type {Record<string, unknown>} */ (currentRaw) }
      : {}
  if (patchRaw === undefined) {
    return { ok: true, merged: base }
  }
  if (patchRaw === null || typeof patchRaw !== 'object' || Array.isArray(patchRaw)) {
    return { ok: false, message: 'licensePolicy는 객체여야 합니다.' }
  }
  const po = /** @type {Record<string, unknown>} */ (patchRaw)

  /**
   * @param {string} snakeKey
   * @param {string} label
   * @param {unknown} v
   * @returns {string | null} 오류 메시지 또는 null
   */
  function applySnake(label, snakeKey, v) {
    if (v === null || v === '' || v === undefined) {
      delete base[snakeKey]
      return null
    }
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(String(v).trim()) : Number(v)
    if (!Number.isSafeInteger(n) || n < 1) {
      return `${label}는 1 이상의 정수이거나 null(제한 없음)이어야 합니다.`
    }
    base[snakeKey] = n
    return null
  }

  let err = null
  if ('maxConcurrentSessionsPerUser' in po || 'max_concurrent_sessions_per_user' in po) {
    const v = po.maxConcurrentSessionsPerUser ?? po.max_concurrent_sessions_per_user
    err = applySnake('maxConcurrentSessionsPerUser', 'max_concurrent_sessions_per_user', v)
  }
  if (err) return { ok: false, message: err }
  if ('maxRegisteredDevicesPerUser' in po || 'max_registered_devices_per_user' in po) {
    const v = po.maxRegisteredDevicesPerUser ?? po.max_registered_devices_per_user
    err = applySnake('maxRegisteredDevicesPerUser', 'max_registered_devices_per_user', v)
  }
  if (err) return { ok: false, message: err }
  return { ok: true, merged: base }
}

/**
 * PATCH seat_limit. omit = 변경 없음, null = 무제한(DB NULL), number = 좌석 상한.
 * @param {unknown} raw
 * @returns
 *   | { kind: 'omit' }
 *   | { kind: 'set'; value: number | null }
 *   | { kind: 'error'; message: string }
 */
export function parseSeatLimitForApiPatch(raw) {
  if (raw === undefined) {
    return /** @type {const} */ ({ kind: 'omit' })
  }
  if (raw === null) {
    return /** @type {const} */ ({ kind: 'set', value: null })
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(String(raw).trim()) : Number(raw)
  if (!Number.isSafeInteger(n) || n < 1 || n > 500000) {
    return {
      kind: 'error',
      message: 'seatLimit은 1~500000 사이 정수이거나 null(무제한)이어야 합니다.',
    }
  }
  return /** @type {const} */ ({ kind: 'set', value: n })
}

export function billingEntitlementFromInput(raw, maxChars = 50_000) {
  if (raw === undefined) return undefined
  if (raw === null) return {}
  let s
  try {
    s = JSON.stringify(raw)
  } catch {
    return null
  }
  if (s.length > maxChars) return null
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return /** @type {Record<string, unknown>} */ (raw)
}

/**
 * @param {import('pg').PoolClient | import('pg').Pool} client
 * @param {number} tenantId
 * @returns {Promise<number>}
 */
export async function countActiveTenantSeatMemberships(client, tenantId) {
  const scopeIdStr = String(tenantId)
  const { rows } = await client.query(
    `
    SELECT COUNT(*)::int AS c
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.scope_type = 'tenant'
      AND m.tenant_id IS NOT DISTINCT FROM $1
      AND COALESCE(m.scope_id, '') = $2
      AND m.role IN ('staff', 'user')
      AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
      AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
    `,
    [tenantId, scopeIdStr],
  )
  const c = rows[0]?.c
  return typeof c === 'number' ? c : Number(c ?? 0) || 0
}

export function computeRemainingSeats(seatLimit, activeCount) {
  if (seatLimit == null) return null
  return Math.max(0, seatLimit - activeCount)
}

export function formatSeatExceededMessage(seatLimit, activeCount) {
  return `계약 좌석 수(${seatLimit}명)를 초과했습니다. 현재 활성 사용자는 ${activeCount}명입니다. 다른 사용자를 비활성화하거나 좌석을 늘리세요.`
}

/**
 * 새 활성 staff/user 또는 inactive→active 전환 전 호출한다.
 * @param {{ seatLimitColumn: unknown; activeSeatCountBefore: number }} ctx
 */
export function assertSeatAvailableForNewActivation(ctx) {
  const lim = parseSeatLimitColumn(ctx.seatLimitColumn)
  if (lim == null) return { ok: true }
  const next = ctx.activeSeatCountBefore + 1
  if (next > lim) {
    return { ok: false, lim, activeBefore: ctx.activeSeatCountBefore, message: formatSeatExceededMessage(lim, ctx.activeSeatCountBefore) }
  }
  return { ok: true }
}
