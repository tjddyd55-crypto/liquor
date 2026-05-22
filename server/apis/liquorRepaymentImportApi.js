/**
 * 주류 CRM 상환 import API (exact alias 매칭만).
 */
import multer from 'multer'
import { assertLiquorCustomerAccess, resolveLiquorGaId } from '../lib/liquorCustomers/access.js'
import { parseRepaymentExcelBuffer, REPAYMENT_IMPORT_MAX_BYTES } from '../lib/liquorRepayments/importSources/excelImportSource.js'
import { matchRepaymentByExactAlias } from '../lib/liquorRepayments/repaymentExactAliasMatcher.js'
import { maskAccountNumber } from '../lib/liquorRepayments/repaymentAliasNormalize.js'
import { confirmRepaymentImportRow } from '../lib/liquorRepayments/repaymentConfirmService.js'

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REPAYMENT_IMPORT_MAX_BYTES },
})

function parseId(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function mapBatchRow(row) {
  return {
    id: Number(row.id),
    gaId: Number(row.ga_id),
    uploadedByUserId: row.uploaded_by_user_id != null ? String(row.uploaded_by_user_id) : null,
    sourceType: String(row.source_type ?? 'excel'),
    originalFileName: String(row.original_file_name ?? ''),
    status: String(row.status ?? ''),
    rowCount: Number(row.row_count ?? 0),
    matchedCount: Number(row.matched_count ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapImportRow(row, { includeRaw = false } = {}) {
  const out = {
    id: Number(row.id),
    batchId: Number(row.batch_id),
    transactionDate: row.transaction_date,
    transactionTime: String(row.transaction_time ?? ''),
    amount: Number(row.amount ?? 0),
    direction: String(row.direction ?? ''),
    depositorName: String(row.depositor_name ?? ''),
    description: String(row.description ?? ''),
    bankName: String(row.bank_name ?? ''),
    accountNumberMasked: maskAccountNumber(row.account_number),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    matchedCustomerId: row.matched_customer_id != null ? Number(row.matched_customer_id) : null,
    matchedSupportContractId:
      row.matched_support_contract_id != null ? Number(row.matched_support_contract_id) : null,
    matchStatus: String(row.match_status ?? ''),
    matchReason: String(row.match_reason ?? ''),
    confirmedRepaymentId: row.confirmed_repayment_id != null ? Number(row.confirmed_repayment_id) : null,
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (includeRaw) {
    out.rawRowJson = row.raw_row_json ?? {}
  }
  return out
}

function mapAliasRow(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    supportContractId: row.support_contract_id != null ? Number(row.support_contract_id) : null,
    aliasType: String(row.alias_type ?? ''),
    aliasValue: String(row.alias_value ?? ''),
    usageCount: Number(row.usage_count ?? 0),
    lastUsedAt: row.last_used_at,
    isActive: Boolean(row.is_active),
    memo: String(row.memo ?? ''),
    createdAt: row.created_at,
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} gaId
 * @param {number} batchId
 * @param {import('../lib/liquorRepayments/repaymentImportMapper.js').RepaymentImportMappedRow[]} rows
 */
async function insertAndMatchImportRows(client, gaId, batchId, rows) {
  const aliasR = await client.query(
    `SELECT * FROM liquor_repayment_match_aliases WHERE ga_id = $1 AND is_active = true`,
    [gaId],
  )
  const aliases = aliasR.rows
  let matchedCount = 0
  let failedCount = 0

  for (const row of rows) {
    let matchStatus = 'unmatched'
    let matchReason = ''
    let matchedCustomerId = null
    let matchedSupportContractId = null
    let errorMessage = null

    if (row.direction === 'withdrawal') {
      matchStatus = 'ignored'
      matchReason = '출금 row'
    } else {
      const dupR = await client.query(
        `
        SELECT id FROM liquor_repayment_import_rows
        WHERE ga_id = $1 AND row_hash = $2
          AND match_status IN ('confirmed', 'exact_alias_matched', 'unmatched', 'duplicate', 'conflict')
        LIMIT 1
        `,
        [gaId, row.rowHash],
      )
      if (dupR.rowCount) {
        matchStatus = 'duplicate'
        matchReason = '중복 업로드'
      } else if (row.normalizedDepositorName) {
        const m = matchRepaymentByExactAlias(row.normalizedDepositorName, aliases)
        matchStatus = m.matchStatus
        matchReason = m.matchReason
        matchedCustomerId = m.matchedCustomerId
        matchedSupportContractId = m.matchedSupportContractId
        if (matchStatus === 'exact_alias_matched') matchedCount++
        if (matchStatus === 'conflict') failedCount++
      } else {
        matchStatus = 'unmatched'
        matchReason = '입금자명 없음'
      }
    }

    await client.query(
      `
      INSERT INTO liquor_repayment_import_rows (
        batch_id, ga_id, raw_row_json, transaction_date, transaction_time, amount, direction,
        depositor_name, normalized_depositor_name, description, bank_name, account_number,
        balance_after, row_hash, external_transaction_id,
        matched_customer_id, matched_support_contract_id, match_status, match_reason, error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      `,
      [
        batchId,
        gaId,
        JSON.stringify(row.rawRowJson ?? {}),
        row.transactionDate,
        row.transactionTime ?? '',
        row.amount,
        row.direction,
        row.depositorName,
        row.normalizedDepositorName,
        row.description,
        row.bankName,
        row.accountNumber,
        row.balanceAfter,
        row.rowHash,
        row.externalTransactionId,
        matchedCustomerId,
        matchedSupportContractId,
        matchStatus,
        matchReason,
        errorMessage,
      ],
    )
  }

  return { matchedCount, failedCount }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, handleDbError: Function, chain: import('express').RequestHandler[] }} ctx
 */
export function registerLiquorRepaymentImportApi(apiRouter, ctx) {
  const { pool, handleDbError, chain } = ctx

  apiRouter.post('/liquor/repayment-import/batches/upload', ...chain, uploadImport.single('file'), async (req, res) => {
    const client = await pool.connect()
    try {
      const gaId = resolveLiquorGaId(req)
      const userId = req.user?.id ? String(req.user.id) : ''
      if (gaId == null || !userId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      const file = req.file
      if (!file?.buffer?.length) {
        res.status(400).json({ ok: false, message: '파일이 필요합니다.' })
        return
      }
      const lower = String(file.originalname ?? '').toLowerCase()
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
        res.status(400).json({ ok: false, message: 'xlsx, xls, csv 파일만 업로드할 수 있습니다.' })
        return
      }

      const parsed = parseRepaymentExcelBuffer(file.buffer, file.originalname, gaId)
      if (!parsed.rows.length) {
        res.status(400).json({ ok: false, message: parsed.errors[0] ?? '파싱된 row가 없습니다.' })
        return
      }

      await client.query('BEGIN')
      const batchIns = await client.query(
        `
        INSERT INTO liquor_repayment_import_batches (
          ga_id, uploaded_by_user_id, source_type, original_file_name, status, row_count
        ) VALUES ($1,$2,'excel',$3,'parsed',$4)
        RETURNING *
        `,
        [gaId, userId, String(file.originalname ?? ''), parsed.rows.length],
      )
      const batchId = batchIns.rows[0].id
      const { matchedCount, failedCount } = await insertAndMatchImportRows(client, gaId, batchId, parsed.rows)
      const status = failedCount > 0 ? 'matched' : 'matched'
      const upd = await client.query(
        `
        UPDATE liquor_repayment_import_batches SET
          status = $2, matched_count = $3, failed_count = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [batchId, status, matchedCount, failedCount],
      )
      await client.query('COMMIT')
      res.status(201).json({
        ok: true,
        data: {
          batch: mapBatchRow(upd.rows[0]),
          parseErrors: parsed.errors,
        },
      })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/liquor/repayment-import/batches', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const r = await pool.query(
        `SELECT * FROM liquor_repayment_import_batches WHERE ga_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [gaId],
      )
      res.json({ ok: true, data: r.rows.map(mapBatchRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/repayment-import/batches/:batchId/rows', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      const batchId = parseId(req.params.batchId)
      if (gaId == null || !batchId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      const status = String(req.query?.status ?? req.query?.matchStatus ?? '').trim()
      const params = [batchId, gaId]
      let sql = `
        SELECT * FROM liquor_repayment_import_rows
        WHERE batch_id = $1 AND ga_id = $2
      `
      if (status) {
        params.push(status)
        sql += ` AND match_status = $${params.length}`
      }
      sql += ` ORDER BY transaction_date DESC NULLS LAST, id DESC`
      const r = await pool.query(sql, params)
      res.json({ ok: true, data: r.rows.map((row) => mapImportRow(row)) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/liquor/repayment-import/rows/:rowId/confirm', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const gaId = resolveLiquorGaId(req)
      const userId = req.user?.id ? String(req.user.id) : ''
      const rowId = parseId(req.params.rowId)
      if (gaId == null || !userId || !rowId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      const b = req.body ?? {}
      const peek = await pool.query(
        `SELECT * FROM liquor_repayment_import_rows WHERE id = $1 AND ga_id = $2 LIMIT 1`,
        [rowId, gaId],
      )
      if (!peek.rowCount) {
        res.status(404).json({ ok: false, message: 'import row를 찾을 수 없습니다.' })
        return
      }
      const row = peek.rows[0]
      const customerId = parseId(b.customerId ?? b.customer_id ?? row.matched_customer_id)
      const supportContractId = parseId(
        b.supportContractId ?? b.support_contract_id ?? row.matched_support_contract_id,
      )
      if (!customerId || !supportContractId) {
        res.status(400).json({ ok: false, message: '거래처와 지원계약을 선택해 주세요.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const saveAlias = b.saveAlias !== false && b.save_alias !== false

      await client.query('BEGIN')
      const result = await confirmRepaymentImportRow(client, {
        gaId,
        userId,
        rowId,
        customerId,
        supportContractId,
        saveAlias,
      })
      if (!result.ok) {
        await client.query('ROLLBACK')
        res.status(result.status ?? 400).json({ ok: false, message: result.message })
        return
      }
      await client.query('COMMIT')
      res.json({
        ok: true,
        data: {
          repaymentId: result.repaymentId,
          repaidAmount: result.balance?.repaidAmount ?? 0,
          balanceAmount: result.balance?.balanceAmount ?? 0,
        },
      })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/liquor/repayment-import/aliases', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const r = await pool.query(
        `
        SELECT * FROM liquor_repayment_match_aliases
        WHERE ga_id = $1
        ORDER BY is_active DESC, last_used_at DESC NULLS LAST, id DESC
        LIMIT 200
        `,
        [gaId],
      )
      res.json({ ok: true, data: r.rows.map(mapAliasRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/liquor/repayment-import/aliases/:aliasId/deactivate', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      const aliasId = parseId(req.params.aliasId)
      if (gaId == null || !aliasId) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      const r = await pool.query(
        `
        UPDATE liquor_repayment_match_aliases SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND ga_id = $2
        RETURNING *
        `,
        [aliasId, gaId],
      )
      if (!r.rowCount) {
        res.status(404).json({ ok: false, message: '별칭을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true, data: mapAliasRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
