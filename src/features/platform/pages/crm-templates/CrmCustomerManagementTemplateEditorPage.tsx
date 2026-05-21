import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import type { CustomerEditFormState } from '../../../customers/types/customerEditForm'

import {
  customerIndustryTemplateToDraft,
  draftToPreviewIndustryTemplate,
  draftToSaveBody,
  emptyDraft,
} from './builder/crmTemplateBuilder.converters'
import { normalizeCrmTemplateDraftKeys } from './builder/crmTemplateFieldKeyAuto'
import { validateCrmTemplateDraft } from './builder/crmTemplateBuilder.validation'
import {
  applyNationalIdCoreFieldModeToDraft,
  createDefaultCustomerFormFields,
  inferNationalIdCoreFieldMode,
  type NationalIdCoreFieldMode,
} from './builder/crmTemplateDefaultCustomerFields'
import { mockCustomerRecordFromPreviewBinder } from './builder/mockCustomerForCrmTemplatePreview'
import CrmTemplateBuilderTabPanels from './builder/CrmTemplateBuilderTabPanels'
import type { CrmTemplateLifecycleStatus } from './builder/crmTemplateBuilder.constants'
import type { CrmTemplateBuilderTabId, CrmTemplateDraft, CrmTemplateValidationIssue } from './builder/crmTemplateBuilder.types'

import {
  fetchCrmCustomerManagementTemplate,
  listPlatformIndustriesSimple,
  createCrmCustomerManagementTemplate,
  updateCrmCustomerManagementTemplate,
} from '../../api/crmCustomerManagementTemplatesApi'

function buildPreviewBinder(): CustomerEditFormState {
  return {
    name: '미리보기 고객',
    gender: null,
    ssn: '',
    phone: '010-1111-2222',
    carrier: '',
    birthDate: '1990-01-15',
    address: '서울시 강남구',
    addressDetail: '미리보기',
    zonecode: '',
    height: '',
    weight: '',
    job: '',
    isDriver: null,
    carType: '',
    medical: '',
    insuranceHistory: '',
    cars: [],
    crmExtensionFields: {},
  }
}

function firstTabWithIssues(issues: { tab: CrmTemplateBuilderTabId }[]): CrmTemplateBuilderTabId {
  const order: CrmTemplateBuilderTabId[] = ['basic', 'form', 'list', 'detail']
  for (const t of order) {
    if (issues.some((i) => i.tab === t)) return t
  }
  return 'basic'
}

export default function CrmCustomerManagementTemplateEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  /** `/crm-customer-management-templates/new` 에는 `:id` 세그먼트가 없음 */
  const isNew = id === 'new' || /\/crm-customer-management-templates\/new\/?$/.test(pathname)

  const { token } = useAuth()
  const [nationalIdMode, setNationalIdMode] = useState<NationalIdCoreFieldMode>('birthDateSix')
  const [name, setName] = useState('')
  const [industryCode, setIndustryCode] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CrmTemplateLifecycleStatus>('draft')
  const [draft, setDraft] = useState<CrmTemplateDraft>(() =>
    isNew ? { ...emptyDraft(), formFields: createDefaultCustomerFormFields('birthDateSix') } : emptyDraft(),
  )
  const [industries, setIndustries] = useState<{ id: number; code: string; name: string }[]>([])
  const [statusText, setStatusText] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState<CrmTemplateBuilderTabId>('basic')
  const [validationIssues, setValidationIssues] = useState<CrmTemplateValidationIssue[]>([])

  const [revision, setRevision] = useState<number | null>(null)
  const [previewMeta, setPreviewMeta] = useState<{
    templateId: string
    version: string
    dynamicTemplateDbId?: number
    templateStatus?: string
  } | null>(null)

  const [previewBinder, setPreviewBinder] = useState<CustomerEditFormState>(() => buildPreviewBinder())

  useEffect(() => {
    if (isNew) {
      setStatus('draft')
    }
  }, [isNew])

  useEffect(() => {
    if (!token?.trim()) return
    void listPlatformIndustriesSimple(token).then(setIndustries).catch(() => setIndustries([]))
  }, [token])

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      setRevision(null)
      setPreviewMeta({ templateId: 'preview:new', version: '0' })
    }
  }, [isNew])

  useEffect(() => {
    if (isNew || !token?.trim()) return
    const nid = Number(id)
    if (!Number.isInteger(nid) || nid < 1) {
      setStatusText('잘못된 id')
      setLoading(false)
      return
    }
    setLoading(true)
    void fetchCrmCustomerManagementTemplate(token, nid)
      .then(({ row, resolved }) => {
        setName(String(row.name ?? ''))
        setIndustryCode(String(row.industry_code ?? '').toLowerCase())
        setDescription(String(row.description ?? ''))
        const stRaw = String(row.status ?? 'active').trim().toLowerCase()
        setStatus(
          stRaw === 'archived' ? 'archived' : stRaw === 'draft' ? 'draft' : 'active',
        )
        const loadedDraft = customerIndustryTemplateToDraft(resolved)
        setDraft(loadedDraft)
        setNationalIdMode(inferNationalIdCoreFieldMode(loadedDraft.formFields))
        const rev = typeof row.revision === 'number' ? row.revision : Number(row.revision)
        setRevision(Number.isFinite(rev) ? rev : 1)
        setPreviewMeta({
          templateId: resolved.meta.templateId,
          version: resolved.meta.version,
          dynamicTemplateDbId: resolved.meta.dynamicTemplateDbId,
          templateStatus: resolved.meta.status,
        })
        setValidationIssues([])
        setStatusText(null)
      })
      .catch((e: unknown) =>
        setStatusText(e instanceof Error ? e.message : '불러오기에 실패했습니다.'),
      )
      .finally(() => setLoading(false))
  }, [id, isNew, token])

  const previewDraft = useMemo(
    () => normalizeCrmTemplateDraftKeys(draft, industryCode.trim().toLowerCase()),
    [draft, industryCode],
  )

  const previewTemplate = useMemo(() => {
    const ic = industryCode.trim().toLowerCase()
    if (!ic) return null
    return draftToPreviewIndustryTemplate(previewDraft, ic, {
      templateId: previewMeta?.templateId ?? 'preview',
      version: previewMeta?.version ?? 'preview',
      dynamicTemplateDbId: previewMeta?.dynamicTemplateDbId,
      status: previewMeta?.templateStatus,
    })
  }, [previewDraft, industryCode, previewMeta])

  const serializedPayloadPreview = useMemo(() => {
    try {
      return JSON.stringify(
        draftToSaveBody({
          name: name.trim() || '(이름 없음)',
          industry_code: industryCode.trim().toLowerCase() || 'unknown',
          description,
          status,
          draft,
        }),
        null,
        2,
      )
    } catch {
      return '{}'
    }
  }, [name, industryCode, description, status, draft])

  const mockCustomer = useMemo(() => mockCustomerRecordFromPreviewBinder(previewBinder), [previewBinder])

  const onSave = useCallback(async () => {
    setStatusText(null)
    if (!token?.trim()) {
      setStatusText('로그인이 필요합니다.')
      return
    }

    const normalizedDraft = normalizeCrmTemplateDraftKeys(draft, industryCode.trim().toLowerCase())
    const issues = validateCrmTemplateDraft({ name, industryCode, status, draft: normalizedDraft })
    if (issues.length > 0) {
      setValidationIssues(issues)
      setActiveTab(firstTabWithIssues(issues))
      setStatusText('입력을 확인해 주세요. 해당 탭에 오류가 표시됩니다.')
      return
    }
    setValidationIssues([])
    if (JSON.stringify(normalizedDraft) !== JSON.stringify(draft)) {
      setDraft(normalizedDraft)
    }

    const payload = draftToSaveBody({
      name,
      industry_code: industryCode,
      description,
      status,
      draft: normalizedDraft,
    })

    try {
      if (isNew) {
        await createCrmCustomerManagementTemplate(token, payload)
        setStatusText('저장했습니다. 목록으로 이동합니다.')
        navigate('/admin/platform/crm-customer-management-templates')
        return
      }
      const nid = Number(id)
      const out = await updateCrmCustomerManagementTemplate(token, nid, payload)
      const row = out.row
      if (row && typeof row.revision === 'number') {
        setRevision(row.revision)
      } else if (row && row.revision != null) {
        const r = Number(row.revision)
        if (Number.isFinite(r)) setRevision(r)
      }
      if (out.resolved) {
        setPreviewMeta({
          templateId: out.resolved.meta.templateId,
          version: out.resolved.meta.version,
          dynamicTemplateDbId: out.resolved.meta.dynamicTemplateDbId,
          templateStatus: out.resolved.meta.status,
        })
      }
      setStatusText('저장했습니다.')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setActiveTab('basic')
        setStatusText(e.message)
        return
      }
      const msg = e instanceof Error ? e.message : '저장에 실패했습니다.'
      setStatusText(msg)
      if (/400|fieldKey|options|form_fields|industry/i.test(msg)) {
        setActiveTab('form')
      }
    }
  }, [description, draft, id, industryCode, isNew, name, navigate, status, token])

  const title = isNew ? '동적 템플릿 — 신규' : `동적 템플릿 — ${id}`

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform/crm-customer-management-templates" className="platform-admin-page__back">
          ← 동적 템플릿 목록
        </Link>
        <button
          type="button"
          className="filter-button filter-button--workspace-active ml-auto"
          disabled={loading}
          onClick={() => void onSave()}
        >
          저장
        </button>
      </div>
      <main className="page platform-admin-page platform-admin-page--pc page--with-back crm-template-builder-page">
        <header className="platform-admin-page__head">
          <h1 className="platform-admin-page__title">{title}</h1>
          <p className="platform-admin-page__lede">
            버튼·입력만으로 폼·목록·상세 탭을 구성합니다. JSON 수정은 선택 사항입니다(기본 정보 탭 고급).
          </p>
        </header>
        {loading ? <p className="platform-admin-page__muted">불러오는 중…</p> : null}
        {statusText ? (
          <p
            className={
              statusText.includes('저장했습니다')
                ? 'platform-admin-page__panel platform-admin-page__panel--success mb-4'
                : 'platform-admin-page__panel platform-admin-page__panel--warn mb-4'
            }
          >
            {statusText}
          </p>
        ) : null}

        <CrmTemplateBuilderTabPanels
          industries={industries}
          name={name}
          setName={setName}
          industryCode={industryCode}
          setIndustryCode={setIndustryCode}
          description={description}
          setDescription={setDescription}
          status={status}
          setStatus={setStatus}
          revision={revision}
          draft={draft}
          setDraft={setDraft}
          previewDraft={previewDraft}
          previewTemplate={previewTemplate}
          previewBinder={previewBinder}
          setPreviewBinder={setPreviewBinder}
          mockCustomer={mockCustomer}
          validationIssues={validationIssues}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          serializedPayloadPreview={serializedPayloadPreview}
          onClearValidationIssues={() => {
            setValidationIssues([])
            setStatusText(null)
          }}
          isNewTemplate={isNew}
          nationalIdMode={nationalIdMode}
          setNationalIdMode={setNationalIdMode}
          onNationalIdModeUserSelect={(mode) => {
            setNationalIdMode(mode)
            setDraft((prev) => applyNationalIdCoreFieldModeToDraft(prev, mode))
          }}
        />

      </main>
    </>
  )
}