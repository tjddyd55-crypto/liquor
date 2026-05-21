import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GOV_PROFILE_CONSULTATION_BODY_MAX,
  mapGovSupportProfileConsultationRow,
  normalizeGovProfileConsultationContent,
  normalizeGovProfileConsultationDate,
  parseGovProfileConsultationPatchBody,
} from './governmentProfileConsultations.js'

describe('normalizeGovProfileConsultationContent', () => {
  it('빈 내용 거부', () => {
    const r = normalizeGovProfileConsultationContent('  ')
    assert.equal(r.ok, false)
  })

  it('최대 길이 초과 거부', () => {
    const r = normalizeGovProfileConsultationContent('x'.repeat(GOV_PROFILE_CONSULTATION_BODY_MAX + 1))
    assert.equal(r.ok, false)
  })
})

describe('normalizeGovProfileConsultationDate', () => {
  it('비어 있으면 오늘 날짜', () => {
    const r = normalizeGovProfileConsultationDate(null)
    assert.equal(r.ok, true)
    assert.match(r.consultedAt, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('잘못된 형식 거부', () => {
    const r = normalizeGovProfileConsultationDate('2026/05/19')
    assert.equal(r.ok, false)
  })
})

describe('parseGovProfileConsultationPatchBody', () => {
  it('POST: body + consultationDate', () => {
    const r = parseGovProfileConsultationPatchBody(
      { body: 'hello', consultationDate: '2026-05-19' },
      { requireContent: true },
    )
    assert.equal(r.ok, true)
    assert.equal(r.patch.content, 'hello')
    assert.equal(r.patch.consultedAt, '2026-05-19')
  })

  it('PATCH: 수정 필드 없으면 거부', () => {
    const r = parseGovProfileConsultationPatchBody({}, { requireContent: false })
    assert.equal(r.ok, false)
  })
})

describe('mapGovSupportProfileConsultationRow', () => {
  it('보험 UI 호환 body/consultationDate 매핑', () => {
    const created = new Date('2026-05-19T10:00:00.000Z')
    const row = mapGovSupportProfileConsultationRow({
      id: 3,
      profile_id: 9,
      owner_user_id: 'u1',
      consultation_type: '',
      title: '',
      content: '상담 내용',
      status: '',
      consulted_at: '2026-05-18',
      created_by_user_id: 'u1',
      updated_by_user_id: 'u1',
      created_at: created,
      updated_at: created,
      archived_at: null,
    })
    assert.equal(row.body, '상담 내용')
    assert.equal(row.consultationDate, '2026-05-18')
    assert.equal(row.profileId, '9')
  })
})
