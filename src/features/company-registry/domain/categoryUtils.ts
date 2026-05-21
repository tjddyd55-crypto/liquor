import {
  INSURANCE_COMPANY_NAME_CATEGORY_OVERRIDES,
  INSURANCE_TYPE_LABELS,
  INSURANCE_TYPE_ORDER,
  type InsuranceCategory,
} from './insuranceConstants'

export function normalizeInsuranceCategory(raw: string | undefined | null): InsuranceCategory | '' {
  const s = String(raw ?? '')
    .trim()
    .normalize('NFKC')
  if (!s) {
    return ''
  }
  const u = s.toUpperCase().replace(/-/g, '_')
  if (u === 'NONLIFE') {
    return 'NON_LIFE'
  }
  if (u === 'LIFE' || u === 'NON_LIFE' || u === 'GENERAL') {
    return u
  }
  const lower = s.toLowerCase()
  if (lower === 'life') {
    return 'LIFE'
  }
  if (lower === 'nonlife') {
    return 'NON_LIFE'
  }

  const ko = s.replace(/\s+/g, '')
  if (/^(생명|생명보험|생보)$/.test(ko) || ko === '생명보험') {
    return 'LIFE'
  }
  if (
    /^(손해|손해보험|손보|재산|화재)$/.test(ko) ||
    ko === '손해보험' ||
    ko === '손해보험사'
  ) {
    return 'NON_LIFE'
  }
  if (/^(일반|일반보험)$/.test(ko) || ko === '일반보험') {
    return 'GENERAL'
  }
  return ''
}

function compactCompanyName(name: string): string {
  return name.replace(/\s+/g, '')
}

/** 메리츠 화재 계열 — 서버 `coerceMeritzFireToNonLifeCategory`와 동일 조건 */
function isMeritzFireCompanyName(name: string): boolean {
  const n = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
  return (
    n === '메리츠' ||
    n === '메리츠화재' ||
    n === '메리츠 화재' ||
    (n.startsWith('메리츠') && n.includes('화재'))
  )
}

/**
 * 맵 정확 일차 외: 별칭·접미/키워드로 LIFE | NON_LIFE | GENERAL 추론.
 */
export function inferInsuranceCategoryFromNameHeuristics(companyName: string): InsuranceCategory | '' {
  const raw = String(companyName ?? '')
    .trim()
    .normalize('NFKC')
  if (!raw) {
    return ''
  }
  if (isMeritzFireCompanyName(raw)) {
    return 'NON_LIFE'
  }

  const fromOverride =
    INSURANCE_COMPANY_NAME_CATEGORY_OVERRIDES[raw] ??
    INSURANCE_COMPANY_NAME_CATEGORY_OVERRIDES[compactCompanyName(raw)]
  if (fromOverride) {
    return fromOverride
  }

  const compact = compactCompanyName(raw)
  if (/일반/.test(compact) && (/(화재|해상|손보|손해)/.test(compact) || /^DB|^KB|^MG/.test(compact))) {
    return 'GENERAL'
  }
  if (/(생명|생보|라이프)$/.test(compact) || compact.endsWith('연금') || /라이프$/i.test(raw)) {
    return 'LIFE'
  }
  if (/(화재|해상|손보|손해|손해보험|재보험)/.test(compact)) {
    return 'NON_LIFE'
  }
  return ''
}

/** 연락처 조회 탭 매칭: 정규화 → 맵 매칭. 여전히 없으면 '' (호출부에서 생명 탭 폴백 가능). */
export function resolveTabCategory(
  rawCategory: string | undefined | null,
  companyName: string | undefined | null,
): InsuranceCategory | '' {
  return canonicalInsuranceCategoryForFilter(rawCategory, String(companyName ?? ''))
}

/**
 * 1차 탭 선택값만 정규화 (이름 미사용).
 */
function canonicalTabSelectionCategory(selected: string | undefined | null): InsuranceCategory | '' {
  const s = String(selected ?? '')
    .trim()
    .normalize('NFKC')
  if (!s) {
    return ''
  }
  const fromNorm = normalizeInsuranceCategory(s)
  if (fromNorm) {
    return fromNorm
  }
  if ((INSURANCE_TYPE_ORDER as readonly string[]).includes(s)) {
    return s as InsuranceCategory
  }
  return ''
}

/**
 * - 인자 1개: 1차(생명/손해/일반) 탭 값 정규화.
 * - 인자 2개: 목록 행 — category 정규화 후 없으면 보험사명으로 추론(별칭 JSON·휴리스틱).
 */
export function canonicalInsuranceCategoryForFilter(
  categoryOrSelected: string | undefined | null,
  companyName?: string | null,
): InsuranceCategory | '' {
  if (companyName !== undefined) {
    const fromCat = normalizeInsuranceCategory(categoryOrSelected)
    if (fromCat) {
      return isMeritzFireCompanyName(String(companyName ?? '')) ? 'NON_LIFE' : fromCat
    }
    const n = String(companyName ?? '')
      .trim()
      .normalize('NFKC')
    if (!n) {
      return ''
    }
    const inferred = inferInsuranceCategoryFromNameHeuristics(n)
    return inferred
  }
  return canonicalTabSelectionCategory(categoryOrSelected)
}

export function insuranceCategoryLabel(cat: string | undefined | null): string {
  const raw = typeof cat === 'string' ? cat : String(cat ?? '')
  const n = normalizeInsuranceCategory(raw)
  if (n && n in INSURANCE_TYPE_LABELS) {
    return INSURANCE_TYPE_LABELS[n]
  }
  return raw || '—'
}

export function insuranceTypeSortRank(cat: string): number {
  const n = normalizeInsuranceCategory(cat)
  const idx = INSURANCE_TYPE_ORDER.indexOf(n as InsuranceCategory)
  return idx === -1 ? 99 : idx
}
