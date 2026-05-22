/**
 * 주류 CRM 상환 import DB 스키마.
 * @module liquorRepayments/schema
 */

/**
 * @param {import('pg').Pool | { query: Function }} executor
 */
export async function ensureLiquorRepaymentImportSchema(executor) {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_repayment_import_batches (
      id BIGSERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL DEFAULT 'excel'
        CHECK (source_type IN ('excel', 'bank_api', 'manual')),
      original_file_name TEXT NOT NULL DEFAULT '',
      file_id BIGINT REFERENCES files(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (status IN ('uploaded', 'parsed', 'matched', 'confirmed', 'failed')),
      row_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      confirmed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayment_import_batches_ga_idx
    ON liquor_repayment_import_batches (ga_id, created_at DESC)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_repayment_import_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES liquor_repayment_import_batches(id) ON DELETE CASCADE,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      raw_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      transaction_date DATE,
      transaction_time TEXT NOT NULL DEFAULT '',
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      direction TEXT NOT NULL DEFAULT 'deposit'
        CHECK (direction IN ('deposit', 'withdrawal')),
      depositor_name TEXT NOT NULL DEFAULT '',
      normalized_depositor_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      balance_after NUMERIC(18,2),
      row_hash TEXT NOT NULL DEFAULT '',
      external_transaction_id TEXT,
      matched_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      matched_support_contract_id BIGINT REFERENCES liquor_support_contracts(id) ON DELETE SET NULL,
      match_status TEXT NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN (
          'unmatched', 'exact_alias_matched', 'conflict', 'duplicate',
          'confirmed', 'ignored', 'failed'
        )),
      match_reason TEXT NOT NULL DEFAULT '',
      confirmed_repayment_id BIGINT REFERENCES liquor_repayments(id) ON DELETE SET NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayment_import_rows_batch_idx
    ON liquor_repayment_import_rows (batch_id, match_status)
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayment_import_rows_hash_idx
    ON liquor_repayment_import_rows (ga_id, row_hash)
  `)

  await executor.query(`
    CREATE TABLE IF NOT EXISTS liquor_repayment_match_aliases (
      id BIGSERIAL PRIMARY KEY,
      ga_id INTEGER NOT NULL REFERENCES ga_companies(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      support_contract_id BIGINT REFERENCES liquor_support_contracts(id) ON DELETE SET NULL,
      alias_type TEXT NOT NULL DEFAULT 'depositor_name'
        CHECK (alias_type IN ('depositor_name', 'account_holder', 'custom')),
      alias_value TEXT NOT NULL DEFAULT '',
      normalized_alias_value TEXT NOT NULL DEFAULT '',
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_from_import_row_id BIGINT REFERENCES liquor_repayment_import_rows(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayment_match_aliases_lookup_idx
    ON liquor_repayment_match_aliases (ga_id, normalized_alias_value)
    WHERE is_active = true
  `)
  await executor.query(`
    CREATE INDEX IF NOT EXISTS liquor_repayment_match_aliases_customer_idx
    ON liquor_repayment_match_aliases (ga_id, customer_id)
    WHERE is_active = true
  `)
}
