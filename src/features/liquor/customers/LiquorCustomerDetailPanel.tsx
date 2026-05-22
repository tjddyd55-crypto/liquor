import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import type { CustomerRecord } from '../../customers/domain/types'
import { LiquorCustomerContactsSection } from './LiquorCustomerContactsSection'
import { LiquorCustomerFilesSection } from './LiquorCustomerFilesSection'
import { LiquorRepaymentsSection } from './LiquorRepaymentsSection'
import { LiquorSupportContractsSection } from './LiquorSupportContractsSection'
import { LiquorSupportItemsSection } from './LiquorSupportItemsSection'
import {
  createLiquorCustomerNote,
  fetchLiquorCustomerDetail,
  saveLiquorCustomerProfile,
  type LiquorCustomerDetail,
  type LiquorPartyType,
} from './liquorCustomerApiClient'
import {
  formatLiquorWon,
  LIQUOR_ACCOUNT_STATUS_LABELS,
  LIQUOR_PARTY_TYPE_LABELS,
} from './liquorCustomerUi'
import './liquor-customers.css'

type TabId =
  | 'liquor_basic'
  | 'liquor_contacts'
  | 'liquor_support'
  | 'liquor_repayments'
  | 'liquor_items'
  | 'liquor_files'
  | 'liquor_notes'
  | 'liquor_signatures'

const TABS: { id: TabId; label: string }[] = [
  { id: 'liquor_basic', label: '기본정보' },
  { id: 'liquor_contacts', label: '담당자' },
  { id: 'liquor_support', label: '지원/채권' },
  { id: 'liquor_repayments', label: '상환내역' },
  { id: 'liquor_items', label: '지원물품' },
  { id: 'liquor_files', label: '첨부문서' },
  { id: 'liquor_notes', label: '메모/활동' },
  { id: 'liquor_signatures', label: '전자서명' },
]

type Props = {
  customer: CustomerRecord
  token: string
  editing?: boolean
}

