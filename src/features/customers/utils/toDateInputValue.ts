/**
 * `<input type="date">` value — 비정규 문자열은 빈 문자열로 두어
 * 모바일 WebView 등에서 조용히 막히는 케이스를 줄인다.
 */
export function toDateInputValue(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}
