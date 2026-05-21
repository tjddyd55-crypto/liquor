/**
 * 정부지원 CRM 전자서명 전용 DB 스키마 (보험 contract_* 와 완전 분리).
 * @module governmentSignatures/schema
 */

/**
 * @param {import('pg').Pool | { query: Function }} executor
 */
export async function ensureGovSignatureSchema(executor) {
  await executor.query(`
    ALTER TABLE pdf_templates
    ADD COLUMN IF NOT EXISTS gov_owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_pdf_templates_gov_owner
    ON pdf_templates (gov_owner_user_id, is_active)
    WHERE gov_owner_user_id IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_identity_sessions (
      id TEXT PRIMARY KEY,
      send_session_id TEXT,
      profile_id BIGINT REFERENCES gov_support_profiles(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'self_sms',
      level TEXT NOT NULL DEFAULT 'phone_possession',
      purpose TEXT NOT NULL DEFAULT 'gov_signature',
      status TEXT NOT NULL DEFAULT 'pending',
      target_phone_encrypted TEXT,
      target_phone_hash TEXT,
      target_phone_masked TEXT,
      otp_hash TEXT,
      otp_sent_at TIMESTAMPTZ,
      otp_expires_at TIMESTAMPTZ,
      otp_verified_at TIMESTAMPTZ,
      otp_attempt_count INTEGER NOT NULL DEFAULT 0,
      otp_send_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_sig_identity_send_session
    ON gov_signature_identity_sessions(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_templates (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
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
      template_mode TEXT NOT NULL DEFAULT 'coordinate_pdf',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT gov_signature_templates_template_mode_check
        CHECK (template_mode IN ('coordinate_pdf', 'confirmation_only'))
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_signature_templates_owner_status
    ON gov_signature_templates(owner_user_id, status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_template_confirmation_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE CASCADE,
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
      CONSTRAINT gov_sig_tpl_conf_fields_input_type_check
        CHECK (input_type IN ('text', 'textarea', 'number', 'date')),
      CONSTRAINT gov_sig_tpl_conf_fields_input_role_check
        CHECK (input_role IN ('sender', 'customer')),
      UNIQUE (template_id, field_key)
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_template_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS gov_signature_template_field_settings (
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      input_role TEXT NOT NULL,
      fixed_value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (template_id, field_key),
      CONSTRAINT gov_sig_tpl_field_settings_role_check
        CHECK (input_role IN ('customer', 'sender', 'fixed'))
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_packages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_package_items (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES gov_signature_packages(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_send_sessions (
      id TEXT PRIMARY KEY,
      package_id TEXT REFERENCES gov_signature_packages(id) ON DELETE SET NULL,
      profile_id BIGINT NOT NULL REFERENCES gov_support_profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
      sign_token TEXT NOT NULL UNIQUE,
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
    CREATE INDEX IF NOT EXISTS idx_gov_sig_send_sessions_token ON gov_signature_send_sessions(sign_token)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_sig_send_sessions_owner ON gov_signature_send_sessions(owner_user_id, created_at DESC)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_sig_send_sessions_profile ON gov_signature_send_sessions(profile_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_document_instances (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE RESTRICT,
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
    CREATE TABLE IF NOT EXISTS gov_signature_document_values (
      id TEXT PRIMARY KEY,
      document_instance_id TEXT NOT NULL REFERENCES gov_signature_document_instances(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS gov_signature_confirmation_items (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_confirmation_item_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      confirmation_item_id TEXT NOT NULL REFERENCES gov_signature_confirmation_items(id) ON DELETE CASCADE,
      checked BOOLEAN NOT NULL DEFAULT false,
      checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, confirmation_item_id)
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_attachments (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS gov_signature_send_session_confirmation_field_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES gov_signature_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, template_id, field_key)
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_evidences (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      document_instance_id TEXT REFERENCES gov_signature_document_instances(id) ON DELETE SET NULL,
      identity_session_id TEXT,
      profile_id BIGINT REFERENCES gov_support_profiles(id) ON DELETE SET NULL,
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
      otp_verified_at TIMESTAMPTZ,
      values_hash TEXT,
      document_reference_hash TEXT,
      signature_file_id TEXT,
      signed_pdf_file_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_sig_evidences_document_instance
    ON gov_signature_evidences(document_instance_id)
    WHERE document_instance_id IS NOT NULL
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS gov_signature_events (
      id BIGSERIAL PRIMARY KEY,
      send_session_id TEXT REFERENCES gov_signature_send_sessions(id) ON DELETE CASCADE,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_gov_signature_events_session
    ON gov_signature_events(send_session_id, created_at DESC)
  `)

  await executor.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `)
  await executor.query(`
    ALTER TABLE files
    ADD COLUMN IF NOT EXISTS profile_id BIGINT REFERENCES gov_support_profiles(id) ON DELETE SET NULL
  `)
}
