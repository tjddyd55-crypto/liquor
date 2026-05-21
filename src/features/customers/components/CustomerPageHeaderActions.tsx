import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  SetStateAction,
  TouchEvent,
} from 'react'
import { FormButton } from '../../../components/form'

export type CustomerPageHeaderActionsProps = {
  isMobile: boolean
  setStatusText: Dispatch<SetStateAction<string>>
  onCreateCustomer: () => void
  onCustomerRegisterInviteCopyTouchStart: (e: TouchEvent<HTMLDivElement>) => void
  onCustomerRegisterInviteCopyMouseDown: (e: MouseEvent<HTMLDivElement>) => void
  onCustomerRegisterInviteCopyClick: (e: MouseEvent<HTMLDivElement>) => void
  onCustomerRegisterInviteCopyKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  enterExcelSelectMode: () => void
}

function CustomerPageHeaderActions({
  isMobile,
  setStatusText,
  onCreateCustomer,
  onCustomerRegisterInviteCopyTouchStart,
  onCustomerRegisterInviteCopyMouseDown,
  onCustomerRegisterInviteCopyClick,
  onCustomerRegisterInviteCopyKeyDown,
  enterExcelSelectMode,
}: CustomerPageHeaderActionsProps) {
  return (
    <div className="customers-page__action-row">
      <FormButton
        htmlType="button"
        variant="action"
        className="cta-button customers-page__action-btn"
        onClick={onCreateCustomer}
      >
        고객 등록
      </FormButton>
      <div
        role="button"
        tabIndex={0}
        className="cta-button customers-page__action-btn customers-page__invite-copy-btn"
        style={{ touchAction: 'manipulation' }}
        aria-label="고객 등록 링크 복사"
        onTouchStart={onCustomerRegisterInviteCopyTouchStart}
        onMouseDown={onCustomerRegisterInviteCopyMouseDown}
        onClick={onCustomerRegisterInviteCopyClick}
        onKeyDown={onCustomerRegisterInviteCopyKeyDown}
      >
        등록 링크
      </div>
      <FormButton
        htmlType="button"
        variant="action"
        className="cta-button customers-page__action-btn"
        onClick={() => {
          if (isMobile) {
            const msg = 'PC 버전에서 가능합니다.'
            setStatusText(msg)
            return
          }
          enterExcelSelectMode()
        }}
      >
        엑셀 다운로드
      </FormButton>
    </div>
  )
}

export default CustomerPageHeaderActions
