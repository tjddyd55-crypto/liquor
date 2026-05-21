/**
 * 발급/미리보기용 PDF 파일명 (항상 `.pdf`).
 * 브라우저/내장 PDF 뷰어 표시 및 다운로드에 공통 사용.
 */

/** 경로·헤더에 쓰이지 않도록 파일명 문자만 남김 */
function sanitizeSegment(raw: string, fallback: string): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/[\r\n\u0000]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s.length ? s.slice(0, 80) : fallback
}

export function formatSeoulYmdCompact(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}${m}${d}`
}

export type PdfIssuanceDisplayFilenameInput = {
  customerLabel?: string | null
  templateTitle?: string | null
  templateCode?: string | null
  /** 미지정 시 서울 당일 YYYYMMDD */
  ymdCompact?: string
}

export function buildPdfIssuanceDisplayFilename(input: PdfIssuanceDisplayFilenameInput): string {
  const cust = sanitizeSegment(String(input.customerLabel ?? '').trim(), '고객')
  const tmpl = sanitizeSegment(String(input.templateTitle ?? input.templateCode ?? '').trim(), '신청서')
  const ymd = input.ymdCompact?.trim() || formatSeoulYmdCompact()
  return `${cust}_${tmpl}_${ymd}.pdf`
}
