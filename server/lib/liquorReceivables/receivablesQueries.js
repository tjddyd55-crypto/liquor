/**
 * 채권관리 집계 쿼리 헬퍼.
 */

/**
 * @param {import('express').Request['query']} query
 */
export function parseReceivablesContractFilters(query) {
  const q = query ?? {}
  const status = String(q.status ?? '').trim()
  const supportType = String(q.supportType ?? q.support_type ?? '').trim()
  const search = String(q.search ?? q.q ?? '').trim()
  const hasBalance = String(q.hasBalance ?? q.has_balance ?? '').trim().toLowerCase()
  const overdueDue = String(q.overdueDue ?? q.overdue_due ?? '').trim().toLowerCase()
  const dateFrom = String(q.dateFrom ?? q.date_from ?? '').trim().slice(0, 10)
  const dateTo = String(q.dateTo ?? q.date_to ?? '').trim().slice(0, 10)
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  const offset = Math.max(0, Number(q.offset) || 0)
  return { status, supportType, search, hasBalance, overdueDue, dateFrom, dateTo, limit, offset }
}

/**
 * @param {ReturnType<typeof parseReceivablesContractFilters>} filters
 * @param {number} gaId
 */
export function buildReceivablesContractsWhere(filters, gaId) {
  const params = [gaId]
  const clauses = ['lsc.ga_id = $1']

  if (filters.status) {
    params.push(filters.status)
    clauses.push(`lsc.status = $${params.length}`)
  }
  if (filters.supportType) {
    params.push(filters.supportType)
    clauses.push(`lsc.support_type = $${params.length}`)
  }
  if (filters.hasBalance === 'yes' || filters.hasBalance === 'true' || filters.hasBalance === '1') {
    clauses.push('lsc.balance_amount > 0')
  } else if (filters.hasBalance === 'no' || filters.hasBalance === 'false' || filters.hasBalance === '0') {
    clauses.push('lsc.balance_amount <= 0')
  }
  if (filters.overdueDue === 'yes' || filters.overdueDue === 'true' || filters.overdueDue === '1') {
    clauses.push(`lsc.repayment_due_on IS NOT NULL AND lsc.repayment_due_on < CURRENT_DATE AND lsc.balance_amount > 0`)
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom)
    clauses.push(`lsc.support_date >= $${params.length}::date`)
  }
  if (filters.dateTo) {
    params.push(filters.dateTo)
    clauses.push(`lsc.support_date <= $${params.length}::date`)
  }
  if (filters.search) {
    params.push(`%${filters.search}%`)
    const idx = params.length
    clauses.push(
      `(c.name ILIKE $${idx} OR COALESCE(lcp.business_representative_name, '') ILIKE $${idx} OR COALESCE(lsc.contract_name, '') ILIKE $${idx} OR COALESCE(c.phone, '') ILIKE $${idx})`,
    )
  }

  return { params, whereSql: clauses.join(' AND ') }
}

/**
 * @param {import('express').Request['query']} query
 */
export function parseReceivablesImportFilters(query) {
  const q = query ?? {}
  const statusRaw = String(q.status ?? 'unmatched,conflict,duplicate').trim()
  const statuses = statusRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ['unmatched', 'conflict', 'duplicate'].includes(s))
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  const offset = Math.max(0, Number(q.offset) || 0)
  return {
    statuses: statuses.length ? statuses : ['unmatched', 'conflict', 'duplicate'],
    limit,
    offset,
  }
}

/**
 * @param {import('express').Request['query']} query
 */
export function parseReceivablesSupportItemFilters(query) {
  const q = query ?? {}
  const status = String(q.status ?? '').trim()
  const recoveryOnly = String(q.recoveryOnly ?? q.recovery_only ?? 'yes').trim().toLowerCase()
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  const offset = Math.max(0, Number(q.offset) || 0)
  return { status, recoveryOnly, limit, offset }
}

/**
 * @param {ReturnType<typeof parseReceivablesSupportItemFilters>} filters
 * @param {number} gaId
 */
export function buildReceivablesSupportItemsWhere(filters, gaId) {
  const params = [gaId]
  const clauses = ['si.ga_id = $1', 'si.deleted_at IS NULL']

  if (filters.status) {
    params.push(filters.status)
    clauses.push(`si.status = $${params.length}`)
  } else if (filters.recoveryOnly !== 'no' && filters.recoveryOnly !== 'false' && filters.recoveryOnly !== '0') {
    clauses.push(
      `(si.recovery_required = true OR si.status IN ('recovery_scheduled', 'broken', 'lost'))`,
    )
  }

  return { params, whereSql: clauses.join(' AND ') }
}
