/**
 * 로그인 세션·기기 추적(1차: 기록 + 동시 세션 상한 시 오래된 세션 만료).
 */

const DEFAULT_SESSION_HORIZON_DAYS = 7

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  const fromFwd = typeof fwd === 'string' && fwd.trim() ? fwd.split(',')[0].trim() : ''
  if (fromFwd) return fromFwd.slice(0, 128)
  const rip = req.socket?.remoteAddress
  return typeof rip === 'string' ? rip.slice(0, 128) : ''
}

function userAgent(req) {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua.slice(0, 512) : ''
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {import('express').Request} req
 * @param {number | null} concurrentCap null = 무제한
 */
export async function recordSuccessfulUserLoginSession(pool, userId, req, concurrentCap) {
  const ip = clientIp(req)
  const ua = userAgent(req)
  const fpRaw = req.headers['x-device-fingerprint'] ?? req.headers['x-device-fp']
  const fingerprint = typeof fpRaw === 'string' && fpRaw.trim() ? fpRaw.trim().slice(0, 256) : null

  await pool.query(
    `
    UPDATE users
    SET last_login_at = NOW(),
        last_login_ip = $2,
        last_login_user_agent = $3
    WHERE id = $1
    `,
    [userId, ip || null, ua || null],
  )

  await pool.query(
    `
    INSERT INTO user_auth_sessions (user_id, created_at, last_seen_at, expires_at, ip_inet, user_agent, fingerprint)
    VALUES ($1, NOW(), NOW(), NOW() + ($2::text || ' days')::interval, $3, $4, $5)
    `,
    [userId, String(DEFAULT_SESSION_HORIZON_DAYS), ip || null, ua || null, fingerprint],
  )

  if (concurrentCap != null && Number.isInteger(concurrentCap) && concurrentCap >= 1) {
    const { rows } = await pool.query(
      `
      SELECT id FROM user_auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC
      `,
      [userId],
    )
    if (rows.length > concurrentCap) {
      const toRevoke = rows.slice(concurrentCap).map((r) => r.id)
      if (toRevoke.length > 0) {
        await pool.query(
          `
          UPDATE user_auth_sessions
          SET revoked_at = NOW()
          WHERE user_id = $1 AND id = ANY($2::bigint[])
          `,
          [userId, toRevoke],
        )
      }
    }
  }

  if (fingerprint != null) {
    await pool.query(
      `
      INSERT INTO user_registered_devices (user_id, fingerprint, last_seen_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, fingerprint) DO UPDATE SET
        last_seen_at = NOW(),
        updated_at = NOW()
      `,
      [userId, fingerprint],
    )
  }
}

/**
 * 사용자가 속한 활성 tenant 멤버십의 라이선스 정책 중 max_concurrent_sessions_per_user 최소값(가장 엄격).
 * 없으면 null(무제한).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function resolveMinConcurrentSessionCapForUser(pool, userId) {
  const { rows } = await pool.query(
    `
    SELECT t.license_policy AS lp
    FROM user_memberships m
    INNER JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = $1
      AND m.scope_type = 'tenant'
      AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
      AND m.role IN ('staff', 'user', 'tenant_admin')
      AND LOWER(TRIM(COALESCE(t.status::text, ''))) = 'active'
    `,
    [userId],
  )
  const caps = []
  for (const row of rows) {
    const lp = row.lp && typeof row.lp === 'object' && !Array.isArray(row.lp) ? row.lp : {}
    const raw = lp.max_concurrent_sessions_per_user
    if (raw === null || raw === undefined || raw === '') continue
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number(raw)
    if (Number.isSafeInteger(n) && n >= 1) caps.push(n)
  }
  if (caps.length === 0) return null
  return Math.min(...caps)
}
