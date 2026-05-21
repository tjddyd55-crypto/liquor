import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { CustomerIndustryTemplate } from '../../../../customer-templates/customerTemplate.types'
import CustomerIndustryTemplateFields from '../../../../customers/components/CustomerIndustryTemplateFields'
import type { CustomerEditFormState } from '../../../../customers/types/customerEditForm'

import {
  CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES,
  CRM_TEMPLATE_CORE_STORAGE_KEYS,
  CRM_TEMPLATE_DEFAULT_SHARED_BINDINGS,
  CRM_TEMPLATE_EXTENSION_KEY_INPUT_PLACEHOLDER,
  CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES,
  type CrmTemplateBuilderFieldType,
} from './crmTemplateBuilder.constants'
import type { NationalIdCoreFieldMode } from './crmTemplateDefaultCustomerFields'
import { appendMissingDefaultCustomerCoreFields, inferNationalIdCoreFieldMode } from './crmTemplateDefaultCustomerFields'
import { newLocalId } from './crmTemplateBuilder.converters'
import CrmTemplateBuilderSplitLayout from './CrmTemplateBuilderSplitLayout'
import { sourceFieldKeyToColumnKey } from './crmTemplateFieldKeyAuto'
import CrmTemplateDetailTabsPreview from './preview/CrmTemplateDetailTabsPreview'
import CrmTemplateFormPreview from './preview/CrmTemplateFormPreview'
import CrmTemplateListPreview from './preview/CrmTemplateListPreview'
import { CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS } from './presets/crmTemplateBuilderSamplePresets'

import { formatIndustryCustomerListSecondaryLine } from '../../../../customers/utils/industryCustomerListSummary'
import { industryTemplateReadPreviewRowsForFieldKeys } from '../../../../customers/utils/industryCustomerReadSummary'
import type { CustomerRecord } from '../../../../customers/domain/types'

import type {
  CrmDraftDetailTab,
  CrmDraftFormField,
  CrmDraftListColumn,
  CrmTemplateBuilderTabId,
  CrmTemplateDraft,
  CrmTemplateLifecycleStatus,
  CrmTemplateValidationIssue,
} from './crmTemplateBuilder.types'

type IndustryOption = { id: number; code: string; name: string }

function moveRow<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (index < 0 || j < 0 || index >= list.length || j >= list.length) {
    return [...list]
  }
  const out = [...list]
  const tmp = out[index]
  out[index] = out[j]
  out[j] = tmp
  return out
}

/** 비어 있지 않은 option value 기준 중복 행 표시용 */
function duplicateOptionValueIndices(options: readonly { value: string; label: string }[]): Set<number> {
  const byVal = new Map<string, number[]>()
  options.forEach((o, idx) => {
    const v = String(o.value ?? '').trim()
    if (!v) return
    const arr = byVal.get(v) ?? []
    arr.push(idx)
    byVal.set(v, arr)
  })
  const dup = new Set<number>()
  for (const arr of byVal.values()) {
    if (arr.length > 1) arr.forEach((i) => dup.add(i))
  }
  return dup
}

function issuesFor(instances: readonly CrmTemplateValidationIssue[], localId?: string) {
  return instances.filter((i) => (localId ? i.localId === localId : !i.localId))
}

