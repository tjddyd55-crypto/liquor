/**
 * 주류 CRM 채권관리(지원현황) 조회 API — read-only.
 */
import { resolveLiquorGaId, requireLiquorIndustryCustomerUser } from '../lib/liquorCustomers/access.js'
import { createAttachPlatformContext } from '../lib/platformRbac.js'
import {
  buildReceivablesContractsWhere,
  buildReceivablesSupportItemsWhere,
  parseReceivablesContractFilters,
  parseReceivablesImportFilters,
  parseReceivablesSupportItemFilters,
} from '../lib/liquorReceivables/receivablesQueries.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function mapContractRow(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name ?? ''),
    representativeName: String(row.business_representative_name ?? ''),
    customerPhone: String(row.customer_phone ?? row.store_phone ?? ''),
    contractName: String(row.contract_name ?? ''),
    supportType: String(row.support_type ?? ''),
    supportDate: row.support_date,
    totalRepaymentPlannedAmount: num(row.total_repayment_planned_amount),
    repaidAmount: num(row.repaid_amount),
    adjustmentAmount: num(row.adjustment_amount),
    balanceAmount: num(row.balance_amount),
    status: String(row.status ?? ''),
    latestRepaymentOn: row.latest_repayment_on,
    repaymentDueOn: row.repayment_due_on,
  }
}

function mapImportRow(row) {
  return {
    id: Number(row.id),
    batchId: Number(row.batch_id),
    batchFileName: String(row.original_file_name ?? ''),
    transactionDate: row.transaction_date,
    depositorName: String(row.depositor_name ?? ''),
    amount: num(row.amount),
    matchStatus: String(row.match_status ?? ''),
    matchReason: String(row.match_reason ?? ''),
    matchedCustomerId: row.matched_customer_id != null ? Number(row.matched_customer_id) : null,
    matchedCustomerName: row.matched_customer_name != null ? String(row.matched_customer_name) : null,
  }
}

function mapSupportItemRow(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name ?? ''),
    itemKind: String(row.item_kind ?? ''),
    itemKindOther: String(row.item_kind_other ?? ''),
    modelName: String(row.model_name ?? ''),
    status: String(row.status ?? ''),
    recoveryRequired: Boolean(row.recovery_required),
    recoveryDueOn: row.recovery_due_on,
    recoveredOn: row.recovered_on,
    linkedFileCount: num(row.linked_file_count),
  }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, handleDbError: Function }} ctx
 */
