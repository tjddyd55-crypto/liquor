import { resolveCanonicalFieldKey } from '../../customer-templates'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import type { CustomerRecord } from '../domain/types'
import { readIndustryCanonDisplayValue } from './industryCustomerReadSummary'
import { formatIndustryCustomerListSecondaryLine } from './industryCustomerListSummary'
import { buildGovernmentCustomerStatusSummary, formatGovernmentListMetaSecondaryLine } from './governmentCustomerStatusSummary'

function rawExtTrim(customer: CustomerRecord, canonicalKey: string): string {
  return readIndustryCanonDisplayValue(customer, canonicalKey).trim()
}

/** YYYY-MM-DD 또는 ISO 앞 10자 — 파싱 실패 시 null */
function parseLocalYmdFromStored(s: string): { y: number; m: number; d: number } | null {
  const t = String(s ?? '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

function todayLocalYmdParts(): { y: number; m: number; d: number } {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }
}

/** 두 날짜(로컬 자정 기준 간격) 일수. b - a. */
function calendarDaysDiff(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  const tA = Date.UTC(a.y, a.m - 1, a.d)
  const tB = Date.UTC(b.y, b.m - 1, b.d)
  return Math.round((tB - tA) / 86400000)
}

function truncateOneLine(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`
}

/** 정적 템플릿·동적 템플릿 모두 `meta.industryCode === 'government'` 로 수렴. */
export function isGovernmentIndustryTemplate(template: CustomerIndustryTemplate): boolean {
  return template.meta.industryCode === 'government'
}

/** 상세 상단 카드 전체 줄(항목 많음 · 빈 값은 — 표시로 운영 가시성 확보). */
const GOVERNMENT_DETAIL_SUMMARY_KEYS: readonly string[] = [
  'gov.programName',
  'gov.productName',
  'gov.applicationType',
  'gov.caseNumber',
  'gov.agency',
  'gov.department',
  'gov.status',
  'gov.submittedAt',
  'gov.dueDate',
  'gov.assignee',
  'gov.supportAmount',
  'gov.result',
  'gov.rejectionReason',
  'gov.supplementRequest',
  'business.name',
  'management.memoSummary',
  'management.lastConsultDate',
]

function labelForCanonKey(template: CustomerIndustryTemplate, canonicalKey: string): string {
  const f = template.formFields.find((x) => resolveCanonicalFieldKey(x.fieldKey) === canonicalKey)
  return f?.label?.trim() || canonicalKey
}

export function displayGovernmentCrValue(customer: CustomerRecord, canonicalKey: string): string {
  const raw = readIndustryCanonDisplayValue(customer, canonicalKey).trim()
  if (raw.length > 0) return raw
  return '—'
}

/** 목록 카드 메타 한 줄(정부 업종 한정) — `governmentCustomerStatusSummary`와 동일 소스. */
export function formatGovernmentCardMetaSecondaryLine(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
): string {
  const summary = buildGovernmentCustomerStatusSummary(customer, template)
  if (summary.hasAnySignal || summary.secondaryLine.trim().length > 0) {
    return formatGovernmentListMetaSecondaryLine(summary)
  }
  return formatIndustryCustomerListSecondaryLine(customer, template)
}

export type GovernmentOpsSummaryRow = { label: string; value: string; canonicalKey: string }

/** 상단 요약 카드 행 · 값 없어도 — 로 표시(미입력 상태 가시화). */
export function governmentDetailSummaryRows(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
): GovernmentOpsSummaryRow[] {
  return GOVERNMENT_DETAIL_SUMMARY_KEYS.map((canonicalKey) => ({
    canonicalKey,
    label: labelForCanonKey(template, canonicalKey),
    value: displayGovernmentCrValue(customer, canonicalKey),
  }))
}

// --- 진행 현황 MVP (읽기 전용 · crm_extension 필드만 사용)

export type GovernmentProgressBadgeVariant = 'danger' | 'warn' | 'ok' | 'info' | 'muted'

export type GovernmentProgressBadge = {
  variant: GovernmentProgressBadgeVariant
  label: string
}

export type GovernmentProgressMvpRow = {
  label: string
  value: string
  note?: string
}

export type GovernmentProgressMvpModel = {
  badges: GovernmentProgressBadge[]
  summaryLine: string
  rows: GovernmentProgressMvpRow[]
}

function formatDisplayOrMissing(customer: CustomerRecord, key: string, emptyLabel: string): string {
  const t = rawExtTrim(customer, key)
  return t.length > 0 ? t : emptyLabel
}

/**
 * 상세 화면 전용「진행 현황」— 상단 요약과 중복되지 않게 배지·해석·압축 행 중심.
 */
export function buildGovernmentProgressMvp(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
): GovernmentProgressMvpModel {
  const badges: GovernmentProgressBadge[] = []

  const sup = rawExtTrim(customer, 'gov.supplementRequest')
  if (sup.length > 0) {
    badges.push({ variant: 'warn', label: '보완 필요' })
  }

  const dueRaw = rawExtTrim(customer, 'gov.dueDate')
  const dueParts = dueRaw.length > 0 ? parseLocalYmdFromStored(dueRaw) : null
  const today = todayLocalYmdParts()
  let dueNote = ''
  if (dueParts != null) {
    const diff = calendarDaysDiff(today, dueParts)
    if (diff < 0) {
      badges.push({ variant: 'danger', label: '기한 초과' })
      dueNote = `마감일 지남 (${Math.abs(diff)}일 경과)`
    } else if (diff === 0) {
      badges.push({ variant: 'warn', label: '오늘 마감' })
      dueNote = '오늘 마감'
    } else if (diff >= 1 && diff <= 7) {
      badges.push({ variant: 'warn', label: '마감 임박' })
      dueNote = `D-${diff}`
    }
  }

  const resultRaw = rawExtTrim(customer, 'gov.result')
  const approvalRaw = rawExtTrim(customer, 'gov.approvalAmount')
  const hasOutcome = resultRaw.length > 0 || approvalRaw.length > 0
  if (hasOutcome) {
    badges.push({ variant: 'ok', label: '결과·승인 정보 있음' })
  }

  const rej = rawExtTrim(customer, 'gov.rejectionReason')
  if (rej.length > 0) {
    badges.push({ variant: 'danger', label: '반려 사유 기재됨' })
  }

  const statusRaw = rawExtTrim(customer, 'gov.status')
  const programLine =
    rawExtTrim(customer, 'gov.programName') ||
    rawExtTrim(customer, 'gov.productName') ||
    rawExtTrim(customer, 'gov.applicationType')

  const summaryParts: string[] = []
  if (statusRaw.length > 0) summaryParts.push(`진행: ${statusRaw}`)
  if (programLine.length > 0) summaryParts.push(programLine)
  let summaryLine = summaryParts.length > 0 ? summaryParts.join(' · ') : ''
  if (summaryLine.length === 0 && badges.length > 0) {
    summaryLine = '아래 배지와 항목에서 마감·보완·결과 상태를 확인하세요.'
  }
  if (summaryLine.length === 0) {
    summaryLine = '저장된 진행 정보가 없습니다. 아래 항목을 확인하세요.'
  }

  const rows: GovernmentProgressMvpRow[] = []

  rows.push({
    label: labelForCanonKey(template, 'gov.status'),
    value: statusRaw.length > 0 ? statusRaw : '미입력',
  })

  rows.push({
    label: '프로그램·신청',
    value:
      rawExtTrim(customer, 'gov.programName') ||
      rawExtTrim(customer, 'gov.productName') ||
      rawExtTrim(customer, 'gov.applicationType') ||
      '미입력',
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.caseNumber'),
    value: formatDisplayOrMissing(customer, 'gov.caseNumber', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.agency'),
    value: formatDisplayOrMissing(customer, 'gov.agency', '없음'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.department'),
    value: formatDisplayOrMissing(customer, 'gov.department', '없음'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.submittedAt'),
    value: formatDisplayOrMissing(customer, 'gov.submittedAt', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.dueDate'),
    value:
      dueRaw.length > 0 ? displayGovernmentCrValue(customer, 'gov.dueDate') : '미입력',
    note: dueNote || undefined,
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.assignee'),
    value: formatDisplayOrMissing(customer, 'gov.assignee', '미입력'),
  })

  const reqDoc = rawExtTrim(customer, 'gov.requiredDocuments')
  rows.push({
    label: labelForCanonKey(template, 'gov.requiredDocuments'),
    value: reqDoc.length > 0 ? truncateOneLine(reqDoc, 200) : '없음',
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.supplementRequest'),
    value: sup.length > 0 ? truncateOneLine(sup, 240) : '없음',
  })

  const supportRaw = rawExtTrim(customer, 'gov.supportAmount')
  const supportDisp = supportRaw.length > 0 ? displayGovernmentCrValue(customer, 'gov.supportAmount') : '미입력'
  const approvalDisp = approvalRaw.length > 0 ? displayGovernmentCrValue(customer, 'gov.approvalAmount') : '미입력'
  rows.push({
    label: '필요자금 · 승인금액',
    value: `${supportDisp} / ${approvalDisp}`,
  })

  rows.push({
    label: labelForCanonKey(template, 'contract.paymentStatus'),
    value: formatDisplayOrMissing(customer, 'contract.paymentStatus', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'contract.depositStatus'),
    value: formatDisplayOrMissing(customer, 'contract.depositStatus', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.result'),
    value: formatDisplayOrMissing(customer, 'gov.result', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'gov.rejectionReason'),
    value: rej.length > 0 ? truncateOneLine(rej, 400) : '없음',
  })

  rows.push({
    label: labelForCanonKey(template, 'document.signatureStatus'),
    value: formatDisplayOrMissing(customer, 'document.signatureStatus', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'document.lastSentAt'),
    value: formatDisplayOrMissing(customer, 'document.lastSentAt', '없음'),
  })

  rows.push({
    label: labelForCanonKey(template, 'document.lastCompletedAt'),
    value: formatDisplayOrMissing(customer, 'document.lastCompletedAt', '없음'),
  })

  rows.push({
    label: labelForCanonKey(template, 'document.hasLegalEvidence'),
    value: formatDisplayOrMissing(customer, 'document.hasLegalEvidence', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'management.ownerUserId'),
    value: formatDisplayOrMissing(customer, 'management.ownerUserId', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'management.lastConsultDate'),
    value: formatDisplayOrMissing(customer, 'management.lastConsultDate', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'management.priority'),
    value: formatDisplayOrMissing(customer, 'management.priority', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'management.source'),
    value: formatDisplayOrMissing(customer, 'management.source', '미입력'),
  })

  rows.push({
    label: labelForCanonKey(template, 'management.memoSummary'),
    value: formatDisplayOrMissing(customer, 'management.memoSummary', '없음'),
  })

  return { badges, summaryLine, rows }
}
