import { FormButton } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import StorageWorkspace from '../../../storage/components/StorageWorkspace'

type CustomerFilesModalProps = {
  customerId: number
  onClose: () => void
}

export default function CustomerFilesModal({ customerId, onClose }: CustomerFilesModalProps) {
  const { token } = useAuth()

  return (
    <div className="mobile-modal-overlay" role="dialog" aria-modal="true" aria-label="고객 파일" onClick={onClose}>
      <div className="mobile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-modal-header">
          <span className="mobile-modal-header__spacer" aria-hidden />
          <span className="mobile-modal-header__title">고객 파일</span>
          <FormButton htmlType="button" variant="action" className="mobile-btn mobile-btn--close" onClick={onClose}>
            닫기
          </FormButton>
        </div>
        <div className="mobile-modal-body">
          <div className="mobile-modal-content">
            {token?.trim() ? (
              <StorageWorkspace token={token} customerId={customerId} title="" subtitle={undefined} variant="mobile" />
            ) : (
              <div style={{ padding: 16 }}>로그인이 필요합니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
