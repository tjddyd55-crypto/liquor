import CustomerAppNewsImageGallery from '../../customer-app/components/CustomerAppNewsImageGallery'
import './customer-app-news-phone-preview.css'

function formatKrPhoneDisplay(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  if (digits.startsWith('02') && digits.length >= 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return digits
}

type Props = {
  agentName: string
  /** 저장된 휴대폰 번호(숫자·하이픈 혼용 가능) */
  agentPhoneRaw: string | null
  /** 미리보기: blob URL · CDN URL (고객앱 `CustomerAppNewsImageGallery`와 동일 규칙) */
  imageUrls: string[]
  /** 고객앱 홈 하단 CTA·바텀 네비를 함께 표시(전체소식지 PC 미리보기용) */
  showHomeChrome?: boolean
}

export default function CustomerAppNewsPhonePreview({
  agentName,
  agentPhoneRaw,
  imageUrls,
  showHomeChrome = false,
}: Props) {
  const formatted = formatKrPhoneDisplay(agentPhoneRaw)
  const digits = (agentPhoneRaw ?? '').replace(/\D/g, '')
  const count = imageUrls.filter(Boolean).length

  const identityLabel = [agentName.trim() || '담당 설계사', formatted || '전화번호 미등록'].join(' · ')

  const galleryKey = imageUrls.filter(Boolean).join('|') || 'empty'

  return (
    <aside className="customer-app-news-phone-preview" aria-label="고객앱 화면 미리보기">
      <div className="customer-app-news-phone-preview__chassis">
        <header className="customer-app-news-phone-preview__header">
          <div className="customer-app-news-phone-preview__identity" title={identityLabel}>
            <span className="customer-app-news-phone-preview__identity-name">{agentName.trim() || '담당 설계사'}</span>
            <span className="customer-app-news-phone-preview__identity-sep" aria-hidden>
              {' '}
              ·{' '}
            </span>
            <span className="customer-app-news-phone-preview__identity-phone">{formatted || '전화번호 미등록'}</span>
          </div>
          <div className="customer-app-news-phone-preview__header-actions">
            {digits ? (
              <a
                className="customer-app-news-phone-preview__action customer-app-news-phone-preview__action--call"
                href={`tel:${digits}`}
              >
                전화하기
              </a>
            ) : (
              <span className="customer-app-news-phone-preview__action customer-app-news-phone-preview__action--disabled">
                전화하기
              </span>
            )}
            <span className="customer-app-news-phone-preview__action customer-app-news-phone-preview__action--close">
              닫기
            </span>
          </div>
        </header>

        <div className="customer-app-news-phone-preview__stage">
          {count === 0 ? (
            <>
              <div className="customer-app-news-phone-preview__empty">
                이미지를 업로드하면 여기에 표시됩니다.
                <span className="customer-app-news-phone-preview__empty-sub">권장 비율 9:16 (세로형)</span>
              </div>
            </>
          ) : (
            <CustomerAppNewsImageGallery
              key={galleryKey}
              imageUrls={imageUrls}
              altBase="고객앱 미리보기 이미지"
              className="customer-app-news-gallery--phone-preview"
              alwaysShowPager
            />
          )}
        </div>

        {count === 0 ? (
          <p className="customer-app-news-phone-preview__hint customer-app-news-phone-preview__hint--standalone">
            권장 비율 9:16 (세로형)
          </p>
        ) : null}

        {showHomeChrome ? (
          <div className="customer-app-news-phone-preview__home-chrome" aria-hidden>
            <button type="button" className="customer-app-news-phone-preview__cta-primary">
              청구/문의하기
            </button>
            <nav className="customer-app-news-phone-preview__bottom-tabs">
              <span className="customer-app-news-phone-preview__bottom-tab customer-app-news-phone-preview__bottom-tab--active">
                홈
              </span>
              <span className="customer-app-news-phone-preview__bottom-tab">문의내역</span>
              <span className="customer-app-news-phone-preview__bottom-tab">개인메시지</span>
              <span className="customer-app-news-phone-preview__bottom-tab">내정보</span>
            </nav>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
