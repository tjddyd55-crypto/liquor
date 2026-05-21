import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGovernmentProfileFileObjectKey,
  assertGovernmentProfileFileObjectKey,
  sanitizeGovernmentProfileFileName,
} from './governmentProfileFileStorage.js'
import {
  GOV_PROFILE_FILE_MAX_BYTES,
  isValidGovProfileFileName,
  mapGovSupportProfileFileRow,
  normalizeGovProfileFileName,
  parseGovProfileFilePatchBody,
} from './governmentProfileFiles.js'

describe('buildGovernmentProfileFileObjectKey', () => {
  it('government/profile-files 경로 사용', () => {
    const key = buildGovernmentProfileFileObjectKey({
      ownerUserId: 'user-1',
      profileId: '9',
      fileId: '3',
      fileName: 'test.pdf',
    })
    assert.match(key, /government\/profile-files\/user-1\/9\/3\//)
    assert.match(key, /test\.pdf$/)
  })

  it('assertGovernmentProfileFileObjectKey 일치', () => {
    const key = buildGovernmentProfileFileObjectKey({
      ownerUserId: 'u1',
      profileId: '2',
      fileId: '5',
      fileName: 'a.pdf',
    })
    assert.equal(
      assertGovernmentProfileFileObjectKey(key, { ownerUserId: 'u1', profileId: '2', fileId: '5' }),
      true,
    )
  })
})

describe('normalizeGovProfileFileName', () => {
  it('공백 정규화', () => {
    assert.equal(normalizeGovProfileFileName('  hello   world.pdf  '), 'hello world.pdf')
  })
})

describe('isValidGovProfileFileName', () => {
  it('한글 파일명 허용', () => {
    assert.equal(isValidGovProfileFileName('사업자등록증.pdf'), true)
  })

  it('빈 이름 거부', () => {
    assert.equal(isValidGovProfileFileName('  '), false)
  })
})

describe('parseGovProfileFilePatchBody', () => {
  it('fileName 수정', () => {
    const r = parseGovProfileFilePatchBody({ fileName: 'new-name.pdf' })
    assert.equal(r.ok, true)
    assert.equal(r.patch.fileName, 'new-name.pdf')
  })

  it('수정 필드 없으면 거부', () => {
    const r = parseGovProfileFilePatchBody({})
    assert.equal(r.ok, false)
  })
})

describe('mapGovSupportProfileFileRow', () => {
  it('행 매핑', () => {
    const created = new Date('2026-05-22T10:00:00.000Z')
    const row = mapGovSupportProfileFileRow({
      id: 7,
      profile_id: 9,
      owner_user_id: 'u1',
      file_name: 'doc.pdf',
      file_key: 'government/profile-files/u1/9/7/doc.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
      category: '',
      description: '',
      upload_status: 'active',
      created_by_user_id: 'u1',
      updated_by_user_id: 'u1',
      created_at: created,
      updated_at: created,
      archived_at: null,
    })
    assert.equal(row.fileName, 'doc.pdf')
    assert.equal(row.profileId, '9')
    assert.equal(row.fileSize, 1024)
  })
})

describe('GOV_PROFILE_FILE_MAX_BYTES', () => {
  it('25MB', () => {
    assert.equal(GOV_PROFILE_FILE_MAX_BYTES, 25 * 1024 * 1024)
  })
})

describe('sanitizeGovernmentProfileFileName', () => {
  it('특수문자 치환', () => {
    assert.equal(sanitizeGovernmentProfileFileName('bad/name?.pdf'), 'bad_name_.pdf')
  })
})
