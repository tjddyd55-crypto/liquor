import ResponsiveLayout from '../../../components/ResponsiveLayout'
import PlatformHubMobileView from './platform/PlatformHubMobileView'
import PlatformHubPCView from './platform/PlatformHubPCView'

const hubCards = [
  {
    to: '/admin/platform/industries',
    title: 'Industry 목록',
    description: 'industries 테이블 조회',
  },
  {
    to: '/admin/platform/tenants',
    title: 'Tenant 목록',
    description: 'tenants · GA 연계(legacy_ga_id)',
  },
  {
    to: '/admin/platform/memberships',
    title: 'User Membership',
    description: 'user_memberships (일반 users 기반)',
  },
  {
    to: '/admin/platform/external-accounts',
    title: '보험 외부 계정 요약',
    description: '원수사 담당·손해사정사 건수 (yjasset)',
  },
  {
    to: '/admin/platform/crm-customer-management-templates',
    title: '동적 고객관리 템플릿 빌더',
    description: '업종별 폼·목록·상세 탭을 DB에 저장(보험 제외)',
  },
  {
    to: '/admin/platform/customer-templates',
    title: '고객관리 템플릿(정적)',
    description: '코드 기반 정적 템플릿·프리뷰 SSOT',
  },
  {
    to: '/admin/platform/registries',
    title: '필드·기능 레지스트리',
    description: 'Customer Field · Feature Module 정적 레지스트리',
  },
] as const

export type PlatformHubViewProps = {
  cards: readonly (typeof hubCards)[number][]
}

export default function PlatformHubPage() {
  return (
    <ResponsiveLayout<PlatformHubViewProps>
      PC={PlatformHubPCView}
      Mobile={PlatformHubMobileView}
      viewProps={{ cards: hubCards }}
    />
  )
}

export { hubCards }
