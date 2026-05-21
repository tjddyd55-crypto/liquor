/** UI 표시용 — 원문 전화번호 과다 노출 방지 */
export function maskCustomerNameForTestConsole(name: string): string {
  const t = String(name ?? '').trim()
  if (t.length === 0) {
    return '—'
  }
  if (t.length === 1) {
    return '*'
  }
  if (t.length === 2) {
    return `${t[0]}*`
  }
  return `${t[0]}${'*'.repeat(Math.min(4, t.length - 2))}${t[t.length - 1]}`
}

export function maskPhoneForTestConsole(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length < 8) {
    return d.length === 0 ? '—' : '***'
  }
  const head = d.slice(0, 3)
  const tail = d.slice(-4)
  return `${head}-****-${tail}`
}
