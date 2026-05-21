import { formatSeoulYmd } from './formatSeoulYmd'

/**
 * 제목/본문에 포함된 단순 키워드로 제안 마감일(Asia/Seoul)을 만든다.
 * 복잡한 자연어 분석은 하지 않는다.
 */
export function suggestDueDateFromText(text: string): string | null {
  const t = text
  const today = new Date()
  if (t.includes('오늘')) {
    return formatSeoulYmd(today)
  }
  if (t.includes('내일')) {
    const d = new Date(`${formatSeoulYmd(today)}T12:00:00+09:00`)
    d.setDate(d.getDate() + 1)
    return formatSeoulYmd(d)
  }
  if (t.includes('모레')) {
    const d = new Date(`${formatSeoulYmd(today)}T12:00:00+09:00`)
    d.setDate(d.getDate() + 2)
    return formatSeoulYmd(d)
  }
  return null
}
