import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import pool from './db.js'
import {
  runCompanyDirectorySanitize,
  touchContactLastUpdatedAt,
} from './lib/companyDirectorySanitize.js'
import { resolveInsuranceCategoryForApi } from './lib/insuranceCompanyCategoryResolve.js'
import { INSURER_SITES_SEED, insurerSiteBundledLogoPath } from './insurerSitesSeedData.js'

/**
 * ⚠️ 디버그 전용: insurance_forms 등 user_id FK는 ON DELETE CASCADE 로 함께 정리됨.
 * Railway 등에서 1회 사용 후 반드시 환경변수 제거.
 */
async function maybeDebugResetAllUsers() {
  if (process.env.INSURANCE_DEBUG_RESET_ALL_USERS !== 'true') {
    return
  }

  console.warn(
    '[initDb] INSURANCE_DEBUG_RESET_ALL_USERS=true → 모든 users 삭제(CASCADE). 조치 후 변수를 꺼 주세요.',
  )
  await pool.query('DELETE FROM users')
  console.log('[initDb] 기존 users 초기화 완료')
}

/**
 * INSURANCE_ENABLE_ADMIN_BOOTSTRAP=true 일 때만 동작.
 * 없으면 super_admin으로 생성하고, 이미 있으면 비밀번호·역할을 env 기준으로 갱신한다.
 */
async function ensureBootstrapAdminUser() {
  if (process.env.INSURANCE_ENABLE_ADMIN_BOOTSTRAP !== 'true') {
    return
  }

  const username = String(process.env.INSURANCE_ADMIN_BOOTSTRAP_USERNAME || 'admin').trim()
  const password = process.env.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD || '1234'
  const hash = await bcrypt.hash(password, 10)

  const gaRes = await pool.query(`SELECT id FROM ga_companies WHERE code = 'YJASSET' LIMIT 1`)
  const gaId = gaRes.rows[0]?.id
  if (gaId == null) {
    throw new Error('[initDb] YJASSET GA 가 없어 bootstrap 관리자를 만들 수 없습니다.')
  }

  const existing = await pool.query(`SELECT id FROM users WHERE username = $1`, [username])

  if (existing.rowCount === 0) {
    console.log('[initDb] admin 계정 생성 시작:', username)
    const id = randomUUID()
    await pool.query(
      `
      INSERT INTO users (id, username, password_hash, role, ga_id, invited_by_user_id)
      VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, $1)
      `,
      [id, username, hash, gaId],
    )
    console.log('[initDb] admin 생성 완료')
    return
  }

  await pool.query(
    `
    UPDATE users
    SET password_hash = $1, role = 'SUPER_ADMIN', ga_id = $3, invited_by_user_id = COALESCE(invited_by_user_id, id)
    WHERE username = $2
    `,
    [hash, username, gaId],
  )
  console.log('[initDb] admin 비밀번호·역할(SUPER_ADMIN)·ga_id 업데이트 완료:', username)
}

function isPgUniqueViolation(err) {
  return Boolean(err && err.code === '23505')
}

function assertSafePgIdentifier(name) {
  const s = String(name)
  if (!/^[a-z][a-z0-9_]*$/i.test(s)) {
    throw new Error(`[initDb] 병합 FK 갱신: 허용되지 않는 식별자 "${s}"`)
  }
}

/**
 * insurance_company_master(id)를 company_id로 참조하는 public 테이블(pg_catalog).
 * information_schema로 열 목록만 조회하면 마스터 비참조 company_id까지 섞일 수 있어 FK 메타데이터로 한정한다.
 */
async function listChildTablesReferencingMasterCompanyId(client) {
  const { rows } = await client.query(`
    SELECT DISTINCT c.relname AS table_name
    FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
    WHERE co.contype = 'f'
      AND co.confrelid = CAST('insurance_company_master' AS regclass)
      AND n.nspname = 'public'
      AND c.relname <> 'insurance_company_master'
      AND a.attname = 'company_id'
      AND co.conkey IS NOT NULL
      AND array_length(co.conkey, 1) = 1
    ORDER BY 1
  `)
  const names = rows.map((r) => String(r.table_name))
  if (names.length === 0) {
    throw new Error(
      '[initDb] insurance_company_master 참조 company_id 자식 테이블이 0개입니다. 병합을 중단합니다.',
    )
  }
  return names
}

/**
 * (ga_id, category, name) 유니크 충돌 시 보수 병합: FK(company_id)를 유지 행으로 옮기고 중복 마스터 행 삭제.
 * 전 구간 단일 트랜잭션 — 중간 실패 시 ROLLBACK.
 */
async function mergeInsuranceCompanyMasterCategoryConflict(client, row, nextCategory) {
  const dup = await client.query(
    `
    SELECT id
    FROM insurance_company_master
    WHERE ga_id = $1
      AND category = $2
      AND TRIM(name) = TRIM($3)
      AND id <> $4
    LIMIT 1
    `,
    [row.ga_id, nextCategory, row.name, row.id],
  )
  if (dup.rowCount === 0) {
    return { merged: false, keepId: row.id, dropId: null }
  }
  const otherId = Number(dup.rows[0].id)
  const keepId = otherId
  const dropId = Number(row.id)
  console.warn('[보험사 category 충돌 병합]', {
    name: row.name,
    ga_id: row.ga_id,
    keepId,
    dropId,
    category: nextCategory,
  })

  const childTables = await listChildTablesReferencingMasterCompanyId(client)
  await client.query('BEGIN')
  try {
    for (const tableName of childTables) {
      assertSafePgIdentifier(tableName)
      await client.query(
        `UPDATE "${tableName}" SET company_id = $1 WHERE company_id = $2`,
        [keepId, dropId],
      )
    }
    await client.query(
      `
      INSERT INTO insurance_company_merge_logs (keep_id, drop_id, name, category, ga_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [keepId, dropId, String(row.name ?? ''), nextCategory, row.ga_id ?? null],
    )
    await client.query(`DELETE FROM insurance_company_master WHERE id = $1`, [dropId])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }
  return { merged: true, keepId, dropId }
}

/**
 * insurance_company_master.category를 LIFE|NON_LIFE|GENERAL로 맞추고 CHECK 제약을 둔다.
 */
async function ensureInsuranceCompanyMasterCategoryNormalized(pool) {
  const client = await pool.connect()
  const { rows } = await client.query(
    `SELECT id, ga_id, name, category FROM insurance_company_master ORDER BY id`,
  )
  const deletedIds = new Set()
  let updated = 0
  let fallbackGeneral = 0
  try {
    for (const row of rows) {
      if (deletedIds.has(Number(row.id))) {
        continue
      }
      let next = resolveInsuranceCategoryForApi(row.category, row.name)
      if (!next || !['LIFE', 'NON_LIFE', 'GENERAL'].includes(next)) {
        next = 'GENERAL'
        fallbackGeneral += 1
        console.warn('[initDb] 보험사 category 추론 불가 → GENERAL', {
          id: row.id,
          name: row.name,
          categoryWas: row.category,
        })
      }
      if (next === row.category) {
        continue
      }
      try {
        await client.query(`UPDATE insurance_company_master SET category = $1 WHERE id = $2`, [
          next,
          row.id,
        ])
        updated += 1
      } catch (e) {
        if (!isPgUniqueViolation(e)) {
          console.error('[initDb] insurance_company_master category UPDATE 실패', {
            id: row.id,
            ga_id: row.ga_id,
            name: row.name,
            next,
            message: e instanceof Error ? e.message : String(e),
          })
          continue
        }
        console.warn('[보험사 category 충돌]', row.name, 'ga_id', row.ga_id)
        const { merged, dropId } = await mergeInsuranceCompanyMasterCategoryConflict(client, row, next)
        if (merged && dropId != null) {
          deletedIds.add(dropId)
        }
        updated += 1
      }
    }
  } finally {
    client.release()
  }
  if (updated > 0) {
    console.log('[initDb] insurance_company_master category 정규화 반영:', updated, '행')
  }
  if (fallbackGeneral > 0) {
    console.warn('[initDb] insurance_company_master GENERAL 폴백:', fallbackGeneral, '행 → 데이터 점검 권장')
  }

  await pool.query(`
    ALTER TABLE insurance_company_master
    DROP CONSTRAINT IF EXISTS insurance_company_master_category_check
  `)
  await pool.query(`
    ALTER TABLE insurance_company_master
    DROP CONSTRAINT IF EXISTS category_check
  `)
  await pool.query(`
    ALTER TABLE insurance_company_master
    ADD CONSTRAINT insurance_company_master_category_check
    CHECK (category IN ('LIFE', 'NON_LIFE', 'GENERAL'))
  `)
}

/**
 * 원수사 마스터 삭제 시 담당자 행은 company_id 해제(소프트 삭제는 애플리케이션에서 처리).
 * DB 레벨 안전망: ON DELETE SET NULL
 * (ADD COLUMN … REFERENCES 로 생긴 이명 FK까지 제거 후 단일 제약으로 통일)
 */
async function ensureInsurerManagerCompanyFkOnDeleteSetNull(executor) {
  const { rows } = await executor.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'insurer_managers'
      AND c.contype = 'f'
      AND c.confrelid = CAST('insurance_company_master' AS regclass)
  `)
  for (const r of rows) {
    const name = String(r.conname ?? '').replace(/"/g, '')
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
      continue
    }
    await executor.query(`ALTER TABLE insurer_managers DROP CONSTRAINT IF EXISTS "${name}"`)
  }
  await executor.query(`
    ALTER TABLE insurer_managers
    ADD CONSTRAINT fk_insurer_managers_insurance_company_master
    FOREIGN KEY (company_id) REFERENCES insurance_company_master(id) ON DELETE SET NULL
  `)
}

/** 손해사정사 마스터 삭제 시 company_id 해제(ON DELETE SET NULL) */
async function ensureLossAdjusterCompanyFkOnDeleteSetNull(executor) {
  const { rows } = await executor.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'loss_adjusters'
      AND c.contype = 'f'
      AND c.confrelid = CAST('insurance_company_master' AS regclass)
  `)
  for (const r of rows) {
    const name = String(r.conname ?? '').replace(/"/g, '')
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
      continue
    }
    await executor.query(`ALTER TABLE loss_adjusters DROP CONSTRAINT IF EXISTS "${name}"`)
  }
  await executor.query(`
    ALTER TABLE loss_adjusters
    ADD CONSTRAINT fk_loss_adjusters_insurance_company_master
    FOREIGN KEY (company_id) REFERENCES insurance_company_master(id) ON DELETE SET NULL
  `)
}

/**
 * 고객 청구 요청 앱(STEP 1) 스키마:
 * - 링크/디바이스 연결
 * - 요청/요청 첨부
 * - 푸시 토큰
 * - 소식지 읽음
 * - 감사/상태 이력 로그
 */
async function ensureCustomerClaimAppSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS agent_app_link_targets (
      agent_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_app_link_targets_customer
    ON agent_app_link_targets(customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_agent_app_link_targets_ga
    ON agent_app_link_targets(ga_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_app_links (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      link_code VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      last_connected_at TIMESTAMPTZ
    )
  `)
  await executor.query(`
    ALTER TABLE customer_app_links
    DROP CONSTRAINT IF EXISTS customer_app_links_status_check
  `)
  await executor.query(`
    ALTER TABLE customer_app_links
    ADD CONSTRAINT customer_app_links_status_check
    CHECK (status IN ('active', 'inactive', 'expired', 'revoked'))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_links_agent_customer
    ON customer_app_links(agent_id, customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_links_status
    ON customer_app_links(status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_app_devices (
      id BIGSERIAL PRIMARY KEY,
      link_id BIGINT NOT NULL REFERENCES customer_app_links(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device_id VARCHAR(191) NOT NULL,
      device_platform VARCHAR(20),
      app_version VARCHAR(30),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_active_at TIMESTAMPTZ,
      disconnected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE customer_app_devices
    DROP CONSTRAINT IF EXISTS customer_app_devices_status_check
  `)
  await executor.query(`
    ALTER TABLE customer_app_devices
    ADD CONSTRAINT customer_app_devices_status_check
    CHECK (status IN ('active', 'inactive', 'disconnected'))
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_app_devices_agent_customer_device
    ON customer_app_devices(device_id, agent_id, customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_devices_agent_customer
    ON customer_app_devices(agent_id, customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_devices_status
    ON customer_app_devices(status)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_devices_last_active
    ON customer_app_devices(last_active_at DESC)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_claim_requests (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      link_id BIGINT REFERENCES customer_app_links(id) ON DELETE SET NULL,
      device_id VARCHAR(191) NOT NULL,
      request_type VARCHAR(30) NOT NULL DEFAULT 'claim',
      status VARCHAR(20) NOT NULL DEFAULT 'requested',
      title VARCHAR(150),
      memo TEXT,
      requester_name VARCHAR(120) NOT NULL DEFAULT '',
      requester_birth_date VARCHAR(20) NOT NULL DEFAULT '',
      requester_phone VARCHAR(30) NOT NULL DEFAULT '',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      processed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    DROP CONSTRAINT IF EXISTS customer_claim_requests_status_check
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    ADD CONSTRAINT customer_claim_requests_status_check
    CHECK (status IN ('requested', 'processing', 'done', 'rejected', 'canceled'))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_requests_agent_customer
    ON customer_claim_requests(agent_id, customer_id)
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    ADD COLUMN IF NOT EXISTS link_id BIGINT REFERENCES customer_app_links(id) ON DELETE SET NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_requests_link_id
    ON customer_claim_requests(link_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_requests_status
    ON customer_claim_requests(status)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_requests_submitted_at
    ON customer_claim_requests(submitted_at DESC)
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    ADD COLUMN IF NOT EXISTS requester_name VARCHAR(120) NOT NULL DEFAULT ''
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    ADD COLUMN IF NOT EXISTS requester_birth_date VARCHAR(20) NOT NULL DEFAULT ''
  `)
  await executor.query(`
    ALTER TABLE customer_claim_requests
    ADD COLUMN IF NOT EXISTS requester_phone VARCHAR(30) NOT NULL DEFAULT ''
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_app_profiles (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device_id VARCHAR(191) NOT NULL,
      name VARCHAR(120) NOT NULL,
      birth_date VARCHAR(20) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_app_profiles_agent_customer_device
    ON customer_app_profiles(agent_id, customer_id, device_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_profiles_agent_customer
    ON customer_app_profiles(agent_id, customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_claim_request_files (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES customer_claim_requests(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      storage_key VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      content_type VARCHAR(100),
      file_size BIGINT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_request_files_request
    ON customer_claim_request_files(request_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_request_files_agent_customer
    ON customer_claim_request_files(agent_id, customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_app_push_tokens (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device_id VARCHAR(191) NOT NULL,
      push_provider VARCHAR(30) NOT NULL,
      push_token VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE customer_app_push_tokens
    DROP CONSTRAINT IF EXISTS customer_app_push_tokens_status_check
  `)
  await executor.query(`
    ALTER TABLE customer_app_push_tokens
    ADD CONSTRAINT customer_app_push_tokens_status_check
    CHECK (status IN ('active', 'inactive'))
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_app_push_tokens_push_token
    ON customer_app_push_tokens(push_token)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_push_tokens_agent_customer
    ON customer_app_push_tokens(agent_id, customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_push_tokens_device
    ON customer_app_push_tokens(device_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_app_push_tokens_status
    ON customer_app_push_tokens(status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_news_reads (
      id BIGSERIAL PRIMARY KEY,
      news_id BIGINT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_news_reads_news_customer
    ON customer_news_reads(news_id, customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_news_reads_agent_customer
    ON customer_news_reads(agent_id, customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_link_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      device_id VARCHAR(191),
      link_code VARCHAR(64),
      action VARCHAR(30) NOT NULL,
      result VARCHAR(20) NOT NULL,
      reason VARCHAR(255),
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_link_audit_logs_created
    ON customer_link_audit_logs(created_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_link_audit_logs_agent_customer
    ON customer_link_audit_logs(agent_id, customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS customer_claim_status_logs (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES customer_claim_requests(id) ON DELETE CASCADE,
      from_status VARCHAR(20),
      to_status VARCHAR(20) NOT NULL,
      changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      memo VARCHAR(255)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_claim_status_logs_request
    ON customer_claim_status_logs(request_id, changed_at DESC)
  `)
}

