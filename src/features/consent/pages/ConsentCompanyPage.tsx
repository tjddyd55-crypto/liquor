import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { useAuth } from '../../auth/AuthProvider'
import { apiRequest } from '../../../lib/apiClient'
import { CompanyList } from '../components/CompanyList'
import { consentTemplatesByCompanyId } from '../domain/consentTemplateRegistry'
import { MOCK_LIFE_INSURERS, MOCK_NON_LIFE_INSURERS } from '../domain/mockCompanies'
import type { ConsentCompanyItem } from '../domain/types'
import '../consent.css'

interface ConsentTemplateRow {
  id: string
  insurance_company_id: string
}

export function ConsentCompanyPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const gaId = user?.gaId
  const [templates, setTemplates] = useState<ConsentTemplateRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token?.trim() || gaId == null) {
      return
    }
    try {
      const rows = await apiRequest<ConsentTemplateRow[]>('/api/consent/templates', {
        method: 'GET',
        token,
      })
      setLoadError(null)
      setTemplates(rows)
    } catch (e) {
      setTemplates([])
      setLoadError(e instanceof ApiError ? e.message : '템플릿 목록을 불러오지 못했습니다.')
    }
  }, [token, gaId])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const byCompany = useMemo(() => consentTemplatesByCompanyId(templates), [templates])

  const handleSelect = (item: ConsentCompanyItem) => {
    if (gaId == null) {
      return
    }
    const consentTemplateId = byCompany.get(item.id)
    if (!consentTemplateId) {
      setLoadError(`이 보험사(${item.name})에 대한 동의서 템플릿이 아직 등록되지 않았습니다.`)
      return
    }
    navigate('/internal/consent/form', {
      state: {
        gaId,
        insuranceCompanyId: item.id,
        insuranceCompanyName: item.name,
        consentTemplateId,
      },
    })
  }

  if (gaId == null) {
    return (
      <main className="consent-flow">
        <div className="consent-flow__inner">
          <p>로그인 세션에 GA 정보가 없습니다. 다시 로그인해 주세요.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="consent-flow">
      <div className="consent-flow__inner">
        <h1 className="consent-flow__title">보험사 선택</h1>
        <p className="consent-flow__ga-context">
          GA · <strong>#{gaId}</strong>
          {loadError ? (
            <span style={{ display: 'block', color: 'var(--consent-err, #c00)', marginTop: 8 }}>
              {loadError}
            </span>
          ) : null}
        </p>
        <div className="consent-company-columns">
          <div className="consent-company-column">
            <CompanyList title="생명보험사" companies={MOCK_LIFE_INSURERS} onSelect={handleSelect} />
          </div>
          <div className="consent-company-column">
            <CompanyList title="손해보험사" companies={MOCK_NON_LIFE_INSURERS} onSelect={handleSelect} />
          </div>
        </div>
      </div>
    </main>
  )
}
