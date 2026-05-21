import { newLocalId } from './crmTemplateBuilder.converters'
import type { CrmDraftFormField, CrmTemplateDraft } from './crmTemplateBuilder.types'

/** 주민번호 기본 매핑: 앞자리(생년월일 컬럼) vs 전체(ssn 컬럼) */
export type NationalIdCoreFieldMode = 'birthDateSix' | 'fullSsn'

/** 동일 시간대 묶음(주민번호 슬롯) — 사용자 정의 다른 코어 필드와 구분하지 않고 이 키들만 교체·정리 */
export function isNationalIdentityCoreFieldKey(fieldKey: string): boolean {
  const k = fieldKey.trim()
  return (
    k === 'customer.birthDate' || k === 'customer.ssn' || k === 'insurance.ssn'
  )
}

export function inferNationalIdCoreFieldMode(formFields: { storage: string; fieldKey: string }[]): NationalIdCoreFieldMode {
  const coreRows = formFields.filter((f) => f.storage === 'core')
  const keys = new Set(coreRows.map((f) => f.fieldKey.trim()))
  if (keys.has('customer.ssn') || keys.has('insurance.ssn')) return 'fullSsn'
  if (keys.has('customer.birthDate')) return 'birthDateSix'
  return 'birthDateSix'
}

/** nationalId 슬롯용 skeleton (localId 미부여 — 호출처에서 newLocalId) */
export function nationalIdentityCoreDraftFieldSkeleton(mode: NationalIdCoreFieldMode): Omit<CrmDraftFormField, 'localId'> {
  if (mode === 'fullSsn') {
    return {
      storage: 'core',
      fieldKey: 'customer.ssn',
      label: '주민번호',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    }
  }
  return {
    storage: 'core',
    fieldKey: 'customer.birthDate',
    label: '주민번호 앞자리',
    fieldType: 'text',
    required: false,
    placeholder:
      'YYMMDD 6자리 (예 990315). 저장 시 고객 생년월일(YYYY-MM-DD)로 변환됩니다.',
    visibleDefault: true,
    options: [],
  }
}

/** 신규 템플릿 초기 행 순서 전체 구성 */
export function createDefaultCustomerFormFields(mode: NationalIdCoreFieldMode): CrmDraftFormField[] {
  const nationalRow: CrmDraftFormField = {
    ...nationalIdentityCoreDraftFieldSkeleton(mode),
    localId: newLocalId(),
  }

  const rows: CrmDraftFormField[] = [
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.name',
      label: '이름',
      fieldType: 'text',
      required: true,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.phone',
      label: '전화번호',
      fieldType: 'phone',
      required: true,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    nationalRow,
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.gender',
      label: '성별',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.address',
      label: '주소',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.job',
      label: '직업',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      localId: newLocalId(),
      storage: 'core',
      fieldKey: 'customer.memo',
      label: '메모',
      fieldType: 'textarea',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
  ]

  return rows
}

/** 복원에 사용할 표준 패키지 (동일 순서로 누락 행만 뒤에 붙임) */
function defaultRestoreRowsInCanonicalOrder(mode: NationalIdCoreFieldMode): Omit<CrmDraftFormField, 'localId'>[] {
  const n = nationalIdentityCoreDraftFieldSkeleton(mode)
  return [
    {
      storage: 'core',
      fieldKey: 'customer.name',
      label: '이름',
      fieldType: 'text',
      required: true,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      storage: 'core',
      fieldKey: 'customer.phone',
      label: '전화번호',
      fieldType: 'phone',
      required: true,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    n,
    {
      storage: 'core',
      fieldKey: 'customer.gender',
      label: '성별',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      storage: 'core',
      fieldKey: 'customer.address',
      label: '주소',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      storage: 'core',
      fieldKey: 'customer.job',
      label: '직업',
      fieldType: 'text',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
    {
      storage: 'core',
      fieldKey: 'customer.memo',
      label: '메모',
      fieldType: 'textarea',
      required: false,
      placeholder: '',
      visibleDefault: true,
      options: [],
    },
  ]
}

/** 드롭다운 변경: 주민번호 슬롯 1줄만 대상 필드 교체 · 동일 카테고리 중복 줄 정리 */
export function applyNationalIdCoreFieldModeToDraft(
  draft: CrmTemplateDraft,
  mode: NationalIdCoreFieldMode,
): CrmTemplateDraft {
  const skeleton = nationalIdentityCoreDraftFieldSkeleton(mode)
  const fields = [...draft.formFields]

  const nationalIx: number[] = []
  fields.forEach((f, ix) => {
    if (f.storage === 'core' && isNationalIdentityCoreFieldKey(f.fieldKey)) nationalIx.push(ix)
  })

  if (nationalIx.length === 0) {
    return draft
  }

  const canonical = nationalIx[0]!
  const first = fields[canonical]!

  fields[canonical] = {
    ...first,
    fieldKey: skeleton.fieldKey,
    label: skeleton.label,
    placeholder: skeleton.placeholder,
    fieldType: skeleton.fieldType,
    required: skeleton.required,
    storage: skeleton.storage,
  }

  const drop = new Set(nationalIx.slice(1))
  const nextFields = fields.filter((_, ix) => !drop.has(ix))
  return { ...draft, formFields: nextFields }
}

/**
 * 빠진 기본 코어만 뒤에 추가. 이미 존재하는 coreFieldKey는 건너뜀.
 * 주민 슬롯: birthDateSix → customer.birthDate, fullSsn → customer.ssn (insurance.ssn가 있어도 전체 입력으로 간주해 중복 추가 안 함).
 */
export function appendMissingDefaultCustomerCoreFields(draft: CrmTemplateDraft, mode: NationalIdCoreFieldMode): CrmTemplateDraft {
  const presentCoreKeys = new Set(
    draft.formFields.filter((f) => f.storage === 'core').map((f) => f.fieldKey.trim()),
  )
  const toAppend: CrmDraftFormField[] = []

  for (const partial of defaultRestoreRowsInCanonicalOrder(mode)) {
    const fk = partial.fieldKey.trim()

    if (fk === 'customer.birthDate') {
      if (mode !== 'birthDateSix') continue
      if (presentCoreKeys.has('customer.birthDate')) continue
      const row: CrmDraftFormField = { ...partial, localId: newLocalId() }
      toAppend.push(row)
      presentCoreKeys.add('customer.birthDate')
      continue
    }

    if (fk === 'customer.ssn') {
      if (mode !== 'fullSsn') continue
      if (presentCoreKeys.has('customer.ssn') || presentCoreKeys.has('insurance.ssn')) continue
      const row: CrmDraftFormField = { ...partial, localId: newLocalId() }
      toAppend.push(row)
      presentCoreKeys.add('customer.ssn')
      continue
    }

    if (!presentCoreKeys.has(fk)) {
      const row: CrmDraftFormField = { ...partial, localId: newLocalId() }
      toAppend.push(row)
      presentCoreKeys.add(fk)
    }
  }

  if (toAppend.length === 0) return draft
  return { ...draft, formFields: [...draft.formFields, ...toAppend] }
}
