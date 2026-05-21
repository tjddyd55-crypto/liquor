import { FormButton } from '../../../components/form'
import CustomerHeaderAppLinkCompact from '../pages/workspace/CustomerHeaderAppLinkCompact'

export type CustomerWorkspaceActionsVariant = 'mobile' | 'pc'

export type CustomerWorkspaceActionsProps = {
  variant: CustomerWorkspaceActionsVariant
  customerId: number
  carFeatureEnabled: boolean
  gaExcelEnabled: boolean
  onOpenFilesModal: (customerId: number) => void
  onOpenConsultationsModal: (customerId: number) => void
  onOpenAutoModal: (customerId: number) => void
  onOpenGaModal: (customerId: number) => void
  onOpenPersonalMessage: (customerId: number) => void
  onOpenClaims: (customerId: number) => void
  /** 고객별 메모 작업영역(`/customers/:id/memos`) — 모바일 상단 그리드 전용 */
  onOpenMemos: (customerId: number) => void
  /** 모바일 상단 그리드: 현재 카드 고객정보 복사 */
  onCopyCustomerInfo: () => void
}

function MobileActionText({ children }: { children: string }) {
  return <span className="customer-mobile-action-btn__text">{children}</span>
}

export function CustomerWorkspaceActions({
  variant,
  customerId,
  carFeatureEnabled,
  gaExcelEnabled,
  onOpenFilesModal,
  onOpenConsultationsModal,
  onOpenAutoModal,
  onOpenGaModal,
  onOpenPersonalMessage,
  onOpenClaims,
  onOpenMemos,
  onCopyCustomerInfo,
}: CustomerWorkspaceActionsProps) {
  if (variant === 'mobile') {
    return (
      <>
        <div className="customer-mobile-expanded-app-link">
          <CustomerHeaderAppLinkCompact key={customerId} customerId={customerId} />
        </div>
        <div className="customer-detail-feature-actions customer-detail-feature-actions--mobile-priority customer-detail-feature-actions--mobile-grid-8">
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            onClick={() => onOpenFilesModal(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📁
            </span>
            <MobileActionText>고객 파일</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            onClick={() => onOpenConsultationsModal(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              💬
            </span>
            <MobileActionText>상담 내역</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            disabled={!carFeatureEnabled}
            title={!carFeatureEnabled ? '자동차 신청서 기능이 비활성화되어 있습니다.' : undefined}
            onClick={() => onOpenAutoModal(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📝
            </span>
            <MobileActionText>신청서</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            title={
              !gaExcelEnabled
                ? '업로드된 GA 데이터가 없어도 화면에서 확인할 수 있습니다.'
                : undefined
            }
            onClick={() => onOpenGaModal(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📊
            </span>
            <MobileActionText>GA 데이터 보기</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            onClick={() => onOpenPersonalMessage(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              ✉️
            </span>
            <MobileActionText>개인메시지</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            onClick={() => onOpenClaims(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📋
            </span>
            <MobileActionText>청구</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            onClick={() => onOpenMemos(customerId)}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📌
            </span>
            <MobileActionText>메모</MobileActionText>
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            className="button button--secondary customer-mobile-action-btn"
            title="카톡 복사 형식으로 복사"
            aria-label="고객정보 복사"
            onClick={() => void onCopyCustomerInfo()}
          >
            <span className="customer-mobile-action-btn__icon" aria-hidden>
              📄
            </span>
            <MobileActionText>복사</MobileActionText>
          </FormButton>
        </div>
      </>
    )
  }

  return (
    <div className="customer-detail-feature-actions customer-workspace-action-bar">
      <FormButton
        htmlType="button"
        variant="secondary"
        className="button button--secondary customer-workspace-action-button"
        onClick={() => onOpenFilesModal(customerId)}
      >
        고객 파일
      </FormButton>
      <FormButton
        htmlType="button"
        variant="secondary"
        className="button button--secondary customer-workspace-action-button"
        onClick={() => onOpenConsultationsModal(customerId)}
      >
        상담 내역
      </FormButton>
      {carFeatureEnabled ? (
        <FormButton
          htmlType="button"
          variant="secondary"
          className="button button--secondary customer-workspace-action-button"
          onClick={() => onOpenAutoModal(customerId)}
        >
          신청서
        </FormButton>
      ) : null}
      <FormButton
        htmlType="button"
        variant="secondary"
        className="button button--secondary customer-workspace-action-button"
        onClick={() => onOpenGaModal(customerId)}
        title={
          !gaExcelEnabled
            ? '업로드된 GA 데이터가 없어도 화면에서 확인할 수 있습니다.'
            : undefined
        }
      >
        GA 데이터 보기
      </FormButton>
    </div>
  )
}
