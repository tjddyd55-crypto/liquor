import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function resolveKey32() {
  const raw = String(
    process.env.LIQUOR_RESIDENT_ID_ENCRYPTION_KEY ??
      process.env.LIQUOR_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY ??
      process.env.CONTRACT_TARGET_PHONE_ENCRYPTION_KEY ??
      '',
  ).trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw, 'utf8').digest()
}

/** @param {string} digits 숫자 13자리 */
export function encryptLiquorResidentIdDigits(digits) {
  const key = resolveKey32()
  if (!key) {
    throw new Error('[liquor resident id] LIQUOR_RESIDENT_ID_ENCRYPTION_KEY is not set')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(digits), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** @param {string | null | undefined} blob */
export function decryptLiquorResidentIdBlob(blob) {
  const key = resolveKey32()
  if (!key || !blob) return null
  try {
    const buf = Buffer.from(String(blob), 'base64')
    if (buf.length < 28) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 목록/검색용 마스킹 — 900101-1****** */
export function maskLiquorResidentId(digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  if (d.length < 7) return ''
  if (d.length >= 13) return `${d.slice(0, 6)}-${d[6]}******`
  return `${d.slice(0, 6)}-${d.slice(6, 7)}***`
}

/** @param {string} raw */
export function normalizeLiquorResidentIdDigits(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length !== 13) return null
  return d
}
