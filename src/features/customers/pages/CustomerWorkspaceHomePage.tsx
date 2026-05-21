import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { FormButton } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { listCustomers } from '../api/customersApi'
import type { CustomerRecord } from '../domain/types'

type CustomerWorkspaceOutletContext = {
  selectedCustomerId: number | null
  openRelatedCustomerRef: MutableRefObject<
    ((customerId: number, customerName?: string) => void) | null
  >
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

export default function CustomerWorkspaceHomePage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { selectedCustomerId, openRelatedCustomerRef } = useOutletContext<CustomerWorkspaceOutletContext>()
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const recentCustomers = useMemo(
    () =>
      [...customers]
        .sort((a, b) => parseCreatedAtMs(b.createdAt) - parseCreatedAtMs(a.createdAt))
        .slice(0, 5),
    [customers],
  )

  const loadRecentCustomers = useCallback(async () => {
    if (!token?.trim()) {
      setCustomers([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await listCustomers(token, 100)
      setCustomers(result.customers)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '최근 등록 고객을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadRecentCustomers()
  }, [loadRecentCustomers])

  const openRecentCustomer = useCallback(
    (customer: CustomerRecord) => {
      const open = openRelatedCustomerRef.current
      if (open) {
        open(customer.id, customer.name)
        return
      }
      navigate(`/customers?customerId=${customer.id}`)
    },
    [navigate, openRelatedCustomerRef],
  )

  return (
    <section className="customer-workspace-home customer-workspace-home--landing">
      <div className="customer-workspace-home__intro">
        <h3 className="customer-workspace-home__title">고객 작업영역</h3>
        <p className="customer-workspace-home__desc">
          좌측 고객 목록에서 고객을 선택한 뒤, 상단 버튼으로 파일/상담/신청서 작업을 진행하세요.
        </p>
        <p className="customer-workspace-home__selected">
          현재 선택 고객: {selectedCustomerId ? `#${selectedCustomerId}` : '없음'}
        </p>
      </div>

      <section className="customer-workspace-recent" aria-label="최근 등록 고객">
        <div className="customer-workspace-recent__header">
          <div>
            <h4>최근 등록 고객</h4>
            <p>등록 링크로 새로 들어온 고객을 빠르게 확인합니다.</p>
          </div>
          <FormButton htmlType="button" variant="secondary" onClick={() => void loadRecentCustomers()} loading={loading}>
            새로고침
          </FormButton>
        </div>

        {error ? <p className="customer-workspace-recent__error">{error}</p> : null}
        {loading && recentCustomers.length === 0 ? <div className="customer-workspace-recent__empty">불러오는 중…</div> : null}
        {!loading && recentCustomers.length === 0 ? <div className="customer-workspace-recent__empty">최근 등록 고객이 없습니다.</div> : null}

        {recentCustomers.length > 0 ? (
          <div className="customer-workspace-recent__list">
            {recentCustomers.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                className="customer-workspace-recent__item"
                onClick={() => openRecentCustomer(customer)}
              >
                <span className="customer-workspace-recent__rank">{index + 1}</span>
                <span className="customer-workspace-recent__main">
                  <strong>{customer.name || `고객 #${customer.id}`}</strong>
                  <small>{formatPhone(customer.phone)} · {formatRegisteredAt(customer.createdAt)}</small>
                </span>
                <span className="customer-workspace-recent__action">열기</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}
