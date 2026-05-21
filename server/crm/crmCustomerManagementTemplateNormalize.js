/** 동적 고객관리 템플릿 빌더 — 저장 요청 검증·정규화 */

export const ALLOWED_FORM_TYPES = /** @type {const} */ ([
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'phone',
])

const FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_.]*$/

/** 코어 저장소에 둘 수 있는 필드(canonical 키) — 그 외는 extension(crm_extension) */
export const CORE_STORAGE_FIELD_KEYS = /** @type {const} */ ([
  'customer.name',
  'customer.phone',
  'customer.ssn',
  'insurance.ssn',
  'customer.gender',
  'customer.address',
  'customer.job',
  'customer.height',
  'customer.weight',
  'customer.birthDate',
  'customer.carrier',
  'customer.memo',
])

const CORE_SET = new Set(CORE_STORAGE_FIELD_KEYS)

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, message: string }}
 */
function asNonEmptyString(raw, label) {
  if (raw === undefined || raw === null) {
    return { ok: false, message: `${label}이(가) 필요합니다.` }
  }
  const s = String(raw).trim()
  if (!s) {
    return { ok: false, message: `${label}이(가) 필요합니다.` }
  }
  return { ok: true, value: s }
}

/**
 * @param {unknown} raw
 * @returns {Array<{ value: string; label: string }>}
 */
function normalizeOptions(raw) {
  if (!Array.isArray(raw)) {
    return []
  }
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const v = String(item.value ?? '').trim()
    const lab = String(item.label ?? '').trim() || v
    if (!v) continue
    out.push({ value: v.slice(0, 200), label: lab.slice(0, 200) })
  }
  return out
}

/**
 * @param {unknown} body
 * @returns
 *   | { ok: true, data: {
 *       name: string,
 *       industryCode: string,
 *       description: string,
 *       status: 'active'|'draft'|'archived',
 *       formFields: object[],
 *       listColumns: object[],
 *       detailTabs: object[],
 *       sharedFeatureBindings: string[],
 *       extensionFeatureBindings: string[],
 *       metadata: Record<string, unknown>,
 *     }}
 *   | { ok: false, status: number, message: string }
 */
