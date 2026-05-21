/** 정부지원 CRM 이용자(program user) 전용 네비게이션 */
export type GovernmentUserNavItem = {
  to: string
  label: string
  end?: boolean
}

export const GOVERNMENT_USER_NAV: GovernmentUserNavItem[] = [
  { to: '/government/workspace', label: '홈', end: true },
  { to: '/government/my-applications', label: '내 고객/신청' },
  { to: '/government/signatures', label: '전자서명' },
  { to: '/government/notices', label: '공지사항' },
  { to: '/government/resources', label: '자료실' },
  { to: '/government/me', label: '내 정보' },
]
