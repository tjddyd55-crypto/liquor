/**
 * templateCode.js — 정책 계약을 고정하는 테스트.
 *
 * "어떻게 슬러그를 만드는지" 가 아니라 "어떤 경우에 어떤 분기가 일어나는지" 를 테스트한다.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createTemplateWithAutoCode, deriveBaseCodeFromTitle } from './templateCode.js'

test('deriveBaseCodeFromTitle: 영문 제목은 슬러그로', () => {
  assert.equal(deriveBaseCodeFromTitle('Car Consent v2'), 'car-consent-v2')
})

test('deriveBaseCodeFromTitle: 한글만 있을 때는 doc- 접두어 + 짧은 UUID', () => {
  const code = deriveBaseCodeFromTitle('자동차보험 개인정보 동의서')
  assert.match(code, /^doc-[a-f0-9]{8}$/)
})

test('deriveBaseCodeFromTitle: 앞뒤 하이픈 제거, 40자 제한', () => {
  const long = 'a'.repeat(100)
  const code = deriveBaseCodeFromTitle(long)
  assert.equal(code.length, 40)
})

test('createTemplateWithAutoCode: 첫 시도에 성공하면 즉시 반환', async () => {
  let calls = 0
  const insertOnce = async (_pool, input) => {
    calls += 1
    return { id: 1, code: input.code }
  }
  const row = await createTemplateWithAutoCode({}, insertOnce, {
    gaId: null,
    title: 'Hello',
    description: '',
    storageKey: 'k',
    pageCount: 1,
    createdByUserId: null,
  })
  assert.equal(row.code, 'hello')
  assert.equal(calls, 1)
})

test('createTemplateWithAutoCode: 23505 충돌 시 -2 접미어로 재시도', async () => {
  let calls = 0
  const insertOnce = async (_pool, input) => {
    calls += 1
    if (calls === 1) {
      const err = new Error('duplicate')
      // @ts-ignore — 테스트용 code 필드 주입
      err.code = '23505'
      throw err
    }
    return { id: 2, code: input.code }
  }
  const row = await createTemplateWithAutoCode({}, insertOnce, {
    gaId: null,
    title: 'Hello',
    description: '',
    storageKey: 'k',
    pageCount: 1,
    createdByUserId: null,
  })
  assert.equal(row.code, 'hello-2')
  assert.equal(calls, 2)
})

test('createTemplateWithAutoCode: 23505 외의 오류는 그대로 전파', async () => {
  const insertOnce = async () => {
    throw new Error('boom')
  }
  await assert.rejects(
    () =>
      createTemplateWithAutoCode({}, insertOnce, {
        gaId: null,
        title: 'Hello',
        description: '',
        storageKey: 'k',
        pageCount: 1,
        createdByUserId: null,
      }),
    /boom/,
  )
})
