import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FormButton } from '../../../components/form'
import { fetchInsurerManagersHealth, type InsurerManagersHealth } from '../../auth/authApi'
import { fetchTeamMembers } from '../../team/api/teamApi'
import { useAuth } from '../../auth/AuthProvider'
import { isGaStaffReadOnlyUi } from '../../auth/roleGuards'
import { Button, Modal } from '../../../components/ui'
import { buildAppMenuForSession, type GaTenantDashboardMenuEntry } from '../gaTenantMenu'

type MenuEntry = GaTenantDashboardMenuEntry

function showInsurerManagerHealthBanner(role: string | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'GA_ADMIN'
}

function pathIsActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/contacts') {
    return pathname === '/contacts' || pathname === '/insurance/contacts'
  }
  if (itemPath === '/insurance/contacts') {
    return pathname === '/insurance/contacts' || pathname === '/contacts'
  }
  if (itemPath === '/portal/newsletters') {
    return pathname === '/portal/newsletters' || pathname.startsWith('/portal/newsletters/')
  }
  if (itemPath === '/portal/adjuster-news') {
    return pathname === '/portal/adjuster-news' || pathname.startsWith('/portal/adjuster-news/')
  }
  if (itemPath === '/contacts/manage') {
    return pathname === '/contacts/manage' || pathname === '/insurance/company-registry'
  }
  if (itemPath === '/insurance/company-registry') {
    return pathname === '/insurance/company-registry' || pathname.startsWith('/insurance/company-registry/')
  }
  if (itemPath.startsWith('/customers')) {
    return pathname === '/customers'
  }
  if (itemPath === '/application') {
    return pathname === '/application' || pathname.startsWith('/application/')
  }
  if (itemPath === '/application/documents') {
    if (pathname.startsWith('/application/documents/history')) {
      return false
    }
    return pathname === '/application/documents' || pathname.startsWith('/application/documents/')
  }
  if (itemPath === '/application/documents/history') {
    return (
      pathname === '/application/documents/history' ||
      pathname.startsWith('/application/documents/history/')
    )
  }
  if (itemPath === '/feature-request') {
    return pathname === '/feature-request' || pathname === '/feature-requests/my'
  }
  if (itemPath === '/account/reset') {
    return pathname === '/account/reset'
  }
  if (itemPath === '/profile') {
    return pathname === '/profile'
  }
  if (itemPath.startsWith('/internal/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  if (itemPath === '/admin/analytics') {
    return pathname === '/admin/analytics'
  }
  if (itemPath === '/admin/ga') {
    return pathname === '/admin/ga' || pathname === '/admin/create-ga'
  }
  if (itemPath === '/admin/delegates') {
    return pathname === '/admin/delegates' || pathname === '/admin/create-staff'
  }
  if (itemPath === '/insurer-managers') {
    return pathname === '/insurer-managers'
  }
  if (itemPath === '/loss-adjusters') {
    return pathname === '/loss-adjusters'
  }
  if (itemPath === '/insurer/news') {
    if (pathname.startsWith('/insurer/news/upload')) {
      return false
    }
    return pathname === '/insurer/news' || pathname.startsWith('/insurer/news/')
  }
  if (itemPath === '/insurer/news/upload') {
    return pathname === '/insurer/news/upload'
  }
  if (itemPath === '/adjuster/news') {
    if (pathname.startsWith('/adjuster/news/upload')) {
      return false
    }
    return pathname === '/adjuster/news' || pathname.startsWith('/adjuster/news/')
  }
  if (itemPath === '/adjuster/news/upload') {
    return pathname === '/adjuster/news/upload'
  }
  if (itemPath === '/admin/audit-logs') {
    return pathname === '/admin/audit-logs'
  }
  if (itemPath === '/insurance/insurer-sites') {
    return pathname === '/insurance/insurer-sites'
  }
  if (itemPath === '/admin/insurer-sites') {
    return pathname === '/admin/insurer-sites'
  }
  if (itemPath === '/team/manage' || itemPath === '/team/menu-settings' || itemPath === '/team/admin') {
    return pathname === '/team/members' || pathname === itemPath || pathname.startsWith('/team/members/')
  }
  if (itemPath.startsWith('/team/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  return pathname === itemPath
}

export function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, token } = useAuth()
  const role = user?.role
  const showStaffReadOnlyNote = isGaStaffReadOnlyUi(role)
  const showImHealth = showInsurerManagerHealthBanner(role)
  const pathname = location.pathname
  const [imHealthErr, setImHealthErr] = useState('')
  const [imHealth, setImHealth] = useState<InsurerManagersHealth | null>(null)
  const [teamMenuManageVisible, setTeamMenuManageVisible] = useState(false)
  const [preparingNoticeOpen, setPreparingNoticeOpen] = useState(false)

  const loadImHealth = useCallback(async () => {
    if (!showImHealth || !token?.trim()) {
      return
    }
    try {
      const data = await fetchInsurerManagersHealth(token)
      setImHealthErr('')
      setImHealth(data)
    } catch {
      setImHealthErr('원수사 담당자 정합성 상태를 확인하지 못했습니다.')
    }
  }, [showImHealth, token])

  useEffect(() => {
    queueMicrotask(() => {
      void loadImHealth()
    })
  }, [loadImHealth])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      if (!token?.trim() || !user?.id) {
        setTeamMenuManageVisible(false)
        return
      }
      if (role !== 'USER' && role !== 'GA_ADMIN') {
        setTeamMenuManageVisible(false)
        return
      }
      if (!user?.teamId?.trim()) {
        setTeamMenuManageVisible(false)
        return
      }
      void fetchTeamMembers(token)
        .then((data) => {
          if (cancelled) {
            return
          }
          const oid = data.ownerId?.trim() ?? ''
          setTeamMenuManageVisible(Boolean(oid && oid === user.id))
        })
        .catch(() => {
          if (!cancelled) {
            setTeamMenuManageVisible(false)
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [token, user?.id, user?.teamId, role])

  /*
   * 대시보드 메뉴 — `buildAppMenuForSession` 단일 진실 원천 호출.
   *
   *   - `teamMenuManageVisible` : 팀 오너일 때만 "팀 관리" 카드를 `/team/files` 뒤에 주입.
   *
   * divider 는 대시보드 카드 UI 에서는 유지해 섹션 구분선 역할을 한다.
   *
   * 메모 항목은 더 이상 이 메뉴에 포함되지 않는다 — 모바일은 우측 하단 FAB,
   * PC 는 우측 상시 메모 패널로 각각 진입한다(gaTenantMenu.ts 주석 참조).
   */
  const menuItems = useMemo<MenuEntry[]>(() => {
    return buildAppMenuForSession(role, user?.gaCode, user?.gaName, {
      teamMenuManageVisible,
      crmIndustryCode: user?.crmIndustryCode ?? null,
    })
  }, [role, user?.gaCode, user?.gaName, user?.crmIndustryCode, teamMenuManageVisible])

  return (
    <main className="page dashboard-page--centered">
      <div className="dashboard-menu-shell">
        <header className="page-header dashboard-page__header">
          <h1>메뉴</h1>
        </header>

        {imHealthErr ? (
          <p className="status status--error" style={{ maxWidth: 420, margin: '0 auto 12px' }}>
            {imHealthErr}
          </p>
        ) : null}
        {imHealth && imHealth.broken > 0 ? (
          <div
            className="status status--error"
            role="alert"
            style={{ maxWidth: 420, margin: '0 auto 12px', padding: '12px 14px', textAlign: 'left' }}
          >
            <strong>담당자 데이터 정합성 오류</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14 }}>
              원수사 담당자 {imHealth.total}명 중 {imHealth.broken}명에 company_id·분류·GA 불일치 등이
              있습니다. DB 복구 스크립트(<code>recover:insurer-managers</code>)와{' '}
              <code>audit-insurer-manager-company.sql</code>로 점검해 주세요.
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.95 }}>
              null·무효 company_id: {imHealth.nullCompany}, FK 깨짐: {imHealth.fkBroken}, GA 불일치:{' '}
              {imHealth.gaMismatch}, 분류 불일치: {imHealth.invalidCategory}
            </p>
          </div>
        ) : null}

        <section className="dashboard-menu-card">
          <h2 className="dashboard-section-title visually-hidden">주요 메뉴</h2>
          {showStaffReadOnlyNote ? (
            <p className="dashboard-menu-note" role="status">
              GA_STAFF 계정은 연락처 관련 입력 화면 일부가 <strong>읽기 전용</strong>입니다. 저장·등록은 GA
              관리자만 가능합니다.
            </p>
          ) : null}
          <nav className="menu-card" aria-label="주요 메뉴">
            {menuItems.map((entry, idx) => {
              if (entry.type === 'divider') {
                return (
                  <div
                    key={`menu-divider-${idx}`}
                    className="menu-card__divider my-3 border-t border-[var(--border-default)]"
                    role="presentation"
                  />
                )
              }
              if (entry.type === 'section') {
                return (
                  <div
                    key={`menu-section-${idx}`}
                    className="menu-card__section"
                    role="presentation"
                  >
                    {entry.label}
                  </div>
                )
              }
              const isDisabled = Boolean(entry.disabled || entry.preparing)
              const isActive =
                !isDisabled &&
                Boolean(entry.path) &&
                entry.path !== '#' &&
                pathIsActive(pathname, entry.path)
              return (
                <FormButton
                  key={`${entry.path}-${entry.label}-${idx}`}
                  htmlType="button"
                  variant="action"
                  className={`menu-item${isActive ? ' active' : ''}${isDisabled ? ' menu-item--disabled' : ''}`}
                  disabled={isDisabled}
                  onClick={() => {
                    /* 개발중(disabled/preparing) 항목은 클릭 비활성 — 모달 없이 배지로만 안내 */
                    if (isDisabled) {
                      return
                    }
                    if (!entry.path.trim() || entry.path === '#') {
                      return
                    }
                    navigate(entry.path)
                  }}
                >
                  <span className="menu-item__label">{entry.label}</span>
                  {entry.badge ? <span className="menu-item__badge">{entry.badge}</span> : null}
                </FormButton>
              )
            })}
          </nav>

          <FormButton
            className="button button--secondary button--full dashboard-logout"
            htmlType="button"
            variant="secondary"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            로그아웃
          </FormButton>
        </section>
      </div>

      <Modal open={preparingNoticeOpen} onClose={() => setPreparingNoticeOpen(false)} ariaLabel="안내">
        <div className="text-center text-base font-medium text-[var(--text-primary)] px-2 py-2">
          준비중입니다.
        </div>
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="primary" className="min-w-[88px]" onClick={() => setPreparingNoticeOpen(false)}>
            확인
          </Button>
        </div>
      </Modal>
    </main>
  )
}
