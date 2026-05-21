import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSeatAvailableForNewActivation,
  mergeLicensePolicyForPatch,
  parseSeatLimitColumn,
  parseSeatLimitForApiPatch,
} from './tenantSeatPolicy.js'

test('parseSeatLimitColumn — null은 무제한', () => {
  assert.equal(parseSeatLimitColumn(null), null)
  assert.equal(parseSeatLimitColumn(undefined), null)
  assert.equal(parseSeatLimitColumn(5), 5)
  assert.equal(parseSeatLimitColumn('10'), 10)
  assert.equal(parseSeatLimitColumn(0), null)
})

test('assertSeatAvailableForNewActivation — 상한·초과·허용', () => {
  assert.equal(
    assertSeatAvailableForNewActivation({ seatLimitColumn: null, activeSeatCountBefore: 99 }).ok,
    true,
  )
  const blocked = assertSeatAvailableForNewActivation({ seatLimitColumn: 5, activeSeatCountBefore: 5 })
  assert.equal(blocked.ok, false)
  assert.match(String(blocked.message ?? ''), /초과/)

  const ok = assertSeatAvailableForNewActivation({ seatLimitColumn: 5, activeSeatCountBefore: 4 })
  assert.equal(ok.ok, true)
})

test('parseSeatLimitForApiPatch', () => {
  assert.equal(parseSeatLimitForApiPatch(undefined).kind, 'omit')

  const cleared = parseSeatLimitForApiPatch(null)
  assert.equal(cleared.kind, 'set')
  assert.equal(cleared.kind === 'set' ? cleared.value : -1, null)

  const n = parseSeatLimitForApiPatch(3)
  assert.equal(n.kind, 'set')
  assert.equal(n.kind === 'set' ? n.value : -1, 3)

  assert.equal(parseSeatLimitForApiPatch(0).kind, 'error')
})

test('mergeLicensePolicyForPatch — 병합·null로 키 삭제', () => {
  const added = mergeLicensePolicyForPatch({}, { maxConcurrentSessionsPerUser: 2 })
  assert.equal(added.ok, true)
  assert.equal(added.merged.max_concurrent_sessions_per_user, 2)

  const cleared = mergeLicensePolicyForPatch(
    { max_concurrent_sessions_per_user: 2 },
    { maxConcurrentSessionsPerUser: null },
  )
  assert.equal(cleared.ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(cleared.merged, 'max_concurrent_sessions_per_user'), false)
})
