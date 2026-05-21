import type { CompanyDirectoryEntry } from '../../company-registry/domain/types'
import type { NewsletterDetail } from '../types'

function slugifyInsurerName(name: string): string {
  const t = name.trim().toLowerCase().replace(/\s+/g, '-')
  const stripped = t.replace(/[^\w\u3131-\u318e\uac00-\ud7a3-]/g, '')
  return stripped.slice(0, 48) || 'insurer'
}

/**
 * 디렉터리 행(company_id) → 소식 저장에 쓰는 GA+원수사 컨텍스트.
 */
export function buildNewsletterContextFromCompany(
  gaCode: string,
  entry: CompanyDirectoryEntry,
): { gaCode: string; insurerCode: string; insurerName: string; insurerSlug: string } {
  const g = gaCode.trim().toUpperCase()
  const code = entry.companyCode.trim()
  return {
    gaCode: g,
    insurerCode: code || `ID${entry.id}`,
    insurerName: entry.name.trim(),
    insurerSlug: slugifyInsurerName(entry.name),
  }
}

/** 목록·상세: 로그인 원수사(company 마스터)에 속한 소식지만 */
export function isNewsletterInCompanyScope(
  n: NewsletterDetail | Pick<NewsletterDetail, 'gaCode' | 'insurerCode' | 'insurerSlug' | 'insurerName'>,
  entry: CompanyDirectoryEntry,
  gaCode: string,
): boolean {
  if (n.gaCode !== gaCode.trim().toUpperCase()) {
    return false
  }
  const ctx = buildNewsletterContextFromCompany(gaCode, entry)
  if (n.insurerCode === ctx.insurerCode && n.insurerSlug === ctx.insurerSlug) {
    return true
  }
  if (n.insurerName.trim() === entry.name.trim()) {
    return true
  }
  const codeUpper = entry.companyCode.trim().toUpperCase()
  if (codeUpper && n.insurerCode.toUpperCase() === codeUpper) {
    return true
  }
  return false
}
