/**
 * 동의서 템플릿 ID는 서버 `GET /api/consent/templates` 응답으로만 결정합니다.
 * (ga_id + insurance_company_id 당 1템플릿)
 */

export function consentTemplatesByCompanyId(
  rows: { id: string; insurance_company_id: string }[],
): Map<string, string> {
  const m = new Map<string, string>()
  for (const row of rows) {
    const cid = String(row.insurance_company_id ?? '').trim()
    if (cid) {
      m.set(cid, String(row.id))
    }
  }
  return m
}
