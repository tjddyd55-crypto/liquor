import { useCallback, useEffect, useMemo, useState } from 'react'
import FormButton from '../../../../components/form/FormButton'
import FormSelect, { type FormSelectOption } from '../../../../components/form/FormSelect'
import { ApiError } from '../../../../lib/apiClient'
import { coercePositiveIntId } from '../../../../lib/numericIds'
import {
  listCrmCustomerManagementTemplates,
  patchTenantCrmCustomerTemplate,
} from '../../api/crmCustomerManagementTemplatesApi'
import { industryAllowsDynamicCrmCustomerTemplates } from '../../config/crmDynamicTemplatePolicy'
import type { PlatformTenantRow } from '../../platformAdmin.types'

function isTemplateActive(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === 'active'
}

export type IndustryTenantCrmTemplateSectionProps = {
  variant: 'pc' | 'mobile'
  token: string | null
  selectedTenant: PlatformTenantRow
  refetchTenants: () => void | Promise<void>
}

export function IndustryTenantCrmTemplateSection({
  variant,
  token,
  selectedTenant,
  refetchTenants,
}: IndustryTenantCrmTemplateSectionProps) {
  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId =
    variant === 'pc' ? 'platform-tenant-crm-template-heading' : 'm-platform-tenant-crm-template'

  const industryCodeLower = (selectedTenant.industryCode?.trim() ?? '').toLowerCase()

  const savedId = coercePositiveIntId(selectedTenant.crmCustomerTemplateId ?? null)

  const allowDynamic = industryAllowsDynamicCrmCustomerTemplates(industryCodeLower)

  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [templateRows, setTemplateRows] = useState<
    Awaited<ReturnType<typeof listCrmCustomerManagementTemplates>>
  >([])

  const [draftId, setDraftId] = useState<number | null>(savedId)

  const [saving, setSaving] = useState(false)
  const [feedbackOk, setFeedbackOk] = useState<string | null>(null)
  const [feedbackErr, setFeedbackErr] = useState<string | null>(null)

  useEffect(() => {
    setDraftId(coercePositiveIntId(selectedTenant.crmCustomerTemplateId ?? null))
  }, [selectedTenant.id, selectedTenant.crmCustomerTemplateId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token || !industryCodeLower) {
        setTemplateRows([])
        return
      }
      setTemplatesLoading(true)
      setTemplatesError(null)
      try {
        const rows = await listCrmCustomerManagementTemplates(token, industryCodeLower)
        if (!cancelled) setTemplateRows(rows)
      } catch (e) {
        if (!cancelled) {
          setTemplatesError(e instanceof ApiError ? e.message : '템플릿 목록을 불러오지 못했습니다.')
          setTemplateRows([])
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token, industryCodeLower])

  useEffect(() => {
    setFeedbackOk(null)
    setFeedbackErr(null)
  }, [selectedTenant.id, industryCodeLower])

  const currentRow = useMemo(() => {
    if (savedId == null) return null
    return templateRows.find((r) => coercePositiveIntId(r.id) === savedId) ?? null
  }, [savedId, templateRows])

  const isSavedArchived =
    savedId != null && (!currentRow || !isTemplateActive(currentRow.status))

  const activeTemplates = useMemo(
    () => templateRows.filter((r) => isTemplateActive(r.status)),
    [templateRows],
  )

  const selectOptions: FormSelectOption[] = useMemo(() => {
    const head: FormSelectOption[] = [{ value: '', label: '미지정 (업종 활성 템플릿)' }]
    const rest = activeTemplates.map((r) => ({
      value: String(r.id),
      label: `${r.name} (#${r.id})`,
    }))
    return [...head, ...rest]
  }, [activeTemplates])

  const selectValue = useMemo(() => {
    if (draftId == null) return ''
    if (!activeTemplates.some((t) => coercePositiveIntId(t.id) === draftId)) return ''
    return String(draftId)
  }, [draftId, activeTemplates])

  const dirty = draftId !== savedId

  const applyPatch = useCallback(
    async (next: number | null) => {
      if (!token) {
        setFeedbackErr('로그인이 필요합니다.')
        return
      }
      const tid = Number(selectedTenant.id)
      if (!Number.isInteger(tid) || tid < 1) {
        setFeedbackErr('테넌트 id가 올바르지 않습니다.')
        return
      }
      setSaving(true)
      setFeedbackOk(null)
      setFeedbackErr(null)
      try {
        await patchTenantCrmCustomerTemplate(token, tid, next)
        setFeedbackOk(next == null ? '연결을 해제했습니다.' : '고객 관리 템플릿을 저장했습니다.')
        await refetchTenants()
      } catch (e) {
        setFeedbackErr(e instanceof ApiError ? e.message : '저장에 실패했습니다.')
      } finally {
        setSaving(false)
      }
    },
    [token, selectedTenant.id, refetchTenants],
  )

  const handleSelectChange = (v: string) => {
    setFeedbackOk(null)
    setFeedbackErr(null)
    if (!v) {
      setDraftId(null)
      return
    }
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) setDraftId(n)
  }

  return (
    <section className="platform-admin-page__crm-template" aria-labelledby={titleId}>
      <h3 id={titleId} className={titleClass}>
        고객 관리 템플릿
      </h3>
      <p className="platform-admin-page__muted">
        이 테넌트에서 사용할 고객 관리 템플릿을 선택합니다. 미지정 시 업종 기본 템플릿이 사용됩니다.
      </p>
      <p className="platform-admin-page__muted">
        적용 우선순위: Tenant 지정 템플릿(동적, 활성) &gt; 업종 활성 템플릿 &gt; 정적 기본 템플릿
      </p>

      {!industryCodeLower ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>tenant.industryCode를 알 수 없어 템플릿 목록을 불러올 수 없습니다.</p>
        </div>
      ) : null}

      <dl className="platform-admin-page__dl">
        <dt>industryCode</dt>
        <dd className="platform-admin-page__mono">{industryCodeLower || '—'}</dd>
        <dt>crmCustomerTemplateId</dt>
        <dd className="platform-admin-page__mono">{savedId != null ? String(savedId) : '미지정'}</dd>
      </dl>

      {allowDynamic ? null : (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>
            보험(insurance) 테넌트는 로그인·세션 bootstrap에서 동적 고객 관리 템플릿을 적용하지 않습니다. 기존 정적 보험
            고객 화면이 유지됩니다. DB에 연결 id를 저장하거나 해제할 수는 있습니다.
          </p>
        </div>
      )}

      {templatesError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{templatesError}</p>
        </div>
      ) : null}

      {industryCodeLower && templatesLoading ? (
        <p className="platform-admin-page__muted">템플릿 목록을 불러오는 중…</p>
      ) : null}

      {isSavedArchived ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>
            현재 연결된 템플릿은 비활성(보관) 상태입니다. 세션에서는 활성 템플릿으로 대체될 수 있습니다. 다른 활성
            템플릿을 선택하거나 연결을 해제해 주세요.
            {currentRow ? ` (${String(currentRow.name)})` : ''}
          </p>
        </div>
      ) : null}

      {allowDynamic && industryCodeLower ? (
        <>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={`${titleId}-select`}>
              템플릿 선택
            </label>
            <FormSelect
              id={`${titleId}-select`}
              value={selectValue}
              onChange={(e) => handleSelectChange(e.target.value)}
              options={selectOptions}
              disabled={saving || templatesLoading || Boolean(templatesError)}
            />
            <p className="platform-admin-page__field-hint">같은 업종·status=active 템플릿만 선택할 수 있습니다.</p>
          </div>
          <div className="platform-admin-page__form-actions">
            <FormButton
              type="button"
              variant="primary"
              htmlType="button"
              onClick={() => void applyPatch(draftId)}
              disabled={saving || !dirty || templatesLoading || Boolean(templatesError)}
              loading={saving}
              loadingText="저장 중…"
            >
              저장
            </FormButton>
            <FormButton
              type="button"
              variant="secondary"
              htmlType="button"
              onClick={() => {
                setFeedbackOk(null)
                setFeedbackErr(null)
                setDraftId(savedId)
              }}
              disabled={saving || !dirty}
            >
              되돌리기
            </FormButton>
          </div>
        </>
      ) : null}

      {!allowDynamic && savedId != null ? (
        <div className="platform-admin-page__form-actions">
          <FormButton
            type="button"
            variant="secondary"
            htmlType="button"
            onClick={() => void applyPatch(null)}
            disabled={saving}
            loading={saving}
            loadingText="처리 중…"
          >
            DB 연결 해제
          </FormButton>
        </div>
      ) : null}

      {!allowDynamic && savedId == null ? (
        <p className="platform-admin-page__muted">보험 테넌트는 동적 템플릿을 여기에서 새로 연결하지 않습니다.</p>
      ) : null}

      {feedbackOk ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
          <p>{feedbackOk}</p>
        </div>
      ) : null}
      {feedbackErr ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{feedbackErr}</p>
        </div>
      ) : null}
    </section>
  )
}
