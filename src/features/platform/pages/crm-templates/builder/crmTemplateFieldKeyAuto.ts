import { CRM_TEMPLATE_FIELD_KEY_REGEX, CRM_TEMPLATE_TAB_ID_REGEX } from './crmTemplateBuilder.constants'
import type { CrmDraftDetailTab, CrmDraftFormField, CrmTemplateDraft } from './crmTemplateBuilder.types'

/** 라벨에서 extension 키 세그먼트(camelCase) 추출 — 라틴 문자가 없으면 빈 문자열 */
export function labelToKeySegment(label: string): string {
  const latin = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  if (!latin || !/^[a-z]/.test(latin)) return ''

  const parts = latin.split('_').filter(Boolean)
  if (parts.length === 0) return ''
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

function sanitizeNamespace(code: string): string {
  const ns = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return ns && /^[a-z]/.test(ns) ? ns : 'custom'
}

function ensureUnique(
  base: string,
  used: Set<string>,
  suffixFn: (base: string, n: number) => string,
): string {
  if (!used.has(base) && CRM_TEMPLATE_FIELD_KEY_REGEX.test(base)) return base
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = suffixFn(base, n)
    if (!used.has(candidate) && CRM_TEMPLATE_FIELD_KEY_REGEX.test(candidate)) return candidate
  }
  const tail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return suffixFn(base, 0).replace(/\.[^.]+$/, '') + `.f${tail}`
}

/** 확장 필드 canonical 키 — industry 네임스페이스 우선 */
export function generateExtensionFieldKey(
  label: string,
  industryCode: string,
  used: Set<string>,
): string {
  const ns = sanitizeNamespace(industryCode)
  const segment = labelToKeySegment(label)
  const base = segment ? `${ns}.${segment}` : `${ns}.field`
  const key = ensureUnique(base, used, (b, n) => {
    if (n <= 1) return b
    const dot = b.lastIndexOf('.')
    if (dot >= 0) {
      return `${b.slice(0, dot + 1)}${b.slice(dot + 1)}${n}`
    }
    return `${b}${n}`
  })
  used.add(key)
  return key
}

export function sourceFieldKeyToColumnKey(sourceFieldKey: string, used: Set<string>): string {
  const raw = sourceFieldKey.trim().replace(/\./g, '_')
  if (!raw) return ''
  const base = /^[a-zA-Z]/.test(raw) ? raw : `col_${raw}`
  const key = ensureUnique(base, used, (b, n) => (n <= 1 ? b : `${b}_${n}`))
  used.add(key)
  return key
}

export function generateTabId(label: string, industryCode: string, used: Set<string>): string {
  const ns = sanitizeNamespace(industryCode)
  const segment = labelToKeySegment(label).replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
  const slug = segment ? segment.replace(/_/g, '_') : ''
  const base = slug ? `${ns}_${slug}` : `${ns}_tab`
  const key = ensureUnique(base, used, (b, n) => (n <= 1 ? b : `${b}_${n}`))
  if (!CRM_TEMPLATE_TAB_ID_REGEX.test(key)) {
    const fallback = `${ns}_tab_${used.size + 1}`
    used.add(fallback)
    return fallback
  }
  used.add(key)
  return key
}

/** 저장·미리보기 직전: 비어 있는 내부 키만 채운다. 기존 키는 유지한다. */
export function normalizeCrmTemplateDraftKeys(
  draft: CrmTemplateDraft,
  industryCode: string,
): CrmTemplateDraft {
  const ic = industryCode.trim().toLowerCase()
  const formFieldKeys = new Set<string>()

  const formFields = draft.formFields.map((f) => {
    if (f.storage === 'core') {
      const fk = f.fieldKey.trim()
      if (fk) formFieldKeys.add(fk)
      return f
    }
    let fk = f.fieldKey.trim()
    if (!fk) {
      const seed = f.label.trim() || `field_${f.localId.slice(0, 8)}`
      fk = generateExtensionFieldKey(seed, ic, formFieldKeys)
    } else {
      formFieldKeys.add(fk)
    }
    return fk === f.fieldKey ? f : { ...f, fieldKey: fk }
  })

  const columnKeys = new Set<string>()
  const listColumns = draft.listColumns.map((c) => {
    let sourceFieldKey = c.sourceFieldKey.trim()
    let columnKey = c.columnKey.trim()
    if (!columnKey && sourceFieldKey) {
      columnKey = sourceFieldKeyToColumnKey(sourceFieldKey, columnKeys)
    } else if (columnKey) {
      columnKeys.add(columnKey)
    }
    return {
      ...c,
      sourceFieldKey,
      columnKey: columnKey || c.columnKey,
    }
  })

  const tabIds = new Set<string>()
  const detailTabs = draft.detailTabs.map((t) => {
    let tabId = t.tabId.trim()
    if (!tabId) {
      const seed = t.label.trim() || `tab_${t.localId.slice(0, 8)}`
      tabId = generateTabId(seed, ic, tabIds)
    } else {
      tabIds.add(tabId)
    }
    return tabId === t.tabId ? t : { ...t, tabId }
  })

  return { ...draft, formFields, listColumns, detailTabs }
}

/**
 * @deprecated UI 라벨 입력 중 호출하지 않는다. `normalizeCrmTemplateDraftKeys`(저장·미리보기)만 사용.
 * 신규 확장 필드: fieldKey가 비어 있을 때만 자동 부여.
 */
export function maybeAssignExtensionFieldKeyFromLabel(
  field: CrmDraftFormField,
  label: string,
  industryCode: string,
  siblingFields: readonly CrmDraftFormField[],
): Partial<CrmDraftFormField> | null {
  if (field.storage !== 'extension') return null
  if (field.fieldKey.trim()) return null
  const used = new Set(
    siblingFields
      .filter((o) => o.localId !== field.localId && o.fieldKey.trim())
      .map((o) => o.fieldKey.trim()),
  )
  const seed = label.trim() || `field_${field.localId.slice(0, 8)}`
  return { fieldKey: generateExtensionFieldKey(seed, industryCode, used) }
}

/**
 * @deprecated UI 라벨 입력 중 호출하지 않는다. `normalizeCrmTemplateDraftKeys`(저장·미리보기)만 사용.
 * 신규 탭: tabId가 비어 있을 때만.
 */
export function maybeAssignTabIdFromLabel(
  tab: CrmDraftDetailTab,
  label: string,
  industryCode: string,
  siblingTabs: readonly CrmDraftDetailTab[],
): Partial<CrmDraftDetailTab> | null {
  if (tab.tabId.trim()) return null
  const used = new Set(
    siblingTabs.filter((o) => o.localId !== tab.localId && o.tabId.trim()).map((o) => o.tabId.trim()),
  )
  const seed = label.trim()
  if (!seed) return null
  return { tabId: generateTabId(seed, industryCode, used) }
}
