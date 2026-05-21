import { FormButton, FormInput } from '../../../../../components/form'

type MaybePromise = void | Promise<void>

type ClaimLinkSectionProps = {
  activeCustomerId?: number | null
  displayedCode?: string
  displayedLink?: string
  linkActionLabel: string
  actionBusy?: boolean
  copyResult?: string
  showDescription?: boolean
  showRawLinkFields?: boolean
  onCreateLink: () => MaybePromise
  onCopyCode?: () => MaybePromise
  onCopyLink?: () => MaybePromise
  onShareBySms?: () => MaybePromise
  onShareByKakao?: () => MaybePromise
  onOpenLinkPreview?: () => MaybePromise
}

export default function ClaimLinkSection({
  activeCustomerId,
  displayedCode = '',
  displayedLink = '',
  linkActionLabel,
  actionBusy = false,
  copyResult = '',
  showDescription = true,
  showRawLinkFields = true,
  onCreateLink,
  onCopyCode,
  onCopyLink,
  onShareBySms,
  onShareByKakao,
  onOpenLinkPreview,
}: ClaimLinkSectionProps) {
  const hasLink = Boolean(displayedLink.trim())
  const hasCode = Boolean(displayedCode.trim())

  return (
    <section className="claim-requests-page__card claim-requests-page__link-section">
      <div className="claim-requests-page__section-header claim-requests-page__link-header">
        <div className="claim-requests-page__section-heading">
          <h2 className="claim-requests-page__section-title">링크 발송</h2>
          {showDescription ? (
            <p className="claim-requests-page__section-description">
              고객에게 청구 요청과 개인메시지를 확인할 수 있는 고객앱 링크를 전달합니다.
            </p>
          ) : null}
        </div>
        <FormButton
          htmlType="button"
          variant="primary"
          onClick={() => void onCreateLink()}
          loading={actionBusy}
          disabled={!activeCustomerId}
        >
          {linkActionLabel}
        </FormButton>
      </div>

      {showRawLinkFields ? (
        <div className="claim-requests-page__link-fields">
          <label className="claim-requests-page__link-row">
            <span>연결 코드</span>
            <div className="claim-requests-page__link-value-row">
              <FormInput readOnly value={displayedCode} placeholder="링크 생성 후 표시됩니다." />
              <FormButton htmlType="button" variant="secondary" onClick={() => void onCopyCode?.()} disabled={!hasCode}>
                복사
              </FormButton>
            </div>
          </label>
          <label className="claim-requests-page__link-row">
            <span>연결 URL</span>
            <div className="claim-requests-page__link-value-row">
              <FormInput readOnly value={displayedLink} placeholder="링크 생성 후 표시됩니다." />
              <FormButton htmlType="button" variant="secondary" onClick={() => void onCopyLink?.()} disabled={!hasLink}>
                복사
              </FormButton>
            </div>
          </label>
        </div>
      ) : null}

      <div className="claim-requests-page__share-actions claim-requests-page__link-actions">
        <FormButton htmlType="button" variant="secondary" onClick={() => void onShareBySms?.()} disabled={!hasLink}>
          문자 발송
        </FormButton>
        <FormButton htmlType="button" variant="secondary" onClick={() => void onShareByKakao?.()} disabled={!hasLink}>
          카카오 발송
        </FormButton>
        <FormButton htmlType="button" variant="secondary" onClick={() => void onOpenLinkPreview?.()} disabled={!hasLink}>
          링크 미리보기
        </FormButton>
      </div>

      {copyResult ? <div className="claim-requests-page__copy-result">{copyResult}</div> : null}
    </section>
  )
}
