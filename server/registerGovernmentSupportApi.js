/**
 * government-support CRM API (보험 CRM / 플랫폼 관리와 분리).
 */
import {
  canAccessGovernmentProfile,
  canAccessGovernmentTenant,
  createGovernmentSupportGuards,
  isGovernmentIndustryAdmin,
  isGovernmentProgramUser,
  isGovernmentSuperAdmin,
  isGovernmentTenantMember,
  resolveGovernmentCrmGaId,
  resolveGovernmentIndustryId,
  canCreateGovernmentProfile,
  resolveGovernmentProfileQueryScope,
  resolveGovernmentTenantScopeForQuery,
  resolveTenantIdForProfileCreate,
} from './lib/governmentSupport/governmentAccess.js'
import { getProgramUserDetailForManager } from './lib/governmentSupport/governmentProgramUsers.js'
import {
  loadProfileAccessRowByApplicationCaseId,
  loadProfileAccessRowByDocumentId,
  loadProfileAccessRowByPriorLoanId,
  loadProfileAccessRowByMemoId,
  loadProfileAccessRowByConsultationId,
  loadProfileAccessRowByProgressEventId,
  loadProfileAccessRowByFileId,
  loadGovernmentProfileAccessRow,
} from './lib/governmentSupport/governmentProfileAccessHelpers.js'
import { GOVERNMENT_INDUSTRY_CODE } from './lib/governmentSupport/constants.js'
import {
  createGovernmentAdminUser,
  listGovernmentAdminUsers,
  patchGovernmentAdminUser,
  resetGovernmentAdminUserPassword,
  resolveGovernmentUserManagerScope,
} from './lib/governmentSupport/governmentAdminUsers.js'
import { mapGovSupportProfileRow, profilePatchFromBody } from './lib/governmentSupport/profileMapper.js'
import {
  mapGovSupportProfileMemoRow,
  normalizeGovProfileMemoContent,
} from './lib/governmentSupport/governmentProfileMemos.js'
import {
  mapGovSupportProfileConsultationRow,
  parseGovProfileConsultationPatchBody,
} from './lib/governmentSupport/governmentProfileConsultations.js'
import {
  mapGovSupportProfileProgressEventRow,
  parseGovProfileProgressPatchBody,
  syncGovProfileProgressStatus,
} from './lib/governmentSupport/governmentProfileProgress.js'
import {
  GOV_PROFILE_FILE_ALLOWED_MIME,
  GOV_PROFILE_FILE_BLOCKED_MIME,
  GOV_PROFILE_FILE_MAX_BYTES,
  isValidGovProfileFileName,
  mapGovSupportProfileFileRow,
  normalizeGovProfileFileName,
  parseGovProfileFilePatchBody,
  resolveGovProfileFileContentType,
} from './lib/governmentSupport/governmentProfileFiles.js'
import {
  assertGovernmentProfileFileObjectKey,
  buildGovernmentProfileFileObjectKey,
} from './lib/governmentSupport/governmentProfileFileStorage.js'
import {
  consentGetSignedDownloadUrl,
  getR2InsurerAttachmentsCacheControl,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2DeleteObject,
  r2GetPresignedPutUrl,
} from './lib/consentStorage.js'
import { normalizeTenantRegistrationCodeRaw } from './lib/tenantRegistrationCodes.js'
import { ensureGovernmentTenantRegistrationCode } from './lib/governmentSupport/ensureGovernmentTenantRegistrationCode.js'

/**
 * @param {import('express').Router} router
 * @param {{ pool: import('pg').Pool, requireAuth: Function, handleDbError: Function }} deps
 */
