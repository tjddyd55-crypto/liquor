import type { NewsletterItem } from '../types'
import FormButton from '../../../components/form/FormButton'

/**
 * PC/Mobile 분기는 `variant` prop 으로 승격 (AGENTS.md §8-5 Tier 4/3 참조).
 * NewsCard 내부에서 useIsMobile 을 직접 호출하지 않으며, 호출 측(NewsletterList)
 * 또는 그 위의 페이지 컨테이너(ClaimRequestsPage 등)가 variant 를 결정해 주입한다.
 */
type Props = {
  item: NewsletterItem
  onOpen?: () => void
  onDelete?: () => void
  deleteBusy?: boolean
  variant: 'pc' | 'mobile'
}

function cardAriaLabel(item: NewsletterItem): string {
  const headline = item.summary?.trim() || item.title?.trim() || ''
  const head = headline ? headline.slice(0, 40) : ''
  const parts = [item.insurerName, head].filter(Boolean)
  return parts.length > 0 ? `${parts.join(' — ')} 소식` : '소식지'
}

function formatPublishedDateLabel(iso: string): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const ymd = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return ymd
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return ymd || '—'
}

export function NewsCard({ item, onOpen, onDelete, deleteBusy, variant }: Props) {
  const isMobile = variant === 'mobile'
  const companyName = item.insurerName?.trim() || '—'
  const dateLabel = formatPublishedDateLabel(item.publishedAt)
  const headline = item.summary?.trim() || item.title?.trim() || '본문 내용이 없습니다.'
  const media = isMobile ? (
    <>
      {item.heroImageUrl ? (
        <img className="news-card__mobile-image" src={item.heroImageUrl} alt="" loading="lazy" />
      ) : (
        <div className="news-card__placeholder news-card__placeholder--content" aria-hidden>
          <span className="news-card__placeholder-label news-card__placeholder-label--headline">
            {headline}
          </span>
        </div>
      )}
      <div className="news-card__overlay">
        <div className="news-card__overlay-name">{companyName}</div>
        <div className="news-card__overlay-date">{dateLabel}</div>
      </div>
    </>
  ) : (
    <div className="news-card__media">
      {item.heroImageUrl ? (
        <img src={item.heroImageUrl} alt="" loading="lazy" />
      ) : (
        <div className="news-card__placeholder news-card__placeholder--content" aria-hidden>
          <span className="news-card__placeholder-label news-card__placeholder-label--headline">
            {headline}
          </span>
        </div>
      )}
      <div className="news-card__overlay">
        <div className="news-card__overlay-name">{companyName}</div>
        <div className="news-card__overlay-date">{dateLabel}</div>
      </div>
    </div>
  )

  const mediaBlock =
    onOpen != null ? (
      <div
        className="card-content card-content--clickable"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
        role="button"
        tabIndex={0}
      >
        {media}
      </div>
    ) : (
      <div className="card-content">{media}</div>
    )

  const deleteFooter =
    onDelete != null ? (
      <div
        className={`news-card__actions${isMobile ? ' news-card__actions--mobile' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <FormButton
          htmlType="button"
          variant="danger"
          size={isMobile ? 'sm' : 'sm'}
          loading={Boolean(deleteBusy)}
          disabled={Boolean(deleteBusy)}
          className="news-card__delete"
          onClick={() => onDelete()}
        >
          삭제
        </FormButton>
      </div>
    ) : null

  if (onOpen != null) {
    return (
      <div
        className={`news-card assessor-news-card${isMobile ? ' news-card--mobile' : ''}`}
        aria-label={cardAriaLabel(item)}
      >
        {mediaBlock}
        {deleteFooter}
      </div>
    )
  }

  return (
    <div
      className={`news-card assessor-news-card news-card--static${isMobile ? ' news-card--mobile' : ''}`}
      role="article"
      aria-label={cardAriaLabel(item)}
    >
      {mediaBlock}
      {deleteFooter}
    </div>
  )
}
