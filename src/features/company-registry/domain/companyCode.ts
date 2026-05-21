import type { InsuranceCategory } from './insuranceConstants'

/** 미등록(표준 맵) 선택 시 2차 드롭다운 값. 저장 후 서버는 INS + id 코드를 부여. */
export const STATIC_COMPANY_CODE_PREFIX = 'STATIC:'

export function isInsCompanyCode(code: string): boolean {
  return /^INS\d+$/.test(String(code ?? '').trim())
}

export function buildStaticCompanyCode(category: InsuranceCategory, name: string): string {
  return `${STATIC_COMPANY_CODE_PREFIX}${category}:${String(name ?? '').trim().normalize('NFKC')}`
}

export function parseStaticCompanyCode(
  code: string,
): { category: InsuranceCategory; name: string } | null {
  const s = String(code ?? '').trim()
  if (!s.startsWith(STATIC_COMPANY_CODE_PREFIX)) {
    return null
  }
  const rest = s.slice(STATIC_COMPANY_CODE_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon <= 0) {
    return null
  }
  const cat = rest.slice(0, colon)
  const name = rest.slice(colon + 1).trim()
  if (cat !== 'LIFE' && cat !== 'NON_LIFE' && cat !== 'GENERAL') {
    return null
  }
  return { category: cat as InsuranceCategory, name }
}
