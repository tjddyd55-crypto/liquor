/** 만기일까지 남은 일수(로컬 자정 기준). 파싱 불가·빈 값이면 null. */
export function getDDay(date: string | undefined | null): number | null {
  if (!date || typeof date !== 'string' || !date.trim()) {
    return null
  }

  const datePart = date.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null
  }

  const [y, m, d] = datePart.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** D-day 배지용: 7일 이내(만기 임박·지남) 빨강, 30일 이내 노랑 */
export function getDDayBadgeClass(dday: number | null): string {
  if (dday === null) {
    return ''
  }
  if (dday <= 7) {
    return 'customer-dday customer-dday--urgent'
  }
  if (dday <= 30) {
    return 'customer-dday customer-dday--warn'
  }
  return 'customer-dday'
}
