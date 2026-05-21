import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import { PageToolbar } from '../../../components/layout'
import { useAuth } from '../../auth/AuthProvider'
import { isInsuranceOpsRole } from '../../auth/roleGuards'
import {
  createInsuranceContact,
  deleteInsuranceContact,
  downloadVCardFallback,
  fetchInsuranceContactVCard,
  getInsuranceContacts,
  updateInsuranceContact,
} from '../api/contactsApi'
import type {
  InsuranceContact,
  InsuranceContactCategory,
  UpsertInsuranceContactPayload,
} from '../domain/types'
import { formatPhoneNumber, normalizePhoneNumber } from '../utils/phone'
import { openVCardInContactsApp } from '../utils/vcard'

const CATEGORY_LABELS: Record<InsuranceContactCategory, string> = {
  LIFE: '생명보험',
  NON_LIFE: '손해보험',
  GENERAL: '일반보험',
}

const CATEGORY_ORDER: InsuranceContactCategory[] = ['LIFE', 'NON_LIFE', 'GENERAL']

interface ContactFormState {
  id?: string
  category: InsuranceContactCategory
  companyName: string
  managerName: string
  position: string
  phoneNumber: string
  description: string
}

const EMPTY_FORM: ContactFormState = {
  category: 'LIFE',
  companyName: '',
  managerName: '',
  position: '',
  phoneNumber: '',
  description: '',
}

function toPayload(form: ContactFormState): UpsertInsuranceContactPayload {
  return {
    category: form.category,
    companyName: form.companyName.trim(),
    managerName: form.managerName.trim(),
    position: form.position.trim(),
    phoneNumber: normalizePhoneNumber(form.phoneNumber),
    description: form.description.trim(),
  }
}