export default function LiquorCustomerDetailPanel({ customer, token, editing = false }: Props) {
  const [tab, setTab] = useState<TabId>('liquor_basic')
  const [detail, setDetail] = useState<LiquorCustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [partyType, setPartyType] = useState<LiquorPartyType>('individual')
  const [residentInput, setResidentInput] = useState('')
  const [individualEmail, setIndividualEmail] = useState('')
  const [profileMemo, setProfileMemo] = useState('')
  const [accountStatus, setAccountStatus] = useState('active')
  const [businessName, setBusinessName] = useState('')
  const [businessRep, setBusinessRep] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessItem, setBusinessItem] = useState('')
  const [businessOpenedOn, setBusinessOpenedOn] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [tradeStartedOn, setTradeStartedOn] = useState('')
  const [saving, setSaving] = useState(false)

  const applyProfileToForm = (p: NonNullable<LiquorCustomerDetail['profile']>) => {
    setPartyType(p.partyType ?? 'individual')
    setProfileMemo(p.memo ?? '')
    setIndividualEmail(p.individualEmail ?? '')
    setAccountStatus(p.accountStatus ?? 'active')
    setBusinessName(p.businessName ?? '')
    setBusinessRep(p.businessRepresentativeName ?? '')
    setBizNo(p.businessRegistrationNumber ?? '')
    setBusinessAddress(p.businessAddress ?? '')
    setStorePhone(p.storePhone ?? '')
    setBusinessType(p.businessType ?? '')
    setBusinessItem(p.businessItem ?? '')
    setBusinessOpenedOn(p.businessOpenedOn ?? '')
    setBusinessEmail(p.businessEmail ?? '')
    setTradeStartedOn(p.tradeStartedOn ?? '')
  }

  const reload = useCallback(async () => {
    if (!token?.trim()) return
    setLoading(true)
    setError(null)
    try {
      const d = await fetchLiquorCustomerDetail(token, customer.id)
      setDetail(d)
      if (d.profile) {
        applyProfileToForm(d.profile)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '주류 고객 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, customer.id])

  useEffect(() => {
    void reload()
  }, [reload])

  const summary = detail?.summary

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await saveLiquorCustomerProfile(token, customer.id, {
        partyType,
        memo: profileMemo,
        individualEmail,
        accountStatus,
        businessName,
        businessRepresentativeName: businessRep,
        businessRegistrationNumber: bizNo,
        businessAddress,
        storePhone,
        businessType,
        businessItem,
        businessOpenedOn: businessOpenedOn || null,
        businessEmail,
        tradeStartedOn: tradeStartedOn || null,
        residentId: residentInput.trim() || undefined,
      })
      setResidentInput('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const supportContracts = detail?.supportContracts ?? []

  const tabContent = useMemo(() => {
    if (loading) return <p className="liquor-customer-panel__muted">불러오는 중…</p>
    if (error) return <p className="liquor-customer-panel__error">{error}</p>

    switch (tab) {
      case 'liquor_basic':
        return (
          <div className="liquor-customer-panel__section">
            {summary ? (
              <div className="liquor-customer-summary-cards">
                <div className="liquor-customer-summary-card">
                  <span>총 지원금액</span>
                  <strong>{formatLiquorWon(summary.totalSupportAmount)}</strong>
                </div>
                <div className="liquor-customer-summary-card">
                  <span>총 상환금액</span>
                  <strong>{formatLiquorWon(summary.totalRepaidAmount)}</strong>
                </div>
                <div className="liquor-customer-summary-card">
                  <span>현재 잔액</span>
                  <strong>{formatLiquorWon(summary.totalBalanceAmount)}</strong>
                </div>
                <div className="liquor-customer-summary-card liquor-customer-summary-card--warn">
                  <span>연체금액</span>
                  <strong>{formatLiquorWon(summary.overdueAmount)}</strong>
                </div>
              </div>
            ) : null}
            {summary ? (
              <p className="liquor-customer-panel__summary-meta">
                최근 상환일: {summary.latestRepaymentOn ?? '—'} · 다음 상환 예정: {summary.nextRepaymentDueOn ?? '—'}
              </p>
            ) : null}
            <p className="liquor-customer-panel__core-hint">
              거래처명·연락처·주소는 상단 고객 기본정보(코어 필드)에서 관리합니다.
            </p>
            <div className="liquor-customer-form-grid">
              <label>
                거래처 구분
                <FormSelect
                  value={partyType}
                  disabled={!editing}
                  onChange={(e) => setPartyType(e.target.value as LiquorPartyType)}
                >
                  <option value="individual">개인</option>
                  <option value="business">사업장</option>
                </FormSelect>
              </label>
              <label>
                거래처 상태
                <FormSelect value={accountStatus} disabled={!editing} onChange={(e) => setAccountStatus(e.target.value)}>
                  <option value="active">거래중</option>
                  <option value="paused">거래중지</option>
                  <option value="closed">거래종료</option>
                </FormSelect>
              </label>
              {partyType === 'individual' ? (
                <>
                  <label>
                    주민번호 {editing ? '(입력 시에만 갱신)' : ''}
                    <FormInput
                      value={editing ? residentInput : detail?.profile?.residentIdMasked ?? '—'}
                      disabled={!editing}
                      placeholder={editing ? '숫자 13자리' : undefined}
                      onChange={(e) => setResidentInput(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    이메일
                    <FormInput
                      type="email"
                      value={individualEmail}
                      disabled={!editing}
                      onChange={(e) => setIndividualEmail(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    대표자명
                    <FormInput value={businessRep} disabled={!editing} onChange={(e) => setBusinessRep(e.target.value)} />
                  </label>
                  <label>
                    상호명/사업자명
                    <FormInput value={businessName} disabled={!editing} onChange={(e) => setBusinessName(e.target.value)} />
                  </label>
                  <label>
                    사업자등록번호
                    <FormInput value={bizNo} disabled={!editing} onChange={(e) => setBizNo(e.target.value)} />
                  </label>
                  <label className="liquor-customer-form-grid--wide">
                    사업장주소
                    <FormTextarea value={businessAddress} disabled={!editing} onChange={(e) => setBusinessAddress(e.target.value)} rows={2} />
                  </label>
                  <label>
                    가게전화
                    <FormInput value={storePhone} disabled={!editing} onChange={(e) => setStorePhone(e.target.value)} />
                  </label>
                  <label>
                    업태
                    <FormInput value={businessType} disabled={!editing} onChange={(e) => setBusinessType(e.target.value)} />
                  </label>
                  <label>
                    종목
                    <FormInput value={businessItem} disabled={!editing} onChange={(e) => setBusinessItem(e.target.value)} />
                  </label>
                  <label>
                    개업일
                    <FormInput type="date" value={businessOpenedOn} disabled={!editing} onChange={(e) => setBusinessOpenedOn(e.target.value)} />
                  </label>
                  <label>
                    이메일
                    <FormInput type="email" value={businessEmail} disabled={!editing} onChange={(e) => setBusinessEmail(e.target.value)} />
                  </label>
                  <label>
                    거래 시작일
                    <FormInput type="date" value={tradeStartedOn} disabled={!editing} onChange={(e) => setTradeStartedOn(e.target.value)} />
                  </label>
                </>
              )}
              <label className="liquor-customer-form-grid--wide">
                메모
                <FormTextarea value={profileMemo} disabled={!editing} onChange={(e) => setProfileMemo(e.target.value)} rows={3} />
              </label>
            </div>
            {editing ? (
              <FormButton type="button" disabled={saving} onClick={() => void handleSaveProfile()}>
                {saving ? '저장 중…' : '주류 거래처 정보 저장'}
              </FormButton>
            ) : null}
            {!detail?.profile ? (
              <p className="liquor-customer-panel__muted">아직 주류 거래처 프로필이 없습니다. 수정 모드에서 저장하세요.</p>
            ) : (
              <p className="liquor-customer-panel__muted">
                구분: {LIQUOR_PARTY_TYPE_LABELS[detail.profile.partyType] ?? detail.profile.partyType}
                {' · '}
                상태: {LIQUOR_ACCOUNT_STATUS_LABELS[detail.profile.accountStatus ?? 'active'] ?? detail.profile.accountStatus}
                {detail.profile.residentIdMasked ? ` · 주민번호 ${detail.profile.residentIdMasked}` : ''}
              </p>
            )}
          </div>
        )
      case 'liquor_contacts':
        return (
          <LiquorCustomerContactsSection
            customerId={customer.id}
            token={token}
            contacts={detail?.contacts ?? []}
            onChanged={reload}
          />
        )
      case 'liquor_support':
        return (
          <LiquorSupportContractsSection
            customerId={customer.id}
            token={token}
            contracts={supportContracts}
            onChanged={reload}
          />
        )
      case 'liquor_repayments':
        return (
          <LiquorRepaymentsSection
            customerId={customer.id}
            token={token}
            contracts={supportContracts}
            repayments={detail?.repayments ?? []}
            onChanged={reload}
            onOpenFilesTab={() => setTab('liquor_files')}
          />
        )
      case 'liquor_items':
        return (
          <LiquorSupportItemsSection
            customerId={customer.id}
            token={token}
            items={detail?.supportItems ?? []}
            contracts={supportContracts}
            files={detail?.files ?? []}
            onChanged={reload}
            onOpenFilesTab={() => setTab('liquor_files')}
          />
        )
      case 'liquor_files':
        return (
          <LiquorCustomerFilesSection
            customerId={customer.id}
            token={token}
            files={detail?.files ?? []}
            contracts={supportContracts}
            repayments={detail?.repayments ?? []}
            supportItems={detail?.supportItems ?? []}
            onChanged={reload}
          />
        )
      case 'liquor_notes':
        return <LiquorNotesTab customerId={customer.id} token={token} notes={detail?.notes ?? []} onChanged={reload} />
      case 'liquor_signatures':
        return (
          <div className="liquor-customer-panel__section">
            <p>이 거래처에 대한 전자서명 발송·내역은 주류 전용 전자서명 메뉴에서 관리합니다.</p>
            <Link to="/liquor/signatures/send" className="liquor-customer-panel__link">
              전자서명 발송
            </Link>
            {' · '}
            <Link to="/liquor/signatures/history" className="liquor-customer-panel__link">
              발송 내역
            </Link>
          </div>
        )
      default:
        return null
    }
  }, [
    tab,
    loading,
    error,
    summary,
    partyType,
    residentInput,
    individualEmail,
    accountStatus,
    profileMemo,
    businessName,
    businessRep,
    bizNo,
    businessAddress,
    storePhone,
    businessType,
    businessItem,
    businessOpenedOn,
    businessEmail,
    tradeStartedOn,
    editing,
    saving,
    detail,
    customer.id,
    token,
    reload,
    supportContracts,
  ])

  return (
    <div className="liquor-customer-panel">
      <div className="liquor-customer-panel__tabs" role="tablist" aria-label="주류 거래처 상세">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={'liquor-customer-panel__tab' + (tab === t.id ? ' liquor-customer-panel__tab--active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="liquor-customer-panel__body" role="tabpanel">
        {tabContent}
      </div>
    </div>
  )
}

function LiquorNotesTab({
  customerId,
  token,
  notes,
  onChanged,
}: {
  customerId: number
  token: string
  notes: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  return (
    <div className="liquor-customer-panel__section">
      <ul className="liquor-customer-list">
        {notes.map((n) => (
          <li key={String(n.id)} className="liquor-customer-list__item">
            <time>{String(n.created_at ?? n.createdAt ?? '').slice(0, 16).replace('T', ' ')}</time>
            <p>{String(n.body ?? '')}</p>
          </li>
        ))}
      </ul>
      <FormTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="메모" />
      <FormButton
        type="button"
        onClick={() =>
          void createLiquorCustomerNote(token, customerId, body).then(() => {
            setBody('')
            return onChanged()
          })
        }
      >
        메모 추가
      </FormButton>
    </div>
  )
}
