import { Link } from 'react-router-dom'
import type { PlatformHubViewProps } from '../PlatformHubPage'

export default function PlatformHubPCView({ cards }: PlatformHubViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">플랫폼 관리</h1>
        <p className="platform-admin-page__lede">
          CRM-Platform 메타(industries / tenants / memberships) 및 보험 전용 외부 계정 요약입니다. 조회 전용입니다.
        </p>
      </header>
      <div className="platform-admin-page__grid">
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
