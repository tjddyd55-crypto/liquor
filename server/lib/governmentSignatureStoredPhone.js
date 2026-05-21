import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * 정부지원 전자서명 발송 세션 target_phone_encrypted.
 * env GOV_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY: 64자 hex 또는 임의 문자열(sha256으로 32바이트 파생).
 */

function resolveGovSignaturePhoneKey32() {
  const raw = String(
    process.env.GOV_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY ??
      process.env.CONTRACT_TARGET_PHONE_ENCRYPTION_KEY ??
      '',
  ).trim()
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
export function encryptGovSignatureTargetPhoneDigits(phoneDigits) {
  const key = resolveGovSignaturePhoneKey32()
  if (!key) {
    throw new Error('[gov signature phone] GOV_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY is not set')
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
export function decryptGovSignatureTargetPhoneBlob(blob) {
  const key = resolveGovSignaturePhoneKey32()
  if (!key || !blob) {
    return null
  }
  try {
    const buf = Buffer.from(String(blob), 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(data), decipher.final()])
    return String(dec.toString('utf8')).replace(/\D/g, '')
  } catch {
    return null
  }
}
