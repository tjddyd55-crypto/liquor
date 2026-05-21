import { canonicalInsuranceCategoryForFilter, normalizeInsuranceCategory, resolveTabCategory } from './categoryUtils'
import {
  buildStaticCompanyCode,
  isInsCompanyCode,
  parseStaticCompanyCode,
} from './companyCode'
import type { InsuranceCategory } from './insuranceConstants'
import type {
  CompanyDirectoryEntry,
  InsuranceCompanyContactDraft,
  InsuranceCompanyFormState,
} from './types'

const EMPTY_COMPANY_FIELDS: Omit<InsuranceCompanyFormState, 'id' | 'category' | 'name' | 'companyCode'> = {
  customerCenter: '',
  systemPhone: '',
  incallNumber: '',
  visitInfo: '',
}

export const EMPTY_CONTACT: InsuranceCompanyContactDraft = { name: '', position: '', phone: '' }

function entryToFormState(entry: CompanyDirectoryEntry): InsuranceCompanyFormState {
  const resolved =
    resolveTabCategory(entry.category, entry.name) ||
    normalizeInsuranceCategory(entry.category) ||
    entry.category
  return {
    id: entry.id,
    companyCode: entry.companyCode,
    category: resolved,
    name: entry.name,
    customerCenter: entry.customerCenter,
    systemPhone: entry.systemPhone,
    incallNumber: entry.incallNumber,
    visitInfo: entry.visitInfo,
  }
}

function entryContactsToDrafts(entry: CompanyDirectoryEntry): InsuranceCompanyContactDraft[] {
  if (!entry.contacts?.length) {
    return [{ ...EMPTY_CONTACT }]
  }
  return entry.contacts.map((c) => ({
    name: c.name ?? '',
    position: c.position ?? '',
    phone: c.phone ?? '',
  }))
}

/** DB 레코드 한 건을 폼 상태·담당자 초안으로 변환 (목록 클릭·자동 매칭 공통) */
export function formStateFromDirectoryEntry(entry: CompanyDirectoryEntry): {
  company: InsuranceCompanyFormState
  contacts: InsuranceCompanyContactDraft[]
} {
  return {
    company: entryToFormState(entry),
    contacts: entryContactsToDrafts(entry),
  }
}

/**
 * 선택 companyCode(INS… 또는 STATIC:…)와 목록 행 매칭.
 * STATIC → 동일 표준명으로 이미 저장된 행이 있으면 반환(최초 등록 전에는 undefined).
 */
export function findSavedEntryForSelection(
  rows: CompanyDirectoryEntry[],
  selectedType: InsuranceCategory,
  selectedCompanyCode: string,
): CompanyDirectoryEntry | undefined {
  const code = selectedCompanyCode.trim()
  if (!code) {
    return undefined
  }
  const want = canonicalInsuranceCategoryForFilter(selectedType)
  if (!want) {
    return undefined
  }
  if (isInsCompanyCode(code)) {
    return rows.find(
      (e) =>
        e.companyCode === code &&
        canonicalInsuranceCategoryForFilter(e.category, e.name ?? '') === want,
    )
  }
  const st = parseStaticCompanyCode(code)
  if (st && st.category === want) {
    const q = st.name.trim().normalize('NFKC')
    return rows.find(
      (e) =>
        e.name.trim().normalize('NFKC') === q &&
        canonicalInsuranceCategoryForFilter(e.category, e.name ?? '') === want,
    )
  }
  return undefined
}

export type LoadCompanyDataResult =
  | {
      syncForm: true
      company: InsuranceCompanyFormState
      contacts: InsuranceCompanyContactDraft[]
      prevSelection: { type: string; companyCode: string }
    }
  | {
      syncForm: false
      prevSelection: { type: string; companyCode: string }
    }

/**
 * 보험 종류·보험사 선택(companyCode)과 서버 목록을 기준으로 폼에 반영할 데이터를 계산합니다.
 */
export function loadCompanyData(
  list: CompanyDirectoryEntry[],
  selectedType: InsuranceCategory | '',
  selectedCompanyCode: string,
  prevSelection: { type: string; companyCode: string },
): LoadCompanyDataResult | null {
  const codeTrim = selectedCompanyCode.trim()
  if (!codeTrim) {
    return {
      syncForm: true,
      company: {
        id: null,
        companyCode: '',
        category: selectedType || '',
        name: '',
        ...EMPTY_COMPANY_FIELDS,
      },
      contacts: [{ ...EMPTY_CONTACT }],
      prevSelection: { type: '', companyCode: '' },
    }
  }

  if (!selectedType) {
    return null
  }

  const entry = findSavedEntryForSelection(list, selectedType, selectedCompanyCode)
  const nextPrev = { type: selectedType, companyCode: codeTrim }

  if (entry) {
    const { company: loaded, contacts } = formStateFromDirectoryEntry(entry)
    return {
      syncForm: true,
      company: {
        ...loaded,
        companyCode: loaded.companyCode || codeTrim,
        name: loaded.name,
        category: selectedType,
      },
      contacts,
      prevSelection: nextPrev,
    }
  }

  const selChanged = prevSelection.type !== selectedType || prevSelection.companyCode !== codeTrim

  if (selChanged) {
    const st = parseStaticCompanyCode(codeTrim)
    const displayName = st?.name ?? ''
    return {
      syncForm: true,
      company: {
        id: null,
        companyCode: codeTrim,
        category: selectedType,
        name: displayName,
        ...EMPTY_COMPANY_FIELDS,
        customerCenter: '',
      },
      contacts: [{ ...EMPTY_CONTACT }],
      prevSelection: nextPrev,
    }
  }

  return {
    syncForm: false,
    prevSelection: nextPrev,
  }
}

export { buildStaticCompanyCode, isInsCompanyCode, parseStaticCompanyCode }