export function registerGovernmentSupportApi(router, deps) {
  const { pool, requireAuth, handleDbError } = deps
  const {
    requireGovernmentMember,
    requireGovernmentIndustryAdmin,
    requireGovernmentUserManager,
    attach,
  } = createGovernmentSupportGuards(pool, {
    requireAuth,
    handleDbError,
  })

  router.get('/government-support/me/access', requireAuth, attach, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!ctx) {
        res.status(500).json({ message: 'platformContext missing' })
        return
      }
      const scope = await resolveGovernmentTenantScopeForQuery(pool, ctx)
      const workspaceTenantIds = scope.ok ? scope.tenantIds : []

      let programUserTenantName = null
      const programTenantIds = ctx.governmentProgramUserTenantIds ?? []
      if (isGovernmentProgramUser(ctx) && programTenantIds.length > 0) {
        const tenantRes = await pool.query(`SELECT name FROM tenants WHERE id::text = $1 LIMIT 1`, [
          String(programTenantIds[0]),
        ])
        programUserTenantName =
          tenantRes.rows[0]?.name != null ? String(tenantRes.rows[0].name).trim() : null
      }

      let accountCreatedAt = null
      if (ctx.userId) {
        const userRes = await pool.query(`SELECT created_at FROM users WHERE id::text = $1 LIMIT 1`, [
          String(ctx.userId),
        ])
        accountCreatedAt = userRes.rows[0]?.created_at ?? null
      }

      res.json({
        success: true,
        data: {
          userId: ctx.userId,
          isSuperAdmin: isGovernmentSuperAdmin(ctx),
          isGovernmentIndustryAdmin: isGovernmentIndustryAdmin(ctx),
          isGovernmentTenantMember: isGovernmentTenantMember(ctx),
          isGovernmentProgramUser: isGovernmentProgramUser(ctx),
          governmentIndustryAdminIndustryIds: [...(ctx.governmentIndustryAdminIndustryIds ?? [])],
          governmentAgencyAdminTenantIds: [...(ctx.governmentAgencyAdminTenantIds ?? [])],
          governmentStaffTenantIds: [...(ctx.governmentStaffTenantIds ?? [])],
          governmentProgramUserTenantIds: [...(ctx.governmentProgramUserTenantIds ?? [])],
          workspaceTenantIds,
          defaultWorkspaceTenantId: workspaceTenantIds[0] ?? null,
          programUserTenantName,
          accountCreatedAt,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/admin/agencies', ...requireGovernmentUserManager, async (req, res) => {
    try {
      const ctx = req.platformContext
      const scope = await resolveGovernmentUserManagerScope(pool, ctx)
      if (!scope.ok) {
        res.status(scope.status).json({ message: scope.message })
        return
      }
      const r = await pool.query(
        `
        SELECT t.id::text AS id, t.code, t.name, t.status, t.created_at, t.updated_at
        FROM tenants t
        INNER JOIN industries i ON i.id = t.industry_id
        WHERE LOWER(TRIM(i.code)) = $1
          AND ($2::boolean OR t.id::text = ANY($3::text[]))
        ORDER BY t.name ASC, t.id ASC
        `,
        [GOVERNMENT_INDUSTRY_CODE, scope.fullAccess, scope.tenantIds],
      )
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: String(row.id),
          agencyCode: String(row.code ?? ''),
          name: String(row.name ?? ''),
          status: String(row.status ?? ''),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/admin/agencies', ...requireGovernmentIndustryAdmin, async (req, res) => {
    try {
      const body = req.body ?? {}
      const name = String(body.name ?? '').trim()
      const agencyCode = normalizeTenantRegistrationCodeRaw(body.agencyCode ?? body.code)
      const status = String(body.status ?? 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active'
      if (!name) {
        res.status(400).json({ message: '대행사명이 필요합니다.' })
        return
      }
      if (!agencyCode || agencyCode.length < 3) {
        res.status(400).json({ message: 'agencyCode는 3자 이상이어야 합니다.' })
        return
      }
      const industryId = await resolveGovernmentIndustryId(pool)
      if (!industryId) {
        res.status(500).json({ message: 'government 업종이 설정되지 않았습니다.' })
        return
      }
      const dup = await pool.query(`SELECT id FROM tenants WHERE code = $1 LIMIT 1`, [agencyCode])
      if ((dup.rowCount ?? 0) > 0) {
        res.status(409).json({ message: '이미 사용 중인 agencyCode 입니다.' })
        return
      }
      const legacyGaId = await resolveGovernmentCrmGaId(pool)
      const ins = await pool.query(
        `
        INSERT INTO tenants (industry_id, code, name, status, legacy_ga_id, config)
        VALUES ($1::bigint, $2, $3, $4, $5, '{}'::jsonb)
        RETURNING id::text AS id, code, name, status
        `,
        [industryId, agencyCode, name, status, legacyGaId],
      )
      const tenant = ins.rows[0]
      await ensureGovernmentTenantRegistrationCode(pool, {
        agencyCode,
        tenantId: tenant.id,
      })
      res.status(201).json({
        success: true,
        data: {
          id: String(tenant.id),
          agencyCode: String(tenant.code),
          name: String(tenant.name),
          status: String(tenant.status),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post(
    '/government-support/admin/agencies/:tenantId/ensure-registration-code',
    ...requireGovernmentIndustryAdmin,
    async (req, res) => {
      try {
        const tenantId = String(req.params.tenantId ?? '').trim()
        if (!tenantId) {
          res.status(400).json({ message: 'tenantId가 필요합니다.' })
          return
        }
        const industryId = await resolveGovernmentIndustryId(pool)
        if (!industryId) {
          res.status(500).json({ message: 'government 업종이 설정되지 않았습니다.' })
          return
        }
        const row = await pool.query(
          `
          SELECT t.id::text AS id, t.code
          FROM tenants t
          INNER JOIN industries i ON i.id = t.industry_id
          WHERE t.id::text = $1 AND LOWER(TRIM(i.code)) = $2
          LIMIT 1
          `,
          [tenantId, GOVERNMENT_INDUSTRY_CODE],
        )
        if ((row.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '대행사를 찾을 수 없습니다.' })
          return
        }
        const agencyCode = String(row.rows[0].code ?? '')
        await ensureGovernmentTenantRegistrationCode(pool, { agencyCode, tenantId })
        res.json({
          success: true,
          data: { tenantId, agencyCode },
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.get('/government-support/admin/users', ...requireGovernmentUserManager, async (req, res) => {
    try {
      const ctx = req.platformContext
      const scope = await resolveGovernmentUserManagerScope(pool, ctx)
      if (!scope.ok) {
        res.status(scope.status).json({ message: scope.message })
        return
      }
      const rows = await listGovernmentAdminUsers(pool, scope, {
        role: req.query.role,
        tenantId: req.query.tenantId ?? req.query.tenant_id ?? req.query.agencyId,
        status: req.query.status,
        q: req.query.q ?? req.query.search,
      })
      res.json({ success: true, data: rows })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/admin/users', ...requireGovernmentUserManager, async (req, res) => {
    try {
      const ctx = req.platformContext
      const scope = await resolveGovernmentUserManagerScope(pool, ctx)
      if (!scope.ok) {
        res.status(scope.status).json({ message: scope.message })
        return
      }
      const result = await createGovernmentAdminUser(pool, scope, req.body ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.status(201).json({ success: true, data: result.user })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/admin/users/:userId', ...requireGovernmentUserManager, async (req, res) => {
    try {
      const userId = String(req.params.userId ?? '').trim()
      if (!userId) {
        res.status(400).json({ message: '잘못된 사용자 ID입니다.' })
        return
      }
      const ctx = req.platformContext
      const scope = await resolveGovernmentUserManagerScope(pool, ctx)
      if (!scope.ok) {
        res.status(scope.status).json({ message: scope.message })
        return
      }
      const result = await patchGovernmentAdminUser(pool, scope, userId, req.body ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.user })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post(
    '/government-support/admin/users/:userId/reset-password',
    ...requireGovernmentUserManager,
    async (req, res) => {
      try {
        const userId = String(req.params.userId ?? '').trim()
        if (!userId) {
          res.status(400).json({ message: '잘못된 사용자 ID입니다.' })
          return
        }
        const ctx = req.platformContext
        const scope = await resolveGovernmentUserManagerScope(pool, ctx)
        if (!scope.ok) {
          res.status(scope.status).json({ message: scope.message })
          return
        }
        const result = await resetGovernmentAdminUserPassword(pool, scope, userId, req.body ?? {})
        if (!result.ok) {
          res.status(result.status).json({ message: result.message })
          return
        }
        res.json({ success: true, message: result.message })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.get('/government-support/profiles', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const scope = await resolveGovernmentProfileQueryScope(pool, ctx)
      if (!scope.ok) {
        res.status(scope.status).json({ message: scope.message })
        return
      }
      if (scope.tenantIds.length === 0) {
        res.json({ success: true, data: [] })
        return
      }
      const r = await pool.query(
        `
        SELECT * FROM gov_support_profiles
        WHERE tenant_id = ANY($1::bigint[])
          AND owner_user_id IS NOT NULL
          AND ($2::text IS NULL OR owner_user_id = $2::text)
        ORDER BY updated_at DESC, id DESC
        `,
        [scope.tenantIds, scope.ownerUserId],
      )
      res.json({ success: true, data: r.rows.map(mapGovSupportProfileRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/admin/program-users/:userId', ...requireGovernmentUserManager, async (req, res) => {
    try {
      const ctx = req.platformContext
      const userId = String(req.params.userId ?? '').trim()
      const result = await getProgramUserDetailForManager(pool, ctx, userId)
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get(
    '/government-support/admin/program-users/:userId/profiles',
    ...requireGovernmentUserManager,
    async (req, res) => {
      try {
        res.status(403).json({
          message:
            '사업장/고객 상세 목록은 담당 배정 후에만 열람할 수 있습니다. (assignment 테이블 예정)',
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.post('/government-support/profiles', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!canCreateGovernmentProfile(ctx)) {
        res.status(403).json({
          message: '사업장/고객은 기관 코드로 가입한 이용자만 등록할 수 있습니다.',
        })
        return
      }
      const body = req.body ?? {}
      const requestedTenantId = body.tenantId ?? body.tenant_id ?? null
      const resolved = await resolveTenantIdForProfileCreate(pool, ctx, requestedTenantId)
      if (!resolved.ok) {
        res.status(resolved.status).json({ message: resolved.message })
        return
      }
      const tenantId = resolved.tenantId
      const pairs = profilePatchFromBody(body)
      const cols = ['tenant_id', ...pairs.map((p) => p[0])]
      const vals = [tenantId, ...pairs.map((p) => p[1])]
      if (isGovernmentProgramUser(ctx)) {
        cols.push('owner_user_id')
        vals.push(ctx.userId)
      }
      const placeholders = vals.map((_, i) => `$${i + 1}`)
      const r = await pool.query(
        `INSERT INTO gov_support_profiles (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals,
      )
      res.status(201).json({ success: true, data: mapGovSupportProfileRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const id = String(req.params.profileId ?? '').trim()
      const r = await pool.query(`SELECT * FROM gov_support_profiles WHERE id = $1::bigint LIMIT 1`, [id])
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      const row = r.rows[0]
      if (!canAccessGovernmentProfile(ctx, row)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      res.json({ success: true, data: mapGovSupportProfileRow(row) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/profiles/:profileId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const id = String(req.params.profileId ?? '').trim()
      const existing = await pool.query(
        `SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`,
        [id],
      )
      if ((existing.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, existing.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const pairs = profilePatchFromBody(req.body ?? {})
      if (pairs.length === 0) {
        res.status(400).json({ message: '수정할 필드가 없습니다.' })
        return
      }
      const sets = pairs.map((p, i) => `${p[0]} = $${i + 2}`)
      const vals = pairs.map((p) => p[1])
      const r = await pool.query(
        `UPDATE gov_support_profiles SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1::bigint RETURNING *`,
        [id, ...vals],
      )
      res.json({ success: true, data: mapGovSupportProfileRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/prior-loans', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `SELECT * FROM gov_support_prior_loans WHERE profile_id = $1::bigint ORDER BY id ASC`,
        [profileId],
      )
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: String(row.id),
          profileId: String(row.profile_id),
          tenantId: String(row.tenant_id),
          hasPrior: String(row.has_prior ?? ''),
          lenderName: String(row.lender_name ?? ''),
          remainingAmount: String(row.remaining_amount ?? ''),
          receivedAt: String(row.received_at ?? ''),
          policyIncluded: String(row.policy_included ?? ''),
          memo: String(row.memo ?? ''),
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/prior-loans', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const b = req.body ?? {}
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const tenantId = pr.rows[0].tenant_id
      const r = await pool.query(
        `
        INSERT INTO gov_support_prior_loans (
          tenant_id, profile_id, has_prior, lender_name, remaining_amount, received_at, policy_included, memo
        ) VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          tenantId,
          profileId,
          String(b.hasPrior ?? b.has_prior ?? ''),
          String(b.lenderName ?? b.lender_name ?? ''),
          String(b.remainingAmount ?? b.remaining_amount ?? ''),
          String(b.receivedAt ?? b.received_at ?? ''),
          String(b.policyIncluded ?? b.policy_included ?? ''),
          String(b.memo ?? ''),
        ],
      )
      res.status(201).json({ success: true, data: { id: String(r.rows[0].id) } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/prior-loans/:loanId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const loanId = String(req.params.loanId ?? '').trim()
      const b = req.body ?? {}
      const accessRow = await loadProfileAccessRowByPriorLoanId(pool, loanId)
      if (!accessRow) {
        res.status(404).json({ message: '기대출 항목을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, accessRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `
        UPDATE gov_support_prior_loans SET
          has_prior = COALESCE($2, has_prior),
          lender_name = COALESCE($3, lender_name),
          remaining_amount = COALESCE($4, remaining_amount),
          received_at = COALESCE($5, received_at),
          policy_included = COALESCE($6, policy_included),
          memo = COALESCE($7, memo),
          updated_at = NOW()
        WHERE id = $1::bigint
        RETURNING *
        `,
        [
          loanId,
          b.hasPrior != null ? String(b.hasPrior) : null,
          b.lenderName != null ? String(b.lenderName) : null,
          b.remainingAmount != null ? String(b.remainingAmount) : null,
          b.receivedAt != null ? String(b.receivedAt) : null,
          b.policyIncluded != null ? String(b.policyIncluded) : null,
          b.memo != null ? String(b.memo) : null,
        ],
      )
      const row = r.rows[0]
      res.json({
        success: true,
        data: {
          id: String(row.id),
          lenderName: String(row.lender_name ?? ''),
          remainingAmount: String(row.remaining_amount ?? ''),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.delete('/government-support/prior-loans/:loanId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const loanId = String(req.params.loanId ?? '').trim()
      const accessRow = await loadProfileAccessRowByPriorLoanId(pool, loanId)
      if (!accessRow) {
        res.status(404).json({ message: '기대출 항목을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, accessRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      await pool.query(`DELETE FROM gov_support_prior_loans WHERE id = $1::bigint`, [loanId])
      res.status(204).send()
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/application-cases', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `SELECT * FROM gov_support_application_cases WHERE profile_id = $1::bigint ORDER BY id DESC`,
        [profileId],
      )
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: String(row.id),
          profileId: String(row.profile_id),
          tenantId: String(row.tenant_id),
          productName: String(row.product_name ?? ''),
          availableProduct: String(row.available_product ?? ''),
          progressStatus: String(row.progress_status ?? ''),
          scheduleAt: String(row.schedule_at ?? ''),
          agencyOrg: String(row.agency_org ?? ''),
          assigneeUserId: row.assignee_user_id != null ? String(row.assignee_user_id) : null,
          requiredFunds: String(row.required_funds ?? ''),
          fee: String(row.fee ?? ''),
          certDelegate: String(row.cert_delegate ?? ''),
          specialNote: String(row.special_note ?? ''),
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/application-cases', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const b = req.body ?? {}
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const tenantId = pr.rows[0].tenant_id
      const r = await pool.query(
        `
        INSERT INTO gov_support_application_cases (
          tenant_id, profile_id, product_name, available_product, progress_status,
          schedule_at, agency_org, assignee_user_id, required_funds, fee, cert_delegate, special_note
        ) VALUES ($1::bigint,$2::bigint,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
        `,
        [
          tenantId,
          profileId,
          String(b.productName ?? b.product_name ?? ''),
          String(b.availableProduct ?? b.available_product ?? ''),
          String(b.progressStatus ?? b.progress_status ?? '상담 접수'),
          String(b.scheduleAt ?? b.schedule_at ?? ''),
          String(b.agencyOrg ?? b.agency_org ?? ''),
          b.assigneeUserId ?? b.assignee_user_id ?? null,
          String(b.requiredFunds ?? b.required_funds ?? ''),
          String(b.fee ?? ''),
          String(b.certDelegate ?? b.cert_delegate ?? ''),
          String(b.specialNote ?? b.special_note ?? ''),
        ],
      )
      res.status(201).json({ success: true, data: { id: String(r.rows[0].id), progressStatus: String(r.rows[0].progress_status) } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/application-cases/:caseId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const caseId = String(req.params.caseId ?? '').trim()
      const b = req.body ?? {}
      const accessRow = await loadProfileAccessRowByApplicationCaseId(pool, caseId)
      if (!accessRow) {
        res.status(404).json({ message: '신청/청약 건을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, accessRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `
        UPDATE gov_support_application_cases SET
          product_name = COALESCE($2, product_name),
          available_product = COALESCE($3, available_product),
          progress_status = COALESCE($4, progress_status),
          schedule_at = COALESCE($5, schedule_at),
          agency_org = COALESCE($6, agency_org),
          required_funds = COALESCE($7, required_funds),
          fee = COALESCE($8, fee),
          cert_delegate = COALESCE($9, cert_delegate),
          special_note = COALESCE($10, special_note),
          updated_at = NOW()
        WHERE id = $1::bigint
        RETURNING *
        `,
        [
          caseId,
          b.productName ?? b.product_name ?? null,
          b.availableProduct ?? b.available_product ?? null,
          b.progressStatus ?? b.progress_status ?? null,
          b.scheduleAt ?? b.schedule_at ?? null,
          b.agencyOrg ?? b.agency_org ?? null,
          b.requiredFunds ?? b.required_funds ?? null,
          b.fee ?? null,
          b.certDelegate ?? b.cert_delegate ?? null,
          b.specialNote ?? b.special_note ?? null,
        ],
      )
      res.json({ success: true, data: { id: String(r.rows[0].id), progressStatus: String(r.rows[0].progress_status) } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/edoc-links', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `SELECT * FROM gov_support_edoc_links WHERE profile_id = $1::bigint ORDER BY id DESC`,
        [profileId],
      )
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: String(row.id),
          documentName: String(row.document_name ?? ''),
          sentAt: row.sent_at,
          recipient: String(row.recipient ?? ''),
          signStatus: String(row.sign_status ?? ''),
          completedAt: row.completed_at,
          applicationCaseId: row.application_case_id != null ? String(row.application_case_id) : null,
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/edoc-links', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const b = req.body ?? {}
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      const tenantId = pr.rows[0].tenant_id
      if (!canAccessGovernmentTenant(ctx, tenantId)) {
        res.status(403).json({ message: 'tenant 접근 권한이 없습니다.' })
        return
      }
      const rawCaseId = b.applicationCaseId ?? b.application_case_id ?? null
      let applicationCaseId = null
      if (rawCaseId != null && String(rawCaseId).trim() !== '') {
        const caseId = String(rawCaseId).trim()
        const ac = await pool.query(
          `SELECT id FROM gov_support_application_cases WHERE id = $1::bigint AND profile_id = $2::bigint LIMIT 1`,
          [caseId, profileId],
        )
        if ((ac.rowCount ?? 0) === 0) {
          res.status(400).json({ message: '신청/청약 건이 프로필과 일치하지 않습니다.' })
          return
        }
        applicationCaseId = caseId
      }
      const r = await pool.query(
        `
        INSERT INTO gov_support_edoc_links (
          tenant_id, profile_id, application_case_id, document_name, recipient, sign_status
        ) VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6)
        RETURNING *
        `,
        [
          tenantId,
          profileId,
          applicationCaseId,
          String(b.documentName ?? b.document_name ?? '정부지원 전자문서'),
          String(b.recipient ?? ''),
          String(b.signStatus ?? b.sign_status ?? '대기'),
        ],
      )
      res.status(201).json({ success: true, data: { id: String(r.rows[0].id) } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/documents', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const pr = await pool.query(`SELECT tenant_id, owner_user_id FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      let r = await pool.query(
        `SELECT * FROM gov_support_document_items WHERE profile_id = $1::bigint ORDER BY id ASC`,
        [profileId],
      )
      if ((r.rowCount ?? 0) === 0) {
        for (const docType of [
          '사업자등록증',
          '부가세 신고자료',
          '소득금액증명원',
          '국세 완납증명서',
          '지방세 완납증명서',
          '통장 사본',
          '임대차계약서',
          '기타 서류',
        ]) {
          await pool.query(
            `INSERT INTO gov_support_document_items (tenant_id, profile_id, doc_type, status)
             VALUES ($1::bigint, $2::bigint, $3, '요청 전')`,
            [pr.rows[0].tenant_id, profileId, docType],
          )
        }
        r = await pool.query(
          `SELECT * FROM gov_support_document_items WHERE profile_id = $1::bigint ORDER BY id ASC`,
          [profileId],
        )
      }
      res.json({
        success: true,
        data: r.rows.map((row) => ({
          id: String(row.id),
          docType: String(row.doc_type ?? ''),
          status: String(row.status ?? ''),
          storageKey: row.storage_key != null ? String(row.storage_key) : null,
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/documents/:docId', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const docId = String(req.params.docId ?? '').trim()
      const b = req.body ?? {}
      const accessRow = await loadProfileAccessRowByDocumentId(pool, docId)
      if (!accessRow) {
        res.status(404).json({ message: '서류 항목을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, accessRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `UPDATE gov_support_document_items SET status = COALESCE($2, status), storage_key = COALESCE($3, storage_key), updated_at = NOW() WHERE id = $1::bigint RETURNING *`,
        [docId, b.status ?? null, b.storageKey ?? b.storage_key ?? null],
      )
      res.json({ success: true, data: { id: String(r.rows[0].id), status: String(r.rows[0].status) } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/pdf-mapping', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const profileId = String(req.params.profileId ?? '').trim()
      const caseId = req.query.applicationCaseId != null ? String(req.query.applicationCaseId) : null
      const pr = await pool.query(`SELECT * FROM gov_support_profiles WHERE id = $1::bigint`, [profileId])
      if ((pr.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, pr.rows[0])) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      let caseRow = null
      if (caseId) {
        const cr = await pool.query(
          `SELECT * FROM gov_support_application_cases WHERE id = $1::bigint AND profile_id = $2::bigint LIMIT 1`,
          [caseId, profileId],
        )
        if ((cr.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '신청/청약 건을 찾을 수 없습니다.' })
          return
        }
        caseRow = cr.rows[0]
      }
      const p = mapGovSupportProfileRow(pr.rows[0])
      const mapping = buildGovernmentPdfFieldMapping(p, caseRow)
      res.json({ success: true, data: { mapping } })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/profiles/:profileId/memos', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '메모는 프로그램 이용자만 조회할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const r = await pool.query(
        `
        SELECT *
        FROM gov_support_profile_memos
        WHERE profile_id = $1::bigint AND archived_at IS NULL
        ORDER BY created_at DESC, id DESC
        `,
        [profileId],
      )
      res.json({ success: true, data: r.rows.map(mapGovSupportProfileMemoRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/memos', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '메모는 프로그램 이용자만 작성할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const body = req.body ?? {}
      const normalized = normalizeGovProfileMemoContent(body.content ?? body.memo ?? body.text)
      if (!normalized.ok) {
        res.status(normalized.status).json({ message: normalized.message })
        return
      }
      const ownerUserId = String(profileRow.owner_user_id ?? ctx.userId)
      const r = await pool.query(
        `
        INSERT INTO gov_support_profile_memos (
          profile_id, owner_user_id, content, created_by_user_id, updated_by_user_id
        ) VALUES ($1::bigint, $2, $3, $4, $4)
        RETURNING *
        `,
        [profileId, ownerUserId, normalized.content, ctx.userId],
      )
      res.status(201).json({ success: true, data: mapGovSupportProfileMemoRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch(
    '/government-support/profiles/:profileId/memos/:memoId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '메모는 프로그램 이용자만 수정할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const memoId = String(req.params.memoId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const memoAccess = await loadProfileAccessRowByMemoId(pool, memoId)
        if (!memoAccess) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, memoAccess)) {
          res.status(403).json({ message: '메모 접근 권한이 없습니다.' })
          return
        }
        if (memoAccess.archived_at != null) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        const body = req.body ?? {}
        const normalized = normalizeGovProfileMemoContent(body.content ?? body.memo ?? body.text)
        if (!normalized.ok) {
          res.status(normalized.status).json({ message: normalized.message })
          return
        }
        const r = await pool.query(
          `
          UPDATE gov_support_profile_memos
          SET content = $3, updated_by_user_id = $4, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING *
          `,
          [memoId, profileId, normalized.content, ctx.userId],
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: mapGovSupportProfileMemoRow(r.rows[0]) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.delete(
    '/government-support/profiles/:profileId/memos/:memoId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '메모는 프로그램 이용자만 삭제할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const memoId = String(req.params.memoId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const memoAccess = await loadProfileAccessRowByMemoId(pool, memoId)
        if (!memoAccess) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, memoAccess)) {
          res.status(403).json({ message: '메모 접근 권한이 없습니다.' })
          return
        }
        if (memoAccess.archived_at != null) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        const r = await pool.query(
          `
          UPDATE gov_support_profile_memos
          SET archived_at = NOW(), updated_by_user_id = $3, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING id
          `,
          [memoId, profileId, ctx.userId],
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '메모를 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: { id: String(r.rows[0].id) } })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.get('/government-support/profiles/:profileId/consultations', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '상담 이력은 프로그램 이용자만 조회할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
      const offset = Math.max(Number(req.query.offset) || 0, 0)
      const r = await pool.query(
        `
        SELECT *
        FROM gov_support_profile_consultations
        WHERE profile_id = $1::bigint AND archived_at IS NULL
        ORDER BY consulted_at DESC NULLS LAST, created_at DESC, id DESC
        LIMIT $2 OFFSET $3
        `,
        [profileId, limit, offset],
      )
      res.json({ success: true, data: r.rows.map(mapGovSupportProfileConsultationRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/consultations', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '상담 이력은 프로그램 이용자만 작성할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const parsed = parseGovProfileConsultationPatchBody(req.body ?? {}, { requireContent: true })
      if (!parsed.ok) {
        res.status(parsed.status).json({ message: parsed.message })
        return
      }
      const { patch } = parsed
      const ownerUserId = String(profileRow.owner_user_id ?? ctx.userId)
      const r = await pool.query(
        `
        INSERT INTO gov_support_profile_consultations (
          profile_id, owner_user_id, content, consulted_at,
          consultation_type, title, status,
          created_by_user_id, updated_by_user_id
        ) VALUES ($1::bigint, $2, $3, $4::date, $5, $6, $7, $8, $8)
        RETURNING *
        `,
        [
          profileId,
          ownerUserId,
          patch.content,
          patch.consultedAt,
          patch.consultationType ?? '',
          patch.title ?? '',
          patch.status ?? '',
          ctx.userId,
        ],
      )
      res.status(201).json({ success: true, data: mapGovSupportProfileConsultationRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch(
    '/government-support/profiles/:profileId/consultations/:consultationId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '상담 이력은 프로그램 이용자만 수정할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const consultationId = String(req.params.consultationId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const consultAccess = await loadProfileAccessRowByConsultationId(pool, consultationId)
        if (!consultAccess) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, consultAccess)) {
          res.status(403).json({ message: '상담 접근 권한이 없습니다.' })
          return
        }
        if (consultAccess.archived_at != null) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        const parsed = parseGovProfileConsultationPatchBody(req.body ?? {}, { requireContent: false })
        if (!parsed.ok) {
          res.status(parsed.status).json({ message: parsed.message })
          return
        }
        const { patch } = parsed
        /** @type {string[]} */
        const sets = []
        /** @type {unknown[]} */
        const vals = [consultationId, profileId]
        let idx = 3
        if (patch.content != null) {
          sets.push(`content = $${idx}`)
          vals.push(patch.content)
          idx += 1
        }
        if (patch.consultedAt != null) {
          sets.push(`consulted_at = $${idx}::date`)
          vals.push(patch.consultedAt)
          idx += 1
        }
        if (patch.consultationType != null) {
          sets.push(`consultation_type = $${idx}`)
          vals.push(patch.consultationType)
          idx += 1
        }
        if (patch.title != null) {
          sets.push(`title = $${idx}`)
          vals.push(patch.title)
          idx += 1
        }
        if (patch.status != null) {
          sets.push(`status = $${idx}`)
          vals.push(patch.status)
          idx += 1
        }
        sets.push(`updated_by_user_id = $${idx}`)
        vals.push(ctx.userId)
        idx += 1
        const r = await pool.query(
          `
          UPDATE gov_support_profile_consultations
          SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING *
          `,
          vals,
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: mapGovSupportProfileConsultationRow(r.rows[0]) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.delete(
    '/government-support/profiles/:profileId/consultations/:consultationId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '상담 이력은 프로그램 이용자만 삭제할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const consultationId = String(req.params.consultationId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const consultAccess = await loadProfileAccessRowByConsultationId(pool, consultationId)
        if (!consultAccess) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, consultAccess)) {
          res.status(403).json({ message: '상담 접근 권한이 없습니다.' })
          return
        }
        if (consultAccess.archived_at != null) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        const r = await pool.query(
          `
          UPDATE gov_support_profile_consultations
          SET archived_at = NOW(), updated_by_user_id = $3, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING id
          `,
          [consultationId, profileId, ctx.userId],
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '상담 기록을 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: { id: String(r.rows[0].id), ok: true } })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.get('/government-support/profiles/:profileId/progress', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '진행상황은 프로그램 이용자만 조회할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
      const offset = Math.max(Number(req.query.offset) || 0, 0)
      const r = await pool.query(
        `
        SELECT *
        FROM gov_support_profile_progress_events
        WHERE profile_id = $1::bigint AND archived_at IS NULL
        ORDER BY event_date DESC NULLS LAST, created_at DESC, id DESC
        LIMIT $2 OFFSET $3
        `,
        [profileId, limit, offset],
      )
      res.json({ success: true, data: r.rows.map(mapGovSupportProfileProgressEventRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/progress', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      if (!isGovernmentProgramUser(ctx)) {
        res.status(403).json({ message: '진행상황은 프로그램 이용자만 작성할 수 있습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
      if (!profileRow) {
        res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, profileRow)) {
        res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
        return
      }
      const parsed = parseGovProfileProgressPatchBody(req.body ?? {}, {
        requireContent: true,
        requireStatus: true,
      })
      if (!parsed.ok) {
        res.status(parsed.status).json({ message: parsed.message })
        return
      }
      const { patch } = parsed
      const ownerUserId = String(profileRow.owner_user_id ?? ctx.userId)
      const r = await pool.query(
        `
        INSERT INTO gov_support_profile_progress_events (
          profile_id, owner_user_id, status, title, content, event_date,
          created_by_user_id, updated_by_user_id
        ) VALUES ($1::bigint, $2, $3, $4, $5, $6::date, $7, $7)
        RETURNING *
        `,
        [
          profileId,
          ownerUserId,
          patch.status,
          patch.title ?? '',
          patch.content,
          patch.eventDate,
          ctx.userId,
        ],
      )
      await syncGovProfileProgressStatus(pool, profileId, patch.status ?? '')
      res.status(201).json({ success: true, data: mapGovSupportProfileProgressEventRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch(
    '/government-support/profiles/:profileId/progress/:progressId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '진행상황은 프로그램 이용자만 수정할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const progressId = String(req.params.progressId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const progressAccess = await loadProfileAccessRowByProgressEventId(pool, progressId)
        if (!progressAccess) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, progressAccess)) {
          res.status(403).json({ message: '진행상황 접근 권한이 없습니다.' })
          return
        }
        if (progressAccess.archived_at != null) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        const parsed = parseGovProfileProgressPatchBody(req.body ?? {}, {
          requireContent: false,
          requireStatus: false,
        })
        if (!parsed.ok) {
          res.status(parsed.status).json({ message: parsed.message })
          return
        }
        const { patch } = parsed
        /** @type {string[]} */
        const sets = []
        /** @type {unknown[]} */
        const vals = [progressId, profileId]
        let idx = 3
        if (patch.status != null) {
          sets.push(`status = $${idx}`)
          vals.push(patch.status)
          idx += 1
        }
        if (patch.title != null) {
          sets.push(`title = $${idx}`)
          vals.push(patch.title)
          idx += 1
        }
        if (patch.content != null) {
          sets.push(`content = $${idx}`)
          vals.push(patch.content)
          idx += 1
        }
        if (patch.eventDate != null) {
          sets.push(`event_date = $${idx}::date`)
          vals.push(patch.eventDate)
          idx += 1
        }
        sets.push(`updated_by_user_id = $${idx}`)
        vals.push(ctx.userId)
        idx += 1
        const r = await pool.query(
          `
          UPDATE gov_support_profile_progress_events
          SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING *
          `,
          vals,
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        if (patch.status != null) {
          await syncGovProfileProgressStatus(pool, profileId, patch.status)
        }
        res.json({ success: true, data: mapGovSupportProfileProgressEventRow(r.rows[0]) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.delete(
    '/government-support/profiles/:profileId/progress/:progressId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const ctx = req.platformContext
        if (!isGovernmentProgramUser(ctx)) {
          res.status(403).json({ message: '진행상황은 프로그램 이용자만 삭제할 수 있습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const progressId = String(req.params.progressId ?? '').trim()
        const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
        if (!profileRow) {
          res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, profileRow)) {
          res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
          return
        }
        const progressAccess = await loadProfileAccessRowByProgressEventId(pool, progressId)
        if (!progressAccess) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, progressAccess)) {
          res.status(403).json({ message: '진행상황 접근 권한이 없습니다.' })
          return
        }
        if (progressAccess.archived_at != null) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        const r = await pool.query(
          `
          UPDATE gov_support_profile_progress_events
          SET archived_at = NOW(), updated_by_user_id = $3, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
          RETURNING id
          `,
          [progressId, profileId, ctx.userId],
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '진행 이력을 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: { id: String(r.rows[0].id), ok: true } })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  async function requireGovProfileFileAccess(req, res, profileId) {
    const ctx = req.platformContext
    if (!isGovernmentProgramUser(ctx)) {
      res.status(403).json({ message: '서류/첨부는 프로그램 이용자만 이용할 수 있습니다.' })
      return null
    }
    const profileRow = await loadGovernmentProfileAccessRow(pool, profileId)
    if (!profileRow) {
      res.status(404).json({ message: '프로필을 찾을 수 없습니다.' })
      return null
    }
    if (!canAccessGovernmentProfile(ctx, profileRow)) {
      res.status(403).json({ message: '프로필 접근 권한이 없습니다.' })
      return null
    }
    return { ctx, profileRow }
  }

  router.get('/government-support/profiles/:profileId/files', ...requireGovernmentMember, async (req, res) => {
    try {
      const profileId = String(req.params.profileId ?? '').trim()
      const access = await requireGovProfileFileAccess(req, res, profileId)
      if (!access) return
      const r = await pool.query(
        `
        SELECT *
        FROM gov_support_profile_files
        WHERE profile_id = $1::bigint AND archived_at IS NULL AND upload_status = 'active'
        ORDER BY created_at DESC, id DESC
        `,
        [profileId],
      )
      res.json({ success: true, data: r.rows.map(mapGovSupportProfileFileRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/files/presign', ...requireGovernmentMember, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const profileId = String(req.params.profileId ?? '').trim()
      const access = await requireGovProfileFileAccess(req, res, profileId)
      if (!access) return
      const { ctx, profileRow } = access
      const body = req.body ?? {}
      const fileName = normalizeGovProfileFileName(body.fileName ?? body.file_name ?? '')
      const contentType = resolveGovProfileFileContentType(body.contentType ?? body.content_type ?? body.mimeType)
      const sizeBytes = Number(body.sizeBytes ?? body.size ?? body.fileSize ?? 0)
      if (!isValidGovProfileFileName(fileName)) {
        res.status(400).json({ message: '파일 이름이 올바르지 않습니다.' })
        return
      }
      if (GOV_PROFILE_FILE_BLOCKED_MIME.has(contentType) || !GOV_PROFILE_FILE_ALLOWED_MIME.has(contentType)) {
        res.status(400).json({ message: '파일 형식 오류' })
        return
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > GOV_PROFILE_FILE_MAX_BYTES) {
        res.status(400).json({ message: '용량 초과' })
        return
      }
      const ownerUserId = String(profileRow.owner_user_id ?? ctx.userId)
      const category = String(body.category ?? '').trim().slice(0, 80)
      const description = String(body.description ?? '').trim().slice(0, 2000)
      const ins = await pool.query(
        `
        INSERT INTO gov_support_profile_files (
          profile_id, owner_user_id, file_name, file_key, file_size, mime_type,
          category, description, upload_status, created_by_user_id, updated_by_user_id
        ) VALUES ($1::bigint, $2, $3, '', $4, $5, $6, $7, 'uploading', $8, $8)
        RETURNING id
        `,
        [profileId, ownerUserId, fileName, sizeBytes, contentType, category, description, ctx.userId],
      )
      const fileId = String(ins.rows[0].id)
      const objectKey = buildGovernmentProfileFileObjectKey({
        ownerUserId,
        profileId,
        fileId,
        fileName,
      })
      await pool.query(
        `UPDATE gov_support_profile_files SET file_key = $2, updated_at = NOW() WHERE id = $1::bigint`,
        [fileId, objectKey],
      )
      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
      if (!uploadUrl) {
        await pool.query(`DELETE FROM gov_support_profile_files WHERE id = $1::bigint AND upload_status = 'uploading'`, [
          fileId,
        ])
        res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
        return
      }
      const putHeaders = cacheControl ? { 'Cache-Control': cacheControl } : {}
      res.status(201).json({
        success: true,
        data: {
          id: fileId,
          fileId,
          uploadUrl,
          objectKey,
          fileKey: objectKey,
          putHeaders,
          fileName,
          profileId,
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/profiles/:profileId/files', ...requireGovernmentMember, async (req, res) => {
    try {
      const profileId = String(req.params.profileId ?? '').trim()
      const access = await requireGovProfileFileAccess(req, res, profileId)
      if (!access) return
      const { ctx } = access
      const body = req.body ?? {}
      const fileId = String(body.fileId ?? body.id ?? '').trim()
      const objectKey = String(body.objectKey ?? body.fileKey ?? body.file_key ?? '').trim()
      const fileName = normalizeGovProfileFileName(body.fileName ?? body.file_name ?? body.displayName ?? '')
      const fileSize = Number(body.size ?? body.fileSize ?? body.file_size ?? 0)
      const mimeType = resolveGovProfileFileContentType(body.mimeType ?? body.mime_type ?? body.contentType)
      if (!fileId) {
        res.status(400).json({ message: 'fileId가 필요합니다.' })
        return
      }
      if (!objectKey) {
        res.status(400).json({ message: 'object key가 필요합니다.' })
        return
      }
      if (!isValidGovProfileFileName(fileName)) {
        res.status(400).json({ message: '파일 이름이 올바르지 않습니다.' })
        return
      }
      const fileAccess = await loadProfileAccessRowByFileId(pool, fileId)
      if (!fileAccess || String(fileAccess.profile_id) !== profileId) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (!canAccessGovernmentProfile(ctx, fileAccess)) {
        res.status(403).json({ message: '파일 접근 권한이 없습니다.' })
        return
      }
      if (fileAccess.archived_at != null) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      if (String(fileAccess.upload_status ?? '') !== 'uploading') {
        res.status(409).json({ message: '이미 등록된 파일입니다.' })
        return
      }
      if (
        !assertGovernmentProfileFileObjectKey(objectKey, {
          ownerUserId: String(fileAccess.owner_user_id ?? ''),
          profileId,
          fileId,
        })
      ) {
        res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
        return
      }
      if (String(fileAccess.file_key ?? '').trim() !== objectKey) {
        res.status(400).json({ message: 'object key가 presign 시점과 일치하지 않습니다.' })
        return
      }
      const rowSize = Number(fileAccess.file_size ?? 0)
      if (!Number.isFinite(fileSize) || fileSize !== rowSize) {
        res.status(400).json({ message: '파일 크기가 presign 시점과 일치하지 않습니다.' })
        return
      }
      if (GOV_PROFILE_FILE_BLOCKED_MIME.has(mimeType) || !GOV_PROFILE_FILE_ALLOWED_MIME.has(mimeType)) {
        res.status(400).json({ message: '파일 형식 오류' })
        return
      }
      const r = await pool.query(
        `
        UPDATE gov_support_profile_files
        SET file_name = $3, upload_status = 'active', updated_by_user_id = $4, updated_at = NOW()
        WHERE id = $1::bigint AND profile_id = $2::bigint AND upload_status = 'uploading' AND archived_at IS NULL
        RETURNING *
        `,
        [fileId, profileId, fileName, ctx.userId],
      )
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      res.status(201).json({ success: true, data: mapGovSupportProfileFileRow(r.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get(
    '/government-support/profiles/:profileId/files/:fileId/download',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        if (!isConsentR2Enabled()) {
          logR2EnvDiagnosticCheck()
          res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
          return
        }
        const profileId = String(req.params.profileId ?? '').trim()
        const fileId = String(req.params.fileId ?? '').trim()
        const access = await requireGovProfileFileAccess(req, res, profileId)
        if (!access) return
        const { ctx } = access
        const fileAccess = await loadProfileAccessRowByFileId(pool, fileId)
        if (!fileAccess || String(fileAccess.profile_id) !== profileId) {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, fileAccess)) {
          res.status(403).json({ message: '파일 접근 권한이 없습니다.' })
          return
        }
        if (fileAccess.archived_at != null || String(fileAccess.upload_status ?? '') !== 'active') {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        const fileKey = String(fileAccess.file_key ?? '').trim()
        if (
          !assertGovernmentProfileFileObjectKey(fileKey, {
            ownerUserId: String(fileAccess.owner_user_id ?? ''),
            profileId,
            fileId,
          })
        ) {
          res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
          return
        }
        const downloadUrl = await consentGetSignedDownloadUrl(fileKey, 900)
        if (!downloadUrl) {
          res.status(503).json({ message: '다운로드 URL을 만들 수 없습니다.' })
          return
        }
        res.json({ success: true, data: { downloadUrl, url: downloadUrl } })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.patch(
    '/government-support/profiles/:profileId/files/:fileId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const profileId = String(req.params.profileId ?? '').trim()
        const fileId = String(req.params.fileId ?? '').trim()
        const access = await requireGovProfileFileAccess(req, res, profileId)
        if (!access) return
        const { ctx } = access
        const fileAccess = await loadProfileAccessRowByFileId(pool, fileId)
        if (!fileAccess || String(fileAccess.profile_id) !== profileId) {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, fileAccess)) {
          res.status(403).json({ message: '파일 접근 권한이 없습니다.' })
          return
        }
        if (fileAccess.archived_at != null || String(fileAccess.upload_status ?? '') !== 'active') {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        const parsed = parseGovProfileFilePatchBody(req.body ?? {})
        if (!parsed.ok) {
          res.status(parsed.status).json({ message: parsed.message })
          return
        }
        const { patch } = parsed
        /** @type {string[]} */
        const sets = []
        /** @type {unknown[]} */
        const vals = [fileId, profileId]
        let idx = 3
        if (patch.fileName != null) {
          sets.push(`file_name = $${idx}`)
          vals.push(patch.fileName)
          idx += 1
        }
        if (patch.description != null) {
          sets.push(`description = $${idx}`)
          vals.push(patch.description)
          idx += 1
        }
        if (patch.category != null) {
          sets.push(`category = $${idx}`)
          vals.push(patch.category)
          idx += 1
        }
        sets.push(`updated_by_user_id = $${idx}`)
        vals.push(ctx.userId)
        const r = await pool.query(
          `
          UPDATE gov_support_profile_files
          SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL AND upload_status = 'active'
          RETURNING *
          `,
          vals,
        )
        if ((r.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        res.json({ success: true, data: mapGovSupportProfileFileRow(r.rows[0]) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  router.delete(
    '/government-support/profiles/:profileId/files/:fileId',
    ...requireGovernmentMember,
    async (req, res) => {
      try {
        const profileId = String(req.params.profileId ?? '').trim()
        const fileId = String(req.params.fileId ?? '').trim()
        const access = await requireGovProfileFileAccess(req, res, profileId)
        if (!access) return
        const { ctx } = access
        const fileAccess = await loadProfileAccessRowByFileId(pool, fileId)
        if (!fileAccess || String(fileAccess.profile_id) !== profileId) {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        if (!canAccessGovernmentProfile(ctx, fileAccess)) {
          res.status(403).json({ message: '파일 접근 권한이 없습니다.' })
          return
        }
        if (fileAccess.archived_at != null) {
          res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
          return
        }
        const fileKey = String(fileAccess.file_key ?? '').trim()
        if (fileKey && isConsentR2Enabled()) {
          try {
            await r2DeleteObject(fileKey)
          } catch {
            /* best effort */
          }
        }
        const hardDelete = String(fileAccess.upload_status ?? '') === 'uploading'
        if (hardDelete) {
          await pool.query(`DELETE FROM gov_support_profile_files WHERE id = $1::bigint AND profile_id = $2::bigint`, [
            fileId,
            profileId,
          ])
        } else {
          await pool.query(
            `
            UPDATE gov_support_profile_files
            SET archived_at = NOW(), updated_by_user_id = $3, updated_at = NOW()
            WHERE id = $1::bigint AND profile_id = $2::bigint AND archived_at IS NULL
            RETURNING id
            `,
            [fileId, profileId, ctx.userId],
          )
        }
        res.json({ success: true, data: { id: fileId, ok: true } })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )
}

/** @param {ReturnType<typeof mapGovSupportProfileRow>} profile @param {Record<string, unknown>|null} caseRow */
function buildGovernmentPdfFieldMapping(profile, caseRow) {
  const c = caseRow ?? {}
  return {
    'gov.customer.name': profile.customerName,
    'gov.customer.phone': profile.phone,
    'gov.customer.carrier': profile.carrier,
    'gov.customer.ssn': profile.ssn,
    'gov.customer.address': profile.homeAddress,
    'gov.customer.homeType': profile.homeType,
    'gov.customer.deposit': profile.deposit,
    'gov.customer.monthlyRent': profile.monthlyRent,
    'gov.customer.creditScore1': profile.creditScore1,
    'gov.customer.creditScore2': profile.creditScore2,
    'gov.business.name': profile.businessName,
    'gov.business.openedAt': profile.businessOpenedAt,
    'gov.business.number': profile.businessNumber,
    'gov.business.address': profile.businessAddress,
    'gov.business.category': profile.businessCategory,
    'gov.business.type': profile.businessType,
    'gov.business.form': profile.businessForm,
    'gov.business.phone': profile.businessPhone,
    'gov.funding.vatReport': profile.vatReport,
    'gov.funding.annualIncome': profile.annualIncome,
    'gov.funding.incomeCert': profile.incomeCert,
    'gov.funding.taxArrears': profile.taxArrears,
    'gov.funding.requiredFunds': profile.requiredFunds,
    'gov.case.productName': String(c.product_name ?? profile.productName),
    'gov.case.agencyOrg': String(c.agency_org ?? profile.agencyOrg),
    'gov.case.fee': String(c.fee ?? profile.fee),
    'gov.case.specialNote': String(c.special_note ?? profile.specialNote),
    'gov.case.progressStatus': String(c.progress_status ?? profile.progressStatus),
  }
}
