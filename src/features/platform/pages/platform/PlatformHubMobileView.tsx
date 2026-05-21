import { Link } from 'react-router-dom'
import type { PlatformHubViewProps } from '../PlatformHubPage'

export default function PlatformHubMobileView({ cards }: PlatformHubViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">플랫폼 관리</h1>
        <p className="platform-admin-page__lede">CRM 메타 · 외부 계정 요약 (조회 전용)</p>
      </header>
      <div className="platform-admin-page__grid platform-admin-page__grid--mobile">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="platform-admin-page__card">
            <h2 className="platform-admin-page__card-title">{c.title}</h2>
            <p className="platform-admin-page__card-desc">{c.description}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
