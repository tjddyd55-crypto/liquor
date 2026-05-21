/**
 * 일반 유저(USER) 계정 초기화 — 단일 트랜잭션.
 *
 * 삭제 범위 (user_id + ga_id, 멀티테넌트 스코프 — 현재 스키마 기준):
 * - insurance_forms (자동차 신청서 — customers 보다 먼저 삭제: customer_id FK)
 * - customers
 * - feature_requests
 * - sms_verification_codes (ga_id 컬럼 없음 — user_id만)
 *
 * 이후 users 행은 hard delete 대신 status=reset + 민감정보 제거 + 로그인 불가(무작위 비밀번호 해시).
 *
 * 새 테이블에 user_id FK가 생기면 반드시 여기에 DELETE 단계를 추가할 것 (부분 삭제 금지).
 */

import { parseGaId } from '../lib/parseGaId.js'

/**
 * 이미 열린 트랜잭션 안에서 계정 초기화 데이터 삭제 + users 비활성화.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ userId: string, gaId: number, newUsername: string, passwordHash: string }} params
 */
export async function runAccountResetDataOnClient(client, { userId, gaId, newUsername, passwordHash }) {
  const uid = String(userId ?? '').trim()
  if (!uid) {
    throw new Error('userId required')
  }
  const gid = parseGaId(gaId)
  if (gid == null) {
    throw new Error('gaId required')
  }
  const uname = String(newUsername ?? '').trim()
  const hash = String(passwordHash ?? '').trim()
  if (!uname || !hash) {
    throw new Error('newUsername and passwordHash required')
  }

  await client.query('DELETE FROM insurance_forms WHERE user_id = $1 AND ga_id = $2', [uid, gid])
  await client.query('DELETE FROM customers WHERE user_id = $1 AND ga_id = $2', [uid, gid])
  await client.query('DELETE FROM feature_requests WHERE user_id = $1 AND ga_id = $2', [uid, gid])
  await client.query('DELETE FROM sms_verification_codes WHERE user_id = $1', [uid])

  const up = await client.query(
    `
    UPDATE users SET
      status = 'reset',
      display_name = '',
      phone_number = NULL,
      password_hash = $3,
      username = $4,
      delegate_password_plaintext = NULL,
      last_sms_requested_at = NULL,
      sms_request_count = 0,
      sms_request_window_start = NULL,
      sms_auth_failure_count = 0,
      sms_blocked_until = NULL
    WHERE id = $1 AND ga_id = $2 AND role = 'USER' AND is_deleted = false
    `,
    [uid, gid, hash, uname],
  )

  if (up.rowCount === 0) {
    throw new Error('account_reset_no_user_updated')
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, gaId: number, newUsername: string, passwordHash: string }} params
 * @returns {Promise<{ success: true }>}
 */
export async function executeAccountResetTransaction(pool, params) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await runAccountResetDataOnClient(client, params)
    await client.query('COMMIT')
    return { success: true }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback errors */
    }
    console.error('[accountReset] transaction failed, rolled back:', error)
    throw error
  } finally {
    client.release()
  }
}
