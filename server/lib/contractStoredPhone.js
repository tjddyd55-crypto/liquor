import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * 발송 세션 target_phone_encrypted / 복호화 (선택).
 * env CONTRACT_TARGET_PHONE_ENCRYPTION_KEY: 64자 hex 또는 임의 문자열(sha256으로 32바이트 파생).
 */

function resolveKey32() {
  const raw = String(process.env.CONTRACT_TARGET_PHONE_ENCRYPTION_KEY ?? '').trim()
  if (!raw) {
    return null
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

/**
 * @param {string} phoneDigits 숫자만
 * @returns {string} base64(iv+tag+ciphertext)
 */
export function encryptContractTargetPhoneDigits(phoneDigits) {
  const key = resolveKey32()
  if (!key) {
    throw new Error('[contract phone] CONTRACT_TARGET_PHONE_ENCRYPTION_KEY is not set')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(phoneDigits), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * @param {string} blob base64
 * @returns {string | null} 숫자만 또는 null
 */
export function decryptContractTargetPhoneBlob(blob) {
  const key = resolveKey32()
  if (!key) {
    return null
  }
  try {
    const buf = Buffer.from(String(blob), 'base64')
    if (buf.length < 28) {
      return null
    }
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const out = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    return out.replace(/\D/g, '')
  } catch {
    return null
  }
}
