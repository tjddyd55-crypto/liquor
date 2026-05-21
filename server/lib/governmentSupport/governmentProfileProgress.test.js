import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GOV_PROFILE_PROGRESS_CONTENT_MAX,
  GOV_PROFILE_PROGRESS_TITLE_MAX,
  mapGovSupportProfileProgressEventRow,
  normalizeGovProfileProgressContent,
  normalizeGovProfileProgressEventDate,
  parseGovProfileProgressPatchBody,
} from './governmentProfileProgress.js'

describe('normalizeGovProfileProgressContent', () => {
  it('빈 내용 거부', () => {
    const r = normalizeGovProfileProgressContent('  ')
    assert.equal(r.ok, false)
  })

  it('최대 길이 초과 거부', () => {
    const r = normalizeGovProfileProgressContent('x'.repeat(GOV_PROFILE_PROGRESS_CONTENT_MAX + 1))
    assert.equal(r.ok, false)
  })
})

describe('normalizeGovProfileProgressEventDate', () => {
  it('비어 있으면 오늘 날짜', () => {
    const r = normalizeGovProfileProgressEventDate(null)
    assert.equal(r.ok, true)
    assert.match(r.eventDate, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('잘못된 형식 거부', () => {
    const r = normalizeGovProfileProgressEventDate('2026/05/19')
    assert.equal(r.ok, false)
  })
})

describe('parseGovProfileProgressPatchBody', () => {
  it('POST: status + content + eventDate', () => {
    const r = parseGovProfileProgressPatchBody(
      { status: '검토 중', content: 'hello', eventDate: '2026-05-19', title: '제목' },
      { requireContent: true, requireStatus: true },
    )
    assert.equal(r.ok, true)
    assert.equal(r.patch.content, 'hello')
    assert.equal(r.patch.status, '검토 중')
    assert.equal(r.patch.eventDate, '2026-05-19')
    assert.equal(r.patch.title, '제목')
  })

  it('body/memo 별칭 지원', () => {
    const r = parseGovProfileProgressPatchBody(
      { status: '접수 완료', body: 'memo text' },
      { requireContent: true, requireStatus: true },
    )
    assert.equal(r.ok, true)
    assert.equal(r.patch.content, 'memo text')
  })

  it('PATCH: 수정 필드 없으면 거부', () => {
    const r = parseGovProfileProgressPatchBody({}, { requireContent: false, requireStatus: false })
    assert.equal(r.ok, false)
  })

  it('제목 최대 길이 초과 거부', () => {
    const r = parseGovProfileProgressPatchBody(
      { title: 'x'.repeat(GOV_PROFILE_PROGRESS_TITLE_MAX + 1) },
      { requireContent: false, requireStatus: false },
    )
    assert.equal(r.ok, false)
  })
})

describe('mapGovSupportProfileProgressEventRow', () => {
  it('진행 이력 행 매핑', () => {
    const created = new Date('2026-05-19T10:00:00.000Z')
    const row = mapGovSupportProfileProgressEventRow({
      id: 5,
      profile_id: 9,
      owner_user_id: 'u1',
      status: '검토 중',
      title: '서류 검토',
      content: '처리 메모',
      event_date: '2026-05-18',
      created_by_user_id: 'u1',
      updated_by_user_id: 'u1',
      created_at: created,
      updated_at: created,
      archived_at: null,
    })
    assert.equal(row.status, '검토 중')
    assert.equal(row.content, '처리 메모')
    assert.equal(row.eventDate, '2026-05-18')
    assert.equal(row.profileId, '9')
  })
})
