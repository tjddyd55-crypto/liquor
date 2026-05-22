/**
 * 주류회사 CRM 전용 menu — 공통 contracts(/contracts/signatures/*) 와 분리.
 */

import type { GaTenantDashboardMenuEntry } from './gaTenantMenu'

const LIQUOR_SIGNATURE_USER_SEND = {
  label: '전자서명 발송',
  path: '/liquor/signatures/send',
} as const

const LIQUOR_SIGNATURE_USER_HISTORY = {
  label: '전자서명 발송내역',
  path: '/liquor/signatures/history',
} as const

const LIQUOR_TENANT_COMPANY_PROFILE_MENU = {
  label: '주류업체정보',
  path: '/liquor/settings/company-profile',
} as const

export const LIQUOR_SIGNATURE_ADMIN_MENU = {
  label: '전자서명 템플릿 관리',
  path: '/liquor/signature-templates',
} as const

/** 공통 CRM shell을 쓰는 업종 코드 (주류회사 CRM) */
export function isCommonCrmIndustryShell(industryCode: string | null | undefined): boolean {
  const ic = String(industryCode ?? '').trim().toLowerCase()
  return ic === 'liquor'
}

type BuildCommonCrmDashboardMenuOptions = {
  /** USER 역할에게만 전자서명 블록을 붙인다. */
  includeUserContractSignatures?: boolean
  /** GA_ADMIN 에게 전자서명 템플릿 관리 메뉴 */
  includeAdminSignatureTemplates?: boolean
}

/** 주류회사 CRM — 고객관리·전자서명·팀·내정보 중심의 최소 shell */
export function buildCommonCrmDashboardMenu(
  options: BuildCommonCrmDashboardMenuOptions = {},
): GaTenantDashboardMenuEntry[] {
  const { includeUserContractSignatures = false, includeAdminSignatureTemplates = false } = options

  const userLiquorSignatures: GaTenantDashboardMenuEntry[] = [
    { type: 'section', label: '전자서명' },
    {
      type: 'link',
      label: LIQUOR_SIGNATURE_USER_SEND.label,
      path: LIQUOR_SIGNATURE_USER_SEND.path,
    },
    {
      type: 'link',
      label: LIQUOR_SIGNATURE_USER_HISTORY.label,
      path: LIQUOR_SIGNATURE_USER_HISTORY.path,
    },
  ]

  const adminSignatureEntry: GaTenantDashboardMenuEntry[] = includeAdminSignatureTemplates
    ? [{ type: 'link', label: LIQUOR_SIGNATURE_ADMIN_MENU.label, path: LIQUOR_SIGNATURE_ADMIN_MENU.path }]
    : []

  return [
    { type: 'section', label: '할일 및 알림' },
    { type: 'link', label: '할일', path: '/todos' },
    { type: 'link', label: '알림', path: '/notifications' },

    { type: 'section', label: '고객관리' },
    { type: 'link', label: '고객리스트', path: '/customers' },

    ...(includeUserContractSignatures ? userLiquorSignatures : []),
    ...adminSignatureEntry,

    { type: 'section', label: '팀관리' },
    { type: 'link', label: '팀원리스트', path: '/team/members' },
    { type: 'link', label: '팀 게시판', path: '/team/posts' },
    { type: 'link', label: '팀 자료', path: '/team/files' },

    { type: 'section', label: '설정' },
    {
      type: 'link',
      label: LIQUOR_TENANT_COMPANY_PROFILE_MENU.label,
      path: LIQUOR_TENANT_COMPANY_PROFILE_MENU.path,
    },

    { type: 'section', label: '내정보' },
    { type: 'link', label: '내 저장공간', path: '/storage' },
    { type: 'link', label: '내정보관리', path: '/profile' },
    { type: 'link', label: '문의요청', path: '/feature-request' },
  ]
}
