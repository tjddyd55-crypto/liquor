/**
 * 선택 URL 필드: 빈 값 허용. 값이 있으면 http(s)로 정규화·검증한다.
 */

export type NormalizeOptionalUrlResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

export function normalizeOptionalUrl(raw: string): NormalizeOptionalUrlResult {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, value: '' }

  let candidate = s
  if (/^\/\//.test(candidate)) {
    candidate = `https:${candidate}`
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, message: 'URL은 http:// 또는 https:// 만 허용됩니다.' }
    }
    if (!u.hostname || u.hostname.includes(' ')) {
      return { ok: false, message: '유효한 도메인을 포함한 URL을 입력해 주세요.' }
    }
    return { ok: true, value: u.href }
  } catch {
    return { ok: false, message: 'URL 형식을 확인해 주세요.' }
  }
}
