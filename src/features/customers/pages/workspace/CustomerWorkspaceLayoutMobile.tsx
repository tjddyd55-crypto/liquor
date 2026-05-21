import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { FormButton } from '../../../../components/form'
import Modal from '../../../../components/ui/Modal'
import { useAuth } from '../../../auth/AuthProvider'
import { listCustomers } from '../../api/customersApi'
import type { CustomerRecord } from '../../domain/types'
import type { CustomerWorkspaceLayoutPCProps } from './CustomerWorkspaceLayoutPC'

const RECENT_CUSTOMER_LIMIT = 5
const RECENT_CUSTOMER_SCROLL_RETRY_LIMIT = 12
const RECENT_CUSTOMER_SCROLL_RETRY_DELAY_MS = 40

function resolveMobileSheetTitle(pathname: string, search: string): string {
  if (pathname.includes('/claim-requests')) {
    const tab = new URLSearchParams(search).get('claimTab')
    return tab === 'news-personal' ? '개인메시지' : '청구 관리'
  }
  if (pathname.includes('/consultations')) {
    return '상담'
  }
  if (pathname.includes('/ga-excel') || pathname.includes('/ga')) {
    return 'GA 데이터 보기'
  }
  if (pathname.includes('/auto-form')) {
    return '자동차 신청서'
  }
  if (pathname.includes('/application-documents')) {
    return '신청서'
  }
  if (pathname.includes('/memos')) {
    return '메모'
  }
  if (pathname.includes('/files')) {
    return '고객 파일'
  }
  return '상세'
}

function parseCreatedAtMs(iso: string | null | undefined): number {
  const time = Date.parse(String(iso ?? ''))
  return Number.isFinite(time) ? time : 0
}