/** 탭 패널 + 탭 헤더(버튼) */
export default function CrmTemplateBuilderTabPanels({
  industries,
  name,
  setName,
  industryCode,
  setIndustryCode,
  description,
  setDescription,
  status,
  setStatus,
  revision,
  draft,
  setDraft,
  previewDraft,
  previewTemplate,
  previewBinder,
  setPreviewBinder,
  mockCustomer,
  validationIssues,
  activeTab,
  setActiveTab,
  serializedPayloadPreview,
  onClearValidationIssues,
  isNewTemplate = false,
  nationalIdMode = 'birthDateSix',
  setNationalIdMode,
  onNationalIdModeUserSelect,
}: {
  industries: IndustryOption[]
  name: string
  setName: (s: string) => void
  industryCode: string
  setIndustryCode: (s: string) => void
  description: string
  setDescription: (s: string) => void
  status: CrmTemplateLifecycleStatus
  setStatus: (s: CrmTemplateLifecycleStatus) => void
  revision: number | null
  draft: CrmTemplateDraft
  setDraft: (next: CrmTemplateDraft | ((p: CrmTemplateDraft) => CrmTemplateDraft)) => void
  /** 미리보기용 — 비어 있는 내부 키를 채운 draft (편집 draft와 분리) */
  previewDraft: CrmTemplateDraft
  previewTemplate: CustomerIndustryTemplate | null
  previewBinder: CustomerEditFormState
  setPreviewBinder: Dispatch<SetStateAction<CustomerEditFormState>>
  mockCustomer: CustomerRecord
  validationIssues: CrmTemplateValidationIssue[]
  activeTab: CrmTemplateBuilderTabId
  setActiveTab: (t: CrmTemplateBuilderTabId) => void
  serializedPayloadPreview: string
  /** 프리셋 적용 시 검증 메시지 초기화(부모 상태) */
  onClearValidationIssues?: () => void
  isNewTemplate?: boolean
  nationalIdMode?: NationalIdCoreFieldMode
  setNationalIdMode?: (mode: NationalIdCoreFieldMode) => void
  onNationalIdModeUserSelect?: (mode: NationalIdCoreFieldMode) => void
}) {
  const [showAdvancedPayload, setShowAdvancedPayload] = useState(false)
  const industriesFiltered = useMemo(
    () => industries.filter((i) => i.code !== 'insurance'),
    [industries],
  )

  /** 미리보기·저장과 동일하게 정규화된 키 목록(라벨만 있는 신규 필드도 포함) */
  const formFieldPickList = useMemo(
    () =>
      previewDraft.formFields
        .map((f) => ({
          key: f.fieldKey.trim(),
          label: f.label.trim() || f.fieldKey.trim(),
        }))
        .filter((x) => x.key.length > 0),
    [previewDraft.formFields],
  )

  const fieldsOrder = useMemo(() => formFieldPickList.map((x) => x.key), [formFieldPickList])

  const tabs: { id: CrmTemplateBuilderTabId; label: string }[] = [
    { id: 'basic', label: '기본 정보' },
    { id: 'form', label: '등록 폼' },
    { id: 'list', label: '목록 표시 항목' },
    { id: 'detail', label: '상세 탭' },
    { id: 'preview', label: '전체 미리보기' },
  ]


  const industriesForIndustrySelect = industriesFiltered

  function tabIssueCount(tab: CrmTemplateBuilderTabId): number {
    return validationIssues.filter((i) => i.tab === tab).length
  }

  return (
    <div className="crm-template-builder">
      <div className="crm-template-builder__tabbar">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`filter-button${activeTab === id ? ' filter-button--workspace-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {tabIssueCount(id) > 0 ? (
              <span className="crm-template-builder__tab-badge">{tabIssueCount(id)}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="crm-template-builder__body">
        {activeTab === 'basic' ? (
          <section className="platform-admin-panel">
            <h2 className="platform-admin-panel__title">템플릿 기본 정보</h2>
            <div className="platform-admin-field">
              <label className="platform-admin-field__label" htmlFor="crm-draft-name">
                템플릿명{' '}
                <span className="platform-admin-page__required">*</span>
              </label>
              <input
                id="crm-draft-name"
                className="platform-admin-field__control"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <label className="platform-admin-field">
              <span className="platform-admin-field__label">
                Industry <span className="platform-admin-page__required">*</span>
              </span>
              <select
                className="platform-admin-field__control"
                value={industryCode}
                onChange={(e) => setIndustryCode(e.target.value)}
              >
                <option value="">선택하세요…</option>
                {industriesForIndustrySelect.map((ind) => (
                  <option key={ind.code} value={ind.code}>
                    {ind.code} — {ind.name}
                  </option>
                ))}
              </select>
              <p className="platform-admin-page__field-hint">보험(insurance) 업종은 동적 템플릿 생성 대상이 아닙니다.</p>
              {CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS.length > 0 ? (
                <div className="platform-admin-field mt-2">
                  <span className="platform-admin-field__label">테스트 샘플 불러오기</span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                    <select
                      className="platform-admin-field__control max-w-xl"
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value.trim()
                        e.target.value = ''
                        if (!id) return
                        const preset = CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS.find((p) => p.id === id)
                        if (!preset) return
                        const presetDraft = preset.buildDraft()
                        setIndustryCode(preset.industryCode)
                        setDraft(presetDraft)
                        const inferred = inferNationalIdCoreFieldMode(presetDraft.formFields)
                        setNationalIdMode?.(inferred)
                        setStatus('active')
                        setName((n) => (String(n).trim() ? n : preset.suggestedTemplateName))
                        onClearValidationIssues?.()
                        setActiveTab('form')
                      }}
                    >
                      <option value="">샘플을 선택하면 폼이 채워집니다…</option>
                      {CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="platform-admin-page__muted m-0 text-sm sm:max-w-2xl">
                      {CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS.length === 1
                        ? CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS[0].helperText
                        : '샘플 선택 시 해당 항목의 Industry 코드와 등록 폼·목록·상세 초안이 함께 덮어씌워집니다. 운영 템플릿은 이 메뉴 없이 같은 구성을 직접 만들 수 있습니다.'}
                    </p>
                  </div>
                </div>
              ) : null}
            </label>
            <label className="platform-admin-field platform-admin-field--stack">
              <span className="platform-admin-field__label">설명</span>
              <textarea
                className="platform-admin-field__control"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="platform-admin-field">
              <span className="platform-admin-field__label">상태</span>
              <select
                className="platform-admin-field__control"
                value={status}
                onChange={(e) => setStatus(e.target.value as CrmTemplateLifecycleStatus)}
              >
                <option value="draft">작성 중 (draft)</option>
                <option value="active">활성 (active)</option>
                <option value="archived">보관됨 (archived)</option>
              </select>
              {status === 'archived' ? (
                <p className="platform-admin-page__field-hint mt-1">
                  보관 처리 시 이 템플릿을 사용 중인 테넌트가 있으면 저장이 거절됩니다. 테넌트 드롭다운에는 활성(active) 템플릿만 나타납니다.
                </p>
              ) : null}
            </label>
            {revision != null ? (
              <p className="platform-admin-page__muted platform-admin-page__mono text-sm">현재 revision: {revision}</p>
            ) : null}

            {validationIssues.some((x) => x.tab === 'basic') ? (
              <div className="platform-admin-page__panel platform-admin-page__panel--warn mt-4">
                <p className="platform-admin-page__panel-title mb-2">입력 확인</p>
                {validationIssues
                  .filter((x) => x.tab === 'basic' && !x.localId)
                  .map((iss, idx) => (
                    <p key={idx} className="platform-admin-page__field-error m-0 mb-2 last:mb-0">
                      {iss.message}
                    </p>
                  ))}
              </div>
            ) : null}

            <details className="crm-template-builder__advanced">
              <summary>고급: 기능 바인딩·원본 저장 페이로드 보기</summary>
              <p className="platform-admin-page__field-hint">
                고객 화면에 노출되는 공통/확장 CRM 기능 플래그 문자열 목록입니다. 일반적으로 기본값을 유지하면 됩니다.
              </p>
              <BindingsEditor draft={draft} setDraft={setDraft} />

              <label className="platform-admin-field mt-4">
                <span className="platform-admin-field__label">저장 페이로드 JSON 보기 (읽기 전용 참고용)</span>
              </label>
              <button
                type="button"
                className="filter-button text-sm mb-2"
                onClick={() => setShowAdvancedPayload(!showAdvancedPayload)}
              >
                {showAdvancedPayload ? '숨기기' : '보기'}
              </button>
              {showAdvancedPayload ? (
                <pre className="crm-template-builder__advanced-pre platform-admin-page__mono text-xs">{serializedPayloadPreview}</pre>
              ) : null}
            </details>
          </section>
        ) : null}

        {activeTab === 'form' ? (
          <FormFieldsTab
            draft={draft}
            setDraft={setDraft}
            previewDraft={previewDraft}
            previewTemplate={previewTemplate}
            industryCode={industryCode}
            validationIssues={validationIssues.filter((x) => x.tab === 'form')}
            isNewTemplate={isNewTemplate}
            nationalIdMode={nationalIdMode}
            onNationalIdModeUserSelect={onNationalIdModeUserSelect}
            onRestoreDefaultCustomerFields={() =>
              setDraft((d) => appendMissingDefaultCustomerCoreFields(d, nationalIdMode))
            }
          />
        ) : null}

        {activeTab === 'list' ? (
          <ListColumnsTab
            draft={draft}
            setDraft={setDraft}
            previewDraft={previewDraft}
            industryCode={industryCode}
            validationIssues={validationIssues.filter((x) => x.tab === 'list')}
          />
        ) : null}

        {activeTab === 'detail' ? (
          <DetailTabsTab
            draft={draft}
            setDraft={setDraft}
            previewDraft={previewDraft}
            previewTemplate={previewTemplate}
            industryCode={industryCode}
            formFieldPickList={formFieldPickList}
            fieldsOrder={fieldsOrder}
            validationIssues={validationIssues.filter((x) => x.tab === 'detail')}
          />
        ) : null}

        {activeTab === 'preview' ? (
          <PreviewTab
            previewTemplate={previewTemplate}
            previewBinder={previewBinder}
            setPreviewBinder={setPreviewBinder}
            mockCustomer={mockCustomer}
          />
        ) : null}
      </div>
    </div>
  )
}

function BindingsEditor({
  draft,
  setDraft,
}: {
  draft: CrmTemplateDraft
  setDraft: (fn: CrmTemplateDraft | ((p: CrmTemplateDraft) => CrmTemplateDraft)) => void
}) {
  const [newShared, setNewShared] = useState('')
  const [newExt, setNewExt] = useState('')

  return (
    <>
      <div className="platform-admin-page__muted text-sm mb-2">공유 기능(shared_feature_bindings)</div>
      <ul className="crm-template-builder__chip-list mb-4">
        {draft.sharedFeatureBindings.map((s, idx) => (
          <li key={`${s}-${idx}`}>
            <code>{s}</code>
            <button
              type="button"
              className="crm-template-builder__chip-remove"
              onClick={() =>
                setDraft({
                  ...draft,
                  sharedFeatureBindings: draft.sharedFeatureBindings.filter((_, i) => i !== idx),
                })
              }
              aria-label="삭제"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 flex-wrap mb-4">
        <input
          className="platform-admin-field__control flex-1 min-w-[180px]"
          placeholder="항목 추가 (예 crm-consultations)"
          value={newShared}
          onChange={(e) => setNewShared(e.target.value)}
        />
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            const k = newShared.trim()
            if (!k || draft.sharedFeatureBindings.includes(k)) return
            setDraft({
              ...draft,
              sharedFeatureBindings: [...draft.sharedFeatureBindings, k],
            })
            setNewShared('')
          }}
        >
          추가
        </button>
        <button
          type="button"
          className="filter-button"
          onClick={() =>
            setDraft({
              ...draft,
              sharedFeatureBindings: [...CRM_TEMPLATE_DEFAULT_SHARED_BINDINGS],
            })
          }
        >
          기본값으로
        </button>
      </div>

      <div className="platform-admin-page__muted text-sm mb-2">확장 기능(extension_feature_bindings)</div>
      <ul className="crm-template-builder__chip-list mb-2">
        {draft.extensionFeatureBindings.map((s, idx) => (
          <li key={`${s}-${idx}`}>
            <code>{s}</code>
            <button
              type="button"
              className="crm-template-builder__chip-remove"
              onClick={() =>
                setDraft({
                  ...draft,
                  extensionFeatureBindings: draft.extensionFeatureBindings.filter((_, i) => i !== idx),
                })
              }
              aria-label="삭제"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 flex-wrap">
        <input
          className="platform-admin-field__control flex-1 min-w-[180px]"
          placeholder="확장 바인딩 문자열 추가"
          value={newExt}
          onChange={(e) => setNewExt(e.target.value)}
        />
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            const k = newExt.trim()
            if (!k || draft.extensionFeatureBindings.includes(k)) return
            setDraft({
              ...draft,
              extensionFeatureBindings: [...draft.extensionFeatureBindings, k],
            })
            setNewExt('')
          }}
        >
          추가
        </button>
      </div>
    </>
  )
}

function FormFieldsTab({
  draft,
  setDraft,
  previewDraft,
  previewTemplate,
  industryCode,
  validationIssues,
  isNewTemplate,
  nationalIdMode,
  onNationalIdModeUserSelect,
  onRestoreDefaultCustomerFields,
}: {
  draft: CrmTemplateDraft
  setDraft: (fn: CrmTemplateDraft | ((p: CrmTemplateDraft) => CrmTemplateDraft)) => void
  previewDraft: CrmTemplateDraft
  previewTemplate: CustomerIndustryTemplate | null
  industryCode: string
  validationIssues: readonly CrmTemplateValidationIssue[]
  isNewTemplate: boolean
  nationalIdMode: NationalIdCoreFieldMode
  onNationalIdModeUserSelect?: (mode: NationalIdCoreFieldMode) => void
  onRestoreDefaultCustomerFields?: () => void
}) {
  const extensionKeyDupCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of draft.formFields) {
      if (row.storage !== 'extension') continue
      const k = row.fieldKey.trim()
      if (!k) continue
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [draft.formFields])

  function patchField(localId: string, patch: Partial<CrmDraftFormField>) {
    setDraft({
      ...draft,
      formFields: draft.formFields.map((f) => (f.localId === localId ? { ...f, ...patch } : f)),
    })
  }

  function move(idx: number, dir: -1 | 1) {
    setDraft({ ...draft, formFields: moveRow(draft.formFields, idx, dir) })
  }

  function firstUnusedCoreKey(excludeLocalId: string): string {
    for (const ck of CRM_TEMPLATE_CORE_STORAGE_KEYS) {
      const taken = draft.formFields.some(
        (o) => o.localId !== excludeLocalId && o.storage === 'core' && o.fieldKey.trim() === ck,
      )
      if (!taken) return ck
    }
    return CRM_TEMPLATE_CORE_STORAGE_KEYS[0] ?? 'customer.name'
  }

  return (
    <CrmTemplateBuilderSplitLayout
      settings={
    <section className="platform-admin-panel">
      <div className="crm-template-builder__section-head flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="platform-admin-panel__title m-0">등록 폼 필드</h2>
          {!isNewTemplate ? (
            <p className="platform-admin-page__muted text-sm mt-1 mb-0">
              기존 템플릿은 불러온 필드만 표시됩니다. 기본 고객 정보는 자동 추가되지 않으며, 빠진 항목은 아래 복원으로
              채울 수 있습니다.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          <label className="platform-admin-field mb-0 flex flex-col gap-1 min-w-[260px]">
            <span className="platform-admin-field__label text-sm">주민번호 입력 방식</span>
            <select
              className="platform-admin-field__control"
              value={nationalIdMode}
              disabled={!onNationalIdModeUserSelect}
              onChange={(e) => {
                const v = e.target.value === 'fullSsn' ? 'fullSsn' : 'birthDateSix'
                onNationalIdModeUserSelect?.(v)
              }}
            >
              <option value="birthDateSix">주민번호 앞자리만 (customer.birthDate)</option>
              <option value="fullSsn">주민번호 전체 (customer.ssn)</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              className="filter-button"
              onClick={() => onRestoreDefaultCustomerFields?.()}
              title="이미 있는 필드 키는 건너뜁니다"
            >
              기본 필드 복원
            </button>
            <button
              type="button"
              className="filter-button filter-button--workspace-active"
              onClick={() =>
                setDraft({
                  ...draft,
                  formFields: [
                    ...draft.formFields,
                    {
                      localId: newLocalId(),
                      storage: 'extension',
                      fieldKey: '',
                      label: '',
                      fieldType: 'text',
                      required: false,
                      placeholder: '',
                      visibleDefault: true,
                      options: [],
                    },
                  ],
                })
              }
            >
              + 필드 추가
            </button>
          </div>
        </div>
      </div>
      <p className="platform-admin-page__field-hint mb-4">
        라벨과 표시 타입만 입력하면 됩니다. 내부 저장 키는 자동 생성되며, 필요 시 각 필드의 「개발자 정보」에서 확인할 수
        있습니다.
      </p>

      {validationIssues.find((x) => !x.localId) ? (
        <p className="platform-admin-page__field-error">{validationIssues.find((x) => !x.localId)?.message}</p>
      ) : null}

      <div className="crm-template-builder__card-stack">
        {draft.formFields.length === 0 ? (
          <p className="platform-admin-page__muted">필드를 추가해 주세요. 빈 템플릿으로 시작합니다.</p>
        ) : null}
        {draft.formFields.map((f, idx) => (
          <article key={f.localId} className="crm-template-builder__card">
            <header className="crm-template-builder__card-head">
              <span className="crm-template-builder__card-title">필드 {idx + 1}</span>
              <div className="crm-template-builder__card-actions">
                <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, -1)}>
                  ↑
                </button>
                <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="filter-button text-xs px-2"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      formFields: draft.formFields.filter((x) => x.localId !== f.localId),
                    })
                  }
                >
                  삭제
                </button>
              </div>
            </header>

            <div className="crm-template-builder__grid">
              <label className="platform-admin-field">
                <span className="platform-admin-field__label">
                  라벨 <span className="platform-admin-page__required">*</span>
                </span>
                <input
                  className="platform-admin-field__control"
                  value={f.label}
                  onChange={(e) => patchField(f.localId, { label: e.target.value })}
                />
              </label>
              <label className="platform-admin-field">
                <span className="platform-admin-field__label">
                  표시 타입<span className="platform-admin-page__required">*</span>
                </span>
                <select
                  className="platform-admin-field__control"
                  value={f.fieldType}
                  onChange={(e) =>
                    patchField(f.localId, { fieldType: e.target.value as CrmTemplateBuilderFieldType })
                  }
                >
                  {CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="platform-admin-field">
                <span className="platform-admin-field__label">
                  저장 위치<span className="platform-admin-page__required">*</span>
                </span>
                <select
                  className="platform-admin-field__control"
                  value={f.storage}
                  onChange={(e) =>
                    patchField(f.localId, {
                      storage: e.target.value as 'core' | 'extension',
                      fieldKey:
                        e.target.value === 'core'
                          ? firstUnusedCoreKey(f.localId)
                          : f.fieldKey &&
                              !(CRM_TEMPLATE_CORE_STORAGE_KEYS as readonly string[]).includes(f.fieldKey.trim())
                            ? f.fieldKey
                            : '',
                    })
                  }
                >
                  <option value="extension">확장 (crm_extension)</option>
                  <option value="core">코어 고객 컬럼</option>
                </select>
              </label>
              <label className="platform-admin-field flex flex-row items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => patchField(f.localId, { required: e.target.checked })}
                />
                <span className="platform-admin-field__label mb-0">필수</span>
              </label>
              <label className="platform-admin-field flex flex-row items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.visibleDefault}
                  onChange={(e) => patchField(f.localId, { visibleDefault: e.target.checked })}
                />
                <span className="platform-admin-field__label mb-0">화면 표시</span>
              </label>
              <label className="platform-admin-field crm-template-builder__full-row">
                <span className="platform-admin-field__label">플레이스홀더</span>
                <input
                  className="platform-admin-field__control"
                  value={f.placeholder}
                  onChange={(e) => patchField(f.localId, { placeholder: e.target.value })}
                />
              </label>
            </div>

            {(f.fieldType === 'select' || f.fieldType === 'radio' || f.fieldType === 'checkbox') && (
              <FieldOptionsEditor
                options={f.options}
                onChange={(opts) => patchField(f.localId, { options: opts })}
              />
            )}

            <details className="crm-template-builder__advanced mt-3">
              <summary>개발자 정보 (내부 키)</summary>
              {f.storage === 'core' ? (
                <label className="platform-admin-field mt-2">
                  <span className="platform-admin-field__label">코어 DB 키</span>
                  <select
                    className="platform-admin-field__control platform-admin-page__mono"
                    value={
                      (CRM_TEMPLATE_CORE_STORAGE_KEYS as readonly string[]).includes(f.fieldKey.trim())
                        ? f.fieldKey.trim()
                        : firstUnusedCoreKey(f.localId)
                    }
                    onChange={(e) => patchField(f.localId, { fieldKey: e.target.value })}
                  >
                    {CRM_TEMPLATE_CORE_STORAGE_KEYS.map((ck) => {
                      const selfKey = f.fieldKey.trim()
                      const isSelf = selfKey === ck
                      const usedByOther = draft.formFields.some(
                        (o) => o.localId !== f.localId && o.storage === 'core' && o.fieldKey.trim() === ck,
                      )
                      const disabled = usedByOther && !isSelf
                      const labelSuffix = usedByOther ? ' · 이미 사용 중' : ''
                      return (
                        <option key={ck} value={ck} disabled={disabled}>
                          {ck}
                          {labelSuffix}
                        </option>
                      )
                    })}
                  </select>
                </label>
              ) : (
                <label className="platform-admin-field mt-2">
                  <span className="platform-admin-field__label">확장 필드 키 (fieldKey)</span>
                  <input
                    className="platform-admin-field__control platform-admin-page__mono"
                    placeholder={CRM_TEMPLATE_EXTENSION_KEY_INPUT_PLACEHOLDER}
                    value={f.fieldKey}
                    onChange={(e) => patchField(f.localId, { fieldKey: e.target.value })}
                  />
                  <p className="platform-admin-page__field-hint text-xs mt-1 mb-0">
                    신규 필드의 내부 키는 미리보기 반영 또는 저장 시 자동 생성됩니다. 기존 필드의 내부 키는 라벨을
                    수정해도 유지됩니다.
                  </p>
                </label>
              )}
            </details>
            {f.storage === 'extension' && f.fieldKey.trim() && (extensionKeyDupCounts.get(f.fieldKey.trim()) ?? 0) > 1 ? (
              <p className="platform-admin-page__field-error m-0 mt-2">
                내부 키가 다른 필드와 겹칩니다. 「개발자 정보」에서 키를 조정해 주세요.
              </p>
            ) : null}

            {issuesFor(validationIssues, f.localId).map((iss, ix) => (
              <p key={ix} className="platform-admin-page__field-error">
                {iss.message}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
      }
      preview={<CrmTemplateFormPreview template={previewTemplate} draft={previewDraft} />}
    />
  )
}

function FieldOptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[]
  onChange: (o: { value: string; label: string }[]) => void
}) {
  const move = (i: number, dir: -1 | 1) => onChange(moveRow(options, i, dir))
  const patch = (i: number, patch: Partial<{ value: string; label: string }>) =>
    onChange(options.map((o, ix) => (ix === i ? { ...o, ...patch } : o)))
  const dupIdx = useMemo(() => duplicateOptionValueIndices(options), [options])

  return (
    <div className="crm-template-builder__options-block">
      <div className="platform-admin-page__muted text-sm mb-2">선택 옵션 (label / value)</div>
      {options.map((opt, idx) => (
        <div key={idx} className="mb-2">
          <div className="crm-template-builder__option-row">
            <input
              className="platform-admin-field__control"
              placeholder="표시 라벨"
              value={opt.label}
              onChange={(e) => patch(idx, { label: e.target.value })}
            />
            <input
              className="platform-admin-field__control platform-admin-page__mono"
              placeholder="값"
              value={opt.value}
              onChange={(e) => patch(idx, { value: e.target.value })}
            />
            <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, -1)}>
              ↑
            </button>
            <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, 1)}>
              ↓
            </button>
            <button type="button" className="filter-button text-xs px-2" onClick={() => onChange(options.filter((_, ix) => ix !== idx))}>
              삭제
            </button>
          </div>
          {dupIdx.has(idx) ? (
            <p className="platform-admin-page__field-error text-xs mt-1 mb-0">
              value가 다른 옵션과 중복되었습니다. 저장 시 거절됩니다.
            </p>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="filter-button text-sm mt-2"
        onClick={() => onChange([...options, { label: '', value: '' }])}
      >
        + 옵션 추가
      </button>
    </div>
  )
}

function ListColumnsTab({
  draft,
  setDraft,
  previewDraft,
  industryCode,
  validationIssues,
}: {
  draft: CrmTemplateDraft
  setDraft: (fn: CrmTemplateDraft | ((p: CrmTemplateDraft) => CrmTemplateDraft)) => void
  previewDraft: CrmTemplateDraft
  industryCode: string
  validationIssues: readonly CrmTemplateValidationIssue[]
}) {
  function patchCol(localId: string, patch: Partial<CrmDraftListColumn>) {
    setDraft({
      ...draft,
      listColumns: draft.listColumns.map((c) => (c.localId === localId ? { ...c, ...patch } : c)),
    })
  }

  function move(idx: number, dir: -1 | 1) {
    setDraft({ ...draft, listColumns: moveRow(draft.listColumns, idx, dir) })
  }

  const formFieldOptions = previewDraft.formFields
    .filter((f) => f.fieldKey.trim().length > 0)
    .map((f) => ({
      fk: f.fieldKey.trim(),
      label: f.label.trim() || f.fieldKey.trim(),
    }))

  function pickSourceField(localId: string, fk: string) {
    const used = new Set(draft.listColumns.filter((c) => c.localId !== localId).map((c) => c.columnKey.trim()))
    const columnKey = fk.trim() ? sourceFieldKeyToColumnKey(fk, used) : ''
    patchCol(localId, { sourceFieldKey: fk, columnKey })
  }

  return (
    <CrmTemplateBuilderSplitLayout
      previewTitle="목록 카드 미리보기"
      previewHint="고객관리 목록 화면의 카드 요약입니다. 실제 저장·등록은 되지 않으며, 설정 변경이 바로 반영됩니다."
      settings={
    <section className="platform-admin-panel">
      <div className="crm-template-builder__list-tab-lede platform-admin-page__field-hint text-sm mb-4">
        <p className="m-0">
          등록된 데이터를 목록에서 볼 때 카드·리스트에 표시할 항목을 설정합니다. 목록에서 한 건을
          선택하면 상세 탭 화면으로 이동합니다.
        </p>
        <p className="m-0 mt-2 platform-admin-page__muted text-xs">
          등록 폼은 데이터 입력, 목록 표시 항목은 목록 카드 요약, 상세 탭은 선택한 건의 상세
          화면 구성입니다.
        </p>
      </div>
      <div className="crm-template-builder__section-head">
        <h2 className="platform-admin-panel__title">목록 표시 항목</h2>
        <button
          type="button"
          className="filter-button filter-button--workspace-active"
          disabled={draft.formFields.length === 0}
          onClick={() =>
            setDraft({
              ...draft,
              listColumns: [
                ...draft.listColumns,
                {
                  localId: newLocalId(),
                  columnKey:
                    draft.formFields[0]?.fieldKey.trim().replace(/\./g, '_') || `col_${draft.listColumns.length + 1}`,
                  label: '',
                  sourceFieldKey: draft.formFields[0]?.fieldKey.trim() ?? '',
                  visibleDefault: true,
                  displayType: 'auto',
                },
              ],
            })
          }
        >
          + 표시 항목 추가
        </button>
      </div>
      {draft.formFields.length === 0 ? (
        <p className="platform-admin-page__field-error">
          목록 원본 필드가 없습니다. 등록 폼 필드를 먼저 추가해 주세요.
        </p>
      ) : null}

      <div className="crm-template-builder__card-stack">
        {draft.listColumns.map((c, idx) => (
          <article key={c.localId} className="crm-template-builder__card">
            <header className="crm-template-builder__card-head">
              <span className="crm-template-builder__card-title">표시 항목 {idx + 1}</span>
              <div className="crm-template-builder__card-actions">
                <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, -1)}>
                  ↑
                </button>
                <button type="button" className="filter-button text-xs px-2" onClick={() => move(idx, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="filter-button text-xs px-2"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      listColumns: draft.listColumns.filter((x) => x.localId !== c.localId),
                    })
                  }
                >
                  삭제
                </button>
              </div>
            </header>

            <div className="crm-template-builder__grid">
              <label className="platform-admin-field">
                <span className="platform-admin-field__label">
                  라벨 <span className="platform-admin-page__required">*</span>
                </span>
                <input
                  className="platform-admin-field__control"
                  value={c.label}
                  onChange={(e) => patchCol(c.localId, { label: e.target.value })}
                />
              </label>
              <label className="platform-admin-field crm-template-builder__full-row">
                <span className="platform-admin-field__label">
                  표시할 등록 폼 필드 <span className="platform-admin-page__required">*</span>
                </span>
                <select
                  className="platform-admin-field__control"
                  value={formFieldOptions.some((o) => o.fk === c.sourceFieldKey.trim()) ? c.sourceFieldKey.trim() : ''}
                  onChange={(e) => {
                    const fk = e.target.value
                    const used = new Set(
                      draft.listColumns.filter((col) => col.localId !== c.localId).map((col) => col.columnKey.trim()),
                    )
                    const columnKey = fk.trim() ? sourceFieldKeyToColumnKey(fk, used) : ''
                    const picked = formFieldOptions.find((o) => o.fk === fk)
                    patchCol(c.localId, {
                      sourceFieldKey: fk,
                      columnKey,
                      ...(picked && !c.label.trim() ? { label: picked.label } : {}),
                    })
                  }}
                >
                  <option value="">— 등록 폼 필드 선택 —</option>
                  {formFieldOptions.map((o) => (
                    <option key={o.fk} value={o.fk}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <details className="crm-template-builder__advanced crm-template-builder__full-row">
                <summary>개발자 정보 (내부 키)</summary>
                <label className="platform-admin-field mt-2">
                  <span className="platform-admin-field__label">컬럼 키 (columnKey)</span>
                  <input
                    className="platform-admin-field__control platform-admin-page__mono"
                    value={c.columnKey}
                    onChange={(e) => patchCol(c.localId, { columnKey: e.target.value })}
                  />
                </label>
                <label className="platform-admin-field">
                  <span className="platform-admin-field__label">원본 필드 키 (sourceFieldKey)</span>
                  <input
                    className="platform-admin-field__control platform-admin-page__mono"
                    value={c.sourceFieldKey}
                    onChange={(e) => pickSourceField(c.localId, e.target.value)}
                  />
                </label>
              </details>
              <label className="platform-admin-field">
                <span className="platform-admin-field__label">표시 타입</span>
                <select
                  className="platform-admin-field__control"
                  value={
                    CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES.includes(
                      (c.displayType ?? 'auto') as (typeof CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES)[number],
                    )
                      ? c.displayType ?? 'auto'
                      : 'auto'
                  }
                  onChange={(e) =>
                    patchCol(c.localId, {
                      displayType: e.target.value as CrmDraftListColumn['displayType'],
                    })
                  }
                >
                  <option value="auto">자동(auto) — 폼 필드 타입에 맞춤</option>
                  <option value="text">텍스트</option>
                  <option value="date">날짜</option>
                  <option value="number">숫자</option>
                </select>
              </label>
              <label className="platform-admin-field flex flex-row items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.visibleDefault}
                  onChange={(e) => patchCol(c.localId, { visibleDefault: e.target.checked })}
                />
                <span className="platform-admin-field__label mb-0">목록에 노출</span>
              </label>
            </div>
            {issuesFor(validationIssues, c.localId).map((iss, ix) => (
              <p key={ix} className="platform-admin-page__field-error">
                {iss.message}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
      }
      preview={<CrmTemplateListPreview draft={previewDraft} industryCode={industryCode} />}
    />
  )
}

type FormFieldPick = { key: string; label: string }

function DetailTabsTab({
  draft,
  setDraft,
  previewDraft,
  previewTemplate,
  industryCode,
  formFieldPickList,
  fieldsOrder,
  validationIssues,
}: {
  draft: CrmTemplateDraft
  setDraft: (fn: CrmTemplateDraft | ((p: CrmTemplateDraft) => CrmTemplateDraft)) => void
  previewDraft: CrmTemplateDraft
  previewTemplate: CustomerIndustryTemplate | null
  industryCode: string
  formFieldPickList: readonly FormFieldPick[]
  fieldsOrder: readonly string[]
  validationIssues: readonly CrmTemplateValidationIssue[]
}) {
  function patchTab(localId: string, patch: Partial<CrmDraftDetailTab>) {
    setDraft({
      ...draft,
      detailTabs: draft.detailTabs.map((t) => (t.localId === localId ? { ...t, ...patch } : t)),
    })
  }

  function move(idx: number, dir: -1 | 1) {
    setDraft({ ...draft, detailTabs: moveRow(draft.detailTabs, idx, dir) })
  }

  return (
    <CrmTemplateBuilderSplitLayout
      settings={
    <section className="platform-admin-panel">
      <div className="crm-template-builder__section-head">
        <h2 className="platform-admin-panel__title">상세 탭</h2>
        <button
          type="button"
          className="filter-button filter-button--workspace-active"
          disabled={formFieldPickList.length === 0}
          onClick={() =>
            setDraft({
              ...draft,
              detailTabs: [
                ...draft.detailTabs,
                {
                  localId: newLocalId(),
                  tabId: '',
                  label: '',
                  visibleDefault: true,
                  fieldKeys: [],
                },
              ],
            })
          }
        >
          + 탭 추가
        </button>
      </div>
      <p className="platform-admin-page__field-hint mb-4">
        탭 이름을 입력하고 등록 폼 필드를 선택하세요. 오른쪽에서 상세 화면 미리보기를 확인할 수 있습니다.
      </p>

      <div className="crm-template-builder__card-stack">
        {draft.detailTabs.map((t, idx) => (
          <DetailTabFieldsEditor
            key={t.localId}
            tab={t}
            tabIndex={idx}
            move={move}
            patchTab={patchTab}
            formFieldPickList={formFieldPickList}
            fieldsOrder={fieldsOrder}
            validationIssues={validationIssues.filter((x) => x.localId === t.localId)}
            removeTab={() =>
              setDraft({
                ...draft,
                detailTabs: draft.detailTabs.filter((x) => x.localId !== t.localId),
              })
            }
          />
        ))}
      </div>
    </section>
      }
      preview={<CrmTemplateDetailTabsPreview template={previewTemplate} draft={previewDraft} />}
    />
  )
}

function DetailTabFieldsEditor({
  tab,
  tabIndex,
  move,
  patchTab,
  formFieldPickList,
  fieldsOrder,
  validationIssues,
  removeTab,
}: {
  tab: CrmDraftDetailTab
  tabIndex: number
  move: (idx: number, dir: -1 | 1) => void
  patchTab: (localId: string, patch: Partial<CrmDraftDetailTab>) => void
  formFieldPickList: readonly FormFieldPick[]
  fieldsOrder: readonly string[]
  validationIssues: readonly CrmTemplateValidationIssue[]
  removeTab: () => void
}) {
  const labelToIdRef = tab.label.trim() || tab.tabId

  function toggleInclude(key: string, nextChecked: boolean) {
    if (nextChecked) {
      if (tab.fieldKeys.includes(key)) return
      const orderIx = Object.fromEntries(fieldsOrder.map((k, i) => [k, i]))
      const mergedKeys = [...tab.fieldKeys, key].sort((a, b) => {
        const ia = orderIx[a] ?? 9999
        const ib = orderIx[b] ?? 9999
        return ia - ib
      })
      patchTab(tab.localId, { fieldKeys: mergedKeys })
      return
    }
    patchTab(
      tab.localId,
      { fieldKeys: tab.fieldKeys.filter((k) => k !== key) },
    )
  }

  const moveFieldInsideTab = (fIdx: number, dir: -1 | 1) => {
    const row = [...tab.fieldKeys]
    const j = fIdx + dir
    if (fIdx < 0 || j < 0 || fIdx >= row.length || j >= row.length) return
    const tmp = row[fIdx]
    row[fIdx] = row[j]
    row[j] = tmp
    patchTab(tab.localId, { fieldKeys: row })
  }

  const labelForKey = (k: string) => formFieldPickList.find((p) => p.key === k)?.label ?? k

  return (
    <article className="crm-template-builder__card">
      <header className="crm-template-builder__card-head">
        <span className="crm-template-builder__card-title">탭 #{tabIndex + 1}</span>
        <div className="crm-template-builder__card-actions">
          <button type="button" className="filter-button text-xs px-2" onClick={() => move(tabIndex, -1)}>
            ↑
          </button>
          <button type="button" className="filter-button text-xs px-2" onClick={() => move(tabIndex, 1)}>
            ↓
          </button>
          <button type="button" className="filter-button text-xs px-2" onClick={removeTab}>
            삭제
          </button>
        </div>
      </header>

      <div className="crm-template-builder__grid">
        <label className="platform-admin-field">
          <span className="platform-admin-field__label">
            탭 이름 <span className="platform-admin-page__required">*</span>
          </span>
          <input
            className="platform-admin-field__control"
            value={tab.label}
            onChange={(e) => patchTab(tab.localId, { label: e.target.value })}
          />
        </label>
        <label className="platform-admin-field flex flex-row items-center gap-2">
          <input
            type="checkbox"
            checked={tab.visibleDefault}
            onChange={(e) => patchTab(tab.localId, { visibleDefault: e.target.checked })}
          />
          <span className="platform-admin-field__label mb-0">탭 표시</span>
        </label>
        <details className="crm-template-builder__advanced crm-template-builder__full-row">
          <summary>개발자 정보 (탭 ID)</summary>
          <label className="platform-admin-field mt-2">
            <span className="platform-admin-field__label">탭 ID (tabId)</span>
            <input
              className="platform-admin-field__control platform-admin-page__mono"
              placeholder="예: liquor_basic"
              value={tab.tabId}
              onChange={(e) => patchTab(tab.localId, { tabId: e.target.value })}
            />
            <p className="platform-admin-page__field-hint text-xs mt-1 mb-0">
              신규 탭의 내부 ID는 미리보기 반영 또는 저장 시 자동 생성됩니다. 기존 탭 ID는 이름을 수정해도 유지됩니다.
            </p>
          </label>
        </details>
      </div>

      <div className="crm-template-builder__nested mt-4">
        <span className="platform-admin-field__label">포함 필드 선택 ({labelToIdRef})</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 mb-4">
          {formFieldPickList.map((pf) => (
            <label key={pf.key} className="flex gap-2 items-start rounded-md border border-[#334155] bg-[#111827]/80 px-3 py-2">
              <input
                type="checkbox"
                checked={tab.fieldKeys.includes(pf.key)}
                onChange={(e) => toggleInclude(pf.key, e.target.checked)}
              />
              <span className="min-w-0 text-sm text-[#f8fafc]">{pf.label}</span>
            </label>
          ))}
        </div>

        <span className="platform-admin-field__label">표시 순서 (포함된 필드만)</span>
        <ol className="crm-template-builder__field-order mt-2">
          {tab.fieldKeys.map((fk, fkIdx) => (
            <li key={`${fk}-${fkIdx}`}>
              <div className="min-w-0 text-sm truncate">{labelForKey(fk)}</div>
              <div className="crm-template-builder__field-order-actions">
                <button type="button" className="filter-button text-xs px-2" onClick={() => moveFieldInsideTab(fkIdx, -1)}>
                  ↑
                </button>
                <button type="button" className="filter-button text-xs px-2" onClick={() => moveFieldInsideTab(fkIdx, 1)}>
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
        {tab.fieldKeys.length === 0 ? (
          <p className="platform-admin-page__muted text-sm mt-2">표시할 필드를 하나 이상 체크하세요.</p>
        ) : null}

        {validationIssues.map((iss, ix) => (
          <p key={ix} className="platform-admin-page__field-error mt-2">
            {iss.message}
          </p>
        ))}
      </div>
    </article>
  )
}

function PreviewTab({
  previewTemplate,
  previewBinder,
  setPreviewBinder,
  mockCustomer,
}: {
  previewTemplate: CustomerIndustryTemplate | null
  previewBinder: CustomerEditFormState
  setPreviewBinder: Dispatch<SetStateAction<CustomerEditFormState>>
  mockCustomer: CustomerRecord
}) {
  const listSecondary = previewTemplate
    ? formatIndustryCustomerListSecondaryLine(mockCustomer, previewTemplate)
    : ''

  if (!previewTemplate) {
    return (
      <section className="platform-admin-panel">
        <p className="platform-admin-page__muted">미리보기를 만들 수 없습니다. 기본 정보가 충족되는지 확인하세요.</p>
      </section>
    )
  }

  return (
    <div className="crm-template-builder__preview-grid">
      <section className="platform-admin-panel">
        <h2 className="platform-admin-panel__title">등록·수정 폼 미리보기</h2>
        <CustomerIndustryTemplateFields
          template={previewTemplate}
          value={{
            ...previewBinder,
            name: previewBinder.name,
            gender: previewBinder.gender,
            phone: previewBinder.phone,
            ssn: previewBinder.ssn,
            carrier: previewBinder.carrier,
            birthDate: previewBinder.birthDate,
            address: previewBinder.address,
            addressDetail: previewBinder.addressDetail,
            zonecode: previewBinder.zonecode,
            job: previewBinder.job,
            height: previewBinder.height,
            weight: previewBinder.weight,
            crmExtensionFields: previewBinder.crmExtensionFields,
          }}
          onPatch={(p) =>
            setPreviewBinder((prev) => ({
              ...prev,
              ...p,
            }))
          }
          variant="edit"
          radioSuffix="crm-preview"
        />
      </section>
      <section className="platform-admin-panel">
        <h2 className="platform-admin-panel__title">목록 카드 줄 미리보기</h2>
        <div className="crm-template-builder__preview-mock-card">
          <div className="crm-template-builder__preview-mock-line1">{previewBinder.name || '(이름)'}</div>
          <div className="crm-template-builder__preview-mock-line2">{listSecondary}</div>
        </div>

        <h2 className="platform-admin-panel__title mt-6">상세 읽기 탭별 미리보기</h2>
        {previewTemplate.detailTabs
          .filter((t) => t.visibleDefault !== false)
          .sort((a, b) => a.order - b.order)
          .map((tab) => {
            if (!tab.fieldKeys?.length) {
              return (
                <div key={tab.tabId} className="crm-template-builder__detail-preview-tab">
                  <h3>{tab.label || tab.tabId}</h3>
                  <p className="platform-admin-page__muted text-sm">
                    「상세 탭」 빌더에서 이 탭에 표시할 필드를 추가하면 여기에 미리 표시됩니다.
                  </p>
                </div>
              )
            }
            const keys = tab.fieldKeys

            const rows = industryTemplateReadPreviewRowsForFieldKeys(mockCustomer, previewTemplate, keys, 48)
            return (
              <div key={tab.tabId} className="crm-template-builder__detail-preview-tab">
                <h3>{tab.label || tab.tabId}</h3>
                {rows.length === 0 ? (
                  <p className="platform-admin-page__muted text-sm">
                    선택한 폼 상태로는 표시값이 비어 있습니다. 위 폼에서 값을 채워 보세요.
                  </p>
                ) : (
                  <dl className="crm-template-builder__preview-dl">
                    {rows.map((r, i) => (
                      <div key={`${tab.tabId}-${r.canonicalKey}-${i}`}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )
          })}
      </section>
    </div>
  )
}
