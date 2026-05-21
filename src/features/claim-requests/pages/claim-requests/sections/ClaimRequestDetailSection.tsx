import { FormButton, FormSelect, FormTextarea } from '../../../../../components/form'
import type {
  ClaimRequestDetail,
  ClaimRequestFileItem,
  ClaimRequestStatus,
} from '../../../api/claimRequestsApi'

type MaybePromise = void | Promise<void>

type ClaimRequestDetailSectionProps = {
  detail?: ClaimRequestDetail | null
  detailLoading?: boolean
  statusTarget: ClaimRequestStatus
  statusMemo: string
  actionBusy?: boolean
  statusOptions: Array<{ value: ClaimRequestStatus; label: string }>
  onStatusTargetChange: (status: ClaimRequestStatus) => void
  onStatusMemoChange: (memo: string) => void
  onUpdateStatus: () => MaybePromise
  onOpenFile: (file: ClaimRequestFileItem) => MaybePromise
  onDownloadFile: (file: ClaimRequestFileItem) => MaybePromise
  formatDateTime: (iso: string | null) => string
  statusLabel: (status: ClaimRequestStatus) => string
}

export default function ClaimRequestDetailSection({
  detail,
  detailLoading = false,
  statusTarget,
  statusMemo,
  actionBusy = false,
  statusOptions,
  onStatusTargetChange,
  onStatusMemoChange,
  onUpdateStatus,
  onOpenFile,
  onDownloadFile,
  formatDateTime,
  statusLabel,
}: ClaimRequestDetailSectionProps) {
  return (
    <section className="claim-requests-page__card claim-requests-page__detail-card" aria-label="선택한 청구 요청 상세">
      <div className="claim-requests-page__section-header">
        <div>
          <h2 className="claim-requests-page__section-title">선택한 청구 요청 상세</h2>
          <p className="claim-requests-page__section-description">선택한 청구 요청의 첨부파일과 상태 이력을 확인합니다.</p>
        </div>
      </div>

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
    </section>
  )
}

type ClaimRequestDetailBodyProps = Omit<ClaimRequestDetailSectionProps, 'statusOptions'> & {
  statusOptions: Array<{ value: ClaimRequestStatus; label: string }>
}

export function ClaimRequestDetailBody({
  detail,
  detailLoading = false,
  statusTarget,
  statusMemo,
  actionBusy = false,
  statusOptions,
  onStatusTargetChange,
  onStatusMemoChange,
  onUpdateStatus,
  onOpenFile,
  onDownloadFile,
  formatDateTime,
  statusLabel,
}: ClaimRequestDetailBodyProps) {
  if (detailLoading) {
    return <div className="claim-requests-page__detail-empty">상세 불러오는 중…</div>
  }

  if (!detail) {
    return <div className="claim-requests-page__detail-empty">요청을 선택해 주세요.</div>
  }

  const senderName = detail.requesterName || detail.customerName
  const saveDisabled = statusTarget === detail.status && !statusMemo.trim()

  return (
    <>
      <div className="claim-requests-page__detail-section">
        <div className="claim-requests-page__detail-title">
          #{detail.id} {senderName}
        </div>
        <div className="claim-requests-page__detail-meta">
          상태 {statusLabel(detail.status)} · 접수 {formatDateTime(detail.submittedAt)}
        </div>
        {detail.requesterName ? (
          <div className="claim-requests-page__detail-meta">
            요청자 정보: {detail.requesterName} / {detail.requesterBirthDate} / {detail.requesterPhone}
          </div>
        ) : null}
        <div className="claim-requests-page__detail-meta">연결고객: {detail.customerName}</div>
        {detail.deviceId ? <div className="claim-requests-page__detail-meta">설치자 기기: {detail.deviceId}</div> : null}
        {detail.title ? <div className="claim-requests-page__detail-text">제목: {detail.title}</div> : null}
        {detail.memo ? <div className="claim-requests-page__detail-text claim-requests-page__detail-text--memo">메모: {detail.memo}</div> : null}
      </div>

      <div className="claim-requests-page__detail-section">
        <div className="claim-requests-page__detail-subtitle">첨부 파일</div>
        {detail.files.length === 0 ? (
          <div className="claim-requests-page__detail-empty">첨부 파일이 없습니다.</div>
        ) : (
          <ul className="claim-requests-page__file-list">
            {detail.files.map((file) => (
              <li key={file.id} className="claim-requests-page__file-item">
                <span className="claim-requests-page__file-name" title={file.fileName}>
                  {file.fileName}
                </span>
                <span className="claim-requests-page__file-size">{(file.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                <div className="claim-requests-page__file-actions">
                  <FormButton htmlType="button" variant="secondary" onClick={() => void onOpenFile(file)}>
                    열기
                  </FormButton>
                  <FormButton htmlType="button" variant="secondary" onClick={() => void onDownloadFile(file)}>
                    다운로드
                  </FormButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="claim-requests-page__detail-section claim-requests-page__detail-section--status">
        <div className="claim-requests-page__detail-subtitle">상태 변경</div>
        <div className="claim-requests-page__status-form-row">
          <FormSelect
            className="claim-requests-page__status-select"
            value={statusTarget}
            onChange={(event) => onStatusTargetChange(event.target.value as ClaimRequestStatus)}
            options={statusOptions.map((item) => ({ value: item.value, label: item.label }))}
          />
          <FormButton
            htmlType="button"
            variant="primary"
            onClick={() => void onUpdateStatus()}
            loading={actionBusy}
            disabled={saveDisabled}
            title={saveDisabled ? '현재 상태와 동일하고 메모도 비어 있어 저장할 내용이 없습니다.' : undefined}
          >
            상태 저장
          </FormButton>
        </div>
        <FormTextarea
          className="claim-requests-page__status-memo"
          rows={2}
          value={statusMemo}
          onChange={(event) => onStatusMemoChange(event.target.value)}
          placeholder="상태 변경 메모 — 담당자 내부 기록용(상태 이력에 남습니다)"
          maxLength={255}
        />
      </div>

      <div className="claim-requests-page__detail-section">
        <div className="claim-requests-page__detail-subtitle">상태 이력</div>
        {detail.statusLogs.length === 0 ? (
          <div className="claim-requests-page__detail-empty">상태 이력이 없습니다.</div>
        ) : (
          <ul className="claim-requests-page__history-list">
            {detail.statusLogs.map((log) => (
              <li key={log.id} className="claim-requests-page__history-item">
                <div className="claim-requests-page__history-main">
                  {log.fromStatus ? `${statusLabel(log.fromStatus)} → ` : ''}
                  {statusLabel(log.toStatus)}
                </div>
                <div className="claim-requests-page__history-meta">{formatDateTime(log.changedAt)}</div>
                {log.memo ? <div className="claim-requests-page__history-memo">{log.memo}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
