import RichTextContent from '../../../components/rich-text/RichTextContent'
import { stripRichText } from '../../../components/rich-text/richText'

type CustomerAppNewsCardProps = {
  id: string
  title?: string | null
  summary?: string | null
  content?: string | null
  updatedAt?: string | null
  heroImageUrl?: string | null
  label?: string
  variant?: 'featured' | 'list'
  onOpen?: () => void
}

function formatDateOnly(iso?: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return String(iso).slice(0, 10) || '—'
  }
  return date.toISOString().slice(0, 10)
}

function normalizeTitle(title?: string | null, label = '소식지'): string {
  const value = String(title ?? '').trim()
  if (!value || value === '전체소식지') {
    return label
  }
  return value
}

export default function CustomerAppNewsCard({
  title,
  summary,
  content,
  updatedAt,
  heroImageUrl,
  label = '소식지',
  variant = 'featured',
  onOpen,
}: CustomerAppNewsCardProps) {
  const displayTitle = normalizeTitle(title, label)
  const body = String(content ?? summary ?? '').trim()
  const plainBody = stripRichText(body)
  const isList = variant === 'list'
  const className = `customer-app-news-card customer-app-news-card--${variant}${onOpen ? ' customer-app-news-card--button' : ''}`

  const card = (
    <>
      {heroImageUrl ? (
        <div className="customer-app-news-card__image-frame">
          <img className="customer-app-news-card__image" src={heroImageUrl} alt="" loading="lazy" />
        </div>
      ) : (
        <div className="customer-app-news-card__text-frame">
          <RichTextContent value={body} className="customer-app-news-card__text-preview" emptyText="내용이 없습니다." />
        </div>
      )}
      <div className="customer-app-news-card__meta">
        <div className="customer-app-news-card__title">{displayTitle}</div>
        <time className="customer-app-news-card__date" dateTime={updatedAt ?? undefined}>{formatDateOnly(updatedAt)}</time>
      </div>
      {heroImageUrl && body ? (
        isList ? (
          <p className="customer-app-news-card__plain-summary">{plainBody}</p>
        ) : (
          <RichTextContent value={body} className="customer-app-news-card__rich-summary" />
        )
      ) : null}
    </>
  )

  if (onOpen) {
    return (
      <button type="button" className={className} onClick={onOpen}>
        {card}
      </button>
    )
  }

  return <article className={className}>{card}</article>
}
