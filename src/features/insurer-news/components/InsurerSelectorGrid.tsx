import type { InsurerSummary } from '../types'
import { InsurerCard } from './InsurerCard'

type Props = {
  insurers: InsurerSummary[]
  onSelect: (slug: string) => void
  emptyMessage?: string
}

export function InsurerSelectorGrid({ insurers, onSelect, emptyMessage }: Props) {
  if (!insurers.length) {
    return <div className="insurer-news-empty">{emptyMessage ?? '등록된 보험사가 없습니다.'}</div>
  }

  return (
    <div className="insurer-news-insurer-grid">
      {insurers.map((g) => (
        <InsurerCard key={`${g.gaCode}-${g.insurerSlug}`} insurer={g} onOpen={() => onSelect(g.insurerSlug)} />
      ))}
    </div>
  )
}
