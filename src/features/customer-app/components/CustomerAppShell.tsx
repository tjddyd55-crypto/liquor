import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import FormButton from '../../../components/form/FormButton'
import { getCustomerAppMe } from '../api/customerAppApi'
import { useCustomerAppSession } from '../session/useCustomerAppSession'
import { closeCustomerApp } from '../utils/closeCustomerApp'
import { isCustomerAppNativeWebView } from '../utils/customerAppEnvironment'
import '../customer-app.css'

/**
 * 고객앱 레이아웃 Shell.
 *
 * - 상단: 담당 설계사 정보
 * - 본문: children (Outlet 또는 페이지 콘텐츠)
 * - 하단 고정: 청구 요청 CTA(작성 화면 제외) + 4탭(홈/문의내역/개인메시지/내정보)
 */

type Props = {
  children: ReactNode
  /** 본문 main aria-label. 미지정 시 "고객 앱". */
  title?: string
  /** false일 때 청구 작성(/requests/new) 등 CTA 숨김 */
  showClaimCta?: boolean
}

interface HeaderInfo {
  agentName: string
  agentPhone: string | null
}

const HEADER_FALLBACK: HeaderInfo = { agentName: '담당 설계사', agentPhone: null }

function formatKrPhone(raw: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  if (digits.startsWith('02') && digits.length >= 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return digits
}

const CLOSE_GUIDE_DELAY_MS = 900

export default function CustomerAppShell({ children, title = '고객 앱', showClaimCta = true }: Props) {
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const closeGuideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [closeGuideVisible, setCloseGuideVisible] = useState(false)
  const [header, setHeader] = useState<HeaderInfo>(() =>
    session
      ? { agentName: session.agentName || HEADER_FALLBACK.agentName, agentPhone: null }
      : HEADER_FALLBACK,
  )

  useEffect(() => {
    if (!session) {
      return
    }
    let mounted = true
    void (async () => {
      try {
        const me = await getCustomerAppMe(session.appToken)
        if (!mounted) {
          return
        }
        setHeader({
          agentName: me.agentName || HEADER_FALLBACK.agentName,
          agentPhone: me.agentPhone ?? null,
        })
      } catch {
        // 세션 캐시로 이름 표시
      }
    })()
    return () => {
      mounted = false
    }
  }, [session])

  useEffect(() => {
    return () => {
      if (closeGuideTimerRef.current != null) {
        window.clearTimeout(closeGuideTimerRef.current)
        closeGuideTimerRef.current = null
      }
    }
  }, [])

  const displayPhone = formatKrPhone(header.agentPhone)
  const telDigits = (header.agentPhone ?? '').replace(/\D/g, '')

  const handleClose = useCallback(() => {
    setCloseGuideVisible(false)
    if (closeGuideTimerRef.current != null) {
      window.clearTimeout(closeGuideTimerRef.current)
      closeGuideTimerRef.current = null
    }
    if (isCustomerAppNativeWebView()) {
      closeCustomerApp()
      return
    }
    closeCustomerApp()
    closeGuideTimerRef.current = window.setTimeout(() => {
      setCloseGuideVisible(true)
      closeGuideTimerRef.current = null
    }, CLOSE_GUIDE_DELAY_MS)
  }, [])

  return (
    <div className={`customer-app-shell${showClaimCta ? '' : ' customer-app-shell--no-cta'}`}>
      <header className="customer-app-header">
        <div className="customer-app-header__row">
          <div className="customer-app-header__identity" title={`${header.agentName}${displayPhone ? ` · ${displayPhone}` : ''}`}>
            <span className="customer-app-header__name">{header.agentName}</span>
            <span className="customer-app-header__sep" aria-hidden>
              {' '}
              ·{' '}
            </span>
            <span className="customer-app-header__phone-line">{displayPhone || '전화번호 미등록'}</span>
          </div>
          <div className="customer-app-header__actions">
            {telDigits ? (
              <a
                className="customer-app-header__action-btn customer-app-header__action-btn--call"
                href={`tel:${telDigits}`}
              >
                전화하기
              </a>
            ) : (
              <span className="customer-app-header__action-btn customer-app-header__action-btn--disabled">전화하기</span>
            )}
            <button type="button" className="customer-app-header__action-btn customer-app-header__action-btn--close" onClick={handleClose}>
              닫기
            </button>
          </div>
        </div>
      </header>

      {closeGuideVisible ? (
        <div className="customer-app-close-guide" role="status">
          <p className="customer-app-close-guide__text">브라우저 상단의 X 또는 뒤로 버튼으로 닫아 주세요.</p>
          <button
            type="button"
            className="customer-app-close-guide__dismiss"
            onClick={() => setCloseGuideVisible(false)}
          >
            확인
          </button>
        </div>
      ) : null}

      <main className="customer-app-main" aria-label={title}>
        {children}
      </main>

      <div className="customer-app-shell__bottom">
        <div className="customer-app-shell__bottom-inner">
          {showClaimCta ? (
            <div className="customer-app-shell__cta-wrap">
              <FormButton
                htmlType="button"
                variant="primary"
                className="customer-app-shell__cta-button"
                fullWidth
                onClick={() => navigate('/customer-app/requests/new')}
              >
                청구/문의하기
              </FormButton>
            </div>
          ) : null}
          <CustomerAppBottomNav />
        </div>
      </div>
    </div>
  )
}

interface TabItem {
  to: string
  label: string
  match: (pathname: string) => boolean
}

const TABS: TabItem[] = [
  {
    to: '/customer-app/home',
    label: '홈',
    match: (path) => path === '/customer-app/home',
  },
  {
    to: '/customer-app/requests',
    label: '문의내역',
    match: (path) => path.startsWith('/customer-app/requests'),
  },
  {
    to: '/customer-app/news/personal',
    label: '개인메시지',
    match: (path) => path === '/customer-app/news/personal',
  },
  {
    to: '/customer-app/profile',
    label: '내정보',
    match: (path) => path.startsWith('/customer-app/profile'),
  },
]

function CustomerAppBottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="customer-app-tabbar" aria-label="고객앱 주요 메뉴">
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={`customer-app-tabbar__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
