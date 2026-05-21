import { EmptyState, LoadingState } from '../../../../components/feedback'
import { FormButton } from '../../../../components/form'
import { useGaSettings } from '../../../ga-settings/useGaSettings'
import CustomerGaExcelPageMobile from '../../pages/detail/CustomerGaExcelPageMobile'

type CustomerGaDataModalProps = {
  customerId: number
  onClose: () => void
}

export default function CustomerGaDataModal({ customerId, onClose }: CustomerGaDataModalProps) {
  const { gaSettings, loading: gaSettingsLoading } = useGaSettings()

  return (
    <div className="mobile-modal-overlay" role="dialog" aria-modal="true" aria-label="GA 데이터" onClick={onClose}>
      <div className="mobile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-modal-header">
          <span className="mobile-modal-header__spacer" aria-hidden />
          <span className="mobile-modal-header__title">GA 데이터</span>
          <FormButton htmlType="button" variant="action" className="mobile-btn mobile-btn--close" onClick={onClose}>
            닫기
          </FormButton>
        </div>
        <div className="mobile-modal-body">
          <div className="mobile-modal-content">
            {gaSettingsLoading ? (
              <LoadingState message="권한 확인 중…" />
            ) : !gaSettings.use_ga_excel ? (
              <EmptyState message="GA 데이터 보기 권한이 비활성화되어 있습니다." />
            ) : (
              <CustomerGaExcelPageMobile routeCustomerId={customerId} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
