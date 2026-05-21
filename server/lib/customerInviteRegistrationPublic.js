/**
 * 외부 고객 등록 초대(/customer/register) 공유 상수·메타 HTML·쿠키 유틸.
 * 개인정보는 메타/쿠키에 넣지 않는다.
 */

export const PUBLIC_INVITE_REG_COOKIE = 'ins_inv_reg'
export const PUBLIC_INVITE_EDIT_MS = 3 * 60 * 60 * 1000

export const REGISTER_LINK_PAGE_TITLE = '고객 정보 등록 페이지'
export const REGISTER_LINK_PAGE_DESC = '담당자가 전달한 링크에서 고객 정보를 등록해 주세요.'

export function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/**
 * dist index.html 에 고객 초대 링크용 title / description / og / twitter 만 삽입 (크롤러용).
 */
export function injectCustomerRegisterInviteMeta(html) {
  const title = REGISTER_LINK_PAGE_TITLE
  const desc = REGISTER_LINK_PAGE_DESC
  const t = escapeHtmlAttr(title)
  const d = escapeHtmlAttr(desc)

  const metaBlock = `
    <meta name="description" content="${d}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
`

  let out = String(html)
    .replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:title["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:type["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:card["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:title["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:description["'][^>]*>/gi, '')

  out = out.replace(/<head>/i, `<head>${metaBlock}`)
  return out
}

export function readCookieFromHeader(cookieHeader, name) {
  const raw = String(cookieHeader ?? '')
  if (!raw.trim()) return ''
  const parts = raw.split(';')
  for (const p of parts) {
    const idx = p.indexOf('=')
    if (idx < 0) continue
    const k = p.slice(0, idx).trim()
    if (k !== name) continue
    try {
      return decodeURIComponent(p.slice(idx + 1).trim())
    } catch {
      return p.slice(idx + 1).trim()
    }
  }
  return ''
}

export function buildInviteRegSetCookieHeader(token, maxAgeSec, { secure }) {
  const parts = [
    `${PUBLIC_INVITE_REG_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (Number.isFinite(maxAgeSec) && maxAgeSec >= 0) {
    parts.push(`Max-Age=${Math.floor(maxAgeSec)}`)
  }
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildInviteRegClearCookieHeader({ secure }) {
  const parts = [`${PUBLIC_INVITE_REG_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** @param {Date | string} firstSubmittedAt */
export function editableDeadlineMsFromFirstSubmitted(firstSubmittedAt) {
  const d = firstSubmittedAt instanceof Date ? firstSubmittedAt : new Date(firstSubmittedAt)
  const t = d.getTime()
  if (Number.isNaN(t)) return Date.now()
  return t + PUBLIC_INVITE_EDIT_MS
}
