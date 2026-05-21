/**
 * 고객 청구요청 배포 상태 점검 스크립트.
 *
 * 목적:
 * 1) 실행 중 서버가 어떤 커밋인지(가능하면) 출력
 * 2) claim request 라우트가 실제 탑재됐는지 확인
 *
 * 사용 예:
 * - 로컬 서버: node server/scripts/checkClaimAppDeploy.mjs
 * - 원격 서버: CLAIM_CHECK_BASE_URL=https://example.up.railway.app node server/scripts/checkClaimAppDeploy.mjs
 * - 토큰 포함: AGENT_BEARER_TOKEN=... node server/scripts/checkClaimAppDeploy.mjs
 */

import { execSync } from 'node:child_process'

const baseUrl =
  String(process.env.CLAIM_CHECK_BASE_URL ?? '').trim() ||
  `http://127.0.0.1:${String(process.env.PORT ?? '3001').trim() || '3001'}`

const agentToken = String(process.env.AGENT_BEARER_TOKEN ?? '').trim()

function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

async function request(path, init = {}) {
  const url = `${baseUrl}${path}`
  try {
    const response = await fetch(url, init)
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      url,
      body: text.slice(0, 300),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      body: error instanceof Error ? error.message : String(error),
    }
  }
}

function printCheck(result, expected) {
  const statusText = `[${result.status}] ${result.url}`
  console.log(`- ${statusText}`)
  if (result.body) {
    console.log(`  body: ${result.body}`)
  }
  const passed = expected.includes(result.status)
  console.log(`  ${passed ? 'PASS' : 'FAIL'} expected: ${expected.join(', ')}`)
  return passed
}

async function main() {
  const head = safeExec('git rev-parse --short HEAD')
  const branch = safeExec('git rev-parse --abbrev-ref HEAD')
  const subject = safeExec('git log -1 --pretty=%s')

  console.log('[claim-check] baseUrl:', baseUrl)
  console.log('[claim-check] branch:', branch ?? '(unknown)')
  console.log('[claim-check] head:', head ?? '(unknown)')
  console.log('[claim-check] subject:', subject ?? '(unknown)')
  console.log('[claim-check] token:', agentToken ? 'provided' : 'not provided')

  const checks = []
  checks.push(await request('/api/health'))
  checks.push(await request('/api/version'))

  const authHeaders = agentToken ? { Authorization: `Bearer ${agentToken}` } : {}
  checks.push(
    await request('/api/agent/customer-claim-requests?page=1&pageSize=1', {
      headers: authHeaders,
    }),
  )
  checks.push(
    await request('/backend/agent/customer-claim-requests?page=1&pageSize=1', {
      headers: authHeaders,
    }),
  )

  console.log('[claim-check] endpoint results')
  const passHealth = printCheck(checks[0], [200])
  const passVersion = printCheck(checks[1], [200])
  const passApi = printCheck(checks[2], agentToken ? [200, 400, 401, 403] : [400, 401, 403])
  const passBackend = printCheck(checks[3], agentToken ? [200, 400, 401, 403] : [400, 401, 403])

  if (!passHealth || !passVersion || !passApi || !passBackend) {
    console.error('[claim-check] FAIL: 배포 라우트/연결 상태를 확인하세요.')
    process.exitCode = 1
    return
  }

  console.log('[claim-check] OK: 배포 서버에 claim request 라우트가 탑재되어 있습니다.')
}

await main()