export function registerLiquorReceivablesApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx
  const attachPlatformContext = createAttachPlatformContext(pool)
  const chain = [requireAuth, attachPlatformContext, requireLiquorIndustryCustomerUser]

  apiRouter.get('/liquor/receivables/summary', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }

      const [contractR, importR, itemR] = await Promise.all([
        pool.query(
          `
          SELECT
            COALESCE(SUM(support_amount), 0)::numeric AS total_support_amount,
            COALESCE(SUM(repaid_amount), 0)::numeric AS total_repaid_amount,
            COALESCE(SUM(balance_amount), 0)::numeric AS total_balance_amount,
            COUNT(*) FILTER (WHERE status IN ('overdue', 'collection_required'))::int AS overdue_or_collection_count,
            COUNT(*) FILTER (WHERE status = 'repaying')::int AS repaying_contract_count,
            COUNT(*) FILTER (WHERE status = 'repaid')::int AS repaid_contract_count
          FROM liquor_support_contracts
          WHERE ga_id = $1
          `,
          [gaId],
        ),
        pool.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE match_status = 'unmatched')::int AS unmatched_import_row_count,
            COUNT(*) FILTER (WHERE match_status = 'conflict')::int AS conflict_import_row_count
          FROM liquor_repayment_import_rows
          WHERE ga_id = $1
            AND direction = 'deposit'
            AND match_status IN ('unmatched', 'conflict', 'duplicate')
          `,
          [gaId],
        ),
        pool.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE recovery_required = true OR status IN ('recovery_scheduled', 'broken', 'lost'))::int AS recovery_required_item_count,
            COUNT(*) FILTER (WHERE status IN ('recovery_scheduled', 'recovered'))::int AS recovery_scheduled_or_recovered_count
          FROM liquor_support_items
          WHERE ga_id = $1 AND deleted_at IS NULL
          `,
          [gaId],
        ),
      ])

      const c = contractR.rows[0] ?? {}
      const i = importR.rows[0] ?? {}
      const s = itemR.rows[0] ?? {}

      res.json({
        ok: true,
        data: {
          totalSupportAmount: num(c.total_support_amount),
          totalRepaidAmount: num(c.total_repaid_amount),
          totalBalanceAmount: num(c.total_balance_amount),
          overdueOrCollectionCount: Number(c.overdue_or_collection_count ?? 0),
          repayingContractCount: Number(c.repaying_contract_count ?? 0),
          repaidContractCount: Number(c.repaid_contract_count ?? 0),
          unmatchedImportRowCount: Number(i.unmatched_import_row_count ?? 0),
          conflictImportRowCount: Number(i.conflict_import_row_count ?? 0),
          recoveryRequiredItemCount: Number(s.recovery_required_item_count ?? 0),
          recoveryScheduledOrRecoveredCount: Number(s.recovery_scheduled_or_recovered_count ?? 0),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/receivables/contracts', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const filters = parseReceivablesContractFilters(req.query)
      const { params, whereSql } = buildReceivablesContractsWhere(filters, gaId)
      const limitIdx = params.length + 1
      const offsetIdx = params.length + 2

      const countR = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM liquor_support_contracts lsc
        JOIN customers c ON c.id = lsc.customer_id
        LEFT JOIN liquor_customer_profiles lcp ON lcp.customer_id = lsc.customer_id
        WHERE ${whereSql}
        `,
        params,
      )

      const listR = await pool.query(
        `
        SELECT
          lsc.*,
          c.name AS customer_name,
          c.phone AS customer_phone,
          lcp.business_representative_name,
          lcp.store_phone,
          (
            SELECT MAX(lr.repaid_on)
            FROM liquor_repayments lr
            WHERE lr.support_contract_id = lsc.id AND lr.deleted_at IS NULL
          ) AS latest_repayment_on
        FROM liquor_support_contracts lsc
        JOIN customers c ON c.id = lsc.customer_id
        LEFT JOIN liquor_customer_profiles lcp ON lcp.customer_id = lsc.customer_id
        WHERE ${whereSql}
        ORDER BY lsc.balance_amount DESC NULLS LAST, lsc.support_date DESC NULLS LAST, lsc.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        [...params, filters.limit, filters.offset],
      )

      res.json({
        ok: true,
        data: {
          total: Number(countR.rows[0]?.total ?? 0),
          items: listR.rows.map(mapContractRow),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/receivables/import-rows', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const filters = parseReceivablesImportFilters(req.query)
      const listR = await pool.query(
        `
        SELECT
          ir.*,
          b.original_file_name,
          mc.name AS matched_customer_name
        FROM liquor_repayment_import_rows ir
        JOIN liquor_repayment_import_batches b ON b.id = ir.batch_id
        LEFT JOIN customers mc ON mc.id = ir.matched_customer_id
        WHERE ir.ga_id = $1
          AND ir.direction = 'deposit'
          AND ir.match_status = ANY($2::text[])
        ORDER BY ir.transaction_date DESC NULLS LAST, ir.id DESC
        LIMIT $3 OFFSET $4
        `,
        [gaId, filters.statuses, filters.limit, filters.offset],
      )

      const countR = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM liquor_repayment_import_rows
        WHERE ga_id = $1
          AND direction = 'deposit'
          AND match_status = ANY($2::text[])
        `,
        [gaId, filters.statuses],
      )

      res.json({
        ok: true,
        data: {
          total: Number(countR.rows[0]?.total ?? 0),
          items: listR.rows.map(mapImportRow),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/receivables/support-items', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const filters = parseReceivablesSupportItemFilters(req.query)
      const { params, whereSql } = buildReceivablesSupportItemsWhere(filters, gaId)
      const limitIdx = params.length + 1
      const offsetIdx = params.length + 2

      const countR = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM liquor_support_items si
        JOIN customers c ON c.id = si.customer_id
        WHERE ${whereSql}
        `,
        params,
      )

      const listR = await pool.query(
        `
        SELECT
          si.*,
          c.name AS customer_name,
          (SELECT COUNT(*)::int FROM liquor_customer_files lcf WHERE lcf.support_item_id = si.id) AS linked_file_count
        FROM liquor_support_items si
        JOIN customers c ON c.id = si.customer_id
        WHERE ${whereSql}
        ORDER BY si.recovery_due_on ASC NULLS LAST, si.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        [...params, filters.limit, filters.offset],
      )

      res.json({
        ok: true,
        data: {
          total: Number(countR.rows[0]?.total ?? 0),
          items: listR.rows.map(mapSupportItemRow),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