export function ReinsurerContactsPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const isAdmin =
    isAuthenticated && !!user && isInsuranceOpsRole(user.role)
  const [contacts, setContacts] = useState<InsuranceContact[]>([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadContacts = useCallback(async () => {
    if (!token) {
      setIsLoading(false)
      return
    }
    try {
      const response = await getInsuranceContacts(token)
      setContacts(response.contacts)
      setLastUpdatedAt(response.lastUpdatedAt)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '연락처를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadContacts()
  }, [loadContacts])

  const filteredContacts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) {
      return contacts
    }
    return contacts.filter((contact) => {
      const normalizedPhone = formatPhoneNumber(contact.phoneNumber)
      return (
        contact.companyName.toLowerCase().includes(keyword) ||
        contact.managerName.toLowerCase().includes(keyword) ||
        contact.position.toLowerCase().includes(keyword) ||
        normalizedPhone.toLowerCase().includes(keyword)
      )
    })
  }, [contacts, searchText])

  const groupedContacts = useMemo(() => {
    const map: Record<InsuranceContactCategory, InsuranceContact[]> = {
      LIFE: [],
      NON_LIFE: [],
      GENERAL: [],
    }
    for (const contact of filteredContacts) {
      map[contact.category].push(contact)
    }

    for (const category of CATEGORY_ORDER) {
      map[category].sort((a, b) => {
        const companyOrder = a.companyName.localeCompare(b.companyName, 'ko-KR')
        if (companyOrder !== 0) {
          return companyOrder
        }
        return a.managerName.localeCompare(b.managerName, 'ko-KR')
      })
    }
    return map
  }, [filteredContacts])

  const handleStartEdit = (contact: InsuranceContact) => {
    setForm({
      id: contact.id,
      category: contact.category,
      companyName: contact.companyName,
      managerName: contact.managerName,
      position: contact.position,
      phoneNumber: contact.phoneNumber,
      description: '',
    })
  }

  const handleCancelEdit = () => {
    setForm(EMPTY_FORM)
  }

  const handleSubmit = async () => {
    if (!isAdmin || !token) {
      setStatusText('관리자 로그인 후 저장할 수 있습니다.')
      return
    }

    const payload = toPayload(form)
    if (!payload.companyName || !payload.managerName || !payload.phoneNumber) {
      setStatusText('보험사명, 담당자명, 전화번호를 입력하세요.')
      return
    }

    setIsSubmitting(true)
    try {
      if (form.id) {
        await updateInsuranceContact(form.id, payload, token)
        setStatusText('연락처를 수정했습니다.')
      } else {
        await createInsuranceContact(payload, token)
        setStatusText('연락처를 등록했습니다.')
      }
      setForm(EMPTY_FORM)
      await loadContacts()
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (contact: InsuranceContact) => {
    if (!isAdmin || !token) {
      setStatusText('관리자 로그인 후 삭제할 수 있습니다.')
      return
    }
    const confirmed = await confirm({
      title: '연락처 삭제',
      message: `${contact.companyName} / ${contact.managerName} 연락처를 삭제할까요?`,
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    try {
      await deleteInsuranceContact(contact.id, token, '연락처 삭제')
      if (form.id === contact.id) {
        setForm(EMPTY_FORM)
      }
      setStatusText('연락처를 삭제했습니다.')
      await loadContacts()
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    }
  }

  const handleDownloadVCard = async (contact: InsuranceContact) => {
    if (!token) {
      setStatusText('로그인이 필요합니다.')
      return
    }
    try {
      const text = await fetchInsuranceContactVCard(contact.id, token)
      openVCardInContactsApp(text)
    } catch {
      downloadVCardFallback(contact)
    }
  }

  return (
    <main className="page page--with-back contacts-page">
      <nav className="contacts-public-auth" aria-label="계정">
        <Link className="button button--small contacts-public-auth__link" to="/insurance/contacts">
          보험사 연락처 조회
        </Link>
        {isAdmin ? (
          <Link className="button button--small contacts-public-auth__link" to="/insurance/company-registry">
            연락처 입력/관리
          </Link>
        ) : null}
        {isAuthenticated ? (
          <span className="contacts-public-auth__user">{user?.username}</span>
        ) : (
          <>
            <Link className="button button--small button--primary contacts-public-auth__link" to="/login">
              로그인
            </Link>
            <Link className="button button--small contacts-public-auth__link" to="/login?signup=1">
              회원가입
            </Link>
          </>
        )}
      </nav>

      <header className="page-header contacts-header">
        <h1>원수사 연락처</h1>
        <p>
          기준일:{' '}
          {lastUpdatedAt
            ? new Date(lastUpdatedAt).toLocaleDateString('ko-KR')
            : '데이터 없음'}
        </p>
      </header>

      <PageToolbar
        search={
          <label className="contacts-search">
            <span>검색</span>
            <FormInput
              className="field__control"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="보험사명/담당자/직책/전화번호"
            />
          </label>
        }
        actions={
          <>
            <FormButton className="button" htmlType="button" variant="action" onClick={() => navigate('/insurance/history')}>
              업데이트 현황
            </FormButton>
            <FormButton className="button" htmlType="button" variant="action" onClick={() => navigate('/insurance/print')}>
              출력
            </FormButton>
            {!isAdmin ? (
              <FormButton className="button" htmlType="button" variant="action" onClick={() => navigate('/login')}>
                관리자 로그인
              </FormButton>
            ) : null}
          </>
        }
        status={<StatusMessage message={statusText} />}
      />

      {isAdmin ? (
        <section className="card contacts-admin-form">
          <h2 className="dashboard-section-title">관리자 입력</h2>
          <div className="contacts-admin-grid">
            <FieldWrapper label="구분">
              <FormSelect
                className="field__control"
                value={form.category}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    category: event.target.value as InsuranceContactCategory,
                  }))
                }
                options={[
                  { value: 'LIFE', label: '생명보험' },
                  { value: 'NON_LIFE', label: '손해보험' },
                  { value: 'GENERAL', label: '일반보험' },
                ]}
              />
            </FieldWrapper>
            <FieldWrapper label="보험사명">
              <FormInput
                className="field__control"
                value={form.companyName}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, companyName: event.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label="담당자명">
              <FormInput
                className="field__control"
                value={form.managerName}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, managerName: event.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label="직책">
              <FormInput
                className="field__control"
                value={form.position}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, position: event.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label="전화번호">
              <FormInput
                className="field__control"
                value={form.phoneNumber}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, phoneNumber: event.target.value }))
                }
                inputMode="numeric"
              />
            </FieldWrapper>
            <FieldWrapper label="변경 설명">
              <FormInput
                className="field__control"
                value={form.description}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, description: event.target.value }))
                }
              />
            </FieldWrapper>
          </div>
          <div className="contacts-admin-actions">
            <FormButton className="button button--primary" htmlType="button" variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {form.id ? '수정 저장' : '신규 등록'}
            </FormButton>
            {form.id ? (
              <FormButton className="button" htmlType="button" variant="action" onClick={handleCancelEdit} disabled={isSubmitting}>
                취소
              </FormButton>
            ) : null}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="card">
          <p className="dashboard-empty">연락처를 불러오는 중입니다...</p>
        </section>
      ) : (
        CATEGORY_ORDER.map((category) => (
          <section key={category} className="card contacts-section">
            <h2 className="dashboard-section-title">{CATEGORY_LABELS[category]}</h2>
            {groupedContacts[category].length === 0 ? (
              <div className="empty-box" role="status">
                📭 등록된 연락처가 없습니다
                <br />
                담당자에게 등록 요청하세요
              </div>
            ) : (
              <ul className="contacts-card-list">
                {groupedContacts[category].map((contact) => (
                  <li key={contact.id} className="contacts-card">
                    <p className="contacts-company">{contact.companyName}</p>
                    <p className="contacts-manager">
                      {contact.managerName} {contact.position ? `(${contact.position})` : ''}
                    </p>
                    <p className="contacts-phone">{formatPhoneNumber(contact.phoneNumber)}</p>
                    <div className="contacts-card-actions">
                      <a className="button button--full" href={`tel:${normalizePhoneNumber(contact.phoneNumber)}`}>
                        전화걸기
                      </a>
                      <FormButton className="button button--full" htmlType="button" variant="action" onClick={() => void handleDownloadVCard(contact)}>
                        연락처저장
                      </FormButton>
                      {isAdmin ? (
                        <>
                          <FormButton className="button button--full" htmlType="button" variant="action" onClick={() => handleStartEdit(contact)}>
                            수정
                          </FormButton>
                          <FormButton className="button button--secondary button--full" htmlType="button" variant="secondary" onClick={() => void handleDelete(contact)}>
                            삭제
                          </FormButton>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
      {confirmDialog}
    </main>
  )
}
