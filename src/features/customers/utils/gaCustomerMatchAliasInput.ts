/** 서버 gaCustomerMatchAliases.js 와 동일한 파싱 규칙 (trim·줄바꿈·쉼표 분리). */

export const MAX_GA_MATCH_ALIASES = 20
export const MAX_GA_MATCH_ALIAS_LENGTH = 100

export function parseGaMatchAliasInput(raw: string | string[]): string[] {
  const chunks = Array.isArray(raw) ? raw.map((s) => String(s ?? '')) : [String(raw ?? '')]
  const parts: string[] = []
  for (const chunk of chunks) {
    for (const piece of chunk.split(/[\n,]/)) {
      const t = piece.trim()
      if (t) parts.push(t)
    }
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (p.length > MAX_GA_MATCH_ALIAS_LENGTH) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= MAX_GA_MATCH_ALIASES) break
  }
  return out
}

/** 텍스트 영역 등 줄바꿈 표기용 */
export function aliasesToTextareaValue(aliases: string[]): string {
  return aliases.join('\n')
}

/** 단일 줄 input 에서 쉼표로 구분해 표시 */
export function aliasesToCommaSeparatedInputValue(aliases: string[]): string {
  return aliases.join(', ')
}
