import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../../auth/AuthProvider'
import { usePlatformLandingAccess } from '../../hooks/usePlatformLandingAccess'
import {
  useTenantModeHubState,
  type LegacyGaLinkStatus,
} from '../../hooks/useTenantModeHubState'
import PlatformLandingAccessFeedback from './PlatformLandingAccessFeedback'

function dash(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t !== '' ? t : '—'
}

function legacyStatusLabel(status: LegacyGaLinkStatus): string {
  switch (status) {
    case 'connected':
      return '연결됨 (legacy_ga_id ↔ ga_companies)'
    case 'needs_ga':
      return 'GA 연결 필요 (legacy_ga_id 없음)'
    case 'ga_not_found':
      return '연결 불완전 (legacy_ga_id는 있으나 GA 행을 찾지 못함)'
    case 'session_ga_only':
      return '세션 GA 기준 (Tenant 메타는 SUPER_ADMIN 목록 API에서만 조회)'
    case 'no_session_ga':
      return '세션 GA 없음 · GA 행 확인 불가'
    default:
      return '—'
  }
}

/** Tenant Mode 운영 허브(`/admin/tenant/:tenantId`). 읽기 전용 · 기존 화면으로 연결만 수행한다. */
export default function TenantModeLandingPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const idRaw = String(tenantId ?? '').trim()
  const displayId = idRaw || '—'

  const { token, user } = useAuth()
  const { decision, reload, summary } = usePlatformLandingAccess({
    token,
    scopeType: 'tenant',
    scopeId: tenantId,
  })

  const isSuperAdmin = summary?.isSuperAdmin === true

  const hub = useTenantModeHubState({
    token,
    tenantIdParam: idRaw,
    decision,
    isSuperAdmin,
    userGaId: user?.gaId,
  })

  const showHub = decision === 'allowed'

  const t = hub.tenantRow

  return (
    <main className="page platform-admin-page platform-admin-page--pc tenant-mode-hub page--with-back">
      <div className="platform-admin-page__toolbar">
        {isSuperAdmin ? (
          <Link to="/admin/platform" className="platform-admin-page__back">
            ← 플랫폼 관리
          </Link>
        ) : (
          <Link to="/dashboard" className="platform-admin-page__back">
            ← 대시보드
          </Link>
        )}
      </div>

      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Tenant Mode</h1>
        <p className="platform-admin-page__lede">테넌트 운영 허브</p>
        <p className="platform-admin-page__lede platform-mode-landing__id-row">
          <span className="platform-admin-page__muted">테넌트 ID</span>{' '}
          <span className="platform-admin-page__mono">{displayId}</span>
        </p>
      </header>

      <section className="platform-admin-page__panel tenant-mode-hub__intro platform-mode-landing">
        <p className="platform-mode-landing__p">
          이 화면은 기존 GA/보험회사 단위를 새 Tenant 구조로 연결하는 운영 허브입니다.
        </p>
        <p className="platform-mode-landing__p">고객관리 업무는 기존 Work 화면을 그대로 사용합니다.</p>
        <p className="platform-mode-landing__p">
          GA 연결 정보가 없는 테넌트는 legacy 기능을 사용할 수 없습니다.
        </p>
      </section>

      <PlatformLandingAccessFeedback decision={decision} onRetry={reload} />

      {showHub ? (
        <>
          {hub.error ? (
            <div className="platform-admin-page__panel tenant-mode-hub__alert" role="alert">
              <p className="tenant-mode-hub__alert-text">{hub.error}</p>
              <button type="button" className="tenant-mode-hub__retry" onClick={() => void hub.reload()}>
                다시 시도
              </button>
            </div>
          ) : null}

          {hub.loading ? (
            <div className="platform-admin-page__panel tenant-mode-hub__loading">
              <p className="platform-admin-page__muted">불러오는 중…</p>
            </div>
          ) : null}

          {!hub.loading && isSuperAdmin && hub.tenantNotFound ? (
            <div className="platform-admin-page__panel tenant-mode-hub__alert tenant-mode-hub__alert--warn" role="status">
              <p className="tenant-mode-hub__alert-text">
                플랫폼 Tenant 목록에서 이 ID를 찾지 못했습니다. URL의 테넌트 ID를 확인해 주세요.
              </p>
            </div>
          ) : null}

          {!hub.loading && !hub.tenantNotFound ? (
            <>
              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">1. Tenant 정보</h2>
                {hub.tenantMetaRestricted ? (
                  <p className="platform-admin-page__muted tenant-mode-hub__note">
                    Tenant Admin 등 비슈퍼 계정은{' '}
                    <span className="platform-admin-page__mono">GET /api/admin/platform/tenants</span> 메타 조회에 접근할 수
                    없습니다. 아래는 URL의 테넌트 ID만 확실합니다. 전체 필드는 SUPER_ADMIN 세션에서 조회하거나, 후속 단건
                    읽기 API가 필요합니다.
                  </p>
                ) : null}
                <dl className="tenant-mode-hub__dl">
                  <div className="tenant-mode-hub__dl-row">
                    <dt>tenantId</dt>
                    <dd className="platform-admin-page__mono">{displayId}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>tenant code</dt>
                    <dd>{dash(t?.code)}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>tenant name</dt>
                    <dd>{dash(t?.name)}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>tenant status</dt>
                    <dd>{dash(t?.status)}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>industryId</dt>
                    <dd className="platform-admin-page__mono">{dash(t?.industryId)}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>industry code</dt>
                    <dd>{dash(t?.industryCode)}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>legacyGaId</dt>
                    <dd className="platform-admin-page__mono">
                      {t?.legacyGaId != null && t.legacyGaId > 0 ? String(t.legacyGaId) : '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">2. Legacy GA 연결 정보</h2>
                <p className="platform-admin-page__muted tenant-mode-hub__note">
                  정책: <span className="platform-admin-page__mono">tenants.legacy_ga_id = ga_companies.id</span> · Insurance
                  업종(<span className="platform-admin-page__mono">industry</span>) 테넌트와 레거시 GA를 연결합니다.
                </p>
                {hub.tenantMetaRestricted ? (
                  <p className="platform-admin-page__muted tenant-mode-hub__note">
                    현재 세션에서 테넌트의 <span className="platform-admin-page__mono">legacy_ga_id</span> 필드를 읽을 수 없어,
                    아래 GA는 <strong>세션</strong>의 조직 GA(<span className="platform-admin-page__mono">users.ga_id</span>)와{' '}
                    <span className="platform-admin-page__mono">GET /api/admin/ga</span> 목록을 맞춘 값입니다. 테넌트와의 정합은
                    SUPER_ADMIN Tenant 목록에서 확인할 수 있습니다.
                  </p>
                ) : null}
                <p className="tenant-mode-hub__status-line">
                  <span className="platform-admin-page__muted">연결 상태</span>{' '}
                  <span>{legacyStatusLabel(hub.legacyGaLinkStatus)}</span>
                </p>
                {hub.legacyGaLinkStatus === 'needs_ga' ? (
                  <div className="tenant-mode-hub__callout" role="status">
                    <strong>GA 연결 필요</strong> — 이 테넌트에 <span className="platform-admin-page__mono">legacy_ga_id</span>가
                    없습니다. 레거시 보험 CRM(Work 고객관리·GA 설정 등)과의 브릿지가 구성되지 않은 상태입니다.
                  </div>
                ) : null}
                <dl className="tenant-mode-hub__dl">
                  <div className="tenant-mode-hub__dl-row">
                    <dt>ga id</dt>
                    <dd className="platform-admin-page__mono">
                      {hub.gaRow != null ? String(hub.gaRow.id) : '—'}
                    </dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>ga code</dt>
                    <dd>{hub.gaRow != null ? hub.gaRow.code : '—'}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>ga name</dt>
                    <dd>{hub.gaRow != null ? hub.gaRow.name : '—'}</dd>
                  </div>
                  <div className="tenant-mode-hub__dl-row">
                    <dt>ga status</dt>
                    <dd>{hub.gaRow != null ? hub.gaRow.status : '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">3. Work 진입</h2>
                <p className="platform-admin-page__muted tenant-mode-hub__note">
                  Work 고객관리는 기존 <span className="platform-admin-page__mono">/customers</span>와 JWT{' '}
                  <span className="platform-admin-page__mono">gaId</span> 정책을 그대로 따릅니다.
                </p>
                <ul className="tenant-mode-hub__link-list">
                  <li>
                    <Link to="/customers" className="platform-admin-page__inline-link">
                      Work 고객관리 → /customers
                    </Link>
                  </li>
                </ul>
              </section>

              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">4. 기존 GA 관리 · 플랫폼</h2>
                <ul className="tenant-mode-hub__link-list">
                  <li>
                    {isSuperAdmin ? (
                      <Link to="/admin/platform" className="platform-admin-page__inline-link">
                        플랫폼 허브 → /admin/platform
                      </Link>
                    ) : (
                      <span className="tenant-mode-hub__muted-link">
                        플랫폼 허브 (/admin/platform) — <strong>SUPER_ADMIN</strong> 전용 라우트이며 그 외 역할은 대시보드로
                        돌아갈 수 있습니다.
                      </span>
                    )}
                  </li>
                  <li>
                    {hub.gaIdForAdminLink != null ? (
                      <Link
                        to={`/admin/ga/${hub.gaIdForAdminLink}`}
                        className="platform-admin-page__inline-link"
                      >
                        기존 GA 상세 설정 → /admin/ga/{hub.gaIdForAdminLink}
                      </Link>
                    ) : (
                      <span className="platform-admin-page__muted">
                        기존 GA 상세 설정 — 표시할 legacy GA id가 없습니다. GA 연결을 먼저 구성해 주세요.
                      </span>
                    )}
                  </li>
                </ul>
              </section>

              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">5. 담당자 / 스태프 / 특수 계정 영역</h2>
                <p className="platform-admin-page__muted tenant-mode-hub__note">
                  원수사·손해사정·외부 협력자 계정은 플랫폼 staff/user 멤버십에 자동 포함되지 않으며, 레거시 역할·전용 화면에서
                  관리합니다. UserManagement로의 직접 이동은 이번 범위에서 제외합니다.
                </p>
                <ul className="tenant-mode-hub__link-list">
                  <li>
                    <Link to="/admin/delegates" className="platform-admin-page__inline-link">
                      담당자(Delegator) 관리 후보 → /admin/delegates
                    </Link>
                  </li>
                  <li>
                    <Link to="/insurer-managers" className="platform-admin-page__inline-link">
                      원수사 담당자 → /insurer-managers
                    </Link>
                  </li>
                  <li>
                    <Link to="/loss-adjusters" className="platform-admin-page__inline-link">
                      손해사정사 목록 → /loss-adjusters
                    </Link>
                  </li>
                </ul>
              </section>

              <section className="platform-admin-page__panel tenant-mode-hub__section">
                <h2 className="platform-mode-landing__subhead">6. 향후 연결 예정 기능</h2>
                <ul className="platform-mode-landing__list">
                  <li>테넌트 스코프 Staff/User 관리 UI와 플랫폼 멤버십 연동 정리</li>
                  <li>Tenant Admin용 테넌트 단건 메타 조회(읽기 전용 API) — 접근 제어 설계 후</li>
                  <li>외부·특수 계정과 테넌트의 관계를 한 화면에서 점검하는 운영 도구</li>
                </ul>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
