import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { ensureGovernmentAdminBootstrap } from './ensureGovernmentAdminBootstrap.js'

describe('ensureGovernmentAdminBootstrap', () => {
  /** @type {NodeJS.ProcessEnv} */
  let envBackup

  beforeEach(() => {
    envBackup = { ...process.env }
    delete process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED
    delete process.env.GOVERNMENT_ADMIN_LOGIN_ID
    delete process.env.GOVERNMENT_ADMIN_EMAIL
    delete process.env.GOVERNMENT_ADMIN_PASSWORD
    delete process.env.GOVERNMENT_ADMIN_NAME
    delete process.env.GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    delete process.env.RAILWAY_ENVIRONMENT
  })

  afterEach(() => {
    process.env = envBackup
  })

  it('disabled: pool query 없이 즉시 반환', async () => {
    let queried = false
    const pool = {
      query: async () => {
        queried = true
        return { rows: [], rowCount: 0 }
      },
    }
    await ensureGovernmentAdminBootstrap(pool)
    assert.equal(queried, false)
  })

  it('enabled without GOVERNMENT_ADMIN_LOGIN_ID: loginId 기본 admin 으로 bootstrap', async () => {
    process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED = 'true'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'test-only'

    const calls = []
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('INSERT INTO ga_companies')) {
          return { rows: [{ id: 99 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM industries')) {
          return { rows: [{ id: 7 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM users WHERE username')) {
          return { rows: [], rowCount: 0 }
        }
        if (String(sql).includes('INSERT INTO users')) {
          assert.equal(params[1], 'admin')
          return { rows: [], rowCount: 1 }
        }
        if (String(sql).includes('user_memberships')) {
          return { rows: [], rowCount: 0 }
        }
        return { rows: [], rowCount: 0 }
      },
    }
    await ensureGovernmentAdminBootstrap(pool)
    const userInsert = calls.find((c) => c.sql.includes('INSERT INTO users'))
    assert.ok(userInsert, 'expected user insert with default admin loginId')
  })

  it('GOVERNMENT_ADMIN_EMAIL 만 있으면 LOGIN_ID 없이 건너뜀 (EMAIL 미사용)', async () => {
    process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED = 'true'
    process.env.GOVERNMENT_ADMIN_EMAIL = 'admin@example.com'
    let queried = false
    const pool = {
      query: async () => {
        queried = true
        return { rows: [], rowCount: 0 }
      },
    }
    await ensureGovernmentAdminBootstrap(pool)
    assert.equal(queried, false)
  })

  it('enabled with LOGIN_ID: users INSERT에 username으로 loginId 사용', async () => {
    process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED = 'true'
    process.env.GOVERNMENT_ADMIN_LOGIN_ID = 'govadmin'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'bootstrap-test-pass'
    process.env.GOVERNMENT_ADMIN_NAME = '테스트 관리자'

    const calls = []
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('INSERT INTO ga_companies')) {
          return { rows: [{ id: 99 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM industries')) {
          return { rows: [{ id: 7 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM users WHERE username')) {
          return { rows: [], rowCount: 0 }
        }
        if (String(sql).includes('INSERT INTO users')) {
          assert.equal(params[1], 'govadmin')
          assert.equal(params[4], '테스트 관리자')
          assert.ok(String(sql).includes('invited_by_user_id'))
          return { rows: [], rowCount: 1 }
        }
        if (String(sql).includes('user_memberships')) {
          return { rows: [], rowCount: 0 }
        }
        return { rows: [], rowCount: 0 }
      },
    }

    await ensureGovernmentAdminBootstrap(pool)
    const userInsert = calls.find((c) => c.sql.includes('INSERT INTO users'))
    assert.ok(userInsert, 'expected user insert')
    assert.equal(userInsert.params[1], 'govadmin')
    assert.equal(userInsert.params[4], '테스트 관리자')
    assert.match(String(userInsert.params[2]), /^\$2[aby]\$/)
  })

  it('기존 유저 + RESET_PASSWORD_ON_BOOTSTRAP=false: password_hash UPDATE 없음', async () => {
    process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED = 'true'
    process.env.GOVERNMENT_ADMIN_LOGIN_ID = 'govadmin'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'new-bootstrap-pass'
    process.env.GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP = 'false'

    const oldHash = await bcrypt.hash('old-pass', 10)
    const calls = []
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('INSERT INTO ga_companies')) {
          return { rows: [{ id: 99 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM industries')) {
          return { rows: [{ id: 7 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM users WHERE username')) {
          return { rows: [{ id: 'user-1', username: 'govadmin' }], rowCount: 1 }
        }
        if (String(sql).includes('SELECT display_name FROM users')) {
          return { rows: [{ display_name: '기존' }], rowCount: 1 }
        }
        if (String(sql).includes('user_memberships')) {
          return { rows: [{ id: 1 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
    }

    await ensureGovernmentAdminBootstrap(pool)
    const passwordUpdate = calls.find(
      (c) => String(c.sql).includes('UPDATE users SET password_hash'),
    )
    assert.equal(passwordUpdate, undefined)
  })

  it('기존 유저 + RESET_PASSWORD_ON_BOOTSTRAP=true: password_hash UPDATE 및 bcrypt compare 성공', async () => {
    process.env.GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED = 'true'
    process.env.GOVERNMENT_ADMIN_LOGIN_ID = 'govadmin'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'reset-bootstrap-pass'
    process.env.GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP = 'true'

    const calls = []
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('INSERT INTO ga_companies')) {
          return { rows: [{ id: 99 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM industries')) {
          return { rows: [{ id: 7 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM users WHERE username')) {
          return { rows: [{ id: 'user-1', username: 'govadmin' }], rowCount: 1 }
        }
        if (String(sql).includes('SELECT display_name FROM users')) {
          return { rows: [{ display_name: '기존' }], rowCount: 1 }
        }
        if (String(sql).includes('user_memberships')) {
          return { rows: [{ id: 1 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
    }

    await ensureGovernmentAdminBootstrap(pool)
    const passwordUpdate = calls.find(
      (c) => String(c.sql).includes('UPDATE users SET password_hash'),
    )
    assert.ok(passwordUpdate, 'expected password_hash update')
    assert.equal(passwordUpdate.params[1], 'user-1')
    const ok = await bcrypt.compare('reset-bootstrap-pass', passwordUpdate.params[0])
    assert.equal(ok, true)
  })

  it('develop + GOVERNMENT_ADMIN_PASSWORD 만 설정: 기존 admin 비밀번호 갱신', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'develop'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'develop-sync-pass'

    const calls = []
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('INSERT INTO ga_companies')) {
          return { rows: [{ id: 99 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM industries')) {
          return { rows: [{ id: 7 }], rowCount: 1 }
        }
        if (String(sql).includes('FROM users WHERE username')) {
          return { rows: [{ id: 'user-admin', username: 'admin' }], rowCount: 1 }
        }
        if (String(sql).includes('SELECT display_name FROM users')) {
          return { rows: [{ display_name: '관리자' }], rowCount: 1 }
        }
        if (String(sql).includes('user_memberships')) {
          return { rows: [{ id: 1 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
    }

    await ensureGovernmentAdminBootstrap(pool)
    const passwordUpdate = calls.find(
      (c) => String(c.sql).includes('UPDATE users SET password_hash'),
    )
    assert.ok(passwordUpdate, 'expected develop password sync update')
    const ok = await bcrypt.compare('develop-sync-pass', passwordUpdate.params[0])
    assert.equal(ok, true)
  })

  it('production 패턴 + PASSWORD 만: bootstrap 없으면 query 없음', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    process.env.GOVERNMENT_ADMIN_PASSWORD = 'should-not-apply'
    let queried = false
    const pool = {
      query: async () => {
        queried = true
        return { rows: [], rowCount: 0 }
      },
    }
    await ensureGovernmentAdminBootstrap(pool)
    assert.equal(queried, false)
  })
})
