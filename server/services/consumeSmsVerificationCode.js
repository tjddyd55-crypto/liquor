/**
 * SMS 인증코드 1회 소비 (SELECT→UPDATE 분리 없음, 경쟁 시 1건만 성공).
 * FOR UPDATE SKIP LOCKED 로 동시 요청 시 나머지는 rowCount 0.
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {{ userId: string, phoneNumber: string, code: string, purpose: string, username: string | null }} p
 * - PASSWORD_RESET: username 필수(저장된 username 과 일치)
 * - ACCOUNT_RESET: username 은 null(username 컬럼이 NULL 인 행만)
 */
export async function consumeSmsVerificationCode(client, p) {
  const userId = String(p.userId ?? '').trim()
  const phoneNumber = String(p.phoneNumber ?? '').trim()
  const code = String(p.code ?? '').trim()
  const purpose = String(p.purpose ?? '').trim()
  const username = p.username

  if (username != null && String(username).trim() !== '') {
    const u = String(username).trim()
    return client.query(
      `
      WITH picked AS (
        SELECT id FROM sms_verification_codes
        WHERE user_id = $1
          AND phone_number = $2
          AND code = $3
          AND purpose = $4
          AND used = FALSE
          AND expires_at > NOW()
          AND username = $5
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE sms_verification_codes AS v
      SET used = TRUE, verified_at = NOW()
      FROM picked
      WHERE v.id = picked.id
      RETURNING v.id
      `,
      [userId, phoneNumber, code, purpose, u],
    )
  }

  return client.query(
    `
    WITH picked AS (
      SELECT id FROM sms_verification_codes
      WHERE user_id = $1
        AND phone_number = $2
        AND code = $3
        AND purpose = $4
        AND used = FALSE
        AND expires_at > NOW()
        AND username IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE sms_verification_codes AS v
    SET used = TRUE, verified_at = NOW()
    FROM picked
    WHERE v.id = picked.id
    RETURNING v.id
    `,
    [userId, phoneNumber, code, purpose],
  )
}

/** 가입 전 SIGNUP 등: user_id 없이 phone + purpose + code만 매칭 */
export async function consumeAnonymousSmsVerificationCode(client, p) {
  const phoneNumber = String(p.phoneNumber ?? '').trim()
  const code = String(p.code ?? '').trim()
  const purpose = String(p.purpose ?? '').trim()

  return client.query(
    `
    WITH picked AS (
      SELECT id FROM sms_verification_codes
      WHERE user_id IS NULL
        AND phone_number = $1
        AND code = $2
        AND purpose = $3
        AND used = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE sms_verification_codes AS v
    SET used = TRUE, verified_at = NOW()
    FROM picked
    WHERE v.id = picked.id
    RETURNING v.id
    `,
    [phoneNumber, code, purpose],
  )
}
