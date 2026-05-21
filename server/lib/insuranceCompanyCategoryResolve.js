/**
 * 보험 구분(LIFE | NON_LIFE | GENERAL) 정규화·이름 추론·API 응답 보완.
 * 별칭 단일 소스: `shared/insuranceCompanyCategoryAliases.json` → `INSURANCE_COMPANY_CATEGORY_ALIASES`
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coerceMeritzFireToNonLifeCategory } from './insuranceCompanyCategoryRules.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ALIASES_PATH = path.join(__dirname, '../../shared/insuranceCompanyCategoryAliases.json')

/** 프론트 `INSURANCE_COMPANY_NAME_CATEGORY_OVERRIDES`와 동일 데이터(JSON 파일 한 곳만 수정) */
export const INSURANCE_COMPANY_CATEGORY_ALIASES =
  /** @type {Record<string, 'LIFE' | 'NON_LIFE' | 'GENERAL'>} */
  (JSON.parse(readFileSync(ALIASES_PATH, 'utf8')))

const VALID_CATEGORIES = new Set(['LIFE', 'NON_LIFE', 'GENERAL'])

export function normalizeInsuranceCompanyCategory(value) {
  const s = String(value ?? '')
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

const LIFE_NAMES = [
  '교보생명',
  '농협생명',
  '동양생명',
  '라이나생명',
  '메트라이프',
  '미래에셋',
  '삼성생명',
  '신한라이프',
  '처브라이프',
  '카디프생명',
  '하나생명',
  '한화생명',
  '흥국생명',
  'ABL생명',
  'DB생명',
  'IBK연금',
  'iM라이프',
  'KB라이프',
  'KDB생명',
]

const NON_LIFE_NAMES = [
  '농협손보',
  '라이나손보',
  '롯데손보',
  '메리츠',
  '메리츠화재',
  '삼성화재',
  '하나손보',
  '한화손보',
  '현대해상',
  '흥국화재',
  'DB손보',
  'KB손보',
  'MG손보',
]

const GENERAL_NAMES = ['삼성화재 일반', '현대해상 일반', 'DB손보 일반', 'KB손보 일반']

function normKey(name) {
  return String(name ?? '')
    .trim()
    .normalize('NFKC')
}

function buildExactMap() {
  /** @type {Record<string, 'LIFE' | 'NON_LIFE' | 'GENERAL'>} */
  const m = {}
  for (const n of LIFE_NAMES) {
    m[normKey(n)] = 'LIFE'
  }
  for (const n of NON_LIFE_NAMES) {
    m[normKey(n)] = 'NON_LIFE'
  }
  for (const n of GENERAL_NAMES) {
    m[normKey(n)] = 'GENERAL'
  }
  for (const [k, v] of Object.entries(INSURANCE_COMPANY_CATEGORY_ALIASES)) {
    m[normKey(k)] = v
  }
  return m
}

const EXACT_NAME_TO_CATEGORY = buildExactMap()

/**
 * 이름만으로 구분 추론(정확 일치 → 접미/키워드 휴리스틱).
 * @param {string | null | undefined} companyName
 * @returns {'' | 'LIFE' | 'NON_LIFE' | 'GENERAL'}
 */
export function inferInsuranceCategoryFromCompanyName(companyName) {
  const raw = normKey(companyName)
  if (!raw) {
    return ''
  }
  if (EXACT_NAME_TO_CATEGORY[raw]) {
    return EXACT_NAME_TO_CATEGORY[raw]
  }
  const compact = raw.replace(/\s+/g, '')
  if (EXACT_NAME_TO_CATEGORY[compact]) {
    return EXACT_NAME_TO_CATEGORY[compact]
  }

  if (
    /일반/.test(compact) &&
    (/(화재|해상|손보|손해)/.test(compact) || /^DB|^KB|^MG/.test(compact))
  ) {
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

/**
 * DB category가 비어 있어도 이름으로 보완한 뒤 메리츠 규칙 적용.
 * @param {string | null | undefined} rawCategory
 * @param {string | null | undefined} companyName
 */
export function resolveInsuranceCategoryForApi(rawCategory, companyName) {
  let n = normalizeInsuranceCompanyCategory(rawCategory)
  if (!n) {
    n = inferInsuranceCategoryFromCompanyName(companyName)
  }
  const out = coerceMeritzFireToNonLifeCategory(n, companyName)

  if (!VALID_CATEGORIES.has(out)) {
    console.warn('[보험사 카테고리 추론 실패]', {
      name: String(companyName ?? '').trim() || '(이름 없음)',
      rawCategory: rawCategory ?? '',
    })
  }

  return out
}
