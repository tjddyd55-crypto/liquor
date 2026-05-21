import type { AgentCustomerNewsItem, LinkedCustomerItem } from '../../api/claimRequestsApi'

type ClaimRequestsPersonalMobileViewProps = {
  /** 고객 호칭 라벨(예: "김동훈 고객님께") — 고객번호 미포함 */
  targetHeading: string
  targetCustomer?: LinkedCustomerItem | null
  targetCustomerId?: number | null
  message: string
  history: AgentCustomerNewsItem[]
  loading?: boolean
  actionBusy?: boolean
  deletingId?: string | null
  editingId?: string | null
  resultMessage?: string
  errorMessage?: string
  onMessageChange: (value: string) => void
  onSend: () => void
  onStartEdit: (item: AgentCustomerNewsItem) => void
  onCancelEdit: () => void
  onDeleteMessage: (item: AgentCustomerNewsItem) => void
  formatDateTime: (iso: string | null) => string
}

export default function ClaimRequestsPersonalMobileView({
  targetHeading,
  targetCustomer,
  targetCustomerId,
  message,
  history,
  loading = false,
  actionBusy = false,
  deletingId = null,
  editingId = null,
  resultMessage = '',
  errorMessage = '',
  onMessageChange,
  onSend,
  onStartEdit,
  onCancelEdit,
  onDeleteMessage,
  formatDateTime,
}: ClaimRequestsPersonalMobileViewProps) {
  const targetLabel = targetCustomer?.customerName?.trim()
    ? targetCustomer.customerName.trim()
    : targetCustomerId
      ? '이름 불명'
      : '미선택'

  const sendDisabled =
    !targetCustomerId ||
    !message.trim() ||
    actionBusy ||
    (deletingId != null && deletingId !== '')

  const isEditing = Boolean(editingId)

  return (
    <main className="page claim-requests-page claim-requests-page--mobile claim-requests-personal-mobile page--with-back content-wrapper">
      {errorMessage ? (
        <p className="status status--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {resultMessage ? (
        <p className="status" role="status">
          {resultMessage}
        </p>
      ) : null}

      <section className="claim-requests-page__card claim-requests-personal-mobile__target-card">
        <div className="claim-requests-page__section-header">
          <div className="claim-requests-page__section-heading">
            <h2 className="claim-requests-page__section-title">연결 고객</h2>
          </div>
        </div>
        <div className="claim-requests-personal-mobile__target-heading">{targetHeading}</div>
        <div className="claim-requests-personal-mobile__target-name">{targetLabel}</div>
        {targetCustomer ? (
          <div className="claim-requests-personal-mobile__target-meta">
            최근 접속 {formatDateTime(targetCustomer.lastConnectedAt)} · 연결 기기 {targetCustomer.deviceCount}대
          </div>
        ) : (
          <div className="claim-requests-personal-mobile__target-meta">
            고객관리에서 고객을 선택한 뒤 개인메시지를 작성합니다.
          </div>
        )}
      </section>

      <section className="claim-requests-page__card claim-requests-personal-mobile__compose-card">
        <div className="claim-requests-page__section-header">
          <div className="claim-requests-page__section-heading">
            <h2 className="claim-requests-page__section-title">{isEditing ? '개인메시지 수정' : '개인메시지 작성'}</h2>
          </div>
          <div className="claim-requests-personal-mobile__compose-actions">
            {isEditing ? (
              <button
                type="button"
                className="form-button button button--secondary claim-requests-personal-mobile__secondary-button"
                onClick={onCancelEdit}
                disabled={actionBusy}
              >
                취소
              </button>
            ) : null}
            <button
              type="button"
              className="form-button button button--primary claim-requests-personal-mobile__send-button"
              onClick={onSend}
              disabled={sendDisabled}
            >
              {actionBusy ? '처리 중…' : isEditing ? '저장' : '발송'}
            </button>
          </div>
        </div>
        <textarea
          className="claim-requests-personal-mobile__textarea"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="고객에게 전달할 개인메시지를 입력해 주세요."
          maxLength={2000}
          rows={5}
        />
      </section>

      <section className="claim-requests-page__card claim-requests-personal-mobile__history-card">
        <div className="claim-requests-page__section-header claim-requests-page__list-header">
          <div className="claim-requests-page__section-heading">
            <h2 className="claim-requests-page__section-title">발송 내역</h2>
          </div>
          <span className="claim-requests-page__list-count">총 {history.length}건</span>
        </div>

        {loading ? <div className="claim-requests-page__empty">개인메시지를 불러오는 중…</div> : null}
        {!loading && history.length === 0 ? (
          <div className="claim-requests-page__empty">해당 고객에게 발송한 개인메시지가 없습니다.</div>
        ) : null}

        {history.length > 0 ? (
          <div className="claim-requests-personal-mobile__history-list">
            {history.map((item) => {
              const isDeleting = deletingId === item.id
              const hasAttachments = (item.attachments?.length ?? 0) > 0
              return (
                <article key={item.id} className="claim-requests-personal-mobile__history-item">
                  <div className="claim-requests-personal-mobile__history-header">
                    <div className="claim-requests-personal-mobile__history-heading">
                      <div className="claim-requests-personal-mobile__history-title">{targetHeading}</div>
                      <div className="claim-requests-personal-mobile__history-date">{formatDateTime(item.updatedAt)}</div>
                    </div>
                    <div className="claim-requests-personal-mobile__history-actions">
                      <button
                        type="button"
                        className="claim-requests-personal-mobile__edit-button"
                        onClick={() => onStartEdit(item)}
                        disabled={isDeleting || actionBusy}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="claim-requests-personal-mobile__delete-button"
                        onClick={() => onDeleteMessage(item)}
                        disabled={isDeleting || actionBusy}
                        aria-label="개인메시지 삭제"
                      >
                        {isDeleting ? '삭제 중…' : '삭제'}
                      </button>
                    </div>
                  </div>
                  <div className="claim-requests-personal-mobile__history-content">{item.content}</div>
                  {hasAttachments ? (
                    <div className="claim-requests-personal-mobile__attachments muted">
                      첨부 {item.attachments?.length}개 · 수정 시 첨부는 유지되고 본문만 바뀝니다.
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </main>
  )
}
