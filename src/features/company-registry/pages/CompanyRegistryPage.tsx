import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { canMutateInsuranceDirectory, isInsuranceOpsRole } from '../../auth/roleGuards'
import { deleteHardCompanyMaster, fullSaveCompanyDirectory, listCompanyDirectory } from '../api/companyRegistryApi'
import {
  canonicalInsuranceCategoryForFilter,
  insuranceCategoryLabel,
  insuranceTypeSortRank,
  resolveTabCategory,
} from '../domain/categoryUtils'
import type { InsuranceCategory } from '../domain/insuranceConstants'
import { INSURANCE_TYPE_LABELS, INSURANCE_TYPE_ORDER, isInsuranceCategory } from '../domain/insuranceConstants'
import type { InsuranceCompanyOption } from '../domain/types'
import {
  buildStaticCompanyCode,
  EMPTY_CONTACT,
  findSavedEntryForSelection,
  formStateFromDirectoryEntry,
  loadCompanyData,
} from '../domain/loadCompanyData'
import type {
  CompanyDirectoryEntry,
  InsuranceCompanyContactDraft,
  InsuranceCompanyFormState,
} from '../domain/types'

const EMPTY_COMPANY_FIELDS: Omit<InsuranceCompanyFormState, 'id' | 'category' | 'name' | 'companyCode'> = {
  customerCenter: '',
  systemPhone: '',
  incallNumber: '',
  visitInfo: '',
}

