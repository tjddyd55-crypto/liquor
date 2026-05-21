import { Navigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../../../components/feedback'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { useGaSettings } from '../../ga-settings/useGaSettings'
import CustomerGaExcelPageMobile from './detail/CustomerGaExcelPageMobile'
import CustomerGaExcelPagePC from './detail/CustomerGaExcelPagePC'

/**
 * [Container] GA 고객 데이터 페이지.
 *
 * 책임:
 *  - URL 파라미터로부터 customerId 를 파싱하고 유효성 가드
 *  - use_ga_excel 권한 가드 (권한 없으면 고객관리로 redirect)
 *  - PC/Mobile 분기를 공용 ResponsiveLayout 에 위임
 *
 * 책임이 아닌 것:
 *  - 데이터 로딩·정렬:
 *    src/features/customers/hooks/useGaCustomerExcelData.ts
 *  - UI 마크업:
 *    ./detail/CustomerGaExcelPagePC.tsx · ./detail/CustomerGaExcelPageMobile.tsx
 *
 * 관련 규칙: AGENTS.md §8, .cursor/rules/ui-pc-mobile-separation.mdc
 */
export default function CustomerGaExcelPage() {
  const { customerId: customerIdParam } = useParams()
  const customerId = Number(customerIdParam)
  const { gaSettings, loading: gaSettingsLoading } = useGaSettings()

  if (!Number.isFinite(customerId) || customerId < 1) {
    return <EmptyState message="고객을 선택해 주세요." />
  }
  if (gaSettingsLoading) {
    return <LoadingState message="권한 확인 중…" />
  }
  if (!gaSettings.use_ga_excel) {
    return <Navigate to={`/customers?customerId=${customerId}`} replace />
  }

  return (
    <ResponsiveLayout
      PC={CustomerGaExcelPagePC}
      Mobile={CustomerGaExcelPageMobile}
    />
  )
}
