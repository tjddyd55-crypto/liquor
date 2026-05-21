import type { ReactNode } from 'react'
import Modal from '../../../../components/ui/Modal'
import type {
  ClaimRequestDetail,
  ClaimRequestListItem,
  ClaimRequestStatus,
  CustomerAppLinkInfo,
} from '../../api/claimRequestsApi'
import ClaimRequestsClaimsMobileLayout from './ClaimRequestsClaimsMobileLayout'
import ClaimConnectionStatusSection from './sections/ClaimConnectionStatusSection'
import { ClaimRequestDetailBody } from './sections/ClaimRequestDetailSection'
import ClaimLinkSection from './sections/ClaimLinkSection'
import ClaimRequestListSection from './sections/ClaimRequestListSection'

type MaybePromise = void | Promise<void>

type ConnectionMeta = {
  title: string
  subtitle: string
  className: string
}

type ClaimRequestsClaimsMobileViewProps = {
  feedbackSection?: ReactNode
  activeCustomerId?: number | null
  displayedCode?: string
  displayedLink?: string
  linkActionLabel: string
  actionBusy?: boolean
  copyResult?: string
  linkStatus?: CustomerAppLinkInfo | null
  linkStatusLoading?: boolean
  connectionMeta: ConnectionMeta
  latestDeviceLabel?: string
  rows: ClaimRequestListItem[]
  selectedId?: number | null
  loading?: boolean
  detail?: ClaimRequestDetail | null
  detailLoading?: boolean
  mobileDetailOpen: boolean
  statusTarget: ClaimRequestStatus
  statusMemo: string
  statusOptions: Array<{ value: ClaimRequestStatus; label: string }>
  onCreateLink: () => MaybePromise
  onCopyCode?: () => MaybePromise
  onCopyLink?: () => MaybePromise
  onShareBySms?: () => MaybePromise
  onShareByKakao?: () => MaybePromise
  onOpenLinkPreview?: () => MaybePromise
  onSelectClaim: (id: number) => void
  onCloseMobileDetail: () => void
  onStatusTargetChange: (status: ClaimRequestStatus) => void
  onStatusMemoChange: (memo: string) => void
  onUpdateStatus: () => MaybePromise
  onOpenFile: NonNullable<Parameters<typeof ClaimRequestDetailBody>[0]>['onOpenFile']
  onDownloadFile: NonNullable<Parameters<typeof ClaimRequestDetailBody>[0]>['onDownloadFile']
  formatDateTime: (iso: string | null) => string
  statusLabel: (status: ClaimRequestStatus) => string
  statusBadgeClass: (status: ClaimRequestStatus) => string
  /** true이면 워크스페이스 헤더(compact)만 쓰고 링크 발송·연결 상태 카드는 넘기지 않음 */
  embedInCustomerWorkspace?: boolean
}

export default function ClaimRequestsClaimsMobileView({
  feedbackSection,
  activeCustomerId,
  displayedCode = '',
  displayedLink = '',
  linkActionLabel,
  actionBusy = false,
  copyResult = '',
  linkStatus,
  linkStatusLoading = false,
  connectionMeta,
  latestDeviceLabel = '미확인',
  rows,
  selectedId,
  loading = false,
  detail,
  detailLoading = false,
  mobileDetailOpen,
  statusTarget,
  statusMemo,
  statusOptions,
  onCreateLink,
  onCopyCode,
  onCopyLink,
  onShareBySms,
  onShareByKakao,
  onOpenLinkPreview,
  onSelectClaim,
  onCloseMobileDetail,
  onStatusTargetChange,
  onStatusMemoChange,
  onUpdateStatus,
  onOpenFile,
  onDownloadFile,
  formatDateTime,
  statusLabel,
  statusBadgeClass,
  embedInCustomerWorkspace = false,
}: ClaimRequestsClaimsMobileViewProps) {
  const legacyLinkSection = (
    <>
      {feedbackSection}
      <ClaimLinkSection
        activeCustomerId={activeCustomerId}
        displayedCode={displayedCode}
        displayedLink={displayedLink}
        linkActionLabel={linkActionLabel}
        actionBusy={actionBusy}
        copyResult={copyResult}
        showDescription={false}
        showRawLinkFields={false}
        onCreateLink={onCreateLink}
        onCopyCode={onCopyCode}
        onCopyLink={onCopyLink}
        onShareBySms={onShareBySms}
        onShareByKakao={onShareByKakao}
        onOpenLinkPreview={onOpenLinkPreview}
      />
    </>
  )

  return (
    <ClaimRequestsClaimsMobileLayout
      linkSection={embedInCustomerWorkspace ? feedbackSection : legacyLinkSection}
      connectionSection={
        embedInCustomerWorkspace ? undefined : (
          <ClaimConnectionStatusSection
            title={connectionMeta.title}
            subtitle={connectionMeta.subtitle}
            className={connectionMeta.className}
            linkStatus={linkStatus}
            loading={linkStatusLoading}
            latestDeviceLabel={latestDeviceLabel}
            showDescription={false}
            formatDateTime={formatDateTime}
          />
        )
      }
      requestListSection={
        <ClaimRequestListSection
          rows={rows}
          selectedId={selectedId}
          loading={loading}
          showDescription={false}
          onSelectClaim={onSelectClaim}
          formatDateTime={formatDateTime}
          statusLabel={statusLabel}
          statusBadgeClass={statusBadgeClass}
        />
      }
      detailModal={
        <Modal
          open={mobileDetailOpen}
          onClose={onCloseMobileDetail}
          ariaLabel="청구 상세"
          panelClassName="claim-requests-page__detail-modal-panel"
        >
          <div className="modal-header claim-requests-page__modal-header">
            <div />
            <h2 className="modal-title claim-requests-page__modal-title">청구 상세</h2>
            <button type="button" className="close-btn claim-requests-page__modal-close" onClick={onCloseMobileDetail}>
              닫기
            </button>
          </div>
          <div className="modal-body claim-requests-page__detail-modal-body">
            <ClaimRequestDetailBody
              detail={detail}
              detailLoading={detailLoading}
              statusTarget={statusTarget}
              statusMemo={statusMemo}
              actionBusy={actionBusy}
              statusOptions={statusOptions}
              onStatusTargetChange={onStatusTargetChange}
              onStatusMemoChange={onStatusMemoChange}
              onUpdateStatus={onUpdateStatus}
              onOpenFile={onOpenFile}
              onDownloadFile={onDownloadFile}
              formatDateTime={formatDateTime}
              statusLabel={statusLabel}
            />
          </div>
        </Modal>
      }
    />
  )
}