export function normalizeCrmCustomerManagementTemplateBody(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {}

  const nameR = asNonEmptyString(b.name, '템플릿명')
  if (!nameR.ok) {
    return { ok: false, status: 400, message: nameR.message }
  }
  const indR = asNonEmptyString(b.industry_code ?? b.industryCode, 'industryCode')
  if (!indR.ok) {
    return { ok: false, status: 400, message: indR.message }
  }
  const industryCode = indR.value.toLowerCase()
  if (industryCode === 'insurance') {
    return { ok: false, status: 400, message: '보험(insurance) 업종은 동적 템플릿을 사용할 수 없습니다.' }
  }

  const description = String(b.description ?? '').trim().slice(0, 2000)
  const statusRaw = String(b.status ?? 'active').trim().toLowerCase()
  const status =
    statusRaw === 'archived' ? 'archived' : statusRaw === 'draft' ? 'draft' : 'active'

  const formIn = Array.isArray(b.form_fields) ? b.form_fields : Array.isArray(b.formFields) ? b.formFields : []
  if (formIn.length === 0) {
    return { ok: false, status: 400, message: '폼 필드(form_fields)가 비어 있습니다.' }
  }
  if (formIn.length > 200) {
    return { ok: false, status: 400, message: '폼 필드는 최대 200개까지입니다.' }
  }

  const formFields = []
  const fieldKeySet = new Set()
  let orderCursor = 0

  for (const rawF of formIn) {
    if (!rawF || typeof rawF !== 'object' || Array.isArray(rawF)) {
      return { ok: false, status: 400, message: 'form_fields 항목 형식이 올바르지 않습니다.' }
    }
    const fk = String(rawF.fieldKey ?? rawF.field_key ?? '').trim()
    if (!FIELD_KEY_REGEX.test(fk)) {
      return { ok: false, status: 400, message: `잘못된 fieldKey: ${fk}` }
    }
    if (fieldKeySet.has(fk)) {
      return { ok: false, status: 400, message: `fieldKey 중복: ${fk}` }
    }
    fieldKeySet.add(fk)

    const labelR = asNonEmptyString(rawF.label, '필드 라벨')
    if (!labelR.ok) {
      return { ok: false, status: 400, message: `${fk}: ${labelR.message}` }
    }

    const typeRaw = String(rawF.type ?? rawF.widget ?? 'text').trim().toLowerCase()
    if (!ALLOWED_FORM_TYPES.includes(typeRaw)) {
      return { ok: false, status: 400, message: `${fk}: 허용되지 않은 필드 타입(${typeRaw})` }
    }

    const storageRaw = String(rawF.storage ?? 'extension').trim().toLowerCase()
    const storage = storageRaw === 'core' ? 'core' : 'extension'
    if (storage === 'core' && !CORE_SET.has(fk)) {
      return {
        ok: false,
        status: 400,
        message: `${fk}: core 저장은 허용된 코어 키만 사용할 수 있습니다.`,
      }
    }

    const options = normalizeOptions(rawF.options)
    if ((typeRaw === 'select' || typeRaw === 'radio' || typeRaw === 'checkbox') && options.length === 0) {
      return { ok: false, status: 400, message: `${fk}: select/radio/checkbox 는 options 가 필요합니다.` }
    }
    if (
      (typeRaw === 'select' || typeRaw === 'radio' || typeRaw === 'checkbox') &&
      options.length > 0
    ) {
      const seenVal = new Set()
      for (const opt of options) {
        if (seenVal.has(opt.value)) {
          return {
            ok: false,
            status: 400,
            message: `${fk}: 옵션 value가 중복됩니다: "${opt.value}"`,
          }
        }
        seenVal.add(opt.value)
      }
    }

    orderCursor += 10
    const order = Number.isFinite(Number(rawF.order)) ? Number(rawF.order) : orderCursor

    formFields.push({
      fieldKey: fk,
      label: labelR.value.slice(0, 200),
      type: typeRaw,
      widget: typeRaw,
      required: Boolean(rawF.required),
      placeholder: String(rawF.placeholder ?? '').trim().slice(0, 500),
      order,
      visibleDefault: rawF.visibleDefault === false ? false : true,
      sectionId: String(rawF.sectionId ?? rawF.section_id ?? '').trim().slice(0, 80),
      sectionLabel: String(rawF.sectionLabel ?? rawF.section_label ?? '').trim().slice(0, 120),
      options,
      storage,
      privacyLevel: String(rawF.privacyLevel ?? 'normal').trim() || 'normal',
      domain: String(rawF.domain ?? industryCode).trim().slice(0, 64) || industryCode,
    })
  }

  const coreFk = new Set()
  for (const x of formFields) {
    if (x.storage === 'core') coreFk.add(x.fieldKey)
  }
  if (coreFk.has('customer.birthDate') && (coreFk.has('customer.ssn') || coreFk.has('insurance.ssn'))) {
    return {
      ok: false,
      status: 400,
      message:
        '등록 폼에 customer.birthDate(주민번호 앞자리)와 customer.ssn/insurance.ssn(주민번호 전체)를 동시에 둘 수 없습니다.',
    }
  }

  const listIn = Array.isArray(b.list_columns) ? b.list_columns : Array.isArray(b.listColumns) ? b.listColumns : []
  const listColumns = []
  let listOrder = 0
  for (const rawC of listIn) {
    if (!rawC || typeof rawC !== 'object' || Array.isArray(rawC)) {
      return { ok: false, status: 400, message: 'list_columns 형식 오류' }
    }
    const columnKey = String(rawC.columnKey ?? rawC.column_key ?? '').trim()
    if (!FIELD_KEY_REGEX.test(columnKey)) {
      return { ok: false, status: 400, message: `잘못된 columnKey: ${columnKey}` }
    }
    const labelCr = asNonEmptyString(rawC.label, '컬럼 라벨')
    if (!labelCr.ok) {
      return { ok: false, status: 400, message: `${columnKey}: ${labelCr.message}` }
    }
    const sourceFieldKey = String(rawC.sourceFieldKey ?? rawC.source_field_key ?? '').trim()
    if (!FIELD_KEY_REGEX.test(sourceFieldKey)) {
      return { ok: false, status: 400, message: `잘못된 sourceFieldKey: ${sourceFieldKey}` }
    }
    if (!fieldKeySet.has(sourceFieldKey)) {
      return {
        ok: false,
        status: 400,
        message: `목록 컬럼의 sourceFieldKey("${sourceFieldKey}")가 form_fields 에 없습니다.`,
      }
    }
    const displayTypeRaw = String(rawC.displayType ?? rawC.display_type ?? 'auto')
      .trim()
      .toLowerCase()
    const displayType = ['auto', 'text', 'date', 'number'].includes(displayTypeRaw) ? displayTypeRaw : 'auto'
    listOrder += 10
    const order = Number.isFinite(Number(rawC.order)) ? Number(rawC.order) : listOrder
    listColumns.push({
      columnKey,
      label: labelCr.value.slice(0, 200),
      sourceFieldKey,
      order,
      visibleDefault: rawC.visibleDefault === false ? false : true,
      domain: String(rawC.domain ?? industryCode).trim().slice(0, 64) || industryCode,
      displayType,
    })
  }

  const tabIn = Array.isArray(b.detail_tabs) ? b.detail_tabs : Array.isArray(b.detailTabs) ? b.detailTabs : []
  const detailTabs = []
  let tabOrder = 0
  for (const rawT of tabIn) {
    if (!rawT || typeof rawT !== 'object' || Array.isArray(rawT)) {
      return { ok: false, status: 400, message: 'detail_tabs 형식 오류' }
    }
    const tabId = String(rawT.tabId ?? rawT.tab_id ?? '').trim()
    if (!tabId || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tabId)) {
      return { ok: false, status: 400, message: `잘못된 tabId: ${tabId}` }
    }
    const tabLabelR = asNonEmptyString(rawT.label, '탭 라벨')
    if (!tabLabelR.ok) {
      return { ok: false, status: 400, message: `${tabId}: ${tabLabelR.message}` }
    }
    const fieldKeysRaw = Array.isArray(rawT.fieldKeys) ? rawT.fieldKeys : []
    /** @type {string[]} */
    const fieldKeys = []
    for (const k of fieldKeysRaw) {
      const ks = String(k ?? '').trim()
      if (!ks) continue
      if (!fieldKeySet.has(ks)) {
        return {
          ok: false,
          status: 400,
          message: `탭 ${tabId}: fieldKey "${ks}" 가 form_fields 에 없습니다.`,
        }
      }
      fieldKeys.push(ks)
    }
    tabOrder += 10
    const order = Number.isFinite(Number(rawT.order)) ? Number(rawT.order) : tabOrder
    detailTabs.push({
      tabId,
      label: tabLabelR.value.slice(0, 200),
      order,
      visibleDefault: rawT.visibleDefault === false ? false : true,
      fieldKeys,
      domain: String(rawT.domain ?? industryCode).trim().slice(0, 64) || industryCode,
      featureBinding: `dynamic.${tabId}`,
    })
  }

  const sharedFb = normalizeStringArray(b.shared_feature_bindings ?? b.sharedFeatureBindings).slice(0, 48)
  const extFb = normalizeStringArray(b.extension_feature_bindings ?? b.extensionFeatureBindings).slice(0, 48)

  const metadata =
    b.metadata != null && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? b.metadata
      : {}

  return {
    ok: true,
    data: {
      name: nameR.value.slice(0, 200),
      industryCode,
      description,
      status,
      formFields,
      listColumns,
      detailTabs,
      sharedFeatureBindings: sharedFb,
      extensionFeatureBindings: extFb,
      metadata,
    },
  }
}

/** @param {unknown} raw @returns {string[]} */
function normalizeStringArray(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const x of raw) {
    const s = String(x ?? '').trim().slice(0, 128)
    if (s) out.push(s)
  }
  return out
}