/**
 * CRM-Platform 1차 메타(industries / tenants / user_memberships).
 * - 도메인 테이블·users.role·users.ga_id·R2 실제 경로에는 관여하지 않는다.
 * - r2_key_prefix 는 기록용 템플릿 문자열(런타임 CRM_R2_OBJECT_ROOT 대체 안 함).
 */
async function ensureCrmPlatformMetaSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS industries (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id BIGSERIAL PRIMARY KEY,
      industry_id BIGINT NOT NULL REFERENCES industries(id),
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      legacy_ga_id INTEGER REFERENCES ga_companies(id),
      r2_key_prefix TEXT,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_tenants_industry_id
    ON tenants (industry_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS user_memberships (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      tenant_id BIGINT REFERENCES tenants(id),
      industry_id BIGINT REFERENCES industries(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_user_memberships_user_role_scope_scopeid
    ON user_memberships (user_id, role, scope_type, (COALESCE(scope_id, '')))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_user_memberships_user_id
    ON user_memberships (user_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_user_memberships_tenant_id
    ON user_memberships (tenant_id)
    WHERE tenant_id IS NOT NULL
  `)

  await executor.query(`
    ALTER TABLE user_memberships
    ADD COLUMN IF NOT EXISTS membership_type TEXT NOT NULL DEFAULT 'agent'
  `)
  await executor.query(`
    ALTER TABLE user_memberships
    ADD COLUMN IF NOT EXISTS customer_access TEXT NOT NULL DEFAULT 'own'
  `)
  await executor.query(`
    UPDATE user_memberships
    SET
      membership_type = CASE LOWER(TRIM(COALESCE(role::text, '')))
          WHEN 'staff' THEN 'staff'
          WHEN 'tenant_admin' THEN 'admin'
          ELSE 'agent'
        END,
      customer_access = CASE LOWER(TRIM(COALESCE(role::text, '')))
          WHEN 'staff' THEN 'none'
          WHEN 'tenant_admin' THEN 'tenant'
          ELSE 'own'
        END,
      updated_at = NOW()
    WHERE scope_type = 'tenant'
      AND membership_type = 'agent'
      AND customer_access = 'own'
      AND LOWER(TRIM(COALESCE(role::text, ''))) IN ('staff', 'tenant_admin', 'user')
  `)
  await executor.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_memberships_customer_access_chk'
      ) THEN
        ALTER TABLE user_memberships
        ADD CONSTRAINT user_memberships_customer_access_chk
        CHECK (customer_access IN ('none', 'own', 'tenant', 'assigned'));
      END IF;
    END $$;
  `)
  await executor.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_memberships_membership_type_chk'
      ) THEN
        ALTER TABLE user_memberships
        ADD CONSTRAINT user_memberships_membership_type_chk
        CHECK (membership_type IN ('agent', 'staff', 'admin', 'owner'));
      END IF;
    END $$;
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS tenant_registration_codes (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      industry_code TEXT NOT NULL REFERENCES industries(code) ON UPDATE CASCADE ON DELETE RESTRICT,
      default_membership_type TEXT NOT NULL DEFAULT 'agent',
      default_customer_access TEXT NOT NULL DEFAULT 'own',
      default_role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tenant_reg_codes_default_membership_chk
        CHECK (default_membership_type IN ('agent', 'staff', 'admin', 'owner')),
      CONSTRAINT tenant_reg_codes_customer_access_chk
        CHECK (default_customer_access IN ('none', 'own', 'tenant', 'assigned')),
      CONSTRAINT tenant_reg_codes_default_role_chk
        CHECK (default_role IN ('user', 'staff', 'tenant_admin')),
      CONSTRAINT tenant_reg_codes_status_chk
        CHECK (status IN ('active', 'inactive')),
      CONSTRAINT tenant_reg_codes_max_uses_chk
        CHECK (max_uses IS NULL OR (max_uses >= 0 AND max_uses <= 100000000))
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenant_registration_codes_code_uk
    ON tenant_registration_codes (code)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS tenant_registration_codes_tenant_idx
    ON tenant_registration_codes (tenant_id, status)
  `)

  await executor.query(`
    INSERT INTO industries (code, name, status, config)
    VALUES ('insurance', '보험', 'active', '{}'::jsonb)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      updated_at = NOW()
  `)

  await executor.query(`
    INSERT INTO industries (code, name, status, config)
    VALUES ('gym', '체육관', 'active', '{}'::jsonb),
           ('government', '정부지원', 'active', '{}'::jsonb),
           ('liquor', '주류회사 CRM', 'active', '{}'::jsonb)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      updated_at = NOW()
  `)

  const { ensureTenantsLegacyGaIdConstraints } = await import('./lib/tenantsLegacyGaIdConstraints.js')
  await ensureTenantsLegacyGaIdConstraints(executor)

  await executor.query(`
    INSERT INTO tenants (industry_id, code, name, status, legacy_ga_id, r2_key_prefix, config)
    SELECT i.id, 'yjasset', '영진에셋', 'active', g.id,
      'crm-platform/{environment}/insurance/tenants/yjasset',
      '{}'::jsonb
    FROM industries i
    INNER JOIN ga_companies g ON g.code = 'YJASSET' AND g.is_deleted IS NOT TRUE
    WHERE i.code = 'insurance'
    LIMIT 1
    ON CONFLICT (code) DO UPDATE SET
      industry_id = EXCLUDED.industry_id,
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      legacy_ga_id = EXCLUDED.legacy_ga_id,
      r2_key_prefix = EXCLUDED.r2_key_prefix,
      updated_at = NOW()
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS crm_customer_management_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      industry_code TEXT NOT NULL REFERENCES industries(code) ON UPDATE CASCADE ON DELETE RESTRICT,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      revision INT NOT NULL DEFAULT 1,
      form_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      list_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
      detail_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      shared_feature_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
      extension_feature_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ccmt_status_check CHECK (status IN ('active', 'draft', 'archived'))
    )
  `)
  await executor.query(`
    ALTER TABLE crm_customer_management_templates
    DROP CONSTRAINT IF EXISTS ccmt_status_check
  `)
  await executor.query(`
    ALTER TABLE crm_customer_management_templates
    ADD CONSTRAINT ccmt_status_check CHECK (status IN ('active', 'draft', 'archived'))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_ccmt_industry_status_updated
    ON crm_customer_management_templates (industry_code, status, updated_at DESC)
  `)

  await executor.query(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS crm_customer_template_id BIGINT REFERENCES crm_customer_management_templates(id) ON DELETE SET NULL
  `)

  await executor.query(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS seat_limit INTEGER
  `)
  await executor.query(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS license_policy JSONB NOT NULL DEFAULT '{}'::jsonb
  `)
  await executor.query(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS billing_entitlement JSONB NOT NULL DEFAULT '{}'::jsonb
  `)
  await executor.query(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_seat_limit_check
  `)
  await executor.query(`
    ALTER TABLE tenants
    ADD CONSTRAINT tenants_seat_limit_check
    CHECK (seat_limit IS NULL OR (seat_limit >= 1 AND seat_limit <= 500000))
  `)

  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
  `)
  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_ip TEXT
  `)
  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_user_agent TEXT
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS user_auth_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      ip_inet TEXT,
      user_agent TEXT,
      fingerprint TEXT
    )
  `)
  await executor.query(`
    DROP INDEX IF EXISTS idx_user_auth_sessions_user_active
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_user_auth_sessions_user_active
    ON user_auth_sessions (user_id, expires_at DESC)
    WHERE revoked_at IS NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS user_registered_devices (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      label TEXT,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, fingerprint)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_user_registered_devices_user
    ON user_registered_devices (user_id)
    WHERE revoked_at IS NULL
  `)
}

/**
 * users / ga / tenants 를 읽기만 함. NOT EXISTS 로 멱등 시드.
 * ensureBootstrapAdminUser 이후에 호출할 것(신규 SUPER_ADMIN 반영).
 *
 * tenant 스코프: scope_id = tenants.id::text (platform 은 scope_id NULL).
 * USER 계정 예전 오시드 보정: user 멤버십이 이미 있으면 중복 staff 삭제,
 * 단독 staff 행은 role=user 로 업데이트.
 */
async function seedCrmPlatformUserMemberships(executor) {
  await executor.query(`
    UPDATE user_memberships m
    SET scope_id = m.tenant_id::text,
        updated_at = NOW()
    WHERE m.scope_type = 'tenant'
      AND m.tenant_id IS NOT NULL
      AND m.scope_id IS DISTINCT FROM m.tenant_id::text
  `)

  await executor.query(`
    DELETE FROM user_memberships m
    USING users u, tenants t
    WHERE m.user_id = u.id
      AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'USER'
      AND m.role = 'staff'
      AND m.scope_type = 'tenant'
      AND t.legacy_ga_id = u.ga_id
      AND m.tenant_id IS NOT DISTINCT FROM t.id
      AND m.scope_id IS NOT DISTINCT FROM t.id::text
      AND EXISTS (
        SELECT 1 FROM user_memberships m2
        WHERE m2.user_id = m.user_id
          AND m2.role = 'user'
          AND m2.scope_type = 'tenant'
          AND m2.tenant_id IS NOT DISTINCT FROM t.id
          AND m2.scope_id IS NOT DISTINCT FROM t.id::text
      )
  `)

  await executor.query(`
    UPDATE user_memberships m
    SET role = 'user', updated_at = NOW()
    FROM users u, tenants t
    WHERE m.user_id = u.id
      AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'USER'
      AND m.role = 'staff'
      AND m.scope_type = 'tenant'
      AND t.legacy_ga_id = u.ga_id
      AND m.tenant_id IS NOT DISTINCT FROM t.id
      AND m.scope_id IS NOT DISTINCT FROM t.id::text
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships m2
        WHERE m2.user_id = m.user_id
          AND m2.role = 'user'
          AND m2.scope_type = 'tenant'
          AND m2.tenant_id IS NOT DISTINCT FROM t.id
      )
  `)

  await executor.query(`
    INSERT INTO user_memberships (user_id, role, scope_type, scope_id, tenant_id, industry_id, status)
    SELECT u.id, 'super_admin', 'platform', NULL, NULL, NULL, 'active'
    FROM users u
    WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'SUPER_ADMIN'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships m
        WHERE m.user_id = u.id
          AND m.role = 'super_admin'
          AND m.scope_type = 'platform'
          AND COALESCE(m.scope_id, '') = ''
      )
  `)

  await executor.query(`
    INSERT INTO user_memberships (user_id, role, scope_type, scope_id, tenant_id, industry_id, status)
    SELECT u.id, 'tenant_admin', 'tenant', t.id::text, t.id, t.industry_id, 'active'
    FROM users u
    INNER JOIN tenants t ON t.legacy_ga_id = u.ga_id AND t.code = 'yjasset'
    WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'GA_ADMIN'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships m
        WHERE m.user_id = u.id
          AND m.role = 'tenant_admin'
          AND m.scope_type = 'tenant'
          AND m.tenant_id IS NOT DISTINCT FROM t.id
          AND m.scope_id IS NOT DISTINCT FROM t.id::text
      )
  `)

  await executor.query(`
    INSERT INTO user_memberships (user_id, role, scope_type, scope_id, tenant_id, industry_id, status)
    SELECT u.id, 'staff', 'tenant', t.id::text, t.id, t.industry_id, 'active'
    FROM users u
    INNER JOIN tenants t ON t.legacy_ga_id = u.ga_id AND t.code = 'yjasset'
    WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'GA_STAFF'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships m
        WHERE m.user_id = u.id
          AND m.role = 'staff'
          AND m.scope_type = 'tenant'
          AND m.tenant_id IS NOT DISTINCT FROM t.id
          AND m.scope_id IS NOT DISTINCT FROM t.id::text
      )
  `)

  await executor.query(`
    INSERT INTO user_memberships (user_id, role, scope_type, scope_id, tenant_id, industry_id, status)
    SELECT u.id, 'user', 'tenant', t.id::text, t.id, t.industry_id, 'active'
    FROM users u
    INNER JOIN tenants t ON t.legacy_ga_id = u.ga_id AND t.code = 'yjasset'
    WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
      AND UPPER(TRIM(COALESCE(u.role, ''))) = 'USER'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships m
        WHERE m.user_id = u.id
          AND m.role = 'user'
          AND m.scope_type = 'tenant'
          AND m.tenant_id IS NOT DISTINCT FROM t.id
          AND m.scope_id IS NOT DISTINCT FROM t.id::text
      )
  `)
}

export async function initDb() {
  const startedAt = Date.now()
  console.log('[initDb] 시작 (idempotent DDL·시드 — 원격 DB면 수 분 소요될 수 있음)')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE ga_companies
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  `)
  await pool.query(`
    ALTER TABLE ga_companies
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false
  `)
  await pool.query(`ALTER TABLE ga_companies DROP CONSTRAINT IF EXISTS ga_companies_status_check`)
  await pool.query(`
    ALTER TABLE ga_companies
    ADD CONSTRAINT ga_companies_status_check
    CHECK (status IN ('active', 'blocked', 'inactive'))
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_history (
      id SERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      old_code VARCHAR(64) NOT NULL,
      new_code VARCHAR(64) NOT NULL,
      old_name VARCHAR(255) NOT NULL,
      new_name VARCHAR(255) NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ga_history_ga_id
    ON ga_history (ga_id)
  `)

  await pool.query(
    `
    INSERT INTO ga_companies (name, code)
    VALUES ('영진에셋', 'YJASSET')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    `,
  )

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false
  `)
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`)
  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_status_check
    CHECK (status IN ('active', 'blocked', 'inactive', 'reset'))
  `)

  /* 휴대폰 유니크는 운영 정책 확정 후 ADD CONSTRAINT ... UNIQUE (phone_number) 등으로 붙일 수 있음 */
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)
  `)
  /*
   * PDF 자동화 엔진의 고객 자동 매핑 대상 컬럼.
   * 프로필 UI 는 후속 PR. 지금은 NULL 로 시작하며, 값이 비어 있으면 render 엔진이
   * "사용자가 직접 입력" 로 폴백하므로 기존 흐름에 영향이 없다.
   */
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS customer_dob DATE
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS customer_address TEXT
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_sms_requested_at TIMESTAMPTZ
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sms_request_count INTEGER NOT NULL DEFAULT 0
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sms_request_window_start TIMESTAMPTZ
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sms_blocked_until TIMESTAMPTZ
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sms_auth_failure_count INTEGER NOT NULL DEFAULT 0
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_verification_codes (
      id SERIAL PRIMARY KEY,
      purpose VARCHAR(50) NOT NULL,
      user_id TEXT NULL,
      username VARCHAR(100) NULL,
      phone_number VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_verification_phone_purpose
    ON sms_verification_codes (phone_number, purpose)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_verification_user_purpose
    ON sms_verification_codes (user_id, purpose)
  `)

  await pool.query(`
    ALTER TABLE sms_verification_codes
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_verification_logs (
      id SERIAL PRIMARY KEY,
      user_id TEXT NULL,
      phone_number VARCHAR(20) NOT NULL,
      purpose VARCHAR(50) NOT NULL,
      success BOOLEAN NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_verification_logs_created
    ON sms_verification_logs (created_at DESC)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_verification_logs_user_created
    ON sms_verification_logs (user_id, created_at DESC)
    WHERE user_id IS NOT NULL
  `)

  await pool.query(`
    ALTER TABLE sms_verification_logs
    ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT ''
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS delegate_password_plaintext TEXT
  `)

  await pool.query(`
    UPDATE users u
    SET ga_id = g.id
    FROM ga_companies g
    WHERE g.code = 'YJASSET' AND u.ga_id IS NULL
  `)

  await pool.query(`
    UPDATE users SET role = CASE role
      WHEN 'super_admin' THEN 'SUPER_ADMIN'
      WHEN 'staff' THEN 'GA_ADMIN'
      WHEN 'user' THEN 'USER'
      WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'
      WHEN 'GA_ADMIN' THEN 'GA_ADMIN'
      WHEN 'GA_STAFF' THEN 'GA_STAFF'
      WHEN 'USER' THEN 'USER'
      ELSE 'USER'
    END
  `)

  const nullGaUsers = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE ga_id IS NULL`)
  if ((nullGaUsers.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] users.ga_id 가 비어 있는 행이 있습니다.')
  }

  await pool.query(`
    ALTER TABLE users ALTER COLUMN ga_id SET NOT NULL
  `)

  await ensureCrmPlatformMetaSchema(pool)
  const { ensureGovernmentSupportSchema } = await import('./lib/governmentSupport/schema.js')
  await ensureGovernmentSupportSchema(pool)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_requests (
      id SERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT feature_requests_status_check CHECK (status IN ('pending', 'reviewed', 'done'))
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_feature_requests_created
    ON feature_requests(created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_feature_requests_ga
    ON feature_requests(ga_id)
  `)

  await pool.query(`
    ALTER TABLE feature_requests
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''
  `)
  await pool.query(`
    UPDATE feature_requests
    SET title = LEFT(TRIM(content), 120)
    WHERE COALESCE(TRIM(title), '') = ''
      AND TRIM(content) <> ''
  `)

  // 문의/요청 댓글.
  // - feature_requests(1) : feature_request_comments(N) 관계.
  // - author_role 은 현재 'admin' 만 기록되지만, 추후 요청자 답글을 허용할 경우
  //   'user' 등 다른 값을 추가할 수 있도록 CHECK 제약 대신 애플리케이션 레이어에서 검증한다.
  // - 요청이 삭제되면 댓글도 함께 정리(CASCADE).
  //
  // 운영 DB 에 이 테이블이 "일부 스키마" 로 이미 존재할 수 있는 과도기가 있었으므로,
  // 신규 환경/기존 환경 모두에서 동일하게 수렴하도록 자가치유(ALTER ... IF NOT EXISTS)
  // 패턴을 사용한다. 제약(NOT NULL, FK) 은 중복 추가를 피하기 위해 DO 블록으로 감싼다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_request_comments (
      id SERIAL PRIMARY KEY
    )
  `)
  await pool.query(`
    ALTER TABLE feature_request_comments
      ADD COLUMN IF NOT EXISTS feature_request_id INTEGER,
      ADD COLUMN IF NOT EXISTS author_user_id TEXT,
      ADD COLUMN IF NOT EXISTS author_role TEXT,
      ADD COLUMN IF NOT EXISTS author_username TEXT,
      ADD COLUMN IF NOT EXISTS content TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)
  // FK(feature_request_id → feature_requests.id) - 이미 존재하면 무시.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'feature_request_comments_feature_request_id_fkey'
      ) THEN
        ALTER TABLE feature_request_comments
          ADD CONSTRAINT feature_request_comments_feature_request_id_fkey
          FOREIGN KEY (feature_request_id) REFERENCES feature_requests(id)
          ON DELETE CASCADE;
      END IF;
    END $$;
  `)
  // FK(author_user_id → users.id) - 이미 존재하면 무시.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'feature_request_comments_author_user_id_fkey'
      ) THEN
        ALTER TABLE feature_request_comments
          ADD CONSTRAINT feature_request_comments_author_user_id_fkey
          FOREIGN KEY (author_user_id) REFERENCES users(id)
          ON DELETE CASCADE;
      END IF;
    END $$;
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_frc_request_created
    ON feature_request_comments(feature_request_id, created_at)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_forms (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL DEFAULT '',
      car_number TEXT NOT NULL DEFAULT '',
      expiry_date DATE,
      form_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // 구버전 스키마 호환: 누락 컬럼을 보강한다.
  await pool.query(`
    ALTER TABLE insurance_forms
    ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS car_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS form_data JSONB NOT NULL DEFAULT CAST('{}' AS jsonb),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)

  await pool.query(`
    UPDATE insurance_forms
    SET updated_at = NOW()
    WHERE updated_at IS NULL
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_forms_user
    ON insurance_forms(user_id)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_forms_expiry
    ON insurance_forms(expiry_date)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_forms_user_updated
    ON insurance_forms(user_id, updated_at DESC)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      ssn TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      carrier TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      height TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      job TEXT NOT NULL DEFAULT '',
      driving TEXT NOT NULL DEFAULT '',
      medical TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_user_search
    ON customers(user_id, created_at DESC)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_user_id
    ON customers(user_id)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_search
    ON customers(user_id, name, phone)
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE customers c
    SET ga_id = u.ga_id
    FROM users u
    WHERE c.user_id = u.id AND c.ga_id IS NULL
  `)
  const nullCust = await pool.query(`SELECT COUNT(*) AS c FROM customers WHERE ga_id IS NULL`)
  if ((nullCust.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] customers.ga_id NULL')
  }
  await pool.query(`ALTER TABLE customers ALTER COLUMN ga_id SET NOT NULL`)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_ga
    ON customers(ga_id)
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS car_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS car_model TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS car_year TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS renewal_date DATE
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS insurance_age INTEGER,
    ADD COLUMN IF NOT EXISTS next_age_date DATE,
    ADD COLUMN IF NOT EXISTS is_driver BOOLEAN,
    ADD COLUMN IF NOT EXISTS car_type TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT CAST('[]' AS jsonb)
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS birth_date DATE
  `)
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS customer_code VARCHAR(50)
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS crm_extension JSONB NOT NULL DEFAULT CAST('{"v":1,"fields":{}}' AS jsonb)
  `)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customers_customer_code_key'
      ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
      END IF;
    END $$;
  `)

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'own'
  `)
  await pool.query(`
    UPDATE customers c
    SET tenant_id = t.id
    FROM tenants t
    WHERE c.ga_id = t.legacy_ga_id
      AND c.tenant_id IS NULL
  `)
  await pool.query(`
    UPDATE customers SET owner_user_id = user_id WHERE owner_user_id IS NULL
  `)
  await pool.query(`
    UPDATE customers SET created_by_user_id = user_id WHERE created_by_user_id IS NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
    ON customers (tenant_id)
    WHERE tenant_id IS NOT NULL
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_cars (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      car_type TEXT NOT NULL DEFAULT '',
      car_number TEXT NOT NULL DEFAULT '',
      car_model TEXT NOT NULL DEFAULT '',
      car_year TEXT NOT NULL DEFAULT '',
      renewal_date DATE NULL,
      memo TEXT NOT NULL DEFAULT '',
      is_primary BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_cars_customer_id
    ON customer_cars(customer_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_cars_user_customer
    ON customer_cars(user_id, customer_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_cars_ga_customer
    ON customer_cars(ga_id, customer_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_cars_renewal_date
    ON customer_cars(renewal_date)
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_cars_primary_per_customer
    ON customer_cars(customer_id)
    WHERE is_primary = true
  `)

  await pool.query(`
    INSERT INTO customer_cars (
      customer_id,
      user_id,
      ga_id,
      car_type,
      car_number,
      car_model,
      car_year,
      renewal_date,
      is_primary,
      sort_order
    )
    SELECT
      c.id,
      c.user_id,
      c.ga_id,
      COALESCE(c.car_type, ''),
      COALESCE(c.car_number, ''),
      COALESCE(c.car_model, ''),
      COALESCE(c.car_year, ''),
      c.renewal_date,
      true,
      0
    FROM customers c
    WHERE NOT EXISTS (
      SELECT 1 FROM customer_cars cc WHERE cc.customer_id = c.id
    )
    AND (
      COALESCE(TRIM(c.car_type), '') <> ''
      OR COALESCE(TRIM(c.car_number), '') <> ''
      OR COALESCE(TRIM(c.car_model), '') <> ''
      OR COALESCE(TRIM(c.car_year), '') <> ''
      OR c.renewal_date IS NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_customer_excel_settings (
      ga_id INTEGER PRIMARY KEY REFERENCES ga_companies(id) ON DELETE CASCADE,
      feature_enabled BOOLEAN NOT NULL DEFAULT false,
      config_ready BOOLEAN NOT NULL DEFAULT false,
      sample_original_filename TEXT,
      sample_uploaded_at TIMESTAMPTZ,
      sample_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
      match_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
      display_column_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      filter_column_id TEXT,
      filter_op TEXT,
      filter_value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settings_version INTEGER NOT NULL DEFAULT 1
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_customer_excel_uploads (
      id SERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      uploaded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL DEFAULT '',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      row_count INTEGER NOT NULL DEFAULT 0,
      settings_version_at_upload INTEGER NOT NULL DEFAULT 1
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ga_customer_excel_uploads_ga
    ON ga_customer_excel_uploads(ga_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_customer_excel_rows (
      id BIGSERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      upload_id INTEGER NOT NULL REFERENCES ga_customer_excel_uploads(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      cells JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ga_customer_excel_rows_ga_upload
    ON ga_customer_excel_rows(ga_id, upload_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ga_customer_match_aliases (
      id SERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      alias_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ga_customer_match_aliases_value_len CHECK (char_length(alias_value) <= 100)
    )
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ga_customer_match_aliases_ga_customer_value_uk
    ON ga_customer_match_aliases(ga_id, customer_id, alias_value)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ga_customer_match_aliases_lookup
    ON ga_customer_match_aliases(ga_id, customer_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_excel_data (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      row_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_excel_data_user_ga
    ON user_excel_data(user_id, ga_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_excel_column_settings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      is_visible BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, ga_id, column_name)
    )
  `)

  await pool.query(`
    ALTER TABLE insurance_forms
    ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_forms_user_customer
    ON insurance_forms(user_id, customer_id)
    WHERE customer_id IS NOT NULL
  `)

  await pool.query(`
    ALTER TABLE insurance_forms
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE insurance_forms f
    SET ga_id = u.ga_id
    FROM users u
    WHERE f.user_id = u.id AND f.ga_id IS NULL
  `)
  const nullForms = await pool.query(`SELECT COUNT(*) AS c FROM insurance_forms WHERE ga_id IS NULL`)
  if ((nullForms.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_forms.ga_id NULL')
  }
  await pool.query(`ALTER TABLE insurance_forms ALTER COLUMN ga_id SET NOT NULL`)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_forms_ga
    ON insurance_forms(ga_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_contacts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('LIFE', 'NON_LIFE', 'GENERAL')),
      company_name TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE insurance_contacts
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS company_name TEXT,
    ADD COLUMN IF NOT EXISTS manager_name TEXT,
    ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_contacts_category
    ON insurance_contacts(category, company_name, manager_name)
  `)

  await pool.query(`
    ALTER TABLE insurance_contacts
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE insurance_contacts c
    SET ga_id = g.id
    FROM ga_companies g
    WHERE g.code = 'YJASSET' AND c.ga_id IS NULL
  `)
  const nullIcGa = await pool.query(`SELECT COUNT(*) AS c FROM insurance_contacts WHERE ga_id IS NULL`)
  if ((nullIcGa.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_contacts.ga_id NULL')
  }
  await pool.query(`ALTER TABLE insurance_contacts ALTER COLUMN ga_id SET NOT NULL`)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_contacts_ga
    ON insurance_contacts(ga_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_contact_updates (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE')),
      category TEXT NOT NULL CHECK (category IN ('LIFE', 'NON_LIFE', 'GENERAL')),
      company_name TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      old_phone_number TEXT,
      new_phone_number TEXT,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE insurance_contact_updates
    ADD COLUMN IF NOT EXISTS contact_id TEXT,
    ADD COLUMN IF NOT EXISTS action_type TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS company_name TEXT,
    ADD COLUMN IF NOT EXISTS manager_name TEXT,
    ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS old_phone_number TEXT,
    ADD COLUMN IF NOT EXISTS new_phone_number TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_contact_updates_created
    ON insurance_contact_updates(created_at DESC)
  `)

  await pool.query(`
    ALTER TABLE insurance_contact_updates
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE insurance_contact_updates u
    SET ga_id = c.ga_id
    FROM insurance_contacts c
    WHERE u.contact_id = c.id AND u.ga_id IS NULL
  `)
  await pool.query(`
    UPDATE insurance_contact_updates u
    SET ga_id = g.id
    FROM ga_companies g
    WHERE g.code = 'YJASSET' AND u.ga_id IS NULL
  `)
  const nullIcuGa = await pool.query(`SELECT COUNT(*) AS c FROM insurance_contact_updates WHERE ga_id IS NULL`)
  if ((nullIcuGa.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_contact_updates.ga_id NULL')
  }
  await pool.query(`ALTER TABLE insurance_contact_updates ALTER COLUMN ga_id SET NOT NULL`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_contact_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_master (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      customer_center TEXT NOT NULL DEFAULT '',
      system_phone TEXT NOT NULL DEFAULT '',
      incall_number TEXT NOT NULL DEFAULT '',
      visit_info TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_contacts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES insurance_company_master(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT ''
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_general_request (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES insurance_company_master(id) ON DELETE CASCADE,
      description TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      fax TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_company_contacts_company
    ON insurance_company_contacts(company_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_update_log (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES insurance_company_master(id) ON DELETE SET NULL,
      company_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_username TEXT NOT NULL DEFAULT '',
      before_payload JSONB NOT NULL DEFAULT '{}',
      after_payload JSONB NOT NULL DEFAULT '{}'
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_company_update_log_updated
    ON insurance_company_update_log (updated_at DESC)
  `)

  /** 보험사(마스터) 삭제 후에도 콘텐츠 보존 — company_id 끊고 표시용 스냅샷 유지 */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_newsletters (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      company_id INTEGER REFERENCES insurance_company_master(id) ON DELETE SET NULL,
      company_name_snapshot TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      body_text TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT CAST('{}' AS jsonb),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_company_newsletters_ga
    ON insurance_company_newsletters(ga_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_company_newsletters_company
    ON insurance_company_newsletters(company_id)
    WHERE company_id IS NOT NULL
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_newsletter_attachments (
      id TEXT PRIMARY KEY,
      newsletter_id TEXT NOT NULL REFERENCES insurance_company_newsletters(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_icn_att_newsletter
    ON insurance_company_newsletter_attachments(newsletter_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_company_merge_logs (
      id SERIAL PRIMARY KEY,
      keep_id INTEGER NOT NULL,
      drop_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      category TEXT,
      ga_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_company_merge_logs_created
    ON insurance_company_merge_logs (created_at DESC)
  `)

  await pool.query(`
    ALTER TABLE insurance_company_master
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `)
  await pool.query(`
    ALTER TABLE insurance_company_master
    ADD COLUMN IF NOT EXISTS updated_by_username TEXT NOT NULL DEFAULT ''
  `)
  await pool.query(`
    UPDATE insurance_company_master
    SET updated_at = created_at
    WHERE updated_at IS NULL
  `)

  await pool.query(`
    ALTER TABLE insurance_company_master
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE insurance_company_master m
    SET ga_id = g.id
    FROM ga_companies g
    WHERE g.code = 'YJASSET' AND m.ga_id IS NULL
  `)
  const nullM = await pool.query(`SELECT COUNT(*) AS c FROM insurance_company_master WHERE ga_id IS NULL`)
  if ((nullM.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_company_master.ga_id NULL')
  }
  await pool.query(`DROP INDEX IF EXISTS uq_insurance_company_master_category_name`)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_company_master_ga_category_name
    ON insurance_company_master (ga_id, category, name)
  `)
  await pool.query(`ALTER TABLE insurance_company_master ALTER COLUMN ga_id SET NOT NULL`)

  await pool.query(`
    ALTER TABLE insurance_company_master
    ADD COLUMN IF NOT EXISTS company_code VARCHAR(20)
  `)
  await pool.query(`
    UPDATE insurance_company_master
    SET company_code = 'INS' || LPAD(CAST(id AS text), 6, '0')
    WHERE company_code IS NULL OR BTRIM(company_code) = ''
  `)
  await pool.query(`DROP INDEX IF EXISTS uq_insurance_company_master_company_code`)
  await pool.query(`
    CREATE UNIQUE INDEX uq_insurance_company_master_company_code
    ON insurance_company_master (company_code)
  `)

  await pool.query(`
    ALTER TABLE insurance_company_update_log
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE insurance_company_update_log l
    SET ga_id = m.ga_id
    FROM insurance_company_master m
    WHERE l.company_id = m.id AND l.ga_id IS NULL
  `)
  await pool.query(`
    UPDATE insurance_company_update_log l
    SET ga_id = g.id
    FROM ga_companies g
    WHERE g.code = 'YJASSET' AND l.ga_id IS NULL
  `)
  const nullLog = await pool.query(`SELECT COUNT(*) AS c FROM insurance_company_update_log WHERE ga_id IS NULL`)
  if ((nullLog.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_company_update_log.ga_id NULL')
  }
  await pool.query(`ALTER TABLE insurance_company_update_log ALTER COLUMN ga_id SET NOT NULL`)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_general_request_company
    ON insurance_general_request(company_id)
  `)

  // 메리츠(화재)는 손해보험사: 잘못 LIFE로 들어간 행을 NON_LIFE로 정정 (중복 없을 때만)
  const meritzRes = await pool.query(`
    UPDATE insurance_company_master icm
    SET category = 'NON_LIFE'
    WHERE icm.category = 'LIFE'
      AND (
        icm.name = '메리츠화재'
        OR icm.name = '메리츠 화재'
        OR (icm.name LIKE '메리츠%' AND icm.name LIKE '%화재%')
        OR icm.name = '메리츠'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM insurance_company_master x
        WHERE x.category = 'NON_LIFE'
          AND TRIM(x.name) = TRIM(icm.name)
          AND x.id <> icm.id
          AND x.ga_id = icm.ga_id
      )
  `)
  if (meritzRes.rowCount > 0) {
    console.log('[initDb] 메리츠(화재) 분류 정정: LIFE → NON_LIFE', meritzRes.rowCount, '행')
  }

  const meritzNameCond = `
        l.name = '메리츠화재'
        OR l.name = '메리츠 화재'
        OR (l.name LIKE '메리츠%' AND l.name LIKE '%화재%')
        OR l.name = '메리츠'
  `

  await pool.query(`
    UPDATE insurance_company_contacts c
    SET company_id = n.id
    FROM insurance_company_master l
    INNER JOIN insurance_company_master n
      ON n.category = 'NON_LIFE'
      AND l.category = 'LIFE'
      AND TRIM(l.name) = TRIM(n.name)
      AND n.ga_id = l.ga_id
    WHERE c.company_id = l.id
      AND (${meritzNameCond})
  `)

  await pool.query(`
    DELETE FROM insurance_general_request g
    USING insurance_company_master l
    INNER JOIN insurance_company_master n
      ON n.category = 'NON_LIFE'
      AND l.category = 'LIFE'
      AND TRIM(l.name) = TRIM(n.name)
      AND n.ga_id = l.ga_id
    WHERE g.company_id = l.id
      AND (${meritzNameCond})
  `)

  const meritzDedup = await pool.query(`
    DELETE FROM insurance_company_master l
    USING insurance_company_master n
    WHERE l.category = 'LIFE'
      AND n.category = 'NON_LIFE'
      AND TRIM(l.name) = TRIM(n.name)
      AND l.ga_id = n.ga_id
      AND (${meritzNameCond})
    RETURNING l.id
  `)
  if (meritzDedup.rowCount > 0) {
    console.log('[initDb] 메리츠 LIFE 중복 마스터 제거:', meritzDedup.rowCount, '행')
  }

  await ensureInsuranceCompanyMasterCategoryNormalized(pool)

  await pool.query(`
    UPDATE insurance_company_master
    SET company_code = 'INS' || LPAD(CAST(id AS text), 6, '0')
    WHERE company_code IS NULL OR BTRIM(company_code) = ''
  `)
  const nullCompanyCode = await pool.query(`
    SELECT COUNT(*) AS c
    FROM insurance_company_master
    WHERE company_code IS NULL OR BTRIM(company_code) = ''
  `)
  if ((nullCompanyCode.rows[0]?.c ?? 0) > 0) {
    throw new Error('[initDb] insurance_company_master.company_code가 비어 있어 NOT NULL을 적용할 수 없습니다.')
  }
  await pool.query(`
    ALTER TABLE insurance_company_master
    ALTER COLUMN company_code SET NOT NULL
  `)

  const meritzIc = await pool.query(`
    UPDATE insurance_contacts
    SET category = 'NON_LIFE'
    WHERE category = 'LIFE'
      AND (
        TRIM(company_name) = '메리츠화재'
        OR TRIM(company_name) = '메리츠 화재'
        OR (TRIM(company_name) LIKE '메리츠%' AND TRIM(company_name) LIKE '%화재%')
        OR TRIM(company_name) = '메리츠'
      )
  `)
  if (meritzIc.rowCount > 0) {
    console.log('[initDb] 재보험 연락처 메리츠 분류 정정: LIFE → NON_LIFE', meritzIc.rowCount, '행')
  }

  const yjGaRes = await pool.query(`SELECT id FROM ga_companies WHERE code = 'YJASSET' LIMIT 1`)
  const yjGaId = yjGaRes.rows[0]?.id

  const directoryClient = await pool.connect()
  try {
    await directoryClient.query('BEGIN')
    await runCompanyDirectorySanitize(directoryClient, (msg, ...args) =>
      console.log('[initDb][company-directory]', msg, ...args),
      yjGaId,
    )
    await touchContactLastUpdatedAt(directoryClient, yjGaId)
    await directoryClient.query('COMMIT')
  } catch (e) {
    await directoryClient.query('ROLLBACK')
    console.error('[initDb] 보험사 디렉터리 자동 정리 실패(서버는 계속 기동):', e)
  } finally {
    directoryClient.release()
  }

  const updatedAtColumnCheck = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'insurance_forms'
      AND column_name = 'updated_at'
    `,
  )

  if (updatedAtColumnCheck.rowCount === 0) {
    throw new Error('DB 점검 실패: insurance_forms.updated_at 컬럼이 없습니다.')
  }

  const indexCheck = await pool.query(
    `
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'insurance_forms'
      AND indexname = 'idx_forms_user_updated'
    `,
  )

  if (
    indexCheck.rowCount === 0 ||
    !String(indexCheck.rows[0].indexdef).includes('(user_id, updated_at DESC)')
  ) {
    throw new Error('DB 점검 실패: idx_forms_user_updated 인덱스가 올바르지 않습니다.')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consent_templates (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL,
      insurance_company_id TEXT NOT NULL,
      fax_number TEXT NOT NULL DEFAULT '',
      fields JSONB NOT NULL DEFAULT CAST('[]' AS jsonb),
      pdf_storage_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY ga_id, insurance_company_id
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM consent_templates
    )
    DELETE FROM consent_templates c
    USING ranked r
    WHERE c.id = r.id AND r.rn > 1
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_templates_ga_insurer
    ON consent_templates(ga_id, insurance_company_id)
  `)

  await pool.query(`
    ALTER TABLE consent_templates
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)

  const yjConsentGa = await pool.query(`SELECT id FROM ga_companies WHERE code = 'YJASSET' LIMIT 1`)
  const yjConsentGaId = yjConsentGa.rows[0]?.id
  if (yjConsentGaId != null) {
    await pool.query(
      `
      DELETE FROM consent_templates a
      USING consent_templates b
      WHERE a.ga_id IS DISTINCT FROM $1
        AND b.ga_id = $1
        AND a.insurance_company_id = b.insurance_company_id
      `,
      [yjConsentGaId],
    )
    await pool.query(`UPDATE consent_templates SET ga_id = $1 WHERE ga_id IS DISTINCT FROM $1`, [
      yjConsentGaId,
    ])
    await pool.query(`
      DELETE FROM consent_templates a
      USING consent_templates b
      WHERE a.ga_id = b.ga_id
        AND a.insurance_company_id = b.insurance_company_id
        AND CAST(a.id AS text) > CAST(b.id AS text)
    `)
  }
  await pool.query(`ALTER TABLE consent_templates DROP CONSTRAINT IF EXISTS fk_consent_templates_ga`)
  await pool.query(`
    ALTER TABLE consent_templates
    ADD CONSTRAINT fk_consent_templates_ga FOREIGN KEY (ga_id) REFERENCES ga_companies(id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurer_managers (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      insurer_type TEXT NOT NULL,
      insurer_name TEXT NOT NULL,
      username VARCHAR(50) NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE insurer_managers DROP CONSTRAINT IF EXISTS insurer_managers_insurer_type_check`)
  await pool.query(`
    ALTER TABLE insurer_managers
    ADD CONSTRAINT insurer_managers_insurer_type_check
    CHECK (insurer_type IN ('LIFE', 'NON_LIFE'))
  `)
  await pool.query(`ALTER TABLE insurer_managers DROP CONSTRAINT IF EXISTS insurer_managers_status_check`)
  await pool.query(`
    ALTER TABLE insurer_managers
    ADD CONSTRAINT insurer_managers_status_check
    CHECK (status IN ('ACTIVE', 'BLOCKED'))
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_insurer_managers_username_active
    ON insurer_managers (username)
    WHERE is_deleted = false
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_insurer_managers_ga_insurer_active
    ON insurer_managers (ga_id, insurer_name)
    WHERE is_deleted = false
  `)

  await pool.query(`
    ALTER TABLE insurer_managers
    ADD COLUMN IF NOT EXISTS password_plaintext TEXT
  `)

  await pool.query(`
    ALTER TABLE insurer_managers
    ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES insurance_company_master(id)
  `)
  await pool.query(`
    UPDATE insurer_managers im
    SET company_id = m.id
    FROM insurance_company_master m
    WHERE im.company_id IS NULL
      AND im.ga_id = m.ga_id
      AND TRIM(im.insurer_name) = TRIM(m.name)
  `)
  await pool.query(`DROP INDEX IF EXISTS uq_insurer_managers_ga_insurer_active`)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_insurer_managers_ga_company_active
    ON insurer_managers (ga_id, company_id)
    WHERE is_deleted = false AND company_id IS NOT NULL
  `)
  await pool.query(`
    ALTER TABLE insurer_managers
    ALTER COLUMN company_id DROP NOT NULL
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loss_adjusters (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      company_id INTEGER REFERENCES insurance_company_master(id),
      company_name TEXT NOT NULL DEFAULT '',
      adjuster_type TEXT NOT NULL DEFAULT 'NON_LIFE',
      adjuster_name TEXT NOT NULL DEFAULT '',
      username VARCHAR(50) NOT NULL,
      password_hash TEXT NOT NULL,
      password_plaintext TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE loss_adjusters
    ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT ''
  `)
  await pool.query(`
    ALTER TABLE loss_adjusters
    ALTER COLUMN adjuster_type SET DEFAULT 'NON_LIFE'
  `)
  await pool.query(`
    ALTER TABLE loss_adjusters
    ALTER COLUMN adjuster_name SET DEFAULT ''
  `)
  await pool.query(`
    UPDATE loss_adjusters
    SET company_name = TRIM(adjuster_name)
    WHERE TRIM(COALESCE(company_name, '')) = ''
      AND TRIM(COALESCE(adjuster_name, '')) <> ''
  `)
  await pool.query(`ALTER TABLE loss_adjusters DROP CONSTRAINT IF EXISTS loss_adjusters_adjuster_type_check`)
  await pool.query(`
    ALTER TABLE loss_adjusters
    ADD CONSTRAINT loss_adjusters_adjuster_type_check
    CHECK (adjuster_type IN ('LIFE', 'NON_LIFE'))
  `)
  await pool.query(`ALTER TABLE loss_adjusters DROP CONSTRAINT IF EXISTS loss_adjusters_status_check`)
  await pool.query(`
    ALTER TABLE loss_adjusters
    ADD CONSTRAINT loss_adjusters_status_check
    CHECK (status IN ('ACTIVE', 'BLOCKED'))
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loss_adjusters_username_active
    ON loss_adjusters (username)
    WHERE is_deleted = false
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loss_adjusters_ga_company_active
    ON loss_adjusters (ga_id, company_id)
    WHERE is_deleted = false AND company_id IS NOT NULL
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loss_adjuster_unique
    ON loss_adjusters (ga_id, company_id, username)
    WHERE is_deleted = false
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurer_manager_recovery_logs (
      id SERIAL PRIMARY KEY,
      manager_id TEXT,
      old_company_id INTEGER,
      new_company_id INTEGER,
      recovery_type TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ga_id INTEGER,
      company_id INTEGER,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await ensureInsurerManagerCompanyFkOnDeleteSetNull(pool)
  await ensureLossAdjusterCompanyFkOnDeleteSetNull(pool)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_insurer_manager_unique
    ON insurer_managers (ga_id, company_id, username)
    WHERE is_deleted = false
  `)

  await maybeDebugResetAllUsers()
  await ensureBootstrapAdminUser()
  await seedCrmPlatformUserMemberships(pool)
  await seedConsentTemplatesIfNeeded()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teams_ga ON teams(ga_id)
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id) ON DELETE SET NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id) WHERE team_id IS NOT NULL
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT
  `)
  await pool.query(`
    UPDATE users SET invited_by_user_id = id WHERE invited_by_user_id IS NULL
  `)
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_invited_by_user_id_fkey
  `)
  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_invited_by_user_id_fkey
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  `)
  await pool.query(`
    ALTER TABLE users ALTER COLUMN invited_by_user_id SET NOT NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_invited_by ON users(invited_by_user_id)
  `)
  await pool.query(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_user_id) WHERE owner_user_id IS NOT NULL
  `)
  await pool.query(`
    UPDATE teams t
    SET owner_user_id = u.id
    FROM (
      SELECT DISTINCT ON (team_id) team_id, id
      FROM users
      WHERE team_id IS NOT NULL AND is_deleted = false
      ORDER BY team_id, display_name ASC NULLS LAST, username ASC
    ) u
    WHERE t.id = u.team_id AND (t.owner_user_id IS NULL OR t.owner_user_id = '')
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_posts (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      author_user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      is_notice BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE team_posts
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE team_posts p
    SET ga_id = t.ga_id
    FROM teams t
    WHERE p.team_id = t.id AND p.ga_id IS NULL
  `)
  await pool.query(`
    ALTER TABLE team_posts ALTER COLUMN ga_id SET NOT NULL
  `)
  await pool.query(`
    ALTER TABLE team_posts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `)
  await pool.query(`
    UPDATE team_posts SET updated_at = created_at WHERE updated_at IS NULL
  `)
  await pool.query(`
    ALTER TABLE team_posts ALTER COLUMN updated_at SET DEFAULT NOW()
  `)
  try {
    await pool.query(`
      ALTER TABLE team_posts ALTER COLUMN updated_at SET NOT NULL
    `)
  } catch (e) {
    console.error(
      '[initDb] team_posts.updated_at NOT NULL 설정 실패 — team_posts 수동 점검 후 패치 API가 동작하지 않을 수 있음:',
      e instanceof Error ? e.message : e,
    )
  }
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_posts_team_notice_created
    ON team_posts(team_id, is_notice DESC, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_posts_ga_team
    ON team_posts(ga_id, team_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_posts_ga_team_created_at
    ON team_posts (ga_id, team_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_posts_ga_team_notice_created
    ON team_posts (ga_id, team_id, is_notice DESC, created_at DESC)
  `)
  /*
   * TODO(스키마 강화): team_posts(team_id, ga_id) → teams(id, ga_id) 복합 FK 는
   * teams 에 UNIQUE (id, ga_id) 선행 후 가능. 현재는 앱 레벨에서 team·ga 정합성 검증.
   *
   * TODO(멀티테넌트): team_post_attachments 에 ga_id 비정규화 시 INSERT/UPDATE 도 동일 GA로 검증.
   * 지금은 모든 첨부 조회를 team_posts 와 조인해 p.ga_id 로 제한한다.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_post_attachments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_post_attachments_post
    ON team_post_attachments(post_id)
  `)

  await pool.query(`
    ALTER TABLE team_posts
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false
  `)
  await pool.query(`
    UPDATE team_posts SET is_deleted = false WHERE is_deleted IS NULL
  `)
  try {
    await pool.query(`
      ALTER TABLE team_posts ALTER COLUMN is_deleted SET NOT NULL
    `)
    await pool.query(`
      ALTER TABLE team_posts ALTER COLUMN is_deleted SET DEFAULT false
    `)
  } catch (e) {
    console.error('[initDb] team_posts.is_deleted NOT NULL 설정 실패:', e instanceof Error ? e.message : e)
  }
  await pool.query(`
    ALTER TABLE team_posts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_post_comments (
      id BIGSERIAL PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      author_user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_team_post_comments_post_ga_team_created
    ON team_post_comments (post_id, ga_id, team_id, created_at DESC)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      team_id TEXT,
      type TEXT NOT NULL DEFAULT '',
      reference_id TEXT,
      message TEXT NOT NULL DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_ga_read_created
    ON notifications (user_id, ga_id, is_read, created_at DESC)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_consultations (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      body TEXT NOT NULL DEFAULT '',
      consultation_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE customer_consultations
    ADD COLUMN IF NOT EXISTS consultation_date DATE
  `)
  await pool.query(`
    UPDATE customer_consultations
    SET consultation_date = CASE
      WHEN body ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN TO_DATE(SUBSTRING(body FROM 1 FOR 10), 'YYYY-MM-DD')
      ELSE (created_at AT TIME ZONE 'UTC')::DATE
    END
    WHERE consultation_date IS NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_consultations_customer_created
    ON customer_consultations(customer_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_consultations_customer_consultation_date
    ON customer_consultations(customer_id, consultation_date DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_consultations_user
    ON customer_consultations(user_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date DATE,
      due_time TIME,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      related_entity_type TEXT,
      related_entity_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      CONSTRAINT todos_status_chk CHECK (status IN ('pending', 'completed', 'canceled')),
      CONSTRAINT todos_priority_chk CHECK (priority IN ('low', 'normal', 'high')),
      CONSTRAINT todos_source_type_chk CHECK (
        source_type IN (
          'manual',
          'customer_memo',
          'consultation_note',
          'pdf_document',
          'e_document',
          'system'
        )
      )
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_todos_ga_owner_status_due
    ON todos (ga_id, owner_user_id, status, due_date)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_todos_ga_assignee_status_due
    ON todos (ga_id, assignee_user_id, status, due_date)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_todos_ga_updated
    ON todos (ga_id, updated_at DESC)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_files (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      content TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      object_key TEXT,
      file_url TEXT NOT NULL,
      file_size BIGINT,
      mime_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `)
  await pool.query(
    `ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT ''`,
  )
  await pool.query(`ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS object_key TEXT`)
  await pool.query(
    `ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
  )
  await pool.query(
    `ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  )
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_files_customer_created
    ON customer_files (customer_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_files_user
    ON customer_files (user_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_files_customer_ga_active
    ON customer_files (customer_id, ga_id)
    WHERE deleted_at IS NULL
  `)
  /** 고객 소속 GA·담당자와 customer_files 정렬 (기존 NULL/불일치 보정) — customers.ga_id는 INTEGER FK 유지 */
  await pool.query(`
    UPDATE customer_files f
    SET ga_id = c.ga_id,
        user_id = c.user_id
    FROM customers c
    WHERE f.customer_id = c.id
      AND (
        f.ga_id IS NULL
        OR f.user_id IS NULL
        OR f.ga_id IS DISTINCT FROM c.ga_id
        OR f.user_id IS DISTINCT FROM c.user_id
      )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER REFERENCES ga_companies(id),
      name VARCHAR(12) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_folders_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 12)
    )
  `)
  await pool.query(`
    ALTER TABLE folders
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    UPDATE folders f
    SET ga_id = u.ga_id
    FROM users u
    WHERE f.user_id = u.id
      AND f.ga_id IS NULL
      AND u.ga_id IS NOT NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_folders_user_ga_created
    ON folders (user_id, ga_id, created_at DESC)
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS storage_limit BIGINT NOT NULL DEFAULT 1073741824
  `)
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS storage_used BIGINT NOT NULL DEFAULT 0
  `)
  await pool.query(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS storage_limit BIGINT NOT NULL DEFAULT 1073741824
  `)
  await pool.query(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS storage_used BIGINT NOT NULL DEFAULT 0
  `)
  await pool.query(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
  `)
  await pool.query(`
    ALTER TABLE folders
    ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_folders_user_ga_customer_created
    ON folders (user_id, ga_id, customer_id, created_at DESC)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL,
      original_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size BIGINT,
      mime_type TEXT,
      is_confirmed BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_user_created
    ON files (user_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_customer_created
    ON files (customer_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_user_folder_created
    ON files (user_id, folder_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_user_confirmed_created
    ON files (user_id, created_at DESC)
    WHERE is_confirmed = true
  `)

  /** folders: 레거시 uq_folders_user_name 미사용.�합 후 partial unique 인����다. */
  await pool.query(`DROP INDEX IF EXISTS uq_folders_user_name`)
  await pool.query(`DROP INDEX IF EXISTS uq_folders_user_ga_personal_name`)
  await pool.query(`DROP INDEX IF EXISTS uq_folders_user_ga_customer_name`)
  await pool.query(`
    UPDATE files f
    SET folder_id = m.keep_id
    FROM folders fo
    INNER JOIN (
      SELECT user_id, ga_id, lower(btrim(name)) AS norm, MIN(id) AS keep_id
      FROM folders
      WHERE customer_id IS NULL
      GROUP BY user_id, ga_id, lower(btrim(name))
      HAVING COUNT(*) > 1
    ) m ON fo.user_id = m.user_id
      AND fo.ga_id IS NOT DISTINCT FROM m.ga_id
      AND lower(btrim(fo.name)) = m.norm
      AND fo.customer_id IS NULL
    WHERE f.folder_id = fo.id
      AND fo.id <> m.keep_id
  `)
  await pool.query(`
    UPDATE files f
    SET folder_id = m.keep_id
    FROM folders fo
    INNER JOIN (
      SELECT user_id, ga_id, customer_id, lower(btrim(name)) AS norm, MIN(id) AS keep_id
      FROM folders
      WHERE customer_id IS NOT NULL
      GROUP BY user_id, ga_id, customer_id, lower(btrim(name))
      HAVING COUNT(*) > 1
    ) m ON fo.user_id = m.user_id
      AND fo.ga_id IS NOT DISTINCT FROM m.ga_id
      AND fo.customer_id IS NOT DISTINCT FROM m.customer_id
      AND lower(btrim(fo.name)) = m.norm
    WHERE f.folder_id = fo.id
      AND fo.id <> m.keep_id
  `)
  await pool.query(`
    DELETE FROM folders fo
    WHERE fo.customer_id IS NULL
      AND fo.id NOT IN (
        SELECT MIN(id)
        FROM folders f2
        WHERE f2.customer_id IS NULL
        GROUP BY f2.user_id, f2.ga_id, lower(btrim(f2.name))
      )
  `)
  await pool.query(`
    DELETE FROM folders fo
    WHERE fo.customer_id IS NOT NULL
      AND fo.id NOT IN (
        SELECT MIN(id)
        FROM folders f2
        WHERE f2.customer_id IS NOT NULL
        GROUP BY f2.user_id, f2.ga_id, f2.customer_id, lower(btrim(f2.name))
      )
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_folders_user_ga_personal_name
    ON folders (user_id, ga_id, lower(btrim(name)))
    WHERE customer_id IS NULL
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_folders_user_ga_customer_name
    ON folders (user_id, ga_id, customer_id, lower(btrim(name)))
    WHERE customer_id IS NOT NULL
  `)

  await pool.query(`
    INSERT INTO files (
      user_id,
      ga_id,
      customer_id,
      folder_id,
      original_name,
      display_name,
      file_path,
      file_size,
      mime_type,
      is_confirmed,
      created_at
    )
    SELECT
      cf.user_id,
      cf.ga_id,
      cf.customer_id,
      NULL::BIGINT AS folder_id,
      cf.file_name AS original_name,
      cf.file_name AS display_name,
      COALESCE(NULLIF(cf.object_key, ''), NULLIF(cf.file_url, '')) AS file_path,
      cf.file_size,
      cf.mime_type,
      true AS is_confirmed,
      cf.created_at
    FROM customer_files cf
    WHERE cf.deleted_at IS NULL
      AND COALESCE(NULLIF(cf.object_key, ''), NULLIF(cf.file_url, '')) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM files f
        WHERE f.user_id = cf.user_id
          AND f.ga_id = cf.ga_id
          AND f.customer_id = cf.customer_id
          AND f.file_path = COALESCE(NULLIF(cf.object_key, ''), NULLIF(cf.file_url, ''))
          AND f.created_at = cf.created_at
      )
  `)

  await pool.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
  `)
  await pool.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT ''
  `)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'upload_status'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'status'
      ) THEN
        ALTER TABLE files RENAME COLUMN upload_status TO status;
      END IF;
    END $$;
  `)
  await pool.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
  `)
  await pool.query(`
    UPDATE files
    SET customer_id = NULL
    WHERE team_id IS NOT NULL
      AND customer_id IS NOT NULL
  `)
  await pool.query(`ALTER TABLE files DROP CONSTRAINT IF EXISTS chk_files_team_customer_exclusive`)
  await pool.query(`
    ALTER TABLE files
    ADD CONSTRAINT chk_files_team_customer_exclusive
    CHECK (team_id IS NULL OR customer_id IS NULL)
  `)
  await pool.query(`ALTER TABLE files DROP CONSTRAINT IF EXISTS chk_files_upload_status`)
  await pool.query(`ALTER TABLE files DROP CONSTRAINT IF EXISTS chk_files_status`)
  await pool.query(`
    ALTER TABLE files
    ADD CONSTRAINT chk_files_status
    CHECK (status IN ('uploading', 'active', 'failed'))
  `)
  await pool.query(`DROP INDEX IF EXISTS idx_files_team_ga_confirmed`)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_team_ga_active
    ON files (team_id, ga_id)
    WHERE team_id IS NOT NULL AND status = 'active'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS storage_upload_staging (
      object_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_storage_upload_staging_ga_created
    ON storage_upload_staging (ga_id, created_at ASC)
  `)

  await pool.query(`
    UPDATE users u
    SET storage_used = COALESCE((
      SELECT SUM(f.file_size)::bigint
      FROM files f
      WHERE f.user_id = u.id
        AND f.ga_id = u.ga_id
        AND f.status = 'active'
        AND f.team_id IS NULL
        AND f.deleted_at IS NULL
    ), 0)
  `)
  await pool.query(`
    UPDATE teams t
    SET storage_used = COALESCE((
      SELECT SUM(f.file_size)::bigint
      FROM files f
      WHERE f.team_id = t.id
        AND f.ga_id = t.ga_id
        AND f.status = 'active'
        AND f.deleted_at IS NULL
    ), 0)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_relations (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      related_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_customer_relations_distinct CHECK (customer_id <> related_customer_id)
    )
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_relations_pair
    ON customer_relations(customer_id, related_customer_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_relations_by_customer
    ON customer_relations(customer_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      ga_id INTEGER REFERENCES ga_companies(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_seoul
    ON analytics_events (CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date), event_type)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analytics_events_ga_created
    ON analytics_events (ga_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analytics_events_login_dau
    ON analytics_events (event_type, ga_id, CAST((created_at AT TIME ZONE 'Asia/Seoul') AS date))
    WHERE event_type = 'login'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_daily_stats (
      id BIGSERIAL PRIMARY KEY,
      stat_date DATE NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('overall', 'ga')),
      ga_id INTEGER REFERENCES ga_companies(id) ON DELETE CASCADE,
      total_users INT NOT NULL DEFAULT 0,
      daily_active_users INT NOT NULL DEFAULT 0,
      weekly_active_users INT NOT NULL DEFAULT 0,
      new_users INT NOT NULL DEFAULT 0,
      customers_created INT NOT NULL DEFAULT 0,
      documents_created INT NOT NULL DEFAULT 0,
      team_messages_created INT NOT NULL DEFAULT 0
    )
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_daily_overall
    ON analytics_daily_stats(stat_date)
    WHERE scope_type = 'overall'
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_daily_ga
    ON analytics_daily_stats(stat_date, ga_id)
    WHERE scope_type = 'ga'
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_stat_date
    ON analytics_daily_stats(stat_date)
  `)

  await ensureCustomerClaimAppSchema(pool)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_claim_requests (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      ga_id INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_claim_files (
      id SERIAL PRIMARY KEY,
      claim_request_id INTEGER REFERENCES customer_claim_requests(id) ON DELETE CASCADE,
      file_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memo (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      ga_id INTEGER REFERENCES ga_companies(id),
      content TEXT DEFAULT '',
      x INTEGER DEFAULT 100,
      y INTEGER DEFAULT 100,
      width INTEGER DEFAULT 200,
      height INTEGER DEFAULT 160,
      z_index BIGINT DEFAULT 0,
      font_size INTEGER DEFAULT 16,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE memo
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await pool.query(`
    ALTER TABLE memo
    ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 200
  `)
  await pool.query(`
    ALTER TABLE memo
    ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 160
  `)
  await pool.query(`
    ALTER TABLE memo
    ADD COLUMN IF NOT EXISTS z_index BIGINT DEFAULT 0
  `)
  await pool.query(`
    ALTER TABLE memo
    ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 16
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_memo_user_id ON memo (user_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_memo_ga_id ON memo (ga_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id),
      owner_type VARCHAR(32) NOT NULL,
      owner_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      assigned_to TEXT,
      item_type VARCHAR(16) NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      due_date DATE,
      all_day BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      color VARCHAR(32),
      location TEXT,
      visibility VARCHAR(16) NOT NULL DEFAULT 'private',
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT calendar_items_owner_type_check CHECK (
        owner_type IN ('user', 'team', 'customer', 'crm', 'workspace')
      ),
      CONSTRAINT calendar_items_item_type_check CHECK (item_type IN ('schedule', 'todo')),
      CONSTRAINT calendar_items_status_check CHECK (status IN ('pending', 'completed', 'cancelled')),
      CONSTRAINT calendar_items_priority_check CHECK (priority IN ('low', 'normal', 'high')),
      CONSTRAINT calendar_items_visibility_check CHECK (visibility IN ('private', 'shared'))
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_items_owner
    ON calendar_items (ga_id, owner_type, owner_id)
    WHERE deleted_at IS NULL
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_items_start
    ON calendar_items (ga_id, start_at)
    WHERE deleted_at IS NULL AND item_type = 'schedule'
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_items_due
    ON calendar_items (ga_id, due_date)
    WHERE deleted_at IS NULL AND item_type = 'todo'
  `)

  await ensureSubscriptionSchema(pool)
  await ensureSignatureSchema(pool)
  await ensurePdfTemplateSchema(pool)
  const { ensureLiquorSignatureSchema } = await import('./lib/liquorSignatures/schema.js')
  await ensureLiquorSignatureSchema(pool)
  const { ensureLiquorCustomerSchema } = await import('./lib/liquorCustomers/schema.js')
  await ensureLiquorCustomerSchema(pool)
  const { ensureGovSignatureSchema } = await import('./lib/governmentSignatures/schema.js')
  await ensureGovSignatureSchema(pool)
  await ensureContractSelfSmsSchema(pool)
  await ensureInsurerSitesSchema(pool)
  await ensurePublicCustomerInviteSessionsSchema(pool)

  console.log(`[initDb] 완료 (${Date.now() - startedAt}ms)`)
}

/** GA 초대 고객 등록(/customer/register) — 제출 세션(httpOnly cookie) 및 최초 제출 시각(3시간 수정 창구) */
async function ensurePublicCustomerInviteSessionsSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS public_customer_invite_sessions (
      id BIGSERIAL PRIMARY KEY,
      secret_token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ref_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      first_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_public_customer_invite_sessions_customer
    ON public_customer_invite_sessions(customer_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_public_customer_invite_sessions_ref_ga
    ON public_customer_invite_sessions(ref_user_id, ga_id)
  `)
}

/**
 * 구독 상태 기반 접근 제어 (docs/refactor-plans/subscription-access-control.md §3)
 *
 * - users: plan / started_at / expires_at 3개 컬럼만 추가. "의도 상태"만 저장하고 "유효 상태"는 런타임 계산.
 * - subscription_change_logs: 관리자 변경 이력 감사.
 * - app_settings: 정책 활성화 스위치(`subscription.policy_active`, 기본 false) + TRIAL 기본 일수.
 *
 * policy_active=false 인 동안 `evaluateSubscription` 이 전원 ACTIVE 로 단락하므로, 이 마이그레이션만
 * 단독 배포해도 유저 영향이 없다. 과금 정책 활성화는 추후 관리자 UI 에서 플래그 토글로 수행한다.
 */
async function ensureSubscriptionSchema(executor) {
  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'FREE'
  `)
  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ
  `)
  await executor.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ
  `)
  await executor.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_plan_check
  `)
  await executor.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_subscription_plan_check
    CHECK (subscription_plan IN ('FREE', 'TRIAL', 'PAID', 'EXPIRED'))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS users_subscription_plan_idx
    ON users (subscription_plan)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS users_subscription_expires_at_idx
    ON users (subscription_expires_at)
    WHERE subscription_expires_at IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS subscription_change_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      prev_plan TEXT,
      next_plan TEXT,
      prev_expires_at TIMESTAMPTZ,
      next_expires_at TIMESTAMPTZ,
      reason TEXT NOT NULL,
      memo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS sub_change_logs_user_id_idx
    ON subscription_change_logs (user_id, created_at DESC)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    )
  `)
  await executor.query(`
    INSERT INTO app_settings (key, value_json)
    VALUES
      ('subscription.policy_active',       CAST('false' AS jsonb)),
      ('subscription.trial_default_days',  CAST('30'    AS jsonb))
    ON CONFLICT (key) DO NOTHING
  `)
}

/**
 * 공용 서명 SSOT 스키마.
 *
 * - 파일 원본은 R2에 저장하고, 이 테이블은 "현재 유효한 서명 id"의 단일 기준점으로 사용한다.
 * - 한 컨텍스트(ga/signer/customer/related)에서 active 는 1개만 허용한다.
 * - related_type/related_id 는 현 단계에서 nullable(임시 저장 허용).
 */
async function ensureSignatureSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS signature (
      id TEXT PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      signer_type TEXT NOT NULL,
      signer_id TEXT NOT NULL,
      related_type TEXT,
      related_id TEXT,
      file_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `)
  await executor.query(`
    ALTER TABLE signature DROP CONSTRAINT IF EXISTS signature_status_check
  `)
  await executor.query(`
    ALTER TABLE signature
    ADD CONSTRAINT signature_status_check
    CHECK (status IN ('active', 'replaced', 'deleted'))
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_signature_ga_created
    ON signature (ga_id, created_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_signature_context
    ON signature (ga_id, signer_type, signer_id, customer_id)
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_active_context
    ON signature (
      ga_id,
      signer_type,
      signer_id,
      COALESCE(customer_id, 0),
      COALESCE(related_type, ''),
      COALESCE(related_id, '')
    )
    WHERE status = 'active'
  `)
}

/**
 * 좌표 기반 PDF 자동화 엔진 스키마.
 *
 * - `pdf_templates` : 원본 PDF(R2 객체키) + 메타.
 *     GA 범위(`ga_id NULL` = 전체 공용) / 문서 코드 / 활성 여부.
 *     UNIQUE(ga_id, code) 로 한 GA 안에서 같은 code 재등록을 막는다.
 *
 * - `pdf_template_fields` : 필드 정의 + 좌표 placements.
 *     `field_type` 은 Phase 1 에서 text/number/date/textarea 로 CHECK 제약.
 *     `placements` 는 JSONB 배열로 설계 → Phase 2 에서 radio/checkbox 옵션별 좌표를
 *     늘리더라도 스키마 그대로 쓸 수 있다.
 *     placement 요소: { page, x, y, width?, height?, fontSize?, align? }
 *     좌표 단위: PDF user space (원점 좌하단, pt).
 *
 * 확장 포인트:
 *   - Phase 2: `field_type` CHECK 확장(radio/checkbox/select) + placements 의 각 요소에
 *     `optionValue` 를 추가. 필드 1건 = 옵션 N개 → placements 요소 N개.
 *   - Phase 3: `pdf_render_jobs` 를 새 테이블로 분리해 발급 이력/R2 저장을 관리.
 *
 * 정책:
 *   - 이 마이그레이션만 단독 배포해도 기존 기능에 영향이 없다.
 *   - UI·API 가 아직 없으므로 테이블은 존재만 하고 트래픽은 0.
 */
async function ensurePdfTemplateSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS pdf_templates (
      id SERIAL PRIMARY KEY,
      ga_id INTEGER REFERENCES ga_companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      storage_key TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pdf_templates_ga_code_uk
    ON pdf_templates (COALESCE(ga_id, 0), code)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS pdf_templates_ga_active_idx
    ON pdf_templates (ga_id, is_active)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS pdf_template_fields (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT false,
      order_index INTEGER NOT NULL DEFAULT 0,
      customer_mapping TEXT,
      placements JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  /*
   * Phase 2: radio/checkbox 추가. CHECK 제약은 idempotent 하게 교체한다.
   * 현재 타입 정책은 text/textarea/checkbox/radio 이며,
   * 테스트/개발 데이터의 legacy 타입(number/date)은 text로 정규화한다.
   */
  await executor.query(`
    ALTER TABLE pdf_template_fields DROP CONSTRAINT IF EXISTS pdf_template_fields_type_check
  `)
  /* legacy 타입을 text로 통합한다. */
  await executor.query(`
    UPDATE pdf_template_fields
    SET field_type = 'text'
    WHERE field_type IN ('number', 'date')
  `)
  await executor.query(`
    ALTER TABLE pdf_template_fields
    ADD CONSTRAINT pdf_template_fields_type_check
    CHECK (field_type IN ('text', 'textarea', 'checkbox', 'radio', 'signature'))
  `)
  /*
   * radio 타입 필드는 선택지 목록(options)을 JSONB 로 저장한다.
   * 다른 타입에서는 NULL. IF NOT EXISTS 로 재실행에 안전.
   */
  await executor.query(`
    ALTER TABLE pdf_template_fields
    ADD COLUMN IF NOT EXISTS options JSONB
  `)
  await executor.query(`
    ALTER TABLE pdf_template_fields
    ADD COLUMN IF NOT EXISTS input_role TEXT NOT NULL DEFAULT 'customer'
  `)
  await executor.query(`
    UPDATE pdf_template_fields SET customer_mapping = NULL
  `)
  await executor.query(`
    UPDATE pdf_template_fields SET input_role = 'customer' WHERE field_type::text = 'signature'
  `)
  await executor.query(`
    ALTER TABLE pdf_template_fields DROP CONSTRAINT IF EXISTS pdf_template_fields_input_role_check
  `)
  await executor.query(`
    ALTER TABLE pdf_template_fields
    ADD CONSTRAINT pdf_template_fields_input_role_check
    CHECK (
      input_role IN ('customer', 'sender', 'disabled')
      AND (
        field_type::text <> 'signature' OR input_role = 'customer'
      )
    )
  `)

  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pdf_template_fields_tpl_key_uk
    ON pdf_template_fields (template_id, field_key)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS pdf_template_fields_tpl_order_idx
    ON pdf_template_fields (template_id, order_index)
  `)

  /*
   * 발급 이력(pdf_issuances) — Phase 2 마무리.
   *
   * 설계 의도:
   *   - "이미 발급된 PDF 를 다시 볼 수 있어야" 한다는 컴플라이언스 요구를 충족.
   *     재생성(재스탬프) 으로도 같은 결과가 나오긴 하지만, 폰트·엔진 업데이트 이후
   *     바이트 불일치가 생길 수 있어 "그 시점 그대로" 보존하는 편이 안전하다.
   *   - 템플릿/사용자가 삭제돼도 이력은 남아야 하므로 FK 는 ON DELETE SET NULL.
   *     삭제된 대상을 식별하려고 template_code/template_title 스냅샷도 저장.
   *   - values_snapshot 은 "찍힌 값" 을 그대로 보존 — 감사(audit) 용. 민감 정보 암호화는
   *     후속 요구가 생기면 이 컬럼 교체로 이주(JSONB → bytea).
   *
   * 인덱스:
   *   - 사용자 내역 화면: (user_id, created_at DESC)
   *   - 템플릿별 관리자 조회: (template_id, created_at DESC)
   */
  await executor.query(`
    CREATE TABLE IF NOT EXISTS pdf_issuances (
      id BIGSERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES pdf_templates(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ga_id INTEGER REFERENCES ga_companies(id) ON DELETE SET NULL,
      template_code TEXT NOT NULL,
      template_title TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      values_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      byte_length INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS pdf_issuances_user_created_idx
    ON pdf_issuances (user_id, created_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS pdf_issuances_template_created_idx
    ON pdf_issuances (template_id, created_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS pdf_issuances_ga_created_idx
    ON pdf_issuances (ga_id, created_at DESC)
  `)
}

/**
 * 지정 휴대폰 인증(self_sms) + 계약서 발송 세션 + 문서 인스턴스 + 증빙.
 * - 고객 식별자는 기존 customers.id INTEGER 에 맞춘다 (지시문 TEXT 는 프로젝트 정합성 위해 INTEGER FK).
 * - PDF 좌표 원본은 pdf_templates/pdf_template_fields 를 재사용; contract_templates 에 pdf_template_id 로 연결.
 * - send_session ↔ identity_session 간 순환 참조는 애플리케이션 정합성으로 처리(TEXT, FK 없음).
 */
async function ensureContractSelfSmsSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS identity_verification_sessions (
      id TEXT PRIMARY KEY,
      send_session_id TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'self_sms',
      level TEXT NOT NULL DEFAULT 'phone_possession',
      purpose TEXT NOT NULL DEFAULT 'contract_signature',
      status TEXT NOT NULL DEFAULT 'pending',
      target_phone_encrypted TEXT,
      target_phone_hash TEXT,
      target_phone_masked TEXT,
      otp_hash TEXT,
      otp_sent_at TIMESTAMPTZ,
      otp_expires_at TIMESTAMPTZ,
      otp_verified_at TIMESTAMPTZ,
      otp_attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_identity_sessions_send_session_id
    ON identity_verification_sessions(send_session_id)
  `)
  await executor.query(`
    ALTER TABLE identity_verification_sessions
    ADD COLUMN IF NOT EXISTS otp_send_count INTEGER NOT NULL DEFAULT 0
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      pdf_file_id TEXT,
      pdf_file_path TEXT,
      pdf_hash TEXT,
      page_count INTEGER,
      pdf_template_id INTEGER REFERENCES pdf_templates(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE contract_templates
    ADD COLUMN IF NOT EXISTS pdf_template_id INTEGER REFERENCES pdf_templates(id) ON DELETE SET NULL
  `)
  await executor.query(`
    ALTER TABLE contract_templates
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_templates_ga_status
    ON contract_templates(ga_id, status)
  `)

  /* 계약 템플릿 모드: 좌표형 PDF vs 무좌표 확인만(확장 예정). 기본은 기존 동작 유지. */
  await executor.query(`
    ALTER TABLE contract_templates
    ADD COLUMN IF NOT EXISTS template_mode TEXT NOT NULL DEFAULT 'coordinate_pdf'
  `)
  await executor.query(`
    UPDATE contract_templates
    SET template_mode = 'coordinate_pdf'
    WHERE template_mode IS NULL
       OR template_mode NOT IN ('coordinate_pdf', 'confirmation_only')
  `)
  await executor.query(`
    ALTER TABLE contract_templates DROP CONSTRAINT IF EXISTS contract_templates_template_mode_check
  `)
  await executor.query(`
    ALTER TABLE contract_templates
    ADD CONSTRAINT contract_templates_template_mode_check
    CHECK (template_mode IN ('coordinate_pdf', 'confirmation_only'))
  `)

  /* confirmation_only 용 관리자 정의 동적 필드(좌표/PDF 필드 설정 테이블과 분리). */
  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_template_confirmation_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      input_type TEXT NOT NULL,
      input_role TEXT NOT NULL DEFAULT 'sender',
      required BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      placeholder TEXT,
      help_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT contract_template_confirmation_fields_input_type_check
        CHECK (input_type IN ('text', 'textarea', 'number', 'date')),
      CONSTRAINT contract_template_confirmation_fields_input_role_check
        CHECK (input_role IN ('sender', 'customer')),
      CONSTRAINT contract_template_confirmation_fields_template_key_uniq
        UNIQUE (template_id, field_key)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_template_confirmation_fields_template_id
    ON contract_template_confirmation_fields(template_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_template_confirmation_fields_sort
    ON contract_template_confirmation_fields(template_id, sort_order)
  `)
  await executor.query(`
    ALTER TABLE contract_template_confirmation_fields
    ADD COLUMN IF NOT EXISTS input_role TEXT
  `)
  await executor.query(`
    UPDATE contract_template_confirmation_fields
    SET input_role = 'sender'
    WHERE input_role IS NULL
       OR input_role NOT IN ('sender', 'customer')
  `)
  await executor.query(`
    ALTER TABLE contract_template_confirmation_fields
    ALTER COLUMN input_role SET DEFAULT 'sender'
  `)
  await executor.query(`
    ALTER TABLE contract_template_confirmation_fields
    ALTER COLUMN input_role SET NOT NULL
  `)
  await executor.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'contract_template_confirmation_fields_input_role_check'
      ) THEN
        ALTER TABLE contract_template_confirmation_fields
        ADD CONSTRAINT contract_template_confirmation_fields_input_role_check
          CHECK (input_role IN ('sender', 'customer'));
      END IF;
    END $$;
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_template_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL,
      page_no INTEGER NOT NULL,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      width DOUBLE PRECISION,
      height DOUBLE PRECISION,
      font_size INTEGER,
      required INTEGER NOT NULL DEFAULT 0,
      default_value TEXT,
      data_binding_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contract_template_fields_template_id_fkey'
      ) THEN
        ALTER TABLE contract_template_fields
        ADD CONSTRAINT contract_template_fields_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_template_fields_template_id
    ON contract_template_fields(template_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_template_field_settings (
      template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      input_role TEXT NOT NULL,
      fixed_value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (template_id, field_key),
      CONSTRAINT contract_template_field_settings_role_check
        CHECK (input_role IN ('customer', 'sender', 'fixed'))
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_template_field_settings_template_id
    ON contract_template_field_settings(template_id)
  `)
  /* 기존 계약 템플릿에 대해 PDF 필드 기준으로 설정 행 백필(이미 있으면 유지). */
  await executor.query(`
    INSERT INTO contract_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
    SELECT ct.id, pf.field_key,
      CASE
        WHEN pf.field_type::text = 'signature' THEN 'customer'
        WHEN pf.input_role = 'disabled' THEN 'fixed'
        WHEN pf.input_role = 'sender' THEN 'sender'
        ELSE 'customer'
      END,
      CASE WHEN pf.input_role = 'disabled' THEN '' ELSE NULL END,
      NOW(), NOW()
    FROM contract_templates ct
    INNER JOIN pdf_template_fields pf ON pf.template_id = ct.pdf_template_id
    ON CONFLICT (template_id, field_key) DO NOTHING
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_packages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      ga_id INTEGER REFERENCES ga_companies(id),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE contract_packages
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_packages_ga_status
    ON contract_packages(ga_id, status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_package_items (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES contract_packages(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_package_items_package_id
    ON contract_package_items(package_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_send_sessions (
      id TEXT PRIMARY KEY,
      package_id TEXT REFERENCES contract_packages(id) ON DELETE SET NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      link_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      identity_session_id TEXT,
      target_phone_encrypted TEXT,
      target_phone_hash TEXT,
      target_phone_masked TEXT,
      sent_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_send_sessions_link_code
    ON contract_send_sessions(link_code)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_send_sessions_customer_id
    ON contract_send_sessions(customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_document_instances (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE RESTRICT,
      template_version INTEGER,
      title_snapshot TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      original_pdf_hash TEXT,
      filled_pdf_file_id TEXT,
      filled_pdf_hash TEXT,
      signed_pdf_file_id TEXT,
      signed_pdf_hash TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_document_instances_send_session_id
    ON contract_document_instances(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_document_values (
      id TEXT PRIMARY KEY,
      document_instance_id TEXT NOT NULL REFERENCES contract_document_instances(id) ON DELETE CASCADE,
      field_id TEXT,
      field_key TEXT NOT NULL,
      field_type TEXT NOT NULL,
      value_text TEXT,
      value_file_id TEXT,
      value_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_document_values_document_instance_id
    ON contract_document_values(document_instance_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_confirmation_items (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_confirmation_items_send_session_id
    ON contract_confirmation_items(send_session_id)
  `)
  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_confirmation_item_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      confirmation_item_id TEXT NOT NULL REFERENCES contract_confirmation_items(id) ON DELETE CASCADE,
      checked BOOLEAN NOT NULL DEFAULT false,
      checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, confirmation_item_id)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_confirmation_item_values_send_session_id
    ON contract_confirmation_item_values(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_send_session_attachments (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      file_id BIGINT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
      display_filename TEXT NOT NULL,
      mime_type TEXT,
      size_bytes BIGINT,
      content_hash TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      viewed BOOLEAN NOT NULL DEFAULT false,
      viewed_at TIMESTAMPTZ,
      confirmed BOOLEAN NOT NULL DEFAULT false,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_send_session_attachments_session
    ON contract_send_session_attachments(send_session_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_send_session_attachments_file
    ON contract_send_session_attachments(file_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS contract_send_session_confirmation_field_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, template_id, field_key)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_csscfv_send_session
    ON contract_send_session_confirmation_field_values(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS signature_evidences (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES contract_send_sessions(id) ON DELETE CASCADE,
      document_instance_id TEXT REFERENCES contract_document_instances(id) ON DELETE SET NULL,
      identity_session_id TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'self_sms',
      level TEXT NOT NULL DEFAULT 'phone_possession',
      target_phone_hash TEXT,
      document_hash TEXT,
      signature_image_hash TEXT,
      signed_pdf_hash TEXT,
      evidence_hash TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_signature_evidences_send_session_id
    ON signature_evidences(send_session_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_signature_evidences_document_instance_id
    ON signature_evidences(document_instance_id)
  `)
  await executor.query(`
    ALTER TABLE signature_evidences
    ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ
  `)
  await executor.query(`
    ALTER TABLE signature_evidences
    ADD COLUMN IF NOT EXISTS values_hash TEXT
  `)
  await executor.query(`
    ALTER TABLE signature_evidences
    ADD COLUMN IF NOT EXISTS document_reference_hash TEXT
  `)
  await executor.query(`
    ALTER TABLE signature_evidences
    ADD COLUMN IF NOT EXISTS signature_file_id TEXT
  `)
  await executor.query(`
    ALTER TABLE signature_evidences
    ADD COLUMN IF NOT EXISTS signed_pdf_file_id TEXT
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_evidences_document_instance_id
    ON signature_evidences(document_instance_id)
    WHERE document_instance_id IS NOT NULL
  `)
}

/**
 * 전역 공통 보험사 설계사이트 마스터 (GA/회사/팀/유저 FK 없음).
 * 최초 빈 테이블일 때만 시드 삽입; 매 부팅 시 업로드 경로를 제외하고 빈·외부 URL·구번들 로고만 보정합니다.
 */
async function ensureInsurerSitesSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS insurer_sites (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('non_life', 'life')),
      name TEXT NOT NULL,
      logo_path TEXT NOT NULL DEFAULT '',
      sales_url TEXT NOT NULL DEFAULT '',
      homepage_url TEXT NOT NULL DEFAULT '',
      disclosure_url TEXT NOT NULL DEFAULT '',
      claim_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS insurer_sites_active_cat_sort_idx
    ON insurer_sites (is_active, category, sort_order)
  `)

  const countRes = await executor.query(`SELECT COUNT(*)::int AS c FROM insurer_sites`)
  if (countRes.rows[0].c === 0) {
    for (const row of INSURER_SITES_SEED) {
      const logoPath = insurerSiteBundledLogoPath(row.logoFile)
      await executor.query(
        `
        INSERT INTO insurer_sites (
          category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url, sort_order, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        `,
        [
          row.category,
          row.name,
          logoPath,
          row.salesUrl,
          row.homepageUrl,
          row.disclosureUrl ?? '',
          row.claimUrl,
          row.sortOrder,
        ],
      )
    }
    console.log('[initDb] insurer_sites 시드 완료:', INSURER_SITES_SEED.length)
  }

  await backfillInsurerSiteBundledLogos(executor)
}

/**
 * 빈 값·외부 URL·구번들 /assets/insurers 만 보정. `/uploads/system/insurers/` 는 유지.
 */
async function backfillInsurerSiteBundledLogos(executor) {
  let touched = 0
  for (const row of INSURER_SITES_SEED) {
    const expected = insurerSiteBundledLogoPath(row.logoFile)
    const r = await executor.query(
      `
      UPDATE insurer_sites
      SET logo_path = $1, updated_at = NOW()
      WHERE name = $2
        AND NOT (logo_path LIKE '/uploads/system/insurers/%')
        AND (
          TRIM(COALESCE(logo_path, '')) = ''
          OR logo_path LIKE 'http://%'
          OR logo_path LIKE 'https://%'
          OR logo_path LIKE '//%'
          OR (
            logo_path LIKE '/assets/insurers/%'
            AND logo_path IS DISTINCT FROM $1
          )
        )
      `,
      [expected, row.name],
    )
    touched += r.rowCount ?? 0
  }
  if (touched > 0) {
    console.log('[initDb] insurer_sites 기본 로고 경로 보정 행 수:', touched)
  }
}

async function seedConsentTemplatesIfNeeded() {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const { consentPutObject } = await import('./lib/consentStorage.js')
    const { DEFAULT_CONSENT_FIELD_LAYOUT, SEEDED_CONSENT_TEMPLATES } = await import(
      './consentSeedData.js'
    )

    const doc = await PDFDocument.create()
    doc.addPage([595.28, 841.89])
    const blank = Buffer.from(await doc.save())

    const gaRow = await pool.query(`SELECT id FROM ga_companies WHERE code = 'YJASSET' LIMIT 1`)
    const seedGaId = gaRow.rows[0]?.id
    if (seedGaId == null) {
      throw new Error('[initDb] consent 시드: YJASSET GA 없음')
    }

    for (const row of SEEDED_CONSENT_TEMPLATES) {
      const exists = await pool.query(
        `SELECT 1 FROM consent_templates WHERE ga_id = $1 AND insurance_company_id = $2 LIMIT 1`,
        [seedGaId, row.insuranceCompanyId],
      )
      if (exists.rows.length > 0) {
        continue
      }
      const key = `consent-templates/${row.id}.pdf`
      await consentPutObject(key, blank, 'application/pdf')
      await pool.query(
        `
        INSERT INTO consent_templates (id, ga_id, insurance_company_id, fax_number, fields, pdf_storage_key)
        VALUES ($1, $2, $3, $4, CAST($5 AS jsonb), $6)
        ON CONFLICT (ga_id, insurance_company_id)
        DO UPDATE SET updated_at = NOW()
        `,
        [row.id, seedGaId, row.insuranceCompanyId, '', JSON.stringify(DEFAULT_CONSENT_FIELD_LAYOUT), key],
      )
    }
    console.log('[initDb] consent_templates 시드 검사 완료')
  } catch (e) {
    console.error('[initDb] consent_templates 시드 실패:', e)
  }
}
