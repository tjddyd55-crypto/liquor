import { calculateInsuranceAgeFromRrn } from './insuranceAge'

const NOTE_MAX_LENGTH = 2000

export function formatRrnInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 6) {
    return d
  }
  return `${d.slice(0, 6)}-${d.slice(6)}`
}

/** 주민번호 기준 보험나이·상령일 — `insuranceAge.ts` 단일 로직 */
export function calculateInsuranceInfo(rrn: string): { age: number | null; nextAgeDate: Date | null } {
  const r = calculateInsuranceAgeFromRrn(rrn, new Date())
  if (!r) {
    return { age: null, nextAgeDate: null }
  }
  return { age: r.insuranceAge, nextAgeDate: r.maturityDate }
}

export function formatInsuranceUiDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) {
    return '계산 불가'
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 날짜만(YYYY-MM-DD 또는 ISO) 표시 — 타임존 오프셋 피함 */
export function formatDateYmdInput(dateString: string | null): string {
  if (!dateString?.trim()) {
    return '-'
  }
  const s = dateString.trim()
  const dayPart = s.includes('T') ? s.slice(0, 10) : s
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dayPart)
  if (!m) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) {
      return '-'
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
}

export function nextAgeDateToIsoString(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) {
    return null
  }
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export { NOTE_MAX_LENGTH }
