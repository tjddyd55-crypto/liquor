import { FormButton } from '../../../../components/form'
import { ApplicationFormPage } from '../../../application/pages/ApplicationFormPage'

type CustomerAutoModalProps = {
  customerId: number
  onClose: () => void
}

export default function CustomerAutoModal({ customerId, onClose }: CustomerAutoModalProps) {
  return (
    <div className="mobile-modal-overlay" role="dialog" aria-modal="true" aria-label="자동차 신청서" onClick={onClose}>
      <div className="mobile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-modal-header">
          <span className="mobile-modal-header__spacer" aria-hidden />
          <span className="mobile-modal-header__title">자동차 신청서</span>
          <FormButton htmlType="button" variant="action" className="mobile-btn mobile-btn--close" onClick={onClose}>
            닫기
          </FormButton>
        </div>
        <div className="mobile-modal-body">
          <div className="mobile-modal-content">
            {/* ApplicationFormPage는 라우트 기반 customerId를 사용하므로, 모달에서는 식별자 표시만 유지 */}
            <div style={{ padding: '8px 16px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              고객 ID: {customerId}
            </div>
            <ApplicationFormPage />
          </div>
        </div>
      </div>
    </div>
  )
}
