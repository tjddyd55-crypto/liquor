/** initDb 시드용 — 보험사(insurance_company_id)별 기본 템플릿. ga_id는 DB의 YJASSET 행으로 채움 */

export const DEFAULT_CONSENT_FIELD_LAYOUT = Object.freeze([
  { type: 'text', key: 'name', x: 120, y: 720, fontSize: 12, page: 0 },
  { type: 'text', key: 'ssn', x: 120, y: 690, fontSize: 12, page: 0 },
  { type: 'text', key: 'phone', x: 120, y: 660, fontSize: 12, page: 0 },
  { type: 'signature', key: 'signature', x: 100, y: 500, width: 140, height: 50, page: 0 },
])

export const SEEDED_CONSENT_TEMPLATES = Object.freeze([
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    insuranceCompanyId: 'life-samsung',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    insuranceCompanyId: 'life-hanwha',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000003',
    insuranceCompanyId: 'life-kyobo',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000004',
    insuranceCompanyId: 'nonlife-samsung',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    insuranceCompanyId: 'nonlife-db',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000006',
    insuranceCompanyId: 'nonlife-meritz',
  },
])
