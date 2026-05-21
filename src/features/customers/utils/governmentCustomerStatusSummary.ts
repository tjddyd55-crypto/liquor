import { resolveCanonicalFieldKey } from '../../customer-templates'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import type { CustomerRecord } from '../domain/types'
import { readIndustryCanonDisplayValue } from './industryCustomerReadSummary'

function raw(customer: CustomerRecord, canonicalKey: string): string {
  return readIndustryCanonDisplayValue(customer, canonicalKey).trim()
}

function labelFor(template: CustomerIndustryTemplate, canonicalKey: string): string {
  const f = template.formFields.find((x) => resolveCanonicalFieldKey(x.fieldKey) === canonicalKey)
  return f?.label?.trim() || canonicalKey
}

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

function calendarDaysDiff(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  const tA = Date.UTC(a.y, a.m - 1, a.d)
  const tB = Date.UTC(b.y, b.m - 1, b.d)
  return Math.round((tB - tA) / 86400000)
}

export type GovernmentStatusTone = 'blue' | 'amber' | 'green' | 'red' | 'neutral'

export type GovernmentSummaryBadge = {
  label: string
  tone: GovernmentStatusTone
}

export type GovernmentCustomerStatusSummary = {
  statusLabel: string
  statusTone: GovernmentStatusTone
  primaryLine: string
  secondaryLine: string
  badges: GovernmentSummaryBadge[]
  dueDateLabel: string
  paymentLabel: string
  assigneeLabel: string
  /** 카드·요약에 의미 있는 값이 하나라도 있을 때 */
  hasAnySignal: boolean
}

