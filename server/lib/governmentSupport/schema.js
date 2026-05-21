/**
 * government-support 전용 테이블 (idempotent DDL).
 */
import { ensureTenantsLegacyGaIdConstraints } from '../tenantsLegacyGaIdConstraints.js'

export async function ensureGovernmentSupportSchema(executor) {
  await ensureTenantsLegacyGaIdConstraints(executor)
  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_profiles (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      carrier TEXT NOT NULL DEFAULT '',
      ssn TEXT NOT NULL DEFAULT '',
      home_address TEXT NOT NULL DEFAULT '',
      home_type TEXT NOT NULL DEFAULT '',
      deposit TEXT NOT NULL DEFAULT '',
      monthly_rent TEXT NOT NULL DEFAULT '',
      credit_score_1 TEXT NOT NULL DEFAULT '',
      credit_score_2 TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      business_opened_at TEXT NOT NULL DEFAULT '',
      business_number TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      business_category TEXT NOT NULL DEFAULT '',
      business_type TEXT NOT NULL DEFAULT '',
      business_form TEXT NOT NULL DEFAULT '',
      business_phone TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      available_product TEXT NOT NULL DEFAULT '',
      progress_status TEXT NOT NULL DEFAULT '상담 접수',
      schedule_at TEXT NOT NULL DEFAULT '',
      agency_org TEXT NOT NULL DEFAULT '',
      assignee_user_id TEXT,
      region TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      special_note TEXT NOT NULL DEFAULT '',
      vat_report TEXT NOT NULL DEFAULT '',
      annual_income TEXT NOT NULL DEFAULT '',
      income_cert TEXT NOT NULL DEFAULT '',
      tax_arrears TEXT NOT NULL DEFAULT '',
      required_funds TEXT NOT NULL DEFAULT '',
      fee TEXT NOT NULL DEFAULT '',
      cert_delegate TEXT NOT NULL DEFAULT '',
      cert_type TEXT NOT NULL DEFAULT '',
      delegate_status TEXT NOT NULL DEFAULT '',
      delegation_memo TEXT NOT NULL DEFAULT '',
      edoc_status TEXT NOT NULL DEFAULT '',
      doc_status TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE gov_support_profiles
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profiles_tenant
    ON gov_support_profiles (tenant_id, updated_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profiles_owner
    ON gov_support_profiles (owner_user_id)
    WHERE owner_user_id IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_prior_loans (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      has_prior TEXT NOT NULL DEFAULT '',
      lender_name TEXT NOT NULL DEFAULT '',
      remaining_amount TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL DEFAULT '',
      policy_included TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_application_cases (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL DEFAULT '',
      available_product TEXT NOT NULL DEFAULT '',
      progress_status TEXT NOT NULL DEFAULT '상담 접수',
      schedule_at TEXT NOT NULL DEFAULT '',
      agency_org TEXT NOT NULL DEFAULT '',
      assignee_user_id TEXT,
      required_funds TEXT NOT NULL DEFAULT '',
      fee TEXT NOT NULL DEFAULT '',
      cert_delegate TEXT NOT NULL DEFAULT '',
      special_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_document_items (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      application_case_id BIGINT REFERENCES gov_support_application_cases(id) ON DELETE SET NULL,
      doc_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '요청 전',
      storage_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_edoc_links (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      application_case_id BIGINT REFERENCES gov_support_application_cases(id) ON DELETE SET NULL,
      document_name TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ,
      recipient TEXT NOT NULL DEFAULT '',
      sign_status TEXT NOT NULL DEFAULT '대기',
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_notices (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL DEFAULT 'agency',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'draft',
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_notices_list
    ON gov_support_notices (status, is_pinned DESC, published_at DESC NULLS LAST, updated_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_notices_tenant
    ON gov_support_notices (tenant_id, status, updated_at DESC)
    WHERE tenant_id IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_resources (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL DEFAULT 'agency',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'draft',
      file_name TEXT NOT NULL DEFAULT '',
      file_key TEXT NOT NULL DEFAULT '',
      file_size BIGINT NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_resources_list
    ON gov_support_resources (status, published_at DESC NULLS LAST, updated_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_resources_tenant
    ON gov_support_resources (tenant_id, status, updated_at DESC)
    WHERE tenant_id IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_profile_memos (
      id BIGSERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_memos_profile
    ON gov_support_profile_memos (profile_id, created_at DESC)
    WHERE archived_at IS NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_memos_owner
    ON gov_support_profile_memos (owner_user_id, profile_id)
    WHERE archived_at IS NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_profile_consultations (
      id BIGSERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consultation_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      consulted_at DATE,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_consultations_profile
    ON gov_support_profile_consultations (profile_id, consulted_at DESC NULLS LAST, created_at DESC)
    WHERE archived_at IS NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_consultations_owner
    ON gov_support_profile_consultations (owner_user_id, profile_id)
    WHERE archived_at IS NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_profile_progress_events (
      id BIGSERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      event_date DATE,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_progress_profile
    ON gov_support_profile_progress_events (profile_id, event_date DESC NULLS LAST, created_at DESC)
    WHERE archived_at IS NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_progress_owner
    ON gov_support_profile_progress_events (owner_user_id, profile_id)
    WHERE archived_at IS NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_support_profile_files (
      id BIGSERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL DEFAULT '',
      file_key TEXT NOT NULL DEFAULT '',
      file_size BIGINT NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      upload_status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_files_profile
    ON gov_support_profile_files (profile_id, created_at DESC)
    WHERE archived_at IS NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_support_profile_files_owner
    ON gov_support_profile_files (owner_user_id, profile_id)
    WHERE archived_at IS NULL
  `)
}
