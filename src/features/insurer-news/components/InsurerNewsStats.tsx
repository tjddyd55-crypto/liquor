type Props = {
  insurerName: string
  totalCount: number
  lastPublishedAt: string | null
}

export function InsurerNewsStats({ insurerName, totalCount, lastPublishedAt }: Props) {
  return (
    <div className="insurer-news-admin-stats">
      <div className="insurer-news-admin-stat">
        <p className="insurer-news-admin-stat__label">내 보험사</p>
        <p className="insurer-news-admin-stat__value">{insurerName}</p>
      </div>
      <div className="insurer-news-admin-stat">
        <p className="insurer-news-admin-stat__label">총 게시물</p>
        <p className="insurer-news-admin-stat__value">{totalCount}</p>
      </div>
      <div className="insurer-news-admin-stat">
        <p className="insurer-news-admin-stat__label">최근 등록</p>
        <p className="insurer-news-admin-stat__value" style={{ fontSize: '1rem' }}>
          {lastPublishedAt ?? '—'}
        </p>
      </div>
    </div>
  )
}
