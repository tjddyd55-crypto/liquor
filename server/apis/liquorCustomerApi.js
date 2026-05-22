/**
 * 주류회사 CRM 고객/거래처 API (liquor_customers* 전용).
 */
import { parseGaId } from '../lib/parseGaId.js'
import {
  assertLiquorCustomerAccess,
  requireLiquorIndustryCustomerUser,
  resolveLiquorGaId,
} from '../lib/liquorCustomers/access.js'
import {
  decryptLiquorResidentIdBlob,
  encryptLiquorResidentIdDigits,
  maskLiquorResidentId,
  normalizeLiquorResidentIdDigits,
} from '../lib/liquorCustomers/residentIdCrypto.js'
import {
  computeLiquorSupportContractBalance,
  recalculateLiquorSupportContractBalance,
  refreshLiquorRepaymentBalanceAfter,
} from '../services/liquorCustomerBalance.js'
import { createAttachPlatformContext } from '../lib/platformRbac.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseId(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function profileToDto(row, includeResidentPlain = false) {
  if (!row) return null
  let residentIdDisplay = row.resident_id_masked ?? ''
  if (includeResidentPlain && row.resident_id_encrypted) {
    const plain = decryptLiquorResidentIdBlob(row.resident_id_encrypted)
    if (plain) residentIdDisplay = plain
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    partyType: row.party_type,
    residentIdMasked: row.resident_id_masked ?? '',
    residentId: includeResidentPlain ? residentIdDisplay : row.resident_id_masked ?? '',
    individualEmail: row.individual_email ?? '',
    businessRepresentativeName: row.business_representative_name ?? '',
    businessName: row.business_name ?? '',
    businessRegistrationNumber: row.business_registration_number ?? '',
    businessAddress: row.business_address ?? '',
    storePhone: row.store_phone ?? '',
    businessType: row.business_type ?? '',
    businessItem: row.business_item ?? '',
    businessOpenedOn: row.business_opened_on,
    businessEmail: row.business_email ?? '',
    accountStatus: row.account_status ?? 'active',
    tradeStartedOn: row.trade_started_on,
    assignedSalesUserId: row.assigned_sales_user_id,
    memo: row.memo ?? '',
    updatedAt: row.updated_at,
  }
}

function contractToDto(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    contractName: row.contract_name ?? '',
    supportType: row.support_type,
    supportDate: row.support_date,
    supportAmount: num(row.support_amount),
    supportDescription: row.support_description ?? '',
    supportConditions: row.support_conditions ?? '',
    agreementStartOn: row.agreement_start_on,
    agreementEndOn: row.agreement_end_on,
    repaymentRequired: Boolean(row.repayment_required),
    repaymentStartOn: row.repayment_start_on,
    repaymentDueOn: row.repayment_due_on,
    totalRepaymentPlannedAmount: num(row.total_repayment_planned_amount),
    repaidAmount: num(row.repaid_amount),
    balanceAmount: num(row.balance_amount),
    adjustmentAmount: num(row.adjustment_amount),
    adjustmentReason: row.adjustment_reason ?? '',
    adjustedAt: row.adjusted_at,
    status: row.status,
    memo: row.memo ?? '',
    updatedAt: row.updated_at,
  }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, handleDbError: Function }} ctx
 */