function formatRegisteredAt(iso: string | null | undefined): string {
  const date = new Date(String(iso ?? ''))
  if (Number.isNaN(date.getTime())) {
    return '등록일 미확인'
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return String(phone ?? '').trim() || '연락처 없음'
}

function scrollCustomerCardIntoCenter(customerId: number, attempt = 0): void {
  const target = document.querySelector<HTMLElement>(
    `[data-customer-id="${customerId}"], [data-customer-card-id="${customerId}"]`,
  )

  if (!target) {
    if (attempt < RECENT_CUSTOMER_SCROLL_RETRY_LIMIT) {
      window.setTimeout(
        () => scrollCustomerCardIntoCenter(customerId, attempt + 1),
        RECENT_CUSTOMER_SCROLL_RETRY_DELAY_MS,
      )
    }
    return
  }

  const summary = target.querySelector<HTMLElement>('.customer-expand-summary')
  const alreadyExpanded =
    target.classList.contains('customer-expand-card--focal') ||
    summary?.getAttribute('aria-expanded') === 'true'

  if (!alreadyExpanded) {
    summary?.click()
  }

  const snapToCenter = () => {
    if (!target.isConnected) {
      return
    }
    target.scrollIntoView({ behavior: 'auto', block: 'center' })
  }

  snapToCenter()
  ;[80, 180].forEach((ms) => {
    window.setTimeout(snapToCenter, ms)
  })
}

export default function CustomerWorkspaceLayoutMobile(props: CustomerWorkspaceLayoutPCProps) {
  const outlet = useOutlet()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const [recentOpen, setRecentOpen] = useState(false)
  const [recentCustomers, setRecentCustomers] = useState<CustomerRecord[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [recentError, setRecentError] = useState('')

  const isMobileDetailRoute = useMemo(
    () =>
      /^\/customers\/\d+\/(?:files|consultations|ga-excel|memos|auto-form|application-documents|claim-requests)(?:\/|$)/.test(
        location.pathname,
      ),
    [location.pathname],
  )

  const sortedRecentCustomers = useMemo(
    () =>
      [...recentCustomers]
        .sort((a, b) => parseCreatedAtMs(b.createdAt) - parseCreatedAtMs(a.createdAt))
        .slice(0, RECENT_CUSTOMER_LIMIT),
    [recentCustomers],
  )

  const loadRecentCustomers = useCallback(async () => {
    if (!token?.trim()) {
      setRecentCustomers([])
      return
    }
    setRecentLoading(true)
    setRecentError('')
    try {
      const result = await listCustomers(token, 100)
      setRecentCustomers(result.customers)
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : '최근 등록 고객을 불러오지 못했습니다.')
    } finally {
      setRecentLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (isMobileDetailRoute) {
      return
    }
    void loadRecentCustomers()
  }, [isMobileDetailRoute, loadRecentCustomers])

  const handleClose = () => {
    if (props.selectedCustomerId) {
      navigate(`/customers?customerId=${props.selectedCustomerId}`, { replace: true })
      return
    }
    navigate('/customers', { replace: true })
  }

  const openRecentCustomer = (customerId: number) => {
    setRecentOpen(false)
    navigate(`/customers?customerId=${customerId}`, { replace: true })
    window.setTimeout(() => scrollCustomerCardIntoCenter(customerId), 50)
  }

  if (isMobileDetailRoute && outlet) {
    const title = resolveMobileSheetTitle(location.pathname, location.search)
    return (
      <Modal
        open
        onClose={handleClose}
        ariaLabel={title}
        panelClassName="workspace-mobile-outlet-modal"
      >
        <div className="workspace-mobile-outlet-modal__header">
          <span className="workspace-mobile-outlet-modal__spacer" aria-hidden />
          <h2 className="workspace-mobile-outlet-modal__title">{title}</h2>
          <button type="button" className="workspace-mobile-outlet-modal__close" onClick={handleClose}>
            닫기
          </button>
        </div>
        <div className="workspace-mobile-outlet-modal__body">
          {outlet}
        </div>
      </Modal>
    )
  }

  return (
    <>
      <button
        type="button"
        className="customer-recent-mobile-trigger"
        onClick={() => {
          setRecentOpen(true)
          if (sortedRecentCustomers.length === 0) {
            void loadRecentCustomers()
          }
        }}
      >
        최근 등록 {sortedRecentCustomers.length > 0 ? `${sortedRecentCustomers.length}` : ''}
      </button>

      <Modal
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        ariaLabel="최근 등록 고객"
        panelClassName="customer-recent-mobile-modal"
      >
        <div className="customer-recent-mobile-modal__header">
          <div>
            <h2>최근 등록 고객</h2>
            <p>등록 링크로 새로 들어온 고객을 빠르게 확인합니다.</p>
          </div>
          <FormButton
            htmlType="button"
            variant="secondary"
            size="sm"
            onClick={() => setRecentOpen(false)}
          >
            닫기
          </FormButton>
        </div>

        <div className="customer-recent-mobile-modal__toolbar">
          <FormButton
            htmlType="button"
            variant="secondary"
            onClick={() => void loadRecentCustomers()}
            loading={recentLoading}
          >
            새로고침
          </FormButton>
        </div>

        {recentError ? <p className="customer-recent-mobile-modal__error">{recentError}</p> : null}
        {recentLoading && sortedRecentCustomers.length === 0 ? (
          <div className="customer-recent-mobile-modal__empty">불러오는 중…</div>
        ) : null}
        {!recentLoading && sortedRecentCustomers.length === 0 ? (
          <div className="customer-recent-mobile-modal__empty">최근 등록 고객이 없습니다.</div>
        ) : null}

        {sortedRecentCustomers.length > 0 ? (
          <div className="customer-recent-mobile-modal__list">
            {sortedRecentCustomers.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                className="customer-recent-mobile-modal__item"
                onClick={() => openRecentCustomer(customer.id)}
              >
                <span className="customer-recent-mobile-modal__rank">{index + 1}</span>
                <span className="customer-recent-mobile-modal__main">
                  <strong>{customer.name || '선택 고객'}</strong>
                  <small>{formatPhone(customer.phone)} · {formatRegisteredAt(customer.createdAt)}</small>
                </span>
                <span className="customer-recent-mobile-modal__action">열기</span>
              </button>
            ))}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
