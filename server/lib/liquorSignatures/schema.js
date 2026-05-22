/**
 * 주류회사 CRM 전자서명 전용 DB 스키마 (보험 contract_* / 정부 gov_signature_* 와 분리).
 * @module liquorSignatures/schema
 */

/**
 * @param {import('pg').Pool | { query: Function }} executor
 */
export async function ensureLiquorSignatureSchema(executor) {

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_pdf_templates (
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
    CREATE UNIQUE INDEX IF NOT EXISTS liquor_pdf_templates_ga_code_uk
    ON liquor_pdf_templates (COALESCE(ga_id, 0), code)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_pdf_templates_ga_active_idx
    ON liquor_pdf_templates (ga_id, is_active)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_pdf_template_fields (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES liquor_pdf_templates(id) ON DELETE CASCADE,
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
    ALTER TABLE liquor_pdf_template_fields DROP CONSTRAINT IF EXISTS liquor_pdf_template_fields_type_check
  `)
  /* legacy 타입을 text로 통합한다. */
  await executor.query(`
    UPDATE liquor_pdf_template_fields
    SET field_type = 'text'
    WHERE field_type IN ('number', 'date')
  `)
  await executor.query(`
    ALTER TABLE liquor_pdf_template_fields
    ADD CONSTRAINT liquor_pdf_template_fields_type_check
    CHECK (field_type IN ('text', 'textarea', 'checkbox', 'radio', 'signature'))
  `)
  /*
   * radio 타입 필드는 선택지 목록(options)을 JSONB 로 저장한다.
   * 다른 타입에서는 NULL. IF NOT EXISTS 로 재실행에 안전.
   */
  await executor.query(`
    ALTER TABLE liquor_pdf_template_fields
    ADD COLUMN IF NOT EXISTS options JSONB
  `)
  await executor.query(`
    ALTER TABLE liquor_pdf_template_fields
    ADD COLUMN IF NOT EXISTS input_role TEXT NOT NULL DEFAULT 'customer'
  `)
  await executor.query(`
    UPDATE liquor_pdf_template_fields SET customer_mapping = NULL
  `)
  await executor.query(`
    UPDATE liquor_pdf_template_fields SET input_role = 'customer' WHERE field_type::text = 'signature'
  `)
  await executor.query(`
    ALTER TABLE liquor_pdf_template_fields DROP CONSTRAINT IF EXISTS liquor_pdf_template_fields_input_role_check
  `)
  await executor.query(`
    ALTER TABLE liquor_pdf_template_fields
    ADD CONSTRAINT liquor_pdf_template_fields_input_role_check
    CHECK (
      input_role IN ('customer', 'sender', 'disabled')
      AND (
        field_type::text <> 'signature' OR input_role = 'customer'
      )
    )
  `)

  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS liquor_pdf_template_fields_tpl_key_uk
    ON liquor_pdf_template_fields (template_id, field_key)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_pdf_template_fields_tpl_order_idx
    ON liquor_pdf_template_fields (template_id, order_index)
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
      template_id INTEGER REFERENCES liquor_pdf_templates(id) ON DELETE SET NULL,
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

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_identity_sessions (
      id TEXT PRIMARY KEY,
      send_session_id TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'self_sms',
      level TEXT NOT NULL DEFAULT 'phone_possession',
      purpose TEXT NOT NULL DEFAULT 'liquor_signature',
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_identity_send_session_id
    ON liquor_signature_identity_sessions(send_session_id)
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_identity_sessions
    ADD COLUMN IF NOT EXISTS otp_send_count INTEGER NOT NULL DEFAULT 0
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      pdf_file_id TEXT,
      pdf_file_path TEXT,
      pdf_hash TEXT,
      page_count INTEGER,
      pdf_template_id INTEGER REFERENCES liquor_pdf_templates(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_templates
    ADD COLUMN IF NOT EXISTS pdf_template_id INTEGER REFERENCES liquor_pdf_templates(id) ON DELETE SET NULL
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_templates
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_templates_ga_status
    ON liquor_signature_templates(ga_id, status)
  `)

  /* 계약 템플릿 모드: 좌표형 PDF vs 무좌표 확인만(확장 예정). 기본은 기존 동작 유지. */
  await executor.query(`
    ALTER TABLE liquor_signature_templates
    ADD COLUMN IF NOT EXISTS template_mode TEXT NOT NULL DEFAULT 'coordinate_pdf'
  `)
  await executor.query(`
    UPDATE liquor_signature_templates
    SET template_mode = 'coordinate_pdf'
    WHERE template_mode IS NULL
       OR template_mode NOT IN ('coordinate_pdf', 'confirmation_only')
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_templates DROP CONSTRAINT IF EXISTS liquor_signature_templates_template_mode_check
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_templates
    ADD CONSTRAINT liquor_signature_templates_template_mode_check
    CHECK (template_mode IN ('coordinate_pdf', 'confirmation_only'))
  `)

  /* confirmation_only 용 관리자 정의 동적 필드(좌표/PDF 필드 설정 테이블과 분리). */
  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_template_confirmation_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES liquor_signature_templates(id) ON DELETE CASCADE,
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
      CONSTRAINT liquor_signature_template_confirmation_fields_input_type_check
        CHECK (input_type IN ('text', 'textarea', 'number', 'date')),
      CONSTRAINT liquor_signature_template_confirmation_fields_input_role_check
        CHECK (input_role IN ('sender', 'customer')),
      CONSTRAINT liquor_signature_template_confirmation_fields_template_key_uniq
        UNIQUE (template_id, field_key)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_template_confirmation_fields_template_id
    ON liquor_signature_template_confirmation_fields(template_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_template_confirmation_fields_sort
    ON liquor_signature_template_confirmation_fields(template_id, sort_order)
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_template_confirmation_fields
    ADD COLUMN IF NOT EXISTS input_role TEXT
  `)
  await executor.query(`
    UPDATE liquor_signature_template_confirmation_fields
    SET input_role = 'sender'
    WHERE input_role IS NULL
       OR input_role NOT IN ('sender', 'customer')
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_template_confirmation_fields
    ALTER COLUMN input_role SET DEFAULT 'sender'
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_template_confirmation_fields
    ALTER COLUMN input_role SET NOT NULL
  `)
  await executor.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'liquor_signature_template_confirmation_fields_input_role_check'
      ) THEN
        ALTER TABLE liquor_signature_template_confirmation_fields
        ADD CONSTRAINT liquor_signature_template_confirmation_fields_input_role_check
          CHECK (input_role IN ('sender', 'customer'));
      END IF;
    END $$;
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_template_fields (
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
        SELECT 1 FROM pg_constraint WHERE conname = 'liquor_signature_template_fields_template_id_fkey'
      ) THEN
        ALTER TABLE liquor_signature_template_fields
        ADD CONSTRAINT liquor_signature_template_fields_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES liquor_signature_templates(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_template_fields_template_id
    ON liquor_signature_template_fields(template_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_template_field_settings (
      template_id TEXT NOT NULL REFERENCES liquor_signature_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      input_role TEXT NOT NULL,
      fixed_value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (template_id, field_key),
      CONSTRAINT liquor_signature_template_field_settings_role_check
        CHECK (input_role IN ('customer', 'sender', 'fixed'))
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_template_field_settings_template_id
    ON liquor_signature_template_field_settings(template_id)
  `)
  /* 기존 계약 템플릿에 대해 PDF 필드 기준으로 설정 행 백필(이미 있으면 유지). */
  await executor.query(`
    INSERT INTO liquor_signature_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
    SELECT ct.id, pf.field_key,
      CASE
        WHEN pf.field_type::text = 'signature' THEN 'customer'
        WHEN pf.input_role = 'disabled' THEN 'fixed'
        WHEN pf.input_role = 'sender' THEN 'sender'
        ELSE 'customer'
      END,
      CASE WHEN pf.input_role = 'disabled' THEN '' ELSE NULL END,
      NOW(), NOW()
    FROM liquor_signature_templates ct
    INNER JOIN pdf_template_fields pf ON pf.template_id = ct.pdf_template_id
    ON CONFLICT (template_id, field_key) DO NOTHING
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_packages (
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
    ALTER TABLE liquor_signature_packages
    ADD COLUMN IF NOT EXISTS ga_id INTEGER REFERENCES ga_companies(id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_packages_ga_status
    ON liquor_signature_packages(ga_id, status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_package_items (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES liquor_signature_packages(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES liquor_signature_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_package_items_package_id
    ON liquor_signature_package_items(package_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_send_sessions (
      id TEXT PRIMARY KEY,
      package_id TEXT REFERENCES liquor_signature_packages(id) ON DELETE SET NULL,
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_send_sessions_link_code
    ON liquor_signature_send_sessions(link_code)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_send_sessions_customer_id
    ON liquor_signature_send_sessions(customer_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_document_instances (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES liquor_signature_templates(id) ON DELETE RESTRICT,
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_document_instances_send_session_id
    ON liquor_signature_document_instances(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_document_values (
      id TEXT PRIMARY KEY,
      document_instance_id TEXT NOT NULL REFERENCES liquor_signature_document_instances(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_document_values_document_instance_id
    ON liquor_signature_document_values(document_instance_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_confirmation_items (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_confirmation_items_send_session_id
    ON liquor_signature_confirmation_items(send_session_id)
  `)
  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_confirmation_item_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
      confirmation_item_id TEXT NOT NULL REFERENCES liquor_signature_confirmation_items(id) ON DELETE CASCADE,
      checked BOOLEAN NOT NULL DEFAULT false,
      checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, confirmation_item_id)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_confirmation_item_values_send_session_id
    ON liquor_signature_confirmation_item_values(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_send_session_attachments (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_send_session_attachments_session
    ON liquor_signature_send_session_attachments(send_session_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_send_session_attachments_file
    ON liquor_signature_send_session_attachments(file_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_send_session_confirmation_field_values (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES liquor_signature_templates(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(send_session_id, template_id, field_key)
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_csscfv_send_session
    ON liquor_signature_send_session_confirmation_field_values(send_session_id)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_signature_evidences (
      id TEXT PRIMARY KEY,
      send_session_id TEXT NOT NULL REFERENCES liquor_signature_send_sessions(id) ON DELETE CASCADE,
      document_instance_id TEXT REFERENCES liquor_signature_document_instances(id) ON DELETE SET NULL,
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
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_evidences_send_session_id
    ON liquor_signature_evidences(send_session_id)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS idx_liquor_signature_evidences_document_instance_id
    ON liquor_signature_evidences(document_instance_id)
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_evidences
    ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_evidences
    ADD COLUMN IF NOT EXISTS values_hash TEXT
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_evidences
    ADD COLUMN IF NOT EXISTS document_reference_hash TEXT
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_evidences
    ADD COLUMN IF NOT EXISTS signature_file_id TEXT
  `)
  await executor.query(`
    ALTER TABLE liquor_signature_evidences
    ADD COLUMN IF NOT EXISTS signed_pdf_file_id TEXT
  `)
  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_liquor_signature_evidences_document_instance_id
    ON liquor_signature_evidences(document_instance_id)
    WHERE document_instance_id IS NOT NULL
  `)
}
