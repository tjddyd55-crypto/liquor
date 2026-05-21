import type { NewsletterItem } from '../types'
import { formatInsurerNewsDateTime } from '../utils/formatInsurerNewsDate'

/** @deprecated 상세 페이지는 날짜·본문을 페이지에서 직접 구성합니다. 레거시용으로만 유지 */
type Props = {
  item: Pick<NewsletterItem, 'insurerName' | 'publishedAt'>
}

export function NewsletterDetailHeader({ item }: Props) {
  return (
    <header>
      <p className="insurer-news-detail-header__insurer">{item.insurerName}</p>
      <p className="insurer-news-detail-header__time">
        <time dateTime={item.publishedAt}>{formatInsurerNewsDateTime(item.publishedAt)}</time>
      </p>
    </header>
  )
}
