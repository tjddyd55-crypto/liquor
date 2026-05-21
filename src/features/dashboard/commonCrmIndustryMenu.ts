/**
 * 보험·정부지원 전용 메뉴를 제외한 공통 CRM shell 메뉴(주류회사 등).
 * 전자서명은 공통 contracts 모듈(/contracts/signatures/*)을 재사용한다.
 */

import type { GaTenantDashboardMenuEntry } from './gaTenantMenu'

const CONTRACT_SIGNATURE_USER_SEND = {
  label: '전자서명 발송',
  path: '/contracts/signatures/send',
} as const

const CONTRACT_SIGNATURE_USER_HISTORY = {
  label: '전자서명 발송내역',
  path: '/contracts/signatures/history',
} as const

/** 공통 CRM shell을 쓰는 업종 코드 (주류회사 CRM) */
export function isCommonCrmIndustryShell(industryCode: string | null | undefined): boolean {
  const ic = String(industryCode ?? '').trim().toLowerCase()
  return ic === 'liquor'
}

type BuildCommonCrmDashboardMenuOptions = {
  /** USER 역할에게만 전자서명 블록을 붙인다. */
  includeUserContractSignatures?: boolean
}

/** 주류회사 CRM — 고객관리·전자서명·팀·내정보 중심의 최소 shell */
export function buildCommonCrmDashboardMenu(
  options: BuildCommonCrmDashboardMenuOptions = {},
): GaTenantDashboardMenuEntry[] {
  const { includeUserContractSignatures = false } = options

  const userContractSignatures: GaTenantDashboardMenuEntry[] = [
    { type: 'section', label: '전자서명' },
    {
      type: 'link',
      label: CONTRACT_SIGNATURE_USER_SEND.label,
      path: CONTRACT_SIGNATURE_USER_SEND.path,
    },
    {
      type: 'link',
      label: CONTRACT_SIGNATURE_USER_HISTORY.label,
      path: CONTRACT_SIGNATURE_USER_HISTORY.path,
    },
  ]

  return [
    { type: 'section', label: '할일 및 알림' },
    { type: 'link', label: '할일', path: '/todos' },
    { type: 'link', label: '알림', path: '/notifications' },

    { type: 'section', label: '고객관리' },
    { type: 'link', label: '고객리스트', path: '/customers' },

    ...(includeUserContractSignatures ? userContractSignatures : []),

    { type: 'section', label: '팀관리' },
    { type: 'link', label: '팀원리스트', path: '/team/members' },
    { type: 'link', label: '팀 게시판', path: '/team/posts' },
    { type: 'link', label: '팀 자료', path: '/team/files' },

    { type: 'section', label: '내정보' },
    { type: 'link', label: '내 저장공간', path: '/storage' },
    { type: 'link', label: '내정보관리', path: '/profile' },
    { type: 'link', label: '문의요청', path: '/feature-request' },
  ]
}
