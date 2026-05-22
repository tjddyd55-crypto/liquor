/**
 * 주류회사 CRM 고객/거래처 전용 DB 스키마 (customers 마스터 FK, 보험/정부와 분리).
 * @module liquorCustomers/schema
 */

/**
 * @param {import('pg').Pool | { query: Function }} executor
 */
export async function ensureLiquorCustomerSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_tenant_company_profiles (
      id BIGSERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL UNIQUE REFERENCES ga_companies(id) ON DELETE CASCADE,
      representative_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      business_registration_number TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      representative_phone TEXT NOT NULL DEFAULT '',
      business_phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_account_number TEXT NOT NULL DEFAULT '',
      bank_account_holder TEXT NOT NULL DEFAULT '',
      business_registration_file_id BIGINT REFERENCES files(id) ON DELETE SET NULL,
      signature_sender_name TEXT NOT NULL DEFAULT '',
      signature_sender_phone TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_customer_profiles (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      party_type TEXT NOT NULL DEFAULT 'individual'
        CHECK (party_type IN ('individual', 'business')),
      resident_id_encrypted TEXT,
      resident_id_masked TEXT NOT NULL DEFAULT '',
      individual_email TEXT NOT NULL DEFAULT '',
      business_representative_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      business_registration_number TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      store_phone TEXT NOT NULL DEFAULT '',
      business_type TEXT NOT NULL DEFAULT '',
      business_item TEXT NOT NULL DEFAULT '',
      business_opened_on DATE,
      business_email TEXT NOT NULL DEFAULT '',
      account_status TEXT NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'inactive', 'suspended', 'closed')),
      trade_started_on DATE,
      assigned_sales_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_customer_profiles_ga_idx
    ON liquor_customer_profiles (ga_id, party_type)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_customer_contacts (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      birth_date DATE,
      phone TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      role_label TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      is_signature_recipient BOOLEAN NOT NULL DEFAULT false,
      memo TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_customer_contacts_customer_idx
    ON liquor_customer_contacts (customer_id, sort_order)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_support_contracts (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      contract_name TEXT NOT NULL DEFAULT '',
      support_type TEXT NOT NULL DEFAULT 'other'
        CHECK (support_type IN ('liquor_loan', 'cash_support', 'goods_support', 'mixed', 'other')),
      support_date DATE,
      support_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      support_description TEXT NOT NULL DEFAULT '',
      support_conditions TEXT NOT NULL DEFAULT '',
      agreement_start_on DATE,
      agreement_end_on DATE,
      repayment_required BOOLEAN NOT NULL DEFAULT false,
      repayment_start_on DATE,
      repayment_due_on DATE,
      total_repayment_planned_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      repaid_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      balance_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      adjustment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      adjustment_reason TEXT NOT NULL DEFAULT '',
      adjusted_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
          'draft', 'pending_contract', 'support_completed', 'repaying',
          'repaid', 'overdue', 'collection_required', 'terminated'
        )),
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_support_contracts_customer_idx
    ON liquor_support_contracts (customer_id, status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_repayments (
      id BIGSERIAL PRIMARY KEY,
      support_contract_id BIGINT NOT NULL REFERENCES liquor_support_contracts(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      repaid_on DATE,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'other'
        CHECK (method IN ('cash', 'bank_transfer', 'card', 'sales_offset', 'goods_return', 'other')),
      depositor_name TEXT NOT NULL DEFAULT '',
      deposit_account TEXT NOT NULL DEFAULT '',
      processed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      balance_after NUMERIC(18,2) NOT NULL DEFAULT 0,
      evidence_file_id BIGINT REFERENCES files(id) ON DELETE SET NULL,
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayments_contract_idx
    ON liquor_repayments (support_contract_id, repaid_on DESC)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_support_items (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      support_contract_id BIGINT REFERENCES liquor_support_contracts(id) ON DELETE SET NULL,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      item_kind TEXT NOT NULL DEFAULT 'other'
        CHECK (item_kind IN ('refrigerator', 'upright_freezer', 'ice_maker', 'horizontal_stocker', 'signboard', 'display_shelf', 'other')),
      item_kind_other TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      supported_on DATE,
      installed_on DATE,
      install_location TEXT NOT NULL DEFAULT '',
      ownership_type TEXT NOT NULL DEFAULT '',
      recovery_required BOOLEAN NOT NULL DEFAULT false,
      recovery_due_on DATE,
      recovered_on DATE,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN (
          'planned', 'installed', 'in_use', 'broken', 'recovery_scheduled',
          'recovered', 'lost', 'disposed'
        )),
      photo_file_id BIGINT REFERENCES files(id) ON DELETE SET NULL,
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_support_items_customer_idx
    ON liquor_support_items (customer_id, status)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_customer_files (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      support_contract_id BIGINT REFERENCES liquor_support_contracts(id) ON DELETE SET NULL,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      document_kind TEXT NOT NULL DEFAULT 'other'
        CHECK (document_kind IN (
          'business_registration', 'id_card', 'liquor_license', 'bankbook_copy',
          'support_contract', 'loan_agreement', 'goods_support_confirmation',
          'repayment_confirmation', 'deposit_slip', 'store_photo', 'install_photo', 'other'
        )),
      file_id BIGINT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    ALTER TABLE liquor_customer_files
    ADD COLUMN IF NOT EXISTS repayment_id BIGINT REFERENCES liquor_repayments(id) ON DELETE SET NULL
  `)
  await executor.query(`
    ALTER TABLE liquor_customer_files
    ADD COLUMN IF NOT EXISTS support_item_id BIGINT REFERENCES liquor_support_items(id) ON DELETE SET NULL
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_customer_files_customer_idx
    ON liquor_customer_files (customer_id, document_kind)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_customer_notes (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_customer_notes_customer_idx
    ON liquor_customer_notes (customer_id, created_at DESC)
  `)
}
