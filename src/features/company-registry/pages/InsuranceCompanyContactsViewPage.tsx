import { FormButton, FormInput } from '../../../components/form'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canMutateInsuranceDirectory, isInsuranceOpsRole } from '../../auth/roleGuards'
import { listCompanyDirectory } from '../api/companyRegistryApi'
import { resolveTabCategory } from '../domain/categoryUtils'
import {
  INSURANCE_TYPE_ORDER,
  isInsuranceCategory,
  type InsuranceCategory,
} from '../domain/insuranceConstants'
import { CompanyCard } from '../components/CompanyCard'
import type { CompanyDirectoryEntry } from '../domain/types'

const TAB_SHORT_LABEL: Record<InsuranceCategory, string> = {
  LIFE: '생명',
  NON_LIFE: '손해',
  GENERAL: '일반',
}

const TAB_TITLE: Record<InsuranceCategory, string> = {
  LIFE: '생명보험',
  NON_LIFE: '손해보험',
  GENERAL: '일반보험',
}

function categoryForCompanyRow(row: CompanyDirectoryEntry, fallbackTab: InsuranceCategory): InsuranceCategory {
  const n = resolveTabCategory(row.category, row.name)
  if (n && isInsuranceCategory(n)) {
    return n
  }
  return fallbackTab
}

export default function InsuranceCompanyContactsViewPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuth()
  const isStaff = isAuthenticated && !!user && isInsuranceOpsRole(user.role)
  const canEditFromCard = !!user && canMutateInsuranceDirectory(user.role)

  const [activeTab, setActiveTab] = useState<InsuranceCategory>('LIFE')
  const [keyword, setKeyword] = useState('')
  const [list, setList] = useState<CompanyDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  const loadList = useCallback(async () => {
    if (!token) {
      return
    }
    setIsLoading(true)
    try {
      const rows = await listCompanyDirectory(token)
      setList(rows)
      setStatusText('')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filteredList = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const byTab = list
      .filter((item) => {
        const tab = resolveTabCategory(item.category, item.name)
        if (tab) {
          return tab === activeTab
        }
        // DB 분류 없음·맵에도 없음 → 생명 탭에만 표시(누락 방지). 관리 화면에서 종류 지정 권장.
        return activeTab === 'LIFE'
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

    if (!q) {
      return byTab
    }
    return byTab.filter((c) => {
      if (c.name.toLowerCase().includes(q)) {
        return true
      }
      if (
        (c.customerCenter && c.customerCenter.toLowerCase().includes(q)) ||
        (c.systemPhone && c.systemPhone.includes(q)) ||
        (c.incallNumber && c.incallNumber.includes(q))
      ) {
        return true
      }
      return (
        c.contacts?.some(
          (p) =>
            (p.name ?? '').toLowerCase().includes(q) ||
            (p.position ?? '').toLowerCase().includes(q) ||
            (p.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')),
        ) ?? false
      )
    })
  }, [list, activeTab, keyword])

  const openCompanyRegistryEdit = (row: CompanyDirectoryEntry) => {
    const cat = categoryForCompanyRow(row, activeTab)
    navigate(
      `/insurance/company-registry?type=${encodeURIComponent(cat)}&code=${encodeURIComponent(row.companyCode)}`,
    )
  }

  return (
    <main className="page page--with-back company-registry-page insurance-contacts-view company-directory-read-ui">
      <nav className="contacts-public-auth contacts-public-auth--compact" aria-label="이동">
        {isStaff ? (
          <Link
            className="button button--small contacts-public-auth__link touch-nav-btn"
            to="/insurance/company-registry"
          >
            관리
          </Link>
        ) : null}
        {!isAuthenticated ? (
          <Link className="button button--small button--primary contacts-public-auth__link touch-nav-btn" to="/login">
            로그인
          </Link>
        ) : null}
      </nav>

      <header className="page-header insurance-contacts-header contact-header">
        <div className="contact-header__row">
          <h1>원수사 연락처</h1>
          {!isStaff ? (
            <FormButton
              htmlType="button"
              className="update-btn"
              onClick={() => navigate('/updates')}
            >
              업데이트 현황
            </FormButton>
          ) : null}
        </div>
        {statusText ? <p className="insurance-contacts-status">{statusText}</p> : null}
      </header>

      <div className="tabs" role="tablist" aria-label="보험 종류">
        {INSURANCE_TYPE_ORDER.map((tab) => (
          <FormButton
            key={tab}
            htmlType="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            title={TAB_TITLE[tab]}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_SHORT_LABEL[tab]}
          </FormButton>
        ))}
      </div>

      <label className="insurance-contacts-search">
        <span className="visually-hidden">검색</span>
        <FormInput
          className="insurance-contacts-search__input"
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="보험사 또는 담당자 검색 (선택)"
          enterKeyHint="search"
        />
      </label>

      <section className="insurance-contacts-list-wrap" aria-live="polite">
        {isLoading ? (
          <p className="insurance-contacts-loading">불러오는 중…</p>
        ) : filteredList.length === 0 ? (
          <div className="empty-box insurance-contacts-empty" role="status">
            {keyword.trim() ? (
              '검색 결과가 없습니다.'
            ) : (
              <>
                📭 이 분류에 등록된 보험사가 없습니다.
                <br />
                담당자에게 등록 요청하세요
              </>
            )}
          </div>
        ) : (
          <div className="insurance-contacts-cards">
            {filteredList.map((c) => (
              <CompanyCard
                key={c.id}
                variant="directory"
                entry={c}
                showEditButton={canEditFromCard}
                onEdit={openCompanyRegistryEdit}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="insurance-contacts-footer-links">
        <Link to="/insurance/history">업데이트 현황</Link>
      </footer>
    </main>
  )
}
