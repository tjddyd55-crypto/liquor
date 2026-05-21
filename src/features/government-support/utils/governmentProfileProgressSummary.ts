import type { GovSupportProfile } from '../types/governmentProfile.types'

export type GovernmentProgressStatusTone = 'blue' | 'amber' | 'green' | 'red' | 'neutral'

export type GovernmentProgressSummaryBadge = {
  label: string
  tone: GovernmentProgressStatusTone
}

export type GovernmentProgressSummaryRow = {
  label: string
  value: string
  valueTone?: GovernmentProgressStatusTone
}

export type GovernmentProfileProgressSummaryModel = {
  statusLabel: string
  statusTone: GovernmentProgressStatusTone
  primaryLine: string
  secondaryLine: string
  badges: GovernmentProgressSummaryBadge[]
  rows: GovernmentProgressSummaryRow[]
  hasAnySignal: boolean
}

function normalizeStatus(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function inferStatusToneFromText(statusNorm: string): GovernmentProgressStatusTone {
  if (!statusNorm) return 'neutral'
  if (/반려|거절|불승인|탈락|취소|철회|중단|부결/.test(statusNorm)) return 'red'
  if (/승인|선정|합격|지급완료|완료|확정|종료/.test(statusNorm)) return 'green'
  if (/보완|재제출|추가서류/.test(statusNorm)) return 'amber'
  if (/접수|제출|심사|검토|진행|대기|협의|상담|준비|발송|수집/.test(statusNorm)) return 'blue'
  return 'neutral'
}

function pushBadgeUnique(out: GovernmentProgressSummaryBadge[], label: string, tone: GovernmentProgressStatusTone) {
  if (!label.trim()) return
  if (out.some((b) => b.label === label)) return
  out.push({ label, tone })
}

/**
 * 보험 `buildGovernmentCustomerStatusSummary` / `GovernmentDetailStatusSummaryCard` 대응.
 * 정부 CRM profile 필드에서 요약을 조립한다.
 */
export function buildGovernmentProfileProgressSummary(
  profile: GovSupportProfile | null | undefined,
): GovernmentProfileProgressSummaryModel {
  const p = profile
  const statusRaw = String(p?.progressStatus ?? '').trim()
  const statusNorm = normalizeStatus(statusRaw)
  const statusTone = inferStatusToneFromText(statusNorm)

  const badges: GovernmentProgressSummaryBadge[] = []
  if (statusRaw) {
    pushBadgeUnique(badges, statusRaw, statusTone)
  }
  if (/보완/.test(statusNorm)) {
    pushBadgeUnique(badges, '보완요청', 'amber')
  }
  if (/반려|부결/.test(statusNorm)) {
    pushBadgeUnique(badges, '반려', 'red')
  }
  if (/승인|완료|종료/.test(statusNorm)) {
    pushBadgeUnique(badges, '승인·완료', 'green')
  }

  const primaryLine =
    [p?.productName, p?.businessName].filter(Boolean).join(' · ') ||
    statusRaw ||
    '진행상황'

  const secondaryParts = [
    p?.agencyOrg ? `기관 ${p.agencyOrg}` : '',
    p?.scheduleAt ? `일정 ${p.scheduleAt}` : '',
    p?.region ? `지역 ${p.region}` : '',
    p?.availableProduct ? `가능상품 ${p.availableProduct}` : '',
  ].filter(Boolean)

  const rows: GovernmentProgressSummaryRow[] = []
  const pushRow = (label: string, value: string, valueTone?: GovernmentProgressStatusTone) => {
    const v = value.trim()
    if (!v) return
    rows.push({ label, value: v, valueTone })
  }

  pushRow('접수상태', statusRaw, statusTone)
  pushRow('접수상품명', String(p?.productName ?? ''))
  pushRow('가능상품', String(p?.availableProduct ?? ''))
  pushRow('접수일정', String(p?.scheduleAt ?? ''))
  pushRow('진행기관', String(p?.agencyOrg ?? ''))
  pushRow('지역', String(p?.region ?? ''))
  pushRow('사업장', String(p?.businessName ?? ''))

  const hasAnySignal = badges.length > 0 || rows.length > 0

  return {
    statusLabel: statusRaw || '미정',
    statusTone,
    primaryLine,
    secondaryLine: secondaryParts.join(' · '),
    badges,
    rows,
    hasAnySignal,
  }
}

export function progressStatusBadgeTone(status: string): GovernmentProgressStatusTone {
  return inferStatusToneFromText(normalizeStatus(status))
}
