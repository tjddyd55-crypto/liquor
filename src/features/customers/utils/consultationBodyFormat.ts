function normalizeYmd(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null
  }
  return s
}

export function parseConsultationStoredBody(
  raw: string,
  createdAtIso: string,
  consultationDate?: string | null,
): { dateLabel: string; text: string } {
  const s = String(raw ?? '')
  const fromColumn = normalizeYmd(consultationDate)
  if (fromColumn) {
    return { dateLabel: fromColumn, text: s.trim() }
  }
  const d = new Date(createdAtIso)
  const label = Number.isNaN(d.getTime())
    ? String(createdAtIso ?? '').slice(0, 10)
    : d.toISOString().slice(0, 10)
  return { dateLabel: label, text: s.trim() }
}

export function localYmd(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
