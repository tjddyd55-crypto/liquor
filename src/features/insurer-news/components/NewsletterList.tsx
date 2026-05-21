import type { NewsletterItem } from '../types'
import { NewsCard } from './NewsCard'

/**
 * 모든 `NewsCard` 에 동일한 variant 를 전달하기 위한 리스트 래퍼.
 * 페이지 컨테이너(예: `ClaimRequestsPage`)에서 PC/Mobile 을 결정해 주입한다.
 */
type Props = {
  items: NewsletterItem[]
  emptyMessage: string
  variant: 'pc' | 'mobile'
  onOpenItem?: (id: string) => void
  onDeleteItem?: (item: NewsletterItem) => void
  deleteBusyId?: string | null
  noSearchResults?: boolean
}

export function NewsletterList({
  items,
  emptyMessage,
  variant,
  onOpenItem,
  onDeleteItem,
  deleteBusyId,
  noSearchResults,
}: Props) {
  if (!items.length) {
    return (
      <div className="insurer-news-empty" role="status">
        {noSearchResults ? '검색 결과가 없습니다.' : emptyMessage}
      </div>
    )
  }

  return (
    <div className="news-grid">
      {items.map((item) => (
        <NewsCard
          key={item.id}
          item={item}
          variant={variant}
          onOpen={onOpenItem ? () => onOpenItem(item.id) : undefined}
          onDelete={onDeleteItem ? () => onDeleteItem(item) : undefined}
          deleteBusy={Boolean(deleteBusyId && deleteBusyId === item.id)}
        />
      ))}
    </div>
  )
}