function normalizeStatus(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function inferStatusToneFromText(statusNorm: string): GovernmentStatusTone {
  if (!statusNorm) return 'neutral'
  if (/반려|거절|불승인|탈락|취소|철회|중단/.test(statusNorm)) return 'red'
  if (/승인|선정|합격|지급완료|완료|확정/.test(statusNorm)) return 'green'
  if (/보완|재제출|추가서류/.test(statusNorm)) return 'amber'
  if (/접수|제출|심사|검토|진행|대기|협의/.test(statusNorm)) return 'blue'
  return 'neutral'
}

function pushBadgeUnique(out: GovernmentSummaryBadge[], label: string, tone: GovernmentStatusTone) {
  if (!label.trim()) return
  if (out.some((b) => b.label === label)) return
  out.push({ label, tone })
}

function mapStatusToShortBadge(statusRaw: string): { label: string; tone: GovernmentStatusTone } | null {
  const n = normalizeStatus(statusRaw)
  if (!n) return null
  if (/반려|거절|불승인|탈락/.test(n)) return { label: '반려', tone: 'red' }
  if (/취소|철회|중단/.test(n)) return { label: '취소', tone: 'red' }
  if (/승인|선정|합격|지급완료|완료|확정/.test(n)) return { label: '승인', tone: 'green' }
  if (/보완|재제출|추가서류/.test(n)) return { label: '보완요청', tone: 'amber' }
  if (/접수|제출|심사|검토|진행|대기|협의/.test(n)) return { label: '접수·진행', tone: 'blue' }
  return { label: truncateOneLine(statusRaw.replace(/\s+/g, ' '), 10), tone: 'neutral' }
}

function truncateOneLine(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`
}

/**
 * Government 업종 고객 목록/상단 요약용 — crm_extension.fields 및 템플릿 라벨만 사용.
 */
export function buildGovernmentCustomerStatusSummary(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
): GovernmentCustomerStatusSummary {
  const statusRaw = raw(customer, 'gov.status')
  const statusNorm = normalizeStatus(statusRaw)
  const statusTone = inferStatusToneFromText(statusNorm)

  const program =
    raw(customer, 'gov.programName') ||
    raw(customer, 'gov.productName') ||
    raw(customer, 'gov.applicationType')
  const agency = raw(customer, 'gov.agency')
  const dept = raw(customer, 'gov.department')
  const dueRaw = raw(customer, 'gov.dueDate')
  const submitted = raw(customer, 'gov.submittedAt')

  const paymentStatus = raw(customer, 'contract.paymentStatus')
  const depositStatus = raw(customer, 'contract.depositStatus')
  const paymentParts: string[] = []
  if (paymentStatus) paymentParts.push(paymentStatus)
  if (depositStatus && depositStatus !== paymentStatus) paymentParts.push(depositStatus)
  const paymentLabel = paymentParts.join(' · ')

  const assigneeGov = raw(customer, 'gov.assignee')
  const assigneeMgmt = raw(customer, 'management.assignee')
  const assigneeLabel = assigneeGov || assigneeMgmt || ''

  const support = raw(customer, 'gov.supportAmount')
  const approval = raw(customer, 'gov.approvalAmount')
  const fundParts: string[] = []
  if (support) fundParts.push(`필요 ${support}`)
  if (approval) fundParts.push(`승인 ${approval}`)

  const badges: GovernmentSummaryBadge[] = []

  const sup = raw(customer, 'gov.supplementRequest')
  if (sup.length > 0) pushBadgeUnique(badges, '보완요청', 'amber')

  const rej = raw(customer, 'gov.rejectionReason')
  if (rej.length > 0) pushBadgeUnique(badges, '반려', 'red')

  const dueParts = dueRaw.length > 0 ? parseLocalYmdFromStored(dueRaw) : null
  const today = todayLocalYmdParts()
  let dueDateLabel = dueRaw.length > 0 ? dueRaw : ''
  if (dueParts != null) {
    const diff = calendarDaysDiff(today, dueParts)
    if (diff < 0) {
      pushBadgeUnique(badges, '기한경과', 'red')
      dueDateLabel = `${dueRaw} (경과)`
    } else if (diff === 0) {
      pushBadgeUnique(badges, '오늘마감', 'amber')
    } else if (diff >= 1 && diff <= 7) {
      pushBadgeUnique(badges, '마감임박', 'amber')
      dueDateLabel = `${dueRaw} (D-${diff})`
    }
  }

  const fromStatus = mapStatusToShortBadge(statusRaw)
  if (fromStatus) pushBadgeUnique(badges, fromStatus.label, fromStatus.tone)

  const result = raw(customer, 'gov.result')
  if (result.length > 0) {
    const rn = normalizeStatus(result)
    if (/승인|선정|합격|지급|완료/.test(rn)) pushBadgeUnique(badges, '승인', 'green')
    else if (/반려|거절|불승인/.test(rn)) pushBadgeUnique(badges, '반려', 'red')
  }

  const priority = raw(customer, 'management.priority')
  if (priority) pushBadgeUnique(badges, `우선 ${truncateOneLine(priority, 8)}`, 'amber')

  const primaryLine =
    program ||
    agency ||
    (statusRaw ? `상태: ${statusRaw}` : '') ||
    (submitted ? `접수 ${submitted}` : '') ||
    '진행 현황'

  const secondaryParts: string[] = []
  if (agency) secondaryParts.push(agency)
  if (dept) secondaryParts.push(dept)
  if (dueRaw) secondaryParts.push(summaryDuePhrase(dueRaw, dueDateLabel))
  if (paymentLabel) secondaryParts.push(paymentLabel)
  if (assigneeLabel) secondaryParts.push(`담당 ${assigneeLabel}`)
  if (fundParts.length > 0) secondaryParts.push(fundParts.join(' / '))
  if (submitted && !secondaryParts.some((p) => p.startsWith('접수'))) {
    secondaryParts.push(`접수 ${submitted}`)
  }

  const secondaryLine = secondaryParts.filter(Boolean).join(' · ')

  const memo = raw(customer, 'management.memoSummary')
  const lastConsult = raw(customer, 'management.lastConsultDate')

  const hasAnySignal =
    badges.length > 0 ||
    Boolean(
      statusRaw ||
        program ||
        agency ||
        dept ||
        dueRaw ||
        paymentLabel ||
        assigneeLabel ||
        support ||
        approval ||
        submitted ||
        memo ||
        lastConsult,
    )

  return {
    statusLabel: statusRaw || '미정',
    statusTone,
    primaryLine: primaryLine.trim() || '진행 현황',
    secondaryLine: secondaryLine.trim(),
    badges,
    dueDateLabel: dueDateLabel.trim(),
    paymentLabel,
    assigneeLabel,
    hasAnySignal,
  }
}

function summaryDuePhrase(dueRaw: string, dueDateLabel: string): string {
  if (dueDateLabel && dueDateLabel !== dueRaw) return `마감 ${dueDateLabel}`
  return `마감 ${dueRaw}`
}

/** 목록 카드 두 번째 줄: 배지 옆 요약이 아닌 “한 줄 메타” 전용(배지는 JSX에서 따로). */
export function formatGovernmentListMetaSecondaryLine(summary: GovernmentCustomerStatusSummary): string {
  if (!summary.hasAnySignal && !summary.secondaryLine) {
    return '표시할 진행 현황이 없습니다'
  }
  if (summary.secondaryLine) return summary.secondaryLine
  return summary.primaryLine
}

export type GovernmentDetailStatusCardRow = { label: string; value: string; valueTone?: GovernmentStatusTone }

/** 상세 상단 카드용 — 빈 값은 행 자체를 생략한다. */
export function buildGovernmentDetailStatusCardRows(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
  summary: GovernmentCustomerStatusSummary,
): GovernmentDetailStatusCardRow[] {
  const rows: GovernmentDetailStatusCardRow[] = []

  const pushRow = (label: string, value: string, valueTone?: GovernmentStatusTone) => {
    const v = value.trim()
    if (!v) return
    rows.push({ label, value: v, valueTone })
  }

  const statusRawForRow = raw(customer, 'gov.status')
  if (statusRawForRow) {
    pushRow(labelFor(template, 'gov.status'), statusRawForRow, summary.statusTone)
  }

  const program =
    raw(customer, 'gov.programName') ||
    raw(customer, 'gov.productName') ||
    raw(customer, 'gov.applicationType')
  pushRow(labelFor(template, 'gov.programName'), program)

  const agency = raw(customer, 'gov.agency')
  const dept = raw(customer, 'gov.department')
  if (agency || dept) {
    pushRow('기관/부서', [agency, dept].filter(Boolean).join(' / '))
  }

  const due = raw(customer, 'gov.dueDate')
  if (due) pushRow(labelFor(template, 'gov.dueDate'), summary.dueDateLabel || due)

  const support = raw(customer, 'gov.supportAmount')
  const approval = raw(customer, 'gov.approvalAmount')
  if (support || approval) {
    const parts: string[] = []
    if (support) parts.push(`${labelFor(template, 'gov.supportAmount')}: ${support}`)
    if (approval) parts.push(`${labelFor(template, 'gov.approvalAmount')}: ${approval}`)
    pushRow('필요자금 / 승인금액', parts.join(' · '))
  }

  if (summary.paymentLabel) {
    const ps = raw(customer, 'contract.paymentStatus')
    const ds = raw(customer, 'contract.depositStatus')
    const label =
      ps && ds
        ? `${labelFor(template, 'contract.paymentStatus')} / 입금`
        : labelFor(template, 'contract.paymentStatus')
    pushRow(label, summary.paymentLabel)
  }

  if (summary.assigneeLabel) {
    pushRow('담당자', summary.assigneeLabel)
  }

  const pri = raw(customer, 'management.priority')
  if (pri) pushRow(labelFor(template, 'management.priority'), pri)

  const last = raw(customer, 'management.lastConsultDate')
  if (last) pushRow(labelFor(template, 'management.lastConsultDate'), last)

  const memo = raw(customer, 'management.memoSummary')
  if (memo) pushRow(labelFor(template, 'management.memoSummary'), memo.length > 120 ? `${memo.slice(0, 119)}…` : memo)

  return rows
}