export function registerLiquorCustomerApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx
  const attachPlatformContext = createAttachPlatformContext(pool)
  const chain = [requireAuth, attachPlatformContext, requireLiquorIndustryCustomerUser]

  apiRouter.get('/liquor/tenant/company-profile', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const r = await pool.query(`SELECT * FROM liquor_tenant_company_profiles WHERE ga_id = $1 LIMIT 1`, [gaId])
      res.json({ ok: true, data: r.rows[0] ?? null })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.put('/liquor/tenant/company-profile', ...chain, async (req, res) => {
    try {
      const gaId = resolveLiquorGaId(req)
      if (gaId == null) {
        res.status(400).json({ ok: false, message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const b = req.body ?? {}
      const r = await pool.query(
        `
        INSERT INTO liquor_tenant_company_profiles (
          ga_id, representative_name, business_name, business_registration_number, business_address,
          representative_phone, business_phone, email, bank_name, bank_account_number, bank_account_holder,
          signature_sender_name, signature_sender_phone, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (ga_id) DO UPDATE SET
          representative_name = EXCLUDED.representative_name,
          business_name = EXCLUDED.business_name,
          business_registration_number = EXCLUDED.business_registration_number,
          business_address = EXCLUDED.business_address,
          representative_phone = EXCLUDED.representative_phone,
          business_phone = EXCLUDED.business_phone,
          email = EXCLUDED.email,
          bank_name = EXCLUDED.bank_name,
          bank_account_number = EXCLUDED.bank_account_number,
          bank_account_holder = EXCLUDED.bank_account_holder,
          signature_sender_name = EXCLUDED.signature_sender_name,
          signature_sender_phone = EXCLUDED.signature_sender_phone,
          updated_at = NOW()
        RETURNING *
        `,
        [
          gaId,
          String(b.representativeName ?? b.representative_name ?? ''),
          String(b.businessName ?? b.business_name ?? ''),
          String(b.businessRegistrationNumber ?? b.business_registration_number ?? ''),
          String(b.businessAddress ?? b.business_address ?? ''),
          String(b.representativePhone ?? b.representative_phone ?? ''),
          String(b.businessPhone ?? b.business_phone ?? ''),
          String(b.email ?? ''),
          String(b.bankName ?? b.bank_name ?? ''),
          String(b.bankAccountNumber ?? b.bank_account_number ?? ''),
          String(b.bankAccountHolder ?? b.bank_account_holder ?? ''),
          String(b.signatureSenderName ?? b.signature_sender_name ?? ''),
          String(b.signatureSenderPhone ?? b.signature_sender_phone ?? ''),
        ],
      )
      res.json({ ok: true, data: r.rows[0] })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/liquor/customers/:customerId/detail', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const includePlain = String(req.query?.revealResidentId ?? '') === '1'
      const [profileR, contactsR, contractsR, itemsR, filesR, notesR] = await Promise.all([
        pool.query(`SELECT * FROM liquor_customer_profiles WHERE customer_id = $1 LIMIT 1`, [customerId]),
        pool.query(`SELECT * FROM liquor_customer_contacts WHERE customer_id = $1 ORDER BY sort_order, id`, [customerId]),
        pool.query(`SELECT * FROM liquor_support_contracts WHERE customer_id = $1 ORDER BY support_date DESC NULLS LAST, id DESC`, [customerId]),
        pool.query(`SELECT * FROM liquor_support_items WHERE customer_id = $1 ORDER BY supported_on DESC NULLS LAST, id DESC`, [customerId]),
        pool.query(`SELECT * FROM liquor_customer_files WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]),
        pool.query(`SELECT * FROM liquor_customer_notes WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]),
      ])
      const contractIds = contractsR.rows.map((c) => c.id)
      let repayments = []
      if (contractIds.length > 0) {
        const repR = await pool.query(
          `SELECT * FROM liquor_repayments WHERE support_contract_id = ANY($1::bigint[]) ORDER BY repaid_on DESC NULLS LAST, id DESC`,
          [contractIds],
        )
        repayments = repR.rows
      }
      const totalSupport = contractsR.rows.reduce((s, c) => s + num(c.support_amount), 0)
      const totalRepaid = contractsR.rows.reduce((s, c) => s + num(c.repaid_amount), 0)
      const totalBalance = contractsR.rows.reduce((s, c) => s + num(c.balance_amount), 0)
      const overdueAmount = contractsR.rows
        .filter((c) => c.status === 'overdue')
        .reduce((s, c) => s + num(c.balance_amount), 0)
      res.json({
        ok: true,
        data: {
          profile: profileToDto(profileR.rows[0], includePlain),
          contacts: contactsR.rows,
          supportContracts: contractsR.rows.map(contractToDto),
          repayments,
          supportItems: itemsR.rows,
          files: filesR.rows,
          notes: notesR.rows,
          summary: {
            totalSupportAmount: totalSupport,
            totalRepaidAmount: totalRepaid,
            totalBalanceAmount: totalBalance,
            overdueAmount,
            latestRepaymentOn: repayments[0]?.repaid_on ?? null,
            nextRepaymentDueOn: contractsR.rows.find((c) => c.repayment_due_on)?.repayment_due_on ?? null,
          },
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.put('/liquor/customers/:customerId/profile', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null) {
        res.status(400).json({ ok: false, message: '잘못된 요청입니다.' })
        return
      }
      if (!(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const partyType = String(b.partyType ?? b.party_type ?? 'individual')
      let residentEncrypted = null
      let residentMasked = ''
      const rawRrn = b.residentId ?? b.resident_id
      if (rawRrn != null && String(rawRrn).trim() !== '') {
        const digits = normalizeLiquorResidentIdDigits(rawRrn)
        if (!digits) {
          res.status(400).json({ ok: false, message: '주민번호 형식이 올바르지 않습니다.' })
          return
        }
        residentEncrypted = encryptLiquorResidentIdDigits(digits)
        residentMasked = maskLiquorResidentId(digits)
      }
      const r = await pool.query(
        `
        INSERT INTO liquor_customer_profiles (
          customer_id, ga_id, party_type, resident_id_encrypted, resident_id_masked,
          individual_email, business_representative_name, business_name, business_registration_number,
          business_address, store_phone, business_type, business_item, business_opened_on,
          business_email, account_status, trade_started_on, assigned_sales_user_id, memo, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW()
        )
        ON CONFLICT (customer_id) DO UPDATE SET
          party_type = EXCLUDED.party_type,
          resident_id_encrypted = COALESCE(EXCLUDED.resident_id_encrypted, liquor_customer_profiles.resident_id_encrypted),
          resident_id_masked = CASE WHEN EXCLUDED.resident_id_encrypted IS NOT NULL THEN EXCLUDED.resident_id_masked ELSE liquor_customer_profiles.resident_id_masked END,
          individual_email = EXCLUDED.individual_email,
          business_representative_name = EXCLUDED.business_representative_name,
          business_name = EXCLUDED.business_name,
          business_registration_number = EXCLUDED.business_registration_number,
          business_address = EXCLUDED.business_address,
          store_phone = EXCLUDED.store_phone,
          business_type = EXCLUDED.business_type,
          business_item = EXCLUDED.business_item,
          business_opened_on = EXCLUDED.business_opened_on,
          business_email = EXCLUDED.business_email,
          account_status = EXCLUDED.account_status,
          trade_started_on = EXCLUDED.trade_started_on,
          assigned_sales_user_id = EXCLUDED.assigned_sales_user_id,
          memo = EXCLUDED.memo,
          updated_at = NOW()
        RETURNING *
        `,
        [
          customerId,
          gaId,
          partyType === 'business' ? 'business' : 'individual',
          residentEncrypted,
          residentMasked,
          String(b.individualEmail ?? b.individual_email ?? ''),
          String(b.businessRepresentativeName ?? b.business_representative_name ?? ''),
          String(b.businessName ?? b.business_name ?? ''),
          String(b.businessRegistrationNumber ?? b.business_registration_number ?? ''),
          String(b.businessAddress ?? b.business_address ?? ''),
          String(b.storePhone ?? b.store_phone ?? ''),
          String(b.businessType ?? b.business_type ?? ''),
          String(b.businessItem ?? b.business_item ?? ''),
          b.businessOpenedOn ?? b.business_opened_on ?? null,
          String(b.businessEmail ?? b.business_email ?? ''),
          String(b.accountStatus ?? b.account_status ?? 'active'),
          b.tradeStartedOn ?? b.trade_started_on ?? null,
          b.assignedSalesUserId ?? b.assigned_sales_user_id ?? null,
          String(b.memo ?? ''),
        ],
      )
      await pool.query(
        `
        UPDATE customers SET crm_extension = jsonb_set(
          jsonb_set(COALESCE(crm_extension, '{"v":1,"fields":{}}'::jsonb), '{fields,liquor.partyType}', to_jsonb($2::text), true),
          '{fields,liquor.accountStatus}', to_jsonb($3::text), true
        ), updated_at = NOW()
        WHERE id = $1
        `,
        [customerId, partyType === 'business' ? 'business' : 'individual', String(b.accountStatus ?? b.account_status ?? 'active')],
      )
      res.json({ ok: true, data: profileToDto(r.rows[0], false) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  // --- contacts ---
  apiRouter.post('/liquor/customers/:customerId/contacts', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null || !(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const r = await pool.query(
        `INSERT INTO liquor_customer_contacts (customer_id, ga_id, name, birth_date, phone, job_title, role_label, email, is_signature_recipient, memo, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          customerId,
          gaId,
          String(b.name ?? ''),
          b.birthDate ?? b.birth_date ?? null,
          String(b.phone ?? ''),
          String(b.jobTitle ?? b.job_title ?? ''),
          String(b.roleLabel ?? b.role_label ?? ''),
          String(b.email ?? ''),
          Boolean(b.isSignatureRecipient ?? b.is_signature_recipient),
          String(b.memo ?? ''),
          num(b.sortOrder ?? b.sort_order),
        ],
      )
      res.status(201).json({ ok: true, data: r.rows[0] })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/liquor/customers/:customerId/contacts/:contactId', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const contactId = parseId(req.params.contactId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || !contactId || gaId == null || !(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '담당자를 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const r = await pool.query(
        `UPDATE liquor_customer_contacts SET
          name = COALESCE($3, name), birth_date = COALESCE($4, birth_date), phone = COALESCE($5, phone),
          job_title = COALESCE($6, job_title), role_label = COALESCE($7, role_label), email = COALESCE($8, email),
          is_signature_recipient = COALESCE($9, is_signature_recipient), memo = COALESCE($10, memo),
          sort_order = COALESCE($11, sort_order), updated_at = NOW()
         WHERE id = $1 AND customer_id = $2 RETURNING *`,
        [
          contactId,
          customerId,
          b.name != null ? String(b.name) : null,
          b.birthDate ?? b.birth_date ?? null,
          b.phone != null ? String(b.phone) : null,
          b.jobTitle ?? b.job_title ?? null,
          b.roleLabel ?? b.role_label ?? null,
          b.email != null ? String(b.email) : null,
          b.isSignatureRecipient != null ? Boolean(b.isSignatureRecipient) : null,
          b.memo != null ? String(b.memo) : null,
          b.sortOrder != null ? num(b.sortOrder) : null,
        ],
      )
      if (!r.rowCount) {
        res.status(404).json({ ok: false, message: '담당자를 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true, data: r.rows[0] })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.delete('/liquor/customers/:customerId/contacts/:contactId', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const contactId = parseId(req.params.contactId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || !contactId || gaId == null) {
        res.status(404).json({ ok: false, message: '담당자를 찾을 수 없습니다.' })
        return
      }
      await pool.query(`DELETE FROM liquor_customer_contacts WHERE id = $1 AND customer_id = $2 AND ga_id = $3`, [
        contactId,
        customerId,
        gaId,
      ])
      res.json({ ok: true })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  // --- support contracts ---
  apiRouter.post('/liquor/customers/:customerId/support-contracts', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null || !(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const planned = num(b.totalRepaymentPlannedAmount ?? b.total_repayment_planned_amount)
      const adjustment = num(b.adjustmentAmount ?? b.adjustment_amount)
      const balance = computeLiquorSupportContractBalance({
        totalRepaymentPlannedAmount: planned,
        repaidAmount: 0,
        adjustmentAmount: adjustment,
      })
      const r = await pool.query(
        `INSERT INTO liquor_support_contracts (
          customer_id, ga_id, contract_name, support_type, support_date, support_amount, support_description,
          support_conditions, agreement_start_on, agreement_end_on, repayment_required, repayment_start_on,
          repayment_due_on, total_repayment_planned_amount, repaid_amount, balance_amount, adjustment_amount,
          adjustment_reason, status, memo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17,$18,$19) RETURNING *`,
        [
          customerId,
          gaId,
          String(b.contractName ?? b.contract_name ?? ''),
          String(b.supportType ?? b.support_type ?? 'other'),
          b.supportDate ?? b.support_date ?? null,
          num(b.supportAmount ?? b.support_amount),
          String(b.supportDescription ?? b.support_description ?? ''),
          String(b.supportConditions ?? b.support_conditions ?? ''),
          b.agreementStartOn ?? b.agreement_start_on ?? null,
          b.agreementEndOn ?? b.agreement_end_on ?? null,
          Boolean(b.repaymentRequired ?? b.repayment_required),
          b.repaymentStartOn ?? b.repayment_start_on ?? null,
          b.repaymentDueOn ?? b.repayment_due_on ?? null,
          planned,
          balance,
          adjustment,
          String(b.adjustmentReason ?? b.adjustment_reason ?? ''),
          String(b.status ?? 'draft'),
          String(b.memo ?? ''),
        ],
      )
      res.status(201).json({ ok: true, data: contractToDto(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/liquor/customers/:customerId/support-contracts/:contractId', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const contractId = parseId(req.params.contractId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || !contractId || gaId == null) {
        res.status(404).json({ ok: false, message: '지원계약을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const cur = await pool.query(
        `SELECT * FROM liquor_support_contracts WHERE id = $1 AND customer_id = $2 AND ga_id = $3 LIMIT 1`,
        [contractId, customerId, gaId],
      )
      if (!cur.rowCount) {
        res.status(404).json({ ok: false, message: '지원계약을 찾을 수 없습니다.' })
        return
      }
      const row = cur.rows[0]
      const planned = b.totalRepaymentPlannedAmount != null ? num(b.totalRepaymentPlannedAmount) : num(row.total_repayment_planned_amount)
      const adjustment = b.adjustmentAmount != null ? num(b.adjustmentAmount) : num(row.adjustment_amount)
      const repaid = num(row.repaid_amount)
      const balance = computeLiquorSupportContractBalance({
        totalRepaymentPlannedAmount: planned,
        repaidAmount: repaid,
        adjustmentAmount: adjustment,
      })
      const r = await pool.query(
        `UPDATE liquor_support_contracts SET
          contract_name = COALESCE($4, contract_name), support_type = COALESCE($5, support_type),
          support_date = COALESCE($6, support_date), support_amount = COALESCE($7, support_amount),
          support_description = COALESCE($8, support_description), support_conditions = COALESCE($9, support_conditions),
          agreement_start_on = COALESCE($10, agreement_start_on), agreement_end_on = COALESCE($11, agreement_end_on),
          repayment_required = COALESCE($12, repayment_required), repayment_start_on = COALESCE($13, repayment_start_on),
          repayment_due_on = COALESCE($14, repayment_due_on), total_repayment_planned_amount = $15,
          balance_amount = $16, adjustment_amount = $17,
          adjustment_reason = COALESCE($18, adjustment_reason),
          adjusted_at = CASE WHEN $17 IS DISTINCT FROM adjustment_amount THEN NOW() ELSE adjusted_at END,
          status = COALESCE($19, status), memo = COALESCE($20, memo), updated_at = NOW()
         WHERE id = $1 AND customer_id = $2 AND ga_id = $3 RETURNING *`,
        [
          contractId,
          customerId,
          gaId,
          b.contractName ?? b.contract_name ?? null,
          b.supportType ?? b.support_type ?? null,
          b.supportDate ?? b.support_date ?? null,
          b.supportAmount != null ? num(b.supportAmount) : null,
          b.supportDescription ?? b.support_description ?? null,
          b.supportConditions ?? b.support_conditions ?? null,
          b.agreementStartOn ?? b.agreement_start_on ?? null,
          b.agreementEndOn ?? b.agreement_end_on ?? null,
          b.repaymentRequired != null ? Boolean(b.repaymentRequired) : null,
          b.repaymentStartOn ?? b.repayment_start_on ?? null,
          b.repaymentDueOn ?? b.repayment_due_on ?? null,
          planned,
          balance,
          adjustment,
          b.adjustmentReason ?? b.adjustment_reason ?? null,
          b.status ?? null,
          b.memo ?? null,
        ],
      )
      res.json({ ok: true, data: contractToDto(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  // --- repayments ---
  apiRouter.post('/liquor/customers/:customerId/support-contracts/:contractId/repayments', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const customerId = parseId(req.params.customerId)
      const contractId = parseId(req.params.contractId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || !contractId || gaId == null) {
        res.status(404).json({ ok: false, message: '지원계약을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      await client.query('BEGIN')
      const r = await client.query(
        `INSERT INTO liquor_repayments (
          support_contract_id, customer_id, ga_id, repaid_on, amount, method, depositor_name,
          deposit_account, processed_by_user_id, memo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          contractId,
          customerId,
          gaId,
          b.repaidOn ?? b.repaid_on ?? null,
          num(b.amount),
          String(b.method ?? 'other'),
          String(b.depositorName ?? b.depositor_name ?? ''),
          String(b.depositAccount ?? b.deposit_account ?? ''),
          req.user?.id ?? null,
          String(b.memo ?? ''),
        ],
      )
      const bal = await refreshLiquorRepaymentBalanceAfter(client, contractId, r.rows[0].id)
      await client.query('COMMIT')
      res.status(201).json({ ok: true, data: { ...r.rows[0], balanceAfter: bal?.balanceAmount ?? 0 } })
    } catch (e) {
      await client.query('ROLLBACK')
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.delete('/liquor/customers/:customerId/support-contracts/:contractId/repayments/:repaymentId', ...chain, async (req, res) => {
    const client = await pool.connect()
    try {
      const contractId = parseId(req.params.contractId)
      const repaymentId = parseId(req.params.repaymentId)
      const gaId = resolveLiquorGaId(req)
      if (!contractId || !repaymentId || gaId == null) {
        res.status(404).json({ ok: false, message: '상환내역을 찾을 수 없습니다.' })
        return
      }
      await client.query('BEGIN')
      await client.query(`DELETE FROM liquor_repayments WHERE id = $1 AND support_contract_id = $2 AND ga_id = $3`, [
        repaymentId,
        contractId,
        gaId,
      ])
      await recalculateLiquorSupportContractBalance(client, contractId)
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (e) {
      await client.query('ROLLBACK')
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  // --- support items ---
  apiRouter.post('/liquor/customers/:customerId/support-items', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null || !(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const b = req.body ?? {}
      const qty = Math.max(1, num(b.quantity))
      const unit = num(b.unitPrice ?? b.unit_price)
      const total = b.totalAmount != null ? num(b.totalAmount) : qty * unit
      const r = await pool.query(
        `INSERT INTO liquor_support_items (
          customer_id, support_contract_id, ga_id, item_kind, item_kind_other, model_name, manufacturer,
          quantity, unit_price, total_amount, supported_on, installed_on, install_location, ownership_type,
          recovery_required, recovery_due_on, recovered_on, status, memo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [
          customerId,
          b.supportContractId ?? b.support_contract_id ?? null,
          gaId,
          String(b.itemKind ?? b.item_kind ?? 'other'),
          String(b.itemKindOther ?? b.item_kind_other ?? ''),
          String(b.modelName ?? b.model_name ?? ''),
          String(b.manufacturer ?? ''),
          qty,
          unit,
          total,
          b.supportedOn ?? b.supported_on ?? null,
          b.installedOn ?? b.installed_on ?? null,
          String(b.installLocation ?? b.install_location ?? ''),
          String(b.ownershipType ?? b.ownership_type ?? ''),
          Boolean(b.recoveryRequired ?? b.recovery_required),
          b.recoveryDueOn ?? b.recovery_due_on ?? null,
          b.recoveredOn ?? b.recovered_on ?? null,
          String(b.status ?? 'planned'),
          String(b.memo ?? ''),
        ],
      )
      res.status(201).json({ ok: true, data: r.rows[0] })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  // --- notes ---
  apiRouter.post('/liquor/customers/:customerId/notes', ...chain, async (req, res) => {
    try {
      const customerId = parseId(req.params.customerId)
      const gaId = resolveLiquorGaId(req)
      if (!customerId || gaId == null || !(await assertLiquorCustomerAccess(pool, customerId, gaId))) {
        res.status(404).json({ ok: false, message: '고객을 찾을 수 없습니다.' })
        return
      }
      const body = String(req.body?.body ?? '').trim()
      if (!body) {
        res.status(400).json({ ok: false, message: '메모 내용이 필요합니다.' })
        return
      }
      const r = await pool.query(
        `INSERT INTO liquor_customer_notes (customer_id, ga_id, body, created_by_user_id) VALUES ($1,$2,$3,$4) RETURNING *`,
        [customerId, gaId, body, req.user?.id ?? null],
      )
      res.status(201).json({ ok: true, data: r.rows[0] })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