export default function CompanyRegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, token, isAuthenticated } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const isOps = isAuthenticated && !!user && isInsuranceOpsRole(user.role)
  const canMutate = isOps && canMutateInsuranceDirectory(user.role)
  const readOnlyUi = isOps && !canMutate

  const [list, setList] = useState<CompanyDirectoryEntry[]>([])
  const [statusText, setStatusText] = useState('')

  const [selectedType, setSelectedType] = useState<InsuranceCategory | ''>('')
  const [selectedCompanyCode, setSelectedCompanyCode] = useState<string>('')

  const [company, setCompany] = useState<InsuranceCompanyFormState>({
    id: null,
    companyCode: '',
    category: '',
    name: '',
    ...EMPTY_COMPANY_FIELDS,
  })
  const [contacts, setContacts] = useState<InsuranceCompanyContactDraft[]>([{ ...EMPTY_CONTACT }])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  /** 목록만 갱신됐을 때 사용자가 이미 칸을 수정 중이면 폼을 덮어쓰지 않음 */
  const pendingLocalEditRef = useRef(false)

  const companyOptions = useMemo((): InsuranceCompanyOption[] => {
    if (!selectedType) {
      return []
    }
    const filterKey = canonicalInsuranceCategoryForFilter(selectedType)
    if (!filterKey || !isInsuranceCategory(filterKey)) {
      return []
    }
    const merged = list
      .filter((e) => canonicalInsuranceCategoryForFilter(e.category, e.name ?? '') === filterKey)
      .map((e) => ({
        companyCode: e.companyCode,
        name: e.name,
        tel: e.customerCenter || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return merged
  }, [selectedType, list])

  const sortedDirectoryList = useMemo(() => {
    return [...list].sort((a, b) => {
      const ra = resolveTabCategory(a.category, a.name)
      const rb = resolveTabCategory(b.category, b.name)
      const sa = insuranceTypeSortRank(ra || '')
      const sb = insuranceTypeSortRank(rb || '')
      if (sa !== sb) {
        return sa - sb
      }
      return a.name.localeCompare(b.name, 'ko')
    })
  }, [list])

  const prevSelectionRef = useRef<{ type: string; companyCode: string }>({ type: '', companyCode: '' })
  const prevListForSyncRef = useRef(list)

  /** 보험 종류·보험사 선택 — 목록 클릭·드롭다운 모두 이후 loadCompanyData 이펙트로 폼 동기화 */
  const commitDirectorySelection = useCallback((type: InsuranceCategory | '', companyCode: string) => {
    pendingLocalEditRef.current = false
    setSelectedType(type)
    setSelectedCompanyCode(companyCode)
  }, [])

  const hasDirectoryEntryForSelection = useMemo(() => {
    if (!selectedType || !selectedCompanyCode) {
      return false
    }
    return findSavedEntryForSelection(list, selectedType, selectedCompanyCode) != null
  }, [list, selectedType, selectedCompanyCode])

  const loadList = useCallback(async () => {
    if (!token) {
      return
    }
    try {
      const rows = await listCompanyDirectory(token)
      setList(rows)
      setStatusText('')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
    }
  }, [token])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    const t = searchParams.get('type')
    const code = searchParams.get('code') != null ? String(searchParams.get('code')).trim() : ''
    const legacyCompany = searchParams.get('company') != null ? String(searchParams.get('company')).trim() : ''
    if (t && isInsuranceCategory(t) && (code || legacyCompany)) {
      const resolvedCode =
        code || (legacyCompany ? buildStaticCompanyCode(t, legacyCompany) : '')
      if (resolvedCode) {
        commitDirectorySelection(t, resolvedCode)
      }
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, commitDirectorySelection])

  useEffect(() => {
    if (typeof selectedCompanyCode !== 'string') {
      return
    }

    const listIdentityChanged = prevListForSyncRef.current !== list
    prevListForSyncRef.current = list
    if (listIdentityChanged && pendingLocalEditRef.current) {
      return
    }

    const result = loadCompanyData(list, selectedType, selectedCompanyCode, prevSelectionRef.current)
    if (!result) {
      return
    }

    prevSelectionRef.current = result.prevSelection
    if (result.syncForm) {
      pendingLocalEditRef.current = false
      setCompany(result.company)
      setContacts(result.contacts)
    } else {
      const c = selectedCompanyCode.trim()
      const category = selectedType
      setCompany((prev) => {
        if (prev.companyCode === c && prev.category === category) {
          return prev
        }
        return { ...prev, companyCode: c, category }
      })
    }
  }, [list, selectedType, selectedCompanyCode])

  /**
   * 등록 목록 클릭: 분류 확정 시에는 드롭다운과 같이 선택값만 바꾸고,
   * 폼/연락처 반영은 loadCompanyData 동기화 useEffect 한 경로에서 처리합니다.
   */
  const applyDirectoryEntry = useCallback((entry: CompanyDirectoryEntry) => {
    const nameTrim = entry.name.trim()
    const cat = resolveTabCategory(entry.category, entry.name)
    if (!cat || !isInsuranceCategory(cat)) {
      const { company: loaded, contacts: nextContacts } = formStateFromDirectoryEntry(entry)
      setStatusText(
        '보험 종류를 자동 인식하지 못했습니다. 아래에서「보험 종류」를 선택하면 같은 이름의 등록 데이터와 맞춰집니다.',
      )
      commitDirectorySelection('', entry.companyCode || nameTrim)
      prevSelectionRef.current = { type: '', companyCode: entry.companyCode || nameTrim }
      setCompany({ ...loaded, name: nameTrim, companyCode: loaded.companyCode || entry.companyCode })
      setContacts(nextContacts)
      return
    }
    setStatusText('')
    commitDirectorySelection(cat, entry.companyCode)
  }, [commitDirectorySelection])

  const addContactRow = () => {
    if (readOnlyUi) {
      return
    }
    pendingLocalEditRef.current = true
    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }])
  }

  const removeContactRow = (index: number) => {
    if (readOnlyUi) {
      return
    }
    pendingLocalEditRef.current = true
    setContacts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const updateContact = (index: number, patch: Partial<InsuranceCompanyContactDraft>) => {
    if (readOnlyUi) {
      return
    }
    pendingLocalEditRef.current = true
    setContacts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const handleSave = async () => {
    if (!canMutate || !token) {
      setStatusText('연락처 저장은 GA 스태프 이상만 가능합니다.')
      return
    }
    if (!isInsuranceCategory(company.category)) {
      setStatusText('보험 종류를 선택하세요.')
      return
    }
    if (!company.name.trim()) {
      setStatusText('보험사를 선택하세요.')
      return
    }

    setIsSaving(true)
    setStatusText('')
    try {
      const body = {
        company: {
          ...(company.id != null ? { id: company.id } : {}),
          companyCode: company.companyCode.trim(),
          category: company.category,
          name: company.name.trim(),
          customerCenter: company.customerCenter.trim(),
          systemPhone: company.systemPhone.trim(),
          incallNumber: company.incallNumber.trim(),
          visitInfo: company.visitInfo.trim(),
        },
        contacts,
      }
      await fullSaveCompanyDirectory(body, token)
      window.alert('저장했습니다.')
      pendingLocalEditRef.current = false
      await loadList()
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleHardDelete = async () => {
    if (!canMutate || !token || company.id == null) {
      setStatusText('삭제는 GA 스태프 이상만 가능하며, 이미 등록된 보험사만 삭제할 수 있습니다.')
      return
    }
    const label = company.name.trim() || company.companyCode || `id ${company.id}`
    const confirmed = await confirm({
      title: '보험사 완전 삭제',
      message:
        `「${label}」보험사를 완전히 삭제할까요?\n\n` +
        '· 원수사 담당자 계정은 연결이 끊기고 비활성화됩니다.\n' +
        '· 이 보험사의 연락처·일반의뢰 행은 삭제됩니다.\n' +
        '· 소식지·업데이트 이력 등은 삭제되지 않으며, 소식지는 보험사명 스냅샷만 남습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setIsDeleting(true)
    setStatusText('')
    try {
      await deleteHardCompanyMaster(company.id, token)
      window.alert('삭제했습니다. 동일 이름으로 다시 등록할 수 있습니다.')
      pendingLocalEditRef.current = false
      await loadList()
      commitDirectorySelection('', '')
      prevSelectionRef.current = { type: '', companyCode: '' }
      setCompany({
        id: null,
        companyCode: '',
        category: '',
        name: '',
        ...EMPTY_COMPANY_FIELDS,
      })
      setContacts([{ ...EMPTY_CONTACT }])
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <main className="page page--with-back company-registry-page registry-form-touch">
      <nav className="contacts-public-auth" aria-label="이동">
        <Link className="button button--small contacts-public-auth__link" to="/insurance/contacts">
          연락처 조회
        </Link>
        <Link className="button button--small contacts-public-auth__link" to="/insurance/history">
          업데이트 현황
        </Link>
        {!isAuthenticated ? (
          <Link className="button button--small button--primary contacts-public-auth__link" to="/login">
            로그인
          </Link>
        ) : null}
      </nav>

      <header className="page-header">
        <h1>연락처 입력/관리</h1>
        <p>
          {statusText ||
            '보험 종류·보험사를 선택하면 이미 저장된 동일 보험사 데이터가 있으면 자동으로 불러옵니다. 등록된 목록은 「연락처 조회」에서 확인할 수 있습니다.'}
        </p>
      </header>

      {isOps ? (
        <section className="card company-registry-directory-card">
          <h2 className="dashboard-section-title">등록된 보험사</h2>
          <p className="company-registry-field-hint" style={{ marginTop: 0 }}>
            항목을 누르면 아래 폼에 불러옵니다. 바로 입력·저장할 수 있습니다.
          </p>
          {list.length === 0 ? (
            <p className="company-registry-muted">아직 등록된 보험사가 없습니다.</p>
          ) : (
            <ul className="company-registry-pick-list">
              {sortedDirectoryList.map((e) => {
                const tabCat = resolveTabCategory(e.category, e.name)
                const label = tabCat ? insuranceCategoryLabel(tabCat) : '분류 미정'
                return (
                  <li key={e.id}>
                    <FormButton
                      htmlType="button"
                      className="company-registry-pick-list__btn"
                      onClick={() => applyDirectoryEntry(e)}
                    >
                      <span className="company-registry-pick-list__badge">{label}</span>
                      <span className="company-registry-pick-list__name">{e.name}</span>
                    </FormButton>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {isOps ? (
        <section className="card company-registry-form-card" aria-busy={isSaving || isDeleting}>
          <h2 className="dashboard-section-title">
            {readOnlyUi ? '조회 (읽기 전용)' : '입력 · 수정 (GA_ADMIN / GA_STAFF / SUPER_ADMIN)'}
          </h2>
          {readOnlyUi ? (
            <p className="company-registry-field-hint" style={{ marginTop: 0 }}>
              변경·저장은 GA 스태프 이상만 가능합니다. 서버에서도 동일하게 차단됩니다.
            </p>
          ) : null}

          <FieldWrapper label="보험 종류 (필수)">
            <FormSelect
              className="field__control"
              value={selectedType}
              disabled={readOnlyUi}
              onChange={(e) => {
                const v = e.target.value as InsuranceCategory | ''
                commitDirectorySelection(v, '')
              }}
              required
              options={[
                { value: '', label: '선택' },
                ...INSURANCE_TYPE_ORDER.map((v) => ({ value: v, label: INSURANCE_TYPE_LABELS[v] })),
              ]}
            />
          </FieldWrapper>

          <FieldWrapper label="보험사 선택 (필수)">
            <FormSelect
              className="field__control"
              value={selectedCompanyCode}
              onChange={(e) => {
                commitDirectorySelection(selectedType, String(e.target.value ?? ''))
              }}
              disabled={readOnlyUi || !selectedType}
              required
              options={[
                { value: '', label: '선택' },
                ...companyOptions.map((row) => ({ value: row.companyCode, label: row.name })),
              ]}
            />
          </FieldWrapper>

          <FieldWrapper label="보험사명">
            <FormInput
              className="field__control"
              value={company.name}
              onChange={(e) => {
                pendingLocalEditRef.current = true
                const name = e.target.value
                setCompany((prev) => {
                  const next = { ...prev, name }
                  if (
                    prev.id == null &&
                    selectedType &&
                    isInsuranceCategory(selectedType) &&
                    name.trim()
                  ) {
                    next.companyCode = buildStaticCompanyCode(selectedType, name.trim())
                  }
                  return next
                })
              }}
              placeholder="목록에서 선택하거나 신규명을 직접 입력"
              disabled={readOnlyUi || !selectedType}
              autoComplete="organization"
            />
          </FieldWrapper>

          {hasDirectoryEntryForSelection ? (
            <p className="company-registry-field-hint" style={{ margin: '0 0 10px' }}>
              ✓ 저장된 동일 보험사 데이터를 불러왔습니다. 수정 후 저장하면 갱신됩니다.
            </p>
          ) : selectedType && selectedCompanyCode.trim() ? (
            <p className="company-registry-field-hint" style={{ margin: '0 0 10px' }}>
              ℹ 등록된 데이터가 없습니다. 공통정보·담당자는 비어 있는 상태에서 입력할 수 있습니다.
            </p>
          ) : null}

          <h3 className="company-registry-subtitle">공통정보</h3>
          <div className="field-grid-customers">
            <label className="field">
              <span className="field__label">고객센터</span>
              <FormInput
                className="field__control"
                value={company.customerCenter}
                onChange={(e) => {
                  pendingLocalEditRef.current = true
                  setCompany({ ...company, customerCenter: e.target.value })
                }}
                placeholder="고객센터 번호 (직접 입력)"
                autoComplete="tel"
                disabled={readOnlyUi}
              />
            </label>
            <label className="field">
              <span className="field__label">전산문의</span>
              <FormInput
                className="field__control"
                value={company.systemPhone}
                onChange={(e) => {
                  pendingLocalEditRef.current = true
                  setCompany({ ...company, systemPhone: e.target.value })
                }}
                disabled={readOnlyUi}
              />
            </label>
            <label className="field">
              <span className="field__label">인콜번호</span>
              <FormInput
                className="field__control"
                value={company.incallNumber}
                onChange={(e) => {
                  pendingLocalEditRef.current = true
                  setCompany({ ...company, incallNumber: e.target.value })
                }}
                disabled={readOnlyUi}
              />
            </label>
            <label className="field field--wide">
              <span className="field__label">방문일 / 카톡 / 기타</span>
              <FormInput
                className="field__control"
                value={company.visitInfo}
                onChange={(e) => {
                  pendingLocalEditRef.current = true
                  setCompany({ ...company, visitInfo: e.target.value })
                }}
                disabled={readOnlyUi}
              />
            </label>
          </div>

          <h3 className="company-registry-subtitle">담당자</h3>
          <ul className="company-registry-contact-editor-list">
            {contacts.map((row, index) => (
              <li key={index} className="company-registry-contact-editor-row">
                <FormInput
                  className="field__control"
                  placeholder="이름"
                  value={row.name}
                  disabled={readOnlyUi}
                  onChange={(e) => updateContact(index, { name: e.target.value })}
                />
                <FormInput
                  className="field__control"
                  placeholder="직책"
                  value={row.position}
                  disabled={readOnlyUi}
                  onChange={(e) => updateContact(index, { position: e.target.value })}
                />
                <FormInput
                  className="field__control"
                  placeholder="전화"
                  value={row.phone}
                  disabled={readOnlyUi}
                  onChange={(e) => updateContact(index, { phone: e.target.value })}
                />
                <FormButton
                  className="button button--small"
                  htmlType="button"
                  variant="action"
                  onClick={() => removeContactRow(index)}
                  disabled={readOnlyUi || contacts.length <= 1}
                >
                  삭제
                </FormButton>
              </li>
            ))}
          </ul>
          {!readOnlyUi ? (
            <FormButton className="button button--secondary" htmlType="button" variant="secondary" onClick={addContactRow}>
              담당자 추가
            </FormButton>
          ) : null}

          {!readOnlyUi ? (
            <FormButton
              className="button button--primary button--full"
              style={{ marginTop: 16 }}
              htmlType="button"
              variant="primary"
              disabled={isSaving || isDeleting || !selectedType || !selectedCompanyCode}
              onClick={() => void handleSave()}
              loading={isSaving}
              loadingText="저장 중…"
            >
              {company.id != null ? '수정 저장' : '신규 저장'}
            </FormButton>
          ) : null}

          {!readOnlyUi && company.id != null ? (
            <FormButton
              className="button button--full"
              style={{ marginTop: 12, borderColor: 'var(--danger, #b42318)', color: 'var(--danger, #b42318)' }}
              htmlType="button"
              variant="danger"
              disabled={isSaving || isDeleting}
              onClick={() => void handleHardDelete()}
              loading={isDeleting}
              loadingText="삭제 중…"
            >
              보험사 완전 삭제…
            </FormButton>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <p className="empty-state">
            연락처 관리 화면은 <Link to="/login">로그인</Link> 후 원수사 연락처 권한(GA 스태프 이상)이 필요합니다.{' '}
            <Link to="/insurance/contacts">연락처 조회</Link>에서 공개 탭을 볼 수 있습니다.
          </p>
        </section>
      )}

      <section className="card" style={{ marginTop: 20 }}>
        <p className="empty-state" style={{ margin: 0 }}>
          <Link to="/insurance/contacts">→ 보험사 연락처 조회 (탭)</Link>
        </p>
      </section>
      {confirmDialog}
    </main>
  )
}
