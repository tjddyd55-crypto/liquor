import { FormButton, FormInput, FormSelect } from '../../../components/form'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canMutateInsuranceDirectory, isInsuranceOpsRole } from '../../auth/roleGuards'
import { listCompanyDirectory, saveGeneralRequest } from '../api/companyRegistryApi'
import { canonicalInsuranceCategoryForFilter } from '../domain/categoryUtils'
import type { InsuranceCategory } from '../domain/insuranceConstants'
import { INSURANCE_TYPE_LABELS, INSURANCE_TYPE_ORDER, isInsuranceCategory } from '../domain/insuranceConstants'
import type { CompanyDirectoryEntry, InsuranceCompanyOption, InsuranceGeneralDraft } from '../domain/types'

const EMPTY_GENERAL: InsuranceGeneralDraft = { description: '', phone: '', fax: '', email: '' }

export default function GeneralRequestPage() {
  const { user, token, isAuthenticated } = useAuth()
  const isOps = isAuthenticated && !!user && isInsuranceOpsRole(user.role)
  const canMutate = isOps && canMutateInsuranceDirectory(user.role)
  const readOnlyUi = isOps && !canMutate

  const [list, setList] = useState<CompanyDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  const [selectedType, setSelectedType] = useState<InsuranceCategory | ''>('')
  const [selectedCompanyCode, setSelectedCompanyCode] = useState('')
  const [general, setGeneral] = useState<InsuranceGeneralDraft>({ ...EMPTY_GENERAL })
  const [isSaving, setIsSaving] = useState(false)

  const companyOptions = useMemo((): InsuranceCompanyOption[] => {
    if (!selectedType || !isInsuranceCategory(selectedType)) {
      return []
    }
    const filterKey = canonicalInsuranceCategoryForFilter(selectedType)
    if (!filterKey) {
      return []
    }
    const merged = list
      .filter((e) => canonicalInsuranceCategoryForFilter(e.category, e.name) === filterKey)
      .map((e) => ({
        companyCode: e.companyCode,
        name: e.name,
        tel: e.customerCenter || '',
      }))
    merged.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return merged
  }, [selectedType, list])

  const loadList = useCallback(async () => {
    if (!token) {
      setIsLoading(false)
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

  useEffect(() => {
    if (!selectedType || !selectedCompanyCode) {
      setGeneral({ ...EMPTY_GENERAL })
      return
    }
    const entry = list.find((e) => e.companyCode === selectedCompanyCode)
    const g = entry?.general
    if (g) {
      setGeneral({
        description: g.description ?? '',
        phone: g.phone ?? '',
        fax: g.fax ?? '',
        email: g.email ?? '',
      })
    } else {
      setGeneral({ ...EMPTY_GENERAL })
    }
  }, [list, selectedType, selectedCompanyCode])

  const handleSave = async () => {
    if (!canMutate || !token) {
      setStatusText('저장은 GA 관리자 이상만 가능합니다.')
      return
    }
    if (!selectedType || !selectedCompanyCode.trim()) {
      setStatusText('보험 종류와 보험사를 선택하세요.')
      return
    }
    if (!/^INS\d+$/.test(selectedCompanyCode.trim())) {
      setStatusText('일반화재 설계의뢰는 먼저 「연락처 입력/관리」에서 해당 보험사를 저장해 코드(INS…)를 받은 뒤 선택해 주세요.')
      return
    }

    const row = list.find((e) => e.companyCode === selectedCompanyCode.trim())

    setIsSaving(true)
    setStatusText('')
    try {
      await saveGeneralRequest(
        {
          company: {
            category: selectedType,
            name: row?.name.trim() ?? '',
            companyCode: selectedCompanyCode.trim(),
          },
          general,
        },
        token,
      )
      window.alert('일반화재 설계의뢰 정보를 저장했습니다.')
      await loadList()
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="page page--with-back company-registry-page">
      <nav className="contacts-public-auth" aria-label="이동">
        {isOps ? (
          <Link className="button button--small contacts-public-auth__link" to="/insurance/company-registry">
            연락처 입력/관리
          </Link>
        ) : null}
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
        <h1>일반화재 설계의뢰</h1>
        <p>
          {statusText ||
            '저장에는 보험사 코드(INS…)가 필요합니다. 미등록 항목은 먼저 연락처 관리에서 저장하세요.'}
        </p>
      </header>

      {isLoading ? (
        <p>불러오는 중…</p>
      ) : isOps ? (
        <section className="card company-registry-form-card">
          {readOnlyUi ? (
            <p className="company-registry-field-hint" style={{ marginTop: 0 }}>
              GA_STAFF는 <strong>읽기 전용</strong>입니다. 저장은 GA 관리자 이상만 가능합니다.
            </p>
          ) : null}
          <label className="field">
            <span className="field__label">보험 종류</span>
            <FormSelect
              className="field__control"
              value={selectedType}
              disabled={readOnlyUi}
              onChange={(e) => {
                setSelectedType(e.target.value as InsuranceCategory | '')
                setSelectedCompanyCode('')
              }}
              options={[
                { value: '', label: '선택' },
                ...INSURANCE_TYPE_ORDER.map((v) => ({ value: v, label: INSURANCE_TYPE_LABELS[v] })),
              ]}
            />
          </label>
          <label className="field">
            <span className="field__label">보험사</span>
            <FormSelect
              className="field__control"
              value={selectedCompanyCode}
              onChange={(e) => setSelectedCompanyCode(String(e.target.value ?? ''))}
              disabled={readOnlyUi || !selectedType}
              options={[
                { value: '', label: '선택' },
                ...companyOptions.map((row) => ({
                  value: row.companyCode,
                  label: `${row.name}${!/^INS\d+$/.test(row.companyCode) ? ' (등록 후 저장 필요)' : ''}`,
                })),
              ]}
            />
          </label>

          <h3 className="company-registry-subtitle">의뢰 연락처 (선택)</h3>
          <div className="field-grid-customers">
            <label className="field field--wide">
              <span className="field__label">설명</span>
              <FormInput
                className="field__control"
                value={general.description}
                disabled={readOnlyUi}
                onChange={(e) => setGeneral({ ...general, description: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">전화</span>
              <FormInput
                className="field__control"
                value={general.phone}
                disabled={readOnlyUi}
                onChange={(e) => setGeneral({ ...general, phone: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">팩스</span>
              <FormInput
                className="field__control"
                value={general.fax}
                disabled={readOnlyUi}
                onChange={(e) => setGeneral({ ...general, fax: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">이메일</span>
              <FormInput
                className="field__control"
                value={general.email}
                disabled={readOnlyUi}
                onChange={(e) => setGeneral({ ...general, email: e.target.value })}
              />
            </label>
          </div>

          {!readOnlyUi ? (
            <FormButton
              className="button button--primary button--full"
              htmlType="button"
              disabled={isSaving || !selectedType || !selectedCompanyCode}
              onClick={() => void handleSave()}
            >
              {isSaving ? '저장 중…' : '저장'}
            </FormButton>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <p className="empty-state">
            저장은 <Link to="/login">로그인</Link> 후 GA 관리자(GA_ADMIN) 이상 권한이 필요합니다.
          </p>
        </section>
      )}
    </main>
  )
}
