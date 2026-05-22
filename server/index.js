import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pool from './db.js'
import { safeQuery, systemQuery } from './utils/dbSafeQuery.js'
import { initDb } from './initDb.js'
import { registerAuthAccountSmsApi } from './registerAuthAccountSmsApi.js'
import { registerUserProfileApi } from './registerUserProfileApi.js'
import { registerCustomerExtraApi } from './apis/customerExtraApi.js'
import { registerTeamApi } from './apis/teamApi.js'
import { registerNotificationsApi } from './apis/notificationsApi.js'
import { registerMemoApi } from './apis/memoApi.js'
import { registerTodosApi } from './apis/todosApi.js'
import { registerSuperAdminAnalyticsApi } from './registerSuperAdminAnalyticsApi.js'
import { registerGaCustomerExcelApi } from './apis/gaCustomerExcelApi.js'
import { registerGaCustomerMatchAliasesApi } from './apis/gaCustomerMatchAliasesApi.js'
import { registerCustomerClaimAppApi } from './apis/customerClaimAppApi.js'
import { registerCustomerCarsApi } from './apis/customerCarsApi.js'
import { recordAnalyticsEvent } from './lib/analyticsEvents.js'
import { ensureYesterdayAnalyticsAggregated } from './lib/analyticsAggregation.js'
import { tickAnalyticsAggregationScheduler } from './lib/analyticsScheduler.js'
import { verifySignupPhoneProof, verifyRegistrationSignupPhoneProof } from './lib/signupPhoneProof.js'
import { evaluateTenantMembershipLoginBlock, pickPrimaryTenantMembershipForLogin } from './lib/tenantMembershipAuth.js'
import {
  evaluateTenantRegistrationCodeForSignup,
  incrementTenantRegistrationUsedCount,
  normalizeIndustryCodeParam,
  normalizeTenantRegistrationCodeRaw,
} from './lib/tenantRegistrationCodes.js'
import {
  attachGovernmentProgramUserMembership,
  isGovernmentIndustrySignup,
} from './lib/governmentSupport/governmentSignup.js'
import { signInviteSignup, verifyInviteSignupSignature } from './lib/inviteSignupSignature.js'
import { formatDbEngineMessage, formatServerListeningMessage } from './lib/appServerLabel.js'
import { runScheduledSmsCleanup } from './services/smsCleanupScheduler.js'
import { normalizeKrMobile, validateKrMobileDigits } from './lib/phoneNormalize.js'
import { resolveInsuranceCategoryForApi } from './lib/insuranceCompanyCategoryResolve.js'
import { coerceMeritzFireToNonLifeCategory } from './lib/insuranceCompanyCategoryRules.js'
import { parseGaId } from './lib/parseGaId.js'
import { selectCrmBootstrapExtendedForLegacyGa } from './crm/resolveLegacyGaCrmBootstrap.js'
import { mapCustomerRow } from './lib/customerRowMap.js'
import {
  PUBLIC_INVITE_REG_COOKIE,
  buildInviteRegClearCookieHeader,
  buildInviteRegSetCookieHeader,
  editableDeadlineMsFromFirstSubmitted,
  injectCustomerRegisterInviteMeta,
  readCookieFromHeader,
} from './lib/customerInviteRegistrationPublic.js'
import { stringifyCrmExtensionForDb } from './lib/customerCrmExtension.js'
import { buildCustomerRowVisibilityWhere, resolveCustomerApiAccessScope } from './lib/customerAccessScope.js'
import {
  assertCustomerRowAccessibleByVisibility,
  offsetSqlPlaceholders,
  resolveCustomerVisibilitySqlForSelect,
  resolveCustomerVisibilitySqlForUpdate,
} from './lib/customerRowVisibilitySql.js'
import {
  isContractUserSendRole,
  isGaInsurerManagerMutatorRole,
  isGaTenantAdminRole,
  isNewsManagerRole,
  parseCompanyScopeId,
  resolveTenantGaIdForRequest,
} from './lib/rbacScope.js'
import { logSecurityEvent, writeSecurityAudit } from './lib/securityAudit.js'
import { recordSuccessfulUserLoginSession, resolveMinConcurrentSessionCapForUser } from './lib/authSessions.js'
import { registerConsentApi } from './registerConsentApi.js'
import { registerInsurerNewsApi } from './registerInsurerNewsApi.js'
import { registerSignatureApi } from './registerSignatureApi.js'
import { registerClientLogRoutes } from './routes/client-log.js'
import { registerVersionRoutes } from './routes/version.js'
import { seedInsuranceCompanyDirectory } from './seedInsuranceData.js'
import { registerSubscriptionAdminApi } from './registerSubscriptionAdminApi.js'
import { registerPdfTemplateApi } from './registerPdfTemplateApi.js'
import { registerInsurerSitesApi } from './registerInsurerSitesApi.js'
import { registerPlatformAdminApi } from './registerPlatformAdminApi.js'
import { registerCrmCustomerTemplateAdminApi } from './registerCrmCustomerTemplateAdminApi.js'
import { registerGovernmentSupportApi } from './registerGovernmentSupportApi.js'
import { registerGovernmentOperationsApi } from './registerGovernmentOperationsApi.js'
import { registerGovernmentSignatureApi } from './registerGovernmentSignatureApi.js'
import { registerLiquorSignatureApi } from './registerLiquorSignatureApi.js'
import { registerLiquorCustomerModule } from './registerLiquorCustomerApi.js'
import { registerContractPublicOtpApi } from './apis/contractPublicOtpApi.js'
import { registerContractPublicApi } from './apis/contractPublicApi.js'
import { registerContractAdminApi } from './apis/contractAdminApi.js'
import { registerContractUserApi } from './apis/contractUserApi.js'
import { registerSubscriptionEndpoints } from './subscription/endpoints.js'
import { enforceActiveSubscription } from './subscription/requireActiveSubscription.js'

const PORT = Number(process.env.PORT ?? 3001)
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-this-in-production'
/** 초대 가입 링크 HMAC — 운영에서는 INVITE_SIGNUP_SECRET 별도 권장 */
const INVITE_SIGNUP_SECRET = String(process.env.INVITE_SIGNUP_SECRET ?? JWT_SECRET)
const DEFAULT_JWT_SECRET = 'change-this-in-production'
const VALID_USER_ROLES = ['SUPER_ADMIN', 'GA_ADMIN', 'GA_STAFF', 'USER', 'INSURER_MANAGER', 'LOSS_ADJUSTER']
const GA_DELEGATE_ROLES = ['GA_ADMIN', 'GA_STAFF']
const FEATURE_REQUEST_STATUSES = ['pending', 'reviewed', 'done']
const ENTITY_STATUSES = ['active', 'blocked', 'inactive']
const LEGACY_USER_ROLE_MAP = {
  super_admin: 'SUPER_ADMIN',
  staff: 'GA_ADMIN',
  user: 'USER',
}
const RUNNING_IN_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)
const DIST_PATH = path.join(process.cwd(), 'dist')
const UPLOADS_PUBLIC_PATH = path.join(process.cwd(), 'uploads')

function normalizeExpiryDate(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value ?? '')
  }

  return parsed.toISOString()
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return '아이디와 비밀번호를 입력해 주세요.'
  }

  const trimmed = username.trim()
  if (!trimmed || trimmed.length < 3 || trimmed.length > 30) {
    return '아이디는 3~30자여야 합니다.'
  }

  if (password.length < 4 || password.length > 100) {
    return '비밀번호는 4~100자여야 합니다.'
  }

  return null
}

/** users + insurer_managers 비삭제 행 기준 전역 아이디 중복 여부 */
async function isUsernameTakenGlobally(executor, username, options = {}) {
  const normalized = String(username ?? '').trim()
  const excludeUserId = String(options.excludeUserId ?? '').trim()
  const excludeInsurerManagerId = String(options.excludeInsurerManagerId ?? '').trim()
  const excludeLossAdjusterId = String(options.excludeLossAdjusterId ?? '').trim()
  const uParams = [normalized]
  let uSql = `SELECT 1 FROM users WHERE username = $1 AND is_deleted = false`
  if (excludeUserId) {
    uSql += ` AND id <> $2`
    uParams.push(excludeUserId)
  }
  uSql += ' LIMIT 1'
  const u = await systemQuery(executor, uSql, uParams)
  if (u.rowCount > 0) {
    return true
  }
  const imParams = [normalized]
  let imSql = `SELECT 1 FROM insurer_managers WHERE username = $1 AND is_deleted = false`
  if (excludeInsurerManagerId) {
    imSql += ` AND id <> $2`
    imParams.push(excludeInsurerManagerId)
  }
  imSql += ' LIMIT 1'
  const im = await systemQuery(executor, imSql, imParams)
  if (im.rowCount > 0) {
    return true
  }
  const laParams = [normalized]
  let laSql = `SELECT 1 FROM loss_adjusters WHERE username = $1 AND is_deleted = false`
  if (excludeLossAdjusterId) {
    laSql += ` AND id <> $2`
    laParams.push(excludeLossAdjusterId)
  }
  laSql += ' LIMIT 1'
  const la = await systemQuery(executor, laSql, laParams)
  return la.rowCount > 0
}

function parseInsurerManagerType(raw) {
  const u = String(raw ?? '').trim().toUpperCase()
  return u === 'LIFE' || u === 'NON_LIFE' ? u : null
}

const LOSS_ADJUSTER_DEFAULT_TYPE = 'NON_LIFE'

function parseInsurerManagerStatusDb(raw) {
  const u = String(raw ?? '').trim().toUpperCase()
  return u === 'ACTIVE' || u === 'BLOCKED' ? u : null
}

function mapInsurerManagerRow(row) {
  const code = row.ga_code ?? ''
  const st = String(row.status ?? 'ACTIVE').toUpperCase()
  return {
    id: String(row.id),
    companyId: row.company_id != null ? Number(row.company_id) : 0,
    gaCode: typeof code === 'string' ? code.trim().toUpperCase() : '',
    insurerType: row.insurer_type,
    insurerName: String(row.insurer_name ?? '').trim(),
    username: String(row.username ?? '').trim(),
    password: String(row.password_plaintext ?? ''),
    status: st === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
    createdAt: toIsoString(row.created_at),
  }
}

function mapLossAdjusterRow(row) {
  const code = row.ga_code ?? ''
  const st = String(row.status ?? 'ACTIVE').toUpperCase()
  const companyName = String(row.company_name ?? '').trim()
  const personName = String(row.adjuster_name ?? '').trim()
  return {
    id: String(row.id),
    companyId: row.company_id != null ? Number(row.company_id) : 0,
    gaCode: typeof code === 'string' ? code.trim().toUpperCase() : '',
    insurerType: row.adjuster_type === 'LIFE' ? 'LIFE' : 'NON_LIFE',
    insurerName: companyName || personName,
    managerName: personName,
    username: String(row.username ?? '').trim(),
    password: String(row.password_plaintext ?? ''),
    status: st === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
    createdAt: toIsoString(row.created_at),
  }
}

function normalizeLossAdjusterCompanyName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

function normalizeLossAdjusterPersonName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

/** 원수사 담당자 ↔ insurance_company_master: GA·분류(LIFE|NON_LIFE) 일치 검증 (resolve 단일 기준) */
async function validateInsurerManagerCompanyLink(executor, gaId, companyId, insurerTypeNorm) {
  const mid = Number(companyId)
  if (!Number.isInteger(mid) || mid <= 0) {
    return { ok: false, message: '보험사(마스터)를 선택해 주세요.' }
  }
  const g = parseGaId(gaId)
  if (g == null) {
    return { ok: false, message: 'GA 컨텍스트가 없습니다.' }
  }
  const r = await safeQuery(
    executor,
    `SELECT id, name, category, ga_id FROM insurance_company_master WHERE id = $1`,
    [mid],
  )
  if (r.rowCount === 0) {
    return { ok: false, message: '보험사 마스터를 찾을 수 없습니다.' }
  }
  const m = r.rows[0]
  if (Number(m.ga_id) !== Number(g)) {
    return { ok: false, message: '선택한 보험사가 소속 GA와 일치하지 않습니다.' }
  }
  const cat = resolveInsuranceCategoryForApi(m.category, m.name)
  if (!cat || (cat !== 'LIFE' && cat !== 'NON_LIFE' && cat !== 'GENERAL')) {
    return {
      ok: false,
      message: '보험사 마스터 분류를 확인할 수 없습니다. 마스터 데이터를 점검해 주세요.',
    }
  }
  if (cat === 'GENERAL') {
    return { ok: false, message: '일반보험 마스터는 원수사 담당자와 연결할 수 없습니다.' }
  }
  if (cat !== insurerTypeNorm) {
    return { ok: false, message: '보험사 유형(생명/손해)과 마스터 분류가 일치하지 않습니다.' }
  }
  return { ok: true, master: { id: Number(m.id), name: String(m.name ?? '').trim() } }
}

/** 보험사 지정은 company_id(마스터 id)만 허용 — 이름 필드로의 생성/변경 차단 */
function assertNoInsurerNameInPayload(body, res) {
  if (
    Object.prototype.hasOwnProperty.call(body ?? {}, 'insurer_name') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'insurerName')
  ) {
    res.status(400).json({
      message:
        '보험사는 companyId(마스터 id)로만 지정할 수 있습니다. insurerName·insurer_name 필드는 사용할 수 없습니다.',
    })
    return false
  }
  return true
}

async function loadInsurerManagerHealthSummary(executor, gaIdFilter) {
  const params = gaIdFilter != null ? [gaIdFilter] : []
  const gaClause = gaIdFilter != null ? 'AND im.ga_id = $1' : ''
  const r = await safeQuery(
    executor,
    `
    SELECT im.id, im.ga_id, im.company_id, im.insurer_type,
           m.id AS m_id, m.category AS m_category, m.name AS m_name, m.ga_id AS m_ga_id
    FROM insurer_managers im
    LEFT JOIN insurance_company_master m ON m.id = im.company_id
    WHERE im.is_deleted = false
    ${gaClause}
    `,
    params,
  )
  let total = 0
  let nullCompany = 0
  let fkBroken = 0
  let gaMismatch = 0
  let invalidCategory = 0
  const seenBroken = new Set()
  for (const row of r.rows) {
    total += 1
    const cid = row.company_id != null ? Number(row.company_id) : NaN
    const badNull = !Number.isInteger(cid) || cid <= 0
    if (badNull) {
      nullCompany += 1
      seenBroken.add(row.id)
      continue
    }
    if (row.m_id == null) {
      fkBroken += 1
      seenBroken.add(row.id)
      continue
    }
    if (Number(row.m_ga_id) !== Number(row.ga_id)) {
      gaMismatch += 1
      seenBroken.add(row.id)
      continue
    }
    const resolved = resolveInsuranceCategoryForApi(row.m_category, row.m_name)
    const typeBroken =
      !resolved ||
      resolved === 'GENERAL' ||
      (resolved !== 'LIFE' && resolved !== 'NON_LIFE') ||
      resolved !== row.insurer_type
    if (typeBroken) {
      invalidCategory += 1
      seenBroken.add(row.id)
    }
  }
  return {
    total,
    broken: seenBroken.size,
    invalidCategory,
    nullCompany,
    fkBroken,
    gaMismatch,
  }
}

function mapGaDelegateAdminRow(row) {
  const st = String(row.status ?? 'active').toLowerCase()
  let statusLabel = 'ACTIVE'
  if (st === 'blocked') {
    statusLabel = 'BLOCKED'
  } else if (st === 'inactive') {
    statusLabel = 'INACTIVE'
  }
  const code = row.ga_code ?? ''
  return {
    id: String(row.id),
    ga_id: row.ga_id,
    gaCode: typeof code === 'string' ? code.trim().toUpperCase() : '',
    gaName: String(row.ga_name ?? '').trim(),
    username: String(row.username ?? '').trim(),
    password: String(row.delegate_password_plaintext ?? ''),
    role: normalizeUserRole(row.role),
    status: st,
    statusLabel,
    created_at: toIsoString(row.created_at),
  }
}

function buildFormTitle(customerName, carNumber, updatedAt) {
  const normalizedCustomer = customerName?.trim() || '미입력'
  const normalizedCarNumber = carNumber?.trim() || '미입력'
  const normalizedDate = updatedAt?.slice(0, 10) || '날짜없음'
  return `${normalizedCustomer} / ${normalizedCarNumber} / ${normalizedDate}`
}

function mapFormRow(row) {
  const formData = row.form_data ?? {}
  const customerName = row.customer_name || formData.ownerName || ''
  const carNumber = row.car_number || formData.vehicleNumber || ''
  const expiryDate = normalizeExpiryDate(row.expiry_date ?? formData.expiryDate ?? '')
  const dbCid = row.customer_id != null ? Number(row.customer_id) : NaN
  const customerId =
    Number.isInteger(dbCid) && dbCid > 0 ? dbCid : Math.max(0, Number(formData.customerId) || 0)

  return {
    ...formData,
    customerId,
    expiryDate,
    id: String(row.id),
    userId: String(row.user_id),
    customerName,
    carNumber,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    title: buildFormTitle(customerName, carNumber, toIsoString(row.updated_at)),
  }
}

function calculateInsuranceInfoFromRrn(rrnRaw) {
  const clean = String(rrnRaw ?? '').replace(/[^0-9]/g, '')
  if (clean.length < 7) {
    return { age: null, nextAgeDate: null }
  }
  const birth = clean.substring(0, 6)
  const genderCode = clean[6]
  let yearPrefix = null
  if (genderCode === '1' || genderCode === '2') {
    yearPrefix = '19'
  }
  if (genderCode === '3' || genderCode === '4') {
    yearPrefix = '20'
  }
  if (!yearPrefix) {
    return { age: null, nextAgeDate: null }
  }
  const year = parseInt(yearPrefix + birth.substring(0, 2), 10)
  const month = parseInt(birth.substring(2, 4), 10)
  const day = parseInt(birth.substring(4, 6), 10)
  const birthDate = new Date(year, month - 1, day)
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return { age: null, nextAgeDate: null }
  }
  const today = new Date()
  let insuranceAge = today.getFullYear() - year
  const thisYearBirthday = new Date(today.getFullYear(), month - 1, day)
  const thisYearUpperDate = new Date(thisYearBirthday)
  thisYearUpperDate.setMonth(thisYearUpperDate.getMonth() + 6)
  if (today >= thisYearUpperDate) {
    insuranceAge += 1
  }
  return { age: insuranceAge, nextAgeDate: thisYearUpperDate }
}

function nextAgeDateToSqlDate(d) {
  if (!d || Number.isNaN(d.getTime())) {
    return null
  }
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function normalizeCustomerNoteItemsArray(itemsRaw) {
  const out = []
  if (!Array.isArray(itemsRaw)) {
    return out
  }
  for (const item of itemsRaw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const id = String(item.id ?? '').trim()
    const content = String(item.content ?? '').trim()
    const createdAt = String(item.createdAt ?? new Date().toISOString()).trim()
    if (!id || !content) {
      continue
    }
    out.push({ id, content, createdAt })
  }
  return out
}

/** DB jsonb 저장 형식: { items: Note[], insuranceHistory?: string } */
function normalizeCustomerNotesInput(raw) {
  const insuranceHistoryMax = 60000
  let insuranceHistory = ''
  let itemsRaw = raw
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    insuranceHistory = String(raw.insuranceHistory ?? '').trim().slice(0, insuranceHistoryMax)
    itemsRaw = raw.items
  }
  const items = normalizeCustomerNoteItemsArray(itemsRaw)
  return { items, insuranceHistory }
}

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeCategory(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toUpperCase()
}

function normalizeUserRole(value) {
  const r = typeof value === 'string' ? value.trim() : ''
  if (VALID_USER_ROLES.includes(r)) {
    return r
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_USER_ROLE_MAP, r)) {
    return LEGACY_USER_ROLE_MAP[r]
  }
  return 'USER'
}

/** PATCH /admin/users 등: user / admin / super_admin 별칭 허용 */
function parseAdminPatchRole(raw) {
  if (raw == null) {
    return null
  }
  const s = String(raw).trim()
  if (!s) {
    return null
  }
  const lower = s.toLowerCase().replace(/-/g, '_')
  const alias = {
    user: 'USER',
    admin: 'GA_ADMIN',
    ga_admin: 'GA_ADMIN',
    staff: 'GA_STAFF',
    ga_staff: 'GA_STAFF',
    super_admin: 'SUPER_ADMIN',
    superadmin: 'SUPER_ADMIN',
  }
  if (Object.prototype.hasOwnProperty.call(alias, lower)) {
    return alias[lower]
  }
  const up = s.toUpperCase()
  return VALID_USER_ROLES.includes(up) ? up : null
}

function isSuperAdminRole(role) {
  return normalizeUserRole(role) === 'SUPER_ADMIN'
}

function isGaAdminOrSuper(role) {
  const n = normalizeUserRole(role)
  return n === 'SUPER_ADMIN' || n === 'GA_ADMIN' || n === 'GA_STAFF'
}

function parseEntityStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return ENTITY_STATUSES.includes(s) ? s : null
}

/** @returns {number | null} */
function effectiveTenantGaId(req) {
  if (!req.user) {
    return null
  }
  return parseGaId(req.user.gaId)
}

function escapeIlikePattern(raw) {
  return String(raw ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function resolveLinkedCustomerIdFromRequest(body, formData) {
  const raw = body?.customer_id ?? body?.customerId ?? formData?.customerId
  if (raw === undefined || raw === null || raw === '') {
    return null
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}

async function assertCustomerOwnedByUser(req, customerId) {
  if (customerId == null) {
    return true
  }
  return assertCustomerRowAccessibleByVisibility(pool, safeQuery, req, Number(customerId), {
    requireNonDeleted: false,
  })
}

async function assertCustomerActiveAndOwnedByUser(req, customerId) {
  if (customerId == null) {
    return false
  }
  return assertCustomerRowAccessibleByVisibility(pool, safeQuery, req, Number(customerId), {
    requireNonDeleted: true,
  })
}

function mapContactRow(row) {
  return {
    id: String(row.id),
    category: row.category,
    companyName: row.company_name,
    managerName: row.manager_name,
    position: row.position ?? '',
    phoneNumber: normalizePhoneNumber(row.phone_number),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function mapContactUpdateRow(row) {
  return {
    id: String(row.id),
    contactId: row.contact_id ? String(row.contact_id) : null,
    actionType: row.action_type,
    category: row.category,
    companyName: row.company_name,
    managerName: row.manager_name,
    position: row.position ?? '',
    oldPhoneNumber: row.old_phone_number ?? '',
    newPhoneNumber: row.new_phone_number ?? '',
    description: row.description ?? '',
    createdAt: toIsoString(row.created_at),
  }
}

function formatInsCompanyCode(id) {
  return `INS${String(Number(id)).padStart(6, '0')}`
}

async function ensureMasterCompanyCode(client, masterId) {
  const code = formatInsCompanyCode(masterId)
  await safeQuery(client,
    `UPDATE insurance_company_master SET company_code = $1 WHERE id = $2`,
    [code, masterId],
  )
}

function mapInsuranceCompanyMaster(row) {
  const category = resolveInsuranceCategoryForApi(row.category, row.name) || ''
  const updatedRaw = row.updated_at ?? row.created_at
  const id = Number(row.id)
  return {
    id,
    companyCode: row.company_code != null && String(row.company_code).trim() !== ''
      ? String(row.company_code).trim()
      : formatInsCompanyCode(id),
    // API: DB 정규화 후 이름 추론·메리츠 보정까지 반영한 LIFE | NON_LIFE | GENERAL | ''
    category,
    name: row.name ?? '',
    customerCenter: row.customer_center ?? '',
    systemPhone: row.system_phone ?? '',
    incallNumber: row.incall_number ?? '',
    visitInfo: row.visit_info ?? '',
    createdAt: toIsoString(row.created_at),
    updatedAt: updatedRaw ? toIsoString(updatedRaw) : undefined,
    updatedBy: row.updated_by_username ?? '',
  }
}

function mapInsuranceCompanyContact(row) {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    name: row.name ?? '',
    position: row.position ?? '',
    phone: row.phone ?? '',
  }
}

function mapInsuranceGeneralRequest(row) {
  if (!row) {
    return null
  }
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    description: row.description ?? '',
    phone: row.phone ?? '',
    fax: row.fax ?? '',
    email: row.email ?? '',
  }
}

async function loadCompanyDirectoryNestedList(gaId, options = {}) {
  const g = parseGaId(gaId)
  if (g == null) {
    throw new Error('loadCompanyDirectoryNestedList: gaId 필요')
  }
  const masters = await safeQuery(pool,
    `
    SELECT *
    FROM insurance_company_master
    WHERE ga_id = $1
    ORDER BY name ASC NULLS LAST, id ASC
    `,
    [g],
  )
  const contacts = await safeQuery(pool,
    `
    SELECT ic.*
    FROM insurance_company_contacts ic
    INNER JOIN insurance_company_master m ON m.id = ic.company_id AND m.ga_id = $1
    ORDER BY ic.company_id ASC, ic.id ASC
    `,
    [g],
  )
  const generals = await safeQuery(pool,
    `
    SELECT gr.*
    FROM insurance_general_request gr
    INNER JOIN insurance_company_master m ON m.id = gr.company_id AND m.ga_id = $1
    `,
    [g],
  )

  const contactByCompany = new Map()
  for (const c of contacts.rows) {
    const cid = Number(c.company_id)
    if (!contactByCompany.has(cid)) {
      contactByCompany.set(cid, [])
    }
    contactByCompany.get(cid).push(mapInsuranceCompanyContact(c))
  }

  const generalByCompany = new Map()
  for (const g of generals.rows) {
    generalByCompany.set(Number(g.company_id), mapInsuranceGeneralRequest(g))
  }

  const items = masters.rows.map((m) => {
    const id = Number(m.id)
    return {
      ...mapInsuranceCompanyMaster(m),
      contacts: contactByCompany.get(id) ?? [],
      general: generalByCompany.get(id) ?? null,
    }
  })

  items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'))
  const onlyId =
    options && options.onlyCompanyId != null ? Number(options.onlyCompanyId) : null
  if (onlyId != null && Number.isInteger(onlyId) && onlyId > 0) {
    return items.filter((x) => Number(x.id) === onlyId)
  }
  return items
}

function createVCardContent(contact) {
  const tel = normalizePhoneNumber(contact.phone_number)
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.manager_name}`,
    `ORG:${contact.company_name}`,
    contact.position ? `TITLE:${contact.position}` : '',
    tel ? `TEL:${tel}` : '',
    'END:VCARD',
  ].filter(Boolean)

  return `${lines.join('\r\n')}\r\n`
}

function extractFormData(body) {
  const formData = body?.formData ?? body?.form_data
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return null
  }

  return formData
}

const LENIENT_DB_RESPONSES = process.env.LENIENT_DB_RESPONSES === '1'

function handleDbError(error, req, res) {
  if (!res || typeof res.status !== 'function') {
    console.error('[FATAL] invalid res object', res)
    return
  }
  if (error?.code === '23505') {
    if (error?.constraint === 'users_username_key') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    res.status(409).json({ message: '이미 존재하는 데이터입니다.' })
    return
  }

  console.error('[DB ERROR]', error)
  if (LENIENT_DB_RESPONSES) {
    console.error('[LENIENT MODE DB ERROR]', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
      path: req?.originalUrl ?? req?.url,
    })
    res.status(200).json({
      success: false,
      message: '서버 오류 (자동 복구됨)',
      data: [],
    })
    return
  }
  res.status(500).json({ success: false, message: 'DB_ERROR' })
}

async function logInsuranceFormsDbDiagnostics(contextLabel) {
  try {
    await systemQuery(pool,
      `
      SELECT id FROM insurance_forms
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1
      `,
    )
    await systemQuery(pool, `SELECT COUNT(*) AS count FROM insurance_forms WHERE user_id IS NULL`)
  } catch (error) {
    console.error(`[insurance_forms:${contextLabel}] 진단 쿼리 실패:`, error)
  }
}

function getAuthenticatedUserId(req) {
  const raw = req.user?.id
  if (raw === undefined || raw === null) {
    return ''
  }
  return String(raw).trim()
}

/** @returns {string | null} userId 또는 실패 시 응답 전송 후 null */
function requireInsuranceFormUserId(req, res) {
  const userId = getAuthenticatedUserId(req)
  if (!userId) {
    console.error('userId 없음 - 저장 중단')
    res.status(401).json({ message: 'userId 없음: 로그인 정보가 올바르지 않습니다.' })
    return null
  }
  return userId
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const userId = decoded.userId || decoded.sub
    if (!userId || String(userId).trim() === '') {
      console.error('[requireAuth] JWT userId 없음', { keys: Object.keys(decoded) })
      res
        .status(401)
        .json({ error: 'Unauthorized', message: '토큰에 사용자 ID가 없습니다.' })
      return
    }

    const role = normalizeUserRole(decoded.role)
    const gaFromJwt = parseGaId(decoded.gaId ?? decoded.ga_id)
    if (role !== 'SUPER_ADMIN') {
      if (gaFromJwt == null) {
        console.error('[requireAuth] invalid gaId in token', {
          role,
          rawGa: decoded.gaId ?? decoded.ga_id,
          userId: String(userId),
        })
        res.status(401).json({
          error: 'invalid gaId',
          message: '세션에 GA 정보가 없거나 올바르지 않습니다. 다시 로그인해 주세요.',
        })
        return
      }
    }
    const gaCodeRaw = decoded.gaCode ?? decoded.ga_code
    const gaCode =
      typeof gaCodeRaw === 'string' && gaCodeRaw.trim() ? gaCodeRaw.trim().toUpperCase() : ''
    const gaNameRaw = decoded.gaName ?? decoded.ga_name
    const gaName = typeof gaNameRaw === 'string' ? gaNameRaw.trim() : ''
    const companyIdJwt = parseCompanyScopeId(decoded.companyId ?? decoded.company_id)
    const displayNameRaw = decoded.displayName ?? decoded.display_name ?? ''
    const displayName = typeof displayNameRaw === 'string' ? displayNameRaw.trim() : ''
    const teamIdRaw = decoded.teamId ?? decoded.team_id
    const teamId =
      typeof teamIdRaw === 'string' && teamIdRaw.trim() ? teamIdRaw.trim() : null
    const customerScope = resolveCustomerApiAccessScope({
      legacyReqRole: role,
      customerAccessJwt: decoded.customerAccess ?? decoded.customer_access,
      tenantDbIdJwt: decoded.tenantDbId ?? decoded.tenant_db_id,
    })
    const membRoleDecoded = decoded.tenantMembershipRole ?? decoded.tenant_membership_role
    const tenantMembershipRoleStr =
      typeof membRoleDecoded === 'string' && membRoleDecoded.trim()
        ? membRoleDecoded.trim().toLowerCase()
        : ''
    const membTypeDecoded = decoded.membershipType ?? decoded.membership_type
    const membershipTypeStr =
      typeof membTypeDecoded === 'string' && membTypeDecoded.trim()
        ? membTypeDecoded.trim().toLowerCase()
        : ''
    req.user = {
      id: String(userId),
      username: typeof decoded.username === 'string' ? decoded.username : '',
      role,
      gaId: gaFromJwt,
      gaCode,
      gaName,
      companyId: companyIdJwt,
      displayName,
      teamId,
      customerAccess: customerScope.access,
      customerTenantDbId: customerScope.tenantDbId,
      tenantMembershipRole: tenantMembershipRoleStr,
      membershipType: membershipTypeStr,
      tenant_industry_code:
        decoded.tenantIndustryCode ?? decoded.tenant_industry_code ?? null,
      crm_industry_code:
        decoded.crmIndustryCode ?? decoded.crm_industry_code ?? decoded.tenantIndustryCode ?? decoded.tenant_industry_code ?? null,
    }

    if (role === 'INSURER_MANAGER' || role === 'LOSS_ADJUSTER') {
      const isLossAdjuster = role === 'LOSS_ADJUSTER'
      const managerTable = role === 'LOSS_ADJUSTER' ? 'loss_adjusters' : 'insurer_managers'
      const stIm = await safeQuery(
        pool,
        `
        SELECT im.status AS im_status, im.is_deleted AS im_deleted, im.company_id,
               g.status AS ga_status, g.is_deleted AS ga_deleted
        FROM ${managerTable} im
        INNER JOIN ga_companies g ON g.id = im.ga_id
        WHERE im.id = $1
          AND im.is_deleted = false
          AND ($2::int IS NULL OR im.ga_id = $2::int)
        `,
        [req.user.id, gaFromJwt],
      )
      if (stIm.rowCount === 0) {
        res.status(401).json({ error: 'Unauthorized', message: '로그인 정보가 올바르지 않습니다.' })
        return
      }
      const ir = stIm.rows[0]
      const coId = ir.company_id != null ? Number(ir.company_id) : null
      if (Number.isInteger(coId) && coId > 0) {
        req.user.companyId = coId
      }
      if (ir.im_deleted || String(ir.im_status ?? '').toUpperCase() !== 'ACTIVE') {
        forbiddenResponse(req, res, '접근이 제한된 계정입니다', { guard: 'requireAuth', reason: 'insurer_inactive' })
        return
      }
      if (ir.ga_deleted || String(ir.ga_status ?? '').toLowerCase() !== 'active') {
        forbiddenResponse(req, res, '해당 GA는 현재 사용이 제한되었습니다', {
          guard: 'requireAuth',
          reason: 'ga_inactive_insurer',
        })
        return
      }
      if (!isLossAdjuster && (!req.user.companyId || req.user.companyId < 1)) {
        forbiddenResponse(req, res, '담당자 계정에 회사(마스터)가 연결되지 않았습니다.', {
          guard: 'requireAuth',
          reason: 'manager_no_company',
        })
        return
      }
      req.gaId = parseGaId(req.user?.gaId)
      await enforceActiveSubscription(req, res, next)
      return
    }

    const st = await safeQuery(
      pool,
      `
      SELECT
        u.status AS user_status,
        u.is_deleted AS user_deleted,
        g.status AS ga_status,
        g.is_deleted AS ga_deleted
      FROM users u
      INNER JOIN ga_companies g ON g.id = u.ga_id
      WHERE u.id = $1
        AND u.is_deleted = false
        AND ($2::int IS NULL OR u.ga_id = $2::int)
      `,
      [req.user.id, gaFromJwt],
    )
    if (st.rowCount === 0) {
      res.status(401).json({ error: 'Unauthorized', message: '로그인 정보가 올바르지 않습니다.' })
      return
    }
    const row = st.rows[0]
    if (row.user_deleted) {
      forbiddenResponse(req, res, '접근이 제한된 계정입니다', { guard: 'requireAuth', reason: 'user_deleted' })
      return
    }
    if (row.user_status !== 'active') {
      forbiddenResponse(req, res, '접근이 제한된 계정입니다', { guard: 'requireAuth', reason: 'user_inactive' })
      return
    }
    if (row.ga_deleted || row.ga_status !== 'active') {
      forbiddenResponse(req, res, '해당 GA는 현재 사용이 제한되었습니다', {
        guard: 'requireAuth',
        reason: 'ga_inactive_user',
      })
      return
    }

    req.gaId = parseGaId(req.user?.gaId)
    await enforceActiveSubscription(req, res, next)
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
    if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Unauthorized',
        message: '인증이 만료되었거나 유효하지 않습니다.',
      })
      return
    }
    next(e)
  }
}

/** SUPER_ADMIN 전용 */
function requireSuperAdmin(req, res, next) {
  if (!req.user || !isSuperAdminRole(req.user.role)) {
    forbiddenResponse(req, res, '전체 관리자 권한이 필요합니다.', { guard: 'requireSuperAdmin' })
    return
  }
  next()
}

/** GA_ADMIN · GA_STAFF · SUPER_ADMIN (템플릿·원수사 디렉터리 등) */
function requireGaAdminOrSuper(req, res, next) {
  if (!req.user || !isGaAdminOrSuper(req.user.role)) {
    forbiddenResponse(req, res, '원수사 연락처 관리 권한이 없습니다.', { guard: 'requireGaAdminOrSuper' })
    return
  }
  next()
}

/** 전자서명 템플릿 관리(관리자 콘솔) — SUPER_ADMIN · GA_ADMIN */
function requireContractAdminConsole(req, res, next) {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }
  const r = normalizeUserRole(req.user.role)
  if (r !== 'SUPER_ADMIN' && r !== 'GA_ADMIN') {
    forbiddenResponse(req, res, '전자서명 템플릿 관리 권한이 없습니다.', { guard: 'requireContractAdminConsole' })
    return
  }
  next()
}

/** 전자서명 발송 — USER · GA_STAFF (본인 소속 고객만) */
function requireContractUserSend(req, res, next) {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }
  if (!isContractUserSendRole(req.user.role)) {
    forbiddenResponse(req, res, '전자서명 발송 권한이 없습니다.', { guard: 'requireContractUserSend' })
    return
  }
  if (parseGaId(req.user?.gaId) == null) {
    res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
    return
  }
  next()
}

/** 보험사 마스터 쓰기 등: SUPER_ADMIN · GA_ADMIN · GA_STAFF */
function requireGaTenantAdmin(req, res, next) {
  if (!req.user || !isGaTenantAdminRole(req.user.role)) {
    forbiddenResponse(req, res, 'GA 스태프 이상 권한이 필요합니다.', { guard: 'requireGaTenantAdmin' })
    return
  }
  next()
}

/** 원수사 담당자 API 쓰기: SUPER_ADMIN · GA_ADMIN · GA_STAFF */
function requireGaInsurerManagerMutator(req, res, next) {
  if (!req.user || !isGaInsurerManagerMutatorRole(req.user.role)) {
    forbiddenResponse(req, res, '원수사 담당자 관리 권한이 필요합니다.', { guard: 'requireGaInsurerManagerMutator' })
    return
  }
  next()
}

/** 원수사 담당자 삭제: GA_ADMIN · GA_STAFF (SUPER_ADMIN 제외) */
function requireGaStaffOrAdminOnly(req, res, next) {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }
  const r = normalizeUserRole(req.user.role)
  if (r !== 'GA_ADMIN' && r !== 'GA_STAFF') {
    forbiddenResponse(req, res, '원수사 담당자 삭제 권한이 필요합니다.', { guard: 'requireGaStaffOrAdminOnly' })
    return
  }
  next()
}

/** 담당자 정합성 헬스: SUPER_ADMIN · GA_ADMIN 만 */
function requireInsurerHealthReader(req, res, next) {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }
  const r = normalizeUserRole(req.user.role)
  if (r === 'INSURER_MANAGER' || r === 'LOSS_ADJUSTER' || r === 'GA_STAFF' || r === 'USER') {
    forbiddenResponse(req, res, '이 API에 접근할 권한이 없습니다.', { guard: 'requireInsurerHealthReader' })
    return
  }
  if (r !== 'SUPER_ADMIN' && r !== 'GA_ADMIN') {
    forbiddenResponse(req, res, '이 API에 접근할 권한이 없습니다.', { guard: 'requireInsurerHealthReader' })
    return
  }
  next()
}

function forbidInsurerManagerApi(req, res, next) {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' })
    return
  }
  if (isNewsManagerRole(req.user.role)) {
    forbiddenResponse(req, res, '채널 담당자 계정은 이 API를 사용할 수 없습니다.', {
      guard: 'forbidInsurerManagerApi',
    })
    return
  }
  next()
}

/**
 * 권한 거부 응답 + 감사 로그 (비동기, 응답은 즉시).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} message
 * @param {Record<string, unknown>} [extraMeta]
 */
function forbiddenResponse(req, res, message, extraMeta = {}) {
  const u = req.user
  const g = u?.gaId != null ? parseGaId(u.gaId) : null
  const co =
    u?.companyId != null && Number.isInteger(Number(u.companyId)) && Number(u.companyId) > 0
      ? Number(u.companyId)
      : null
  void logSecurityEvent(pool, {
    actorUserId: String(u?.id ?? 'anonymous').slice(0, 200),
    actorRole: String(u?.role ?? 'anonymous').slice(0, 64),
    action: 'FORBIDDEN_ACCESS',
    targetType: 'http',
    meta: {
      path: String(req.originalUrl ?? req.path ?? '').slice(0, 500),
      method: req.method,
      ...extraMeta,
    },
    gaId: Number.isInteger(g) ? g : null,
    companyId: co,
  })
  res.status(403).json({
    error: 'FORBIDDEN',
    message: message || '권한이 없습니다.',
  })
}

function requireAuditLogReader(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized', message: '로그인이 필요합니다.' })
    return
  }
  const r = normalizeUserRole(req.user.role)
  if (r !== 'SUPER_ADMIN' && r !== 'GA_ADMIN') {
    forbiddenResponse(req, res, '감사 로그를 조회할 권한이 없습니다.', { guard: 'requireAuditLogReader' })
    return
  }
  next()
}

async function withTransaction(task) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await task(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function emptyCompanySnapshot() {
  return {
    customerCenter: '',
    system: '',
    incall: '',
    visitInfo: '',
    contacts: [],
  }
}

async function loadCompanySnapshot(client, companyId, gaId) {
  const g = parseGaId(gaId)
  const m = await safeQuery(client,
    `
    SELECT customer_center, system_phone, incall_number, visit_info
    FROM insurance_company_master
    WHERE id = $1
      AND ga_id = $2
    `,
    [companyId, g],
  )
  if (m.rowCount === 0) {
    return emptyCompanySnapshot()
  }
  const row = m.rows[0]
  const c = await safeQuery(client,
    `
    SELECT ic.name, ic.position, ic.phone
    FROM insurance_company_contacts ic
    INNER JOIN insurance_company_master m ON m.id = ic.company_id AND m.ga_id = $2
    WHERE ic.company_id = $1
    ORDER BY ic.id ASC
    `,
    [companyId, g],
  )
  return {
    customerCenter: String(row.customer_center ?? '').trim(),
    system: String(row.system_phone ?? '').trim(),
    incall: String(row.incall_number ?? '').trim(),
    visitInfo: String(row.visit_info ?? '').trim(),
    contacts: c.rows.map((r) => ({
      name: String(r.name ?? '').trim(),
      position: String(r.position ?? '').trim(),
      phone: String(r.phone ?? '').trim(),
    })),
  }
}

function buildCompanySnapshotFromPayload(customerCenter, systemPhone, incallNumber, visitInfo, contactsIn) {
  const contacts = []
  const contactsList = Array.isArray(contactsIn) ? contactsIn : []
  for (const c of contactsList) {
    const cn = String(c?.name ?? '').trim()
    const cp = String(c?.position ?? '').trim()
    const cph = String(c?.phone ?? '').trim()
    if (!cn && !cp && !cph) {
      continue
    }
    contacts.push({ name: cn, position: cp, phone: cph })
  }
  return {
    customerCenter: String(customerCenter ?? '').trim(),
    system: String(systemPhone ?? '').trim(),
    incall: String(incallNumber ?? '').trim(),
    visitInfo: String(visitInfo ?? '').trim(),
    contacts,
  }
}

function normalizeHistoryPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  return {
    customerCenter: String(p.customerCenter ?? '').trim(),
    system: String(p.system ?? '').trim(),
    incall: String(p.incall ?? '').trim(),
    visitInfo: String(p.visitInfo ?? '').trim(),
    contacts: Array.isArray(p.contacts)
      ? p.contacts.map((c) => ({
          name: String(c?.name ?? '').trim(),
          position: String(c?.position ?? '').trim(),
          phone: String(c?.phone ?? '').trim(),
        }))
      : [],
  }
}

async function touchContactLastUpdatedAt(client, gaId = null) {
  const key =
    gaId != null && Number.isInteger(Number(gaId)) && Number(gaId) > 0
      ? `contact_last_updated_at:${Number(gaId)}`
      : 'contact_last_updated_at'
  await safeQuery(
    client,
    `
    INSERT INTO insurance_contact_meta (meta_key, meta_value, updated_at)
    VALUES ($1, CAST(NOW() AS text), NOW())
    ON CONFLICT (meta_key)
    DO UPDATE SET meta_value = CAST(NOW() AS text), updated_at = NOW()
    `,
    [key],
    { allowUnscoped: true },
  )
}

function buildCustomerAppUniversalLinkOpenUrl(req, linkCode) {
  const envPage = String(process.env.CUSTOMER_APP_LINK_PAGE_BASE ?? '').trim()
  const legacy = String(process.env.CUSTOMER_APP_UNIVERSAL_BASE ?? '')
    .trim()
    .replace(/\/customer-app\/connect\/?$/i, '/customer-app/link')
  const fallback = `${req.protocol}://${req.get('host')}/customer-app/link`
  const base = (envPage || legacy || fallback).replace(/\/+$/, '')
  return `${base}?code=${encodeURIComponent(String(linkCode))}`
}

function buildCustomerAppNativeDeepLink(linkCode) {
  return `insurancecustomer://connect?code=${encodeURIComponent(String(linkCode))}`
}

const app = express()
app.use(
  cors({
    origin: '*',
    credentials: true,
  }),
)
app.use(express.json({ limit: '12mb' }))

const apiRouter = express.Router()

registerVersionRoutes(apiRouter)
registerClientLogRoutes(apiRouter)

registerConsentApi(apiRouter, {
  pool,
  requireAuth,
  requireGaAdminOrSuper,
  requireGaTenantAdmin,
  resolveTenantGaIdForRequest,
  isSuperAdminRole,
  isInsurerManagerRole: isNewsManagerRole,
  parseCompanyScopeId,
  effectiveTenantGaId,
  parseGaId,
  handleDbError,
  JWT_SECRET,
})

registerSignatureApi(apiRouter, {
  pool,
  requireAuth,
  parseGaId,
  handleDbError,
  JWT_SECRET,
})

registerInsurerNewsApi(apiRouter, {
  pool,
  requireAuth,
  handleDbError,
  withTransaction,
  effectiveTenantGaId,
  parseGaId,
  resolveTenantGaIdForRequest,
})

function normalizeInviteCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

registerAuthAccountSmsApi(apiRouter, {
  pool,
  bcrypt,
  validateCredentials,
  handleDbError,
  RUNNING_IN_PRODUCTION,
  requireAuth,
})

registerContractPublicOtpApi(apiRouter, { pool, handleDbError })

registerContractPublicApi(apiRouter, { pool, handleDbError })

registerContractAdminApi(apiRouter, {
  pool,
  requireAuth,
  forbidInsurerManagerApi,
  requireContractAdminConsole,
  handleDbError,
})

registerContractUserApi(apiRouter, {
  pool,
  requireAuth,
  forbidInsurerManagerApi,
  requireContractUserSend,
  handleDbError,
})

registerUserProfileApi(apiRouter, {
  pool,
  JWT_SECRET,
  handleDbError,
  requireAuth,
  RUNNING_IN_PRODUCTION,
  normalizeInviteCode,
})

registerTeamApi(apiRouter, { pool, requireAuth, handleDbError })

registerGaCustomerExcelApi(apiRouter, {
  pool,
  requireAuth,
  requireSuperAdmin,
  handleDbError,
  parseGaId,
  requireInsuranceFormUserId,
})

registerGaCustomerMatchAliasesApi(apiRouter, {
  pool,
  requireAuth,
  handleDbError,
  parseGaId,
})

registerNotificationsApi(apiRouter, { pool, requireAuth, handleDbError })

registerMemoApi(apiRouter, { pool, requireAuth, handleDbError })
registerTodosApi(apiRouter, { pool, requireAuth, handleDbError })

registerSuperAdminAnalyticsApi(apiRouter, {
  pool,
  requireAuth,
  requireSuperAdmin,
  handleDbError,
  systemQuery,
})

registerSubscriptionAdminApi(apiRouter, { requireAuth, requireSuperAdmin })

registerPdfTemplateApi(apiRouter, {
  pool,
  requireAuth,
  isSuperAdminRole,
  handleDbError,
})

registerInsurerSitesApi(apiRouter, { pool, requireAuth, requireSuperAdmin, handleDbError })
registerPlatformAdminApi(apiRouter, { pool, requireAuth, requireSuperAdmin, handleDbError })
registerCrmCustomerTemplateAdminApi(apiRouter, { pool, requireAuth, requireSuperAdmin, handleDbError })
registerGovernmentSupportApi(apiRouter, { pool, requireAuth, handleDbError })
registerGovernmentOperationsApi(apiRouter, { pool, requireAuth, handleDbError })
registerGovernmentSignatureApi(apiRouter, { pool, requireAuth, handleDbError })
registerLiquorSignatureApi(apiRouter, {
  pool,
  requireAuth,
  forbidInsurerManagerApi,
  handleDbError,
  isSuperAdminRole,
})
registerLiquorCustomerModule(apiRouter, { pool, requireAuth, handleDbError })

registerSubscriptionEndpoints(apiRouter, { requireAuth })

registerCustomerCarsApi(apiRouter, { pool, requireAuth, handleDbError })

registerCustomerClaimAppApi(apiRouter, {
  pool,
  requireAuth,
  handleDbError,
  jwtSecret: JWT_SECRET,
})

/**
 * 고객 앱 연결 플로우 보조 라우트.
 * customerClaimAppApi 모듈이 어떤 이유로 등록되지 않아도
 * "코드 생성/코드 입력" 핵심 플로우는 동작하도록 index에 안전망을 둔다.
 */
apiRouter.get('/agent/customer-app-links', requireAuth, async (_req, res) => {
  res.status(405).json({ message: 'GET이 아니라 POST /agent/customer-app-links 를 사용해 주세요.' })
})

apiRouter.post('/agent/customer-app-links', requireAuth, async (req, res, next) => {
  try {
    const agentId = String(req.user?.id ?? '').trim()
    if (!agentId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
      return
    }
    const requestedCustomerId = Number(req.body?.customerId)
    let customerId = Number.isInteger(requestedCustomerId) && requestedCustomerId > 0 ? requestedCustomerId : null
    let customerCode = ''
    if (customerId == null) {
      let createdCustomer = null
      for (let i = 0; i < 10 && createdCustomer == null; i += 1) {
        const nextCode = `C${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        try {
          const insertCustomer = await pool.query(
            `
            INSERT INTO customers (user_id, ga_id, customer_code)
            VALUES ($1, $2, $3)
            RETURNING id, customer_code
            `,
            [agentId, gaId, nextCode],
          )
          createdCustomer = insertCustomer.rows[0]
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
            continue
          }
          throw error
        }
      }
      if (!createdCustomer) {
        res.status(500).json({ message: '고객코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
        return
      }
      customerId = Number(createdCustomer.id)
      customerCode = String(createdCustomer.customer_code ?? '')
    } else {
      const vis = resolveCustomerVisibilitySqlForSelect(req, agentId, gaId)
      if (vis.blocked) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      const plc = vis.params.length
      const idPh = `$${plc + 1}`
      const customerCheck = await safeQuery(
        pool,
        `
        SELECT c.id, c.customer_code
        FROM customers c
        WHERE c.id = ${idPh}
          AND (${vis.clause})
          AND c.deleted_at IS NULL
        LIMIT 1
        `,
        [...vis.params, customerId],
      )
      if (customerCheck.rowCount === 0) {
        res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
        return
      }
      customerCode = String(customerCheck.rows[0]?.customer_code ?? '')
    }

    const existing = await pool.query(
      `
      SELECT id, link_code, status, created_at, expires_at, last_connected_at
      FROM customer_app_links
      WHERE agent_id = $1
        AND customer_id = $2
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [agentId, customerId],
    )

    if (existing.rowCount > 0) {
      const row = existing.rows[0]
      const lc = String(row.link_code)
      const deviceCountRow = await pool.query(
        `
        SELECT COUNT(*)::int AS c
        FROM customer_app_devices
        WHERE agent_id = $1
          AND customer_id = $2
          AND status = 'active'
        `,
        [agentId, customerId],
      )
      res.json({
        success: true,
        data: {
          linkId: Number(row.id),
          linkCode: lc,
          connectUrl: buildCustomerAppNativeDeepLink(lc),
          universalUrl: buildCustomerAppUniversalLinkOpenUrl(req, lc),
          customerId,
          customerCode,
          status: String(row.status ?? 'active'),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
          lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at).toISOString() : null,
          deviceCount: Number(deviceCountRow.rows[0]?.c ?? 0),
        },
      })
      return
    }

    let created = null
    for (let i = 0; i < 5 && created == null; i += 1) {
      const linkCode = randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()
      try {
        const insert = await pool.query(
          `
          INSERT INTO customer_app_links
            (agent_id, customer_id, link_code, status, created_by_user_id, created_at, updated_at)
          VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())
          RETURNING id, link_code, status, created_at, expires_at, last_connected_at
          `,
          [agentId, customerId, linkCode, agentId],
        )
        created = insert.rows[0]
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
          continue
        }
        throw error
      }
    }

    if (!created) {
      res.status(500).json({ message: '링크 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
      return
    }

    res.status(201).json({
      success: true,
      data: {
        linkId: Number(created.id),
        linkCode: String(created.link_code),
        connectUrl: buildCustomerAppNativeDeepLink(String(created.link_code)),
        universalUrl: buildCustomerAppUniversalLinkOpenUrl(req, String(created.link_code)),
        customerId,
        customerCode,
        status: String(created.status ?? 'active'),
        createdAt: created.created_at ? new Date(created.created_at).toISOString() : null,
        expiresAt: created.expires_at ? new Date(created.expires_at).toISOString() : null,
        lastConnectedAt: created.last_connected_at ? new Date(created.last_connected_at).toISOString() : null,
        deviceCount: 0,
      },
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/customer-app/connect', async (req, res, next) => {
  try {
    const linkCode = String(req.body?.linkCode ?? '').trim().toUpperCase()
    const deviceId = String(req.body?.deviceId ?? '').trim()
    const devicePlatform = String(req.body?.devicePlatform ?? '').trim().slice(0, 20)
    const appVersion = String(req.body?.appVersion ?? '').trim().slice(0, 30)
    if (!linkCode || !deviceId) {
      res.status(400).json({ message: 'linkCode와 deviceId가 필요합니다.' })
      return
    }
    const linkRes = await pool.query(
      `
      SELECT id, agent_id, customer_id, status, expires_at
      FROM customer_app_links
      WHERE link_code = $1
      LIMIT 1
      `,
      [linkCode],
    )
    if (linkRes.rowCount === 0) {
      res.status(400).json({ message: '유효하지 않은 링크입니다.' })
      return
    }
    const link = linkRes.rows[0]
    const expired =
      link.expires_at != null &&
      Number.isFinite(new Date(String(link.expires_at)).getTime()) &&
      new Date(String(link.expires_at)).getTime() <= Date.now()
    if (String(link.status ?? '') !== 'active' || expired) {
      res.status(400).json({ message: '만료되었거나 비활성화된 링크입니다.' })
      return
    }
    const agentId = String(link.agent_id ?? '').trim()
    const customerId = Number(link.customer_id)

    await pool.query(
      `
      INSERT INTO customer_app_devices
        (link_id, agent_id, customer_id, device_id, device_platform, app_version, status, connected_at, last_active_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW(), NOW(), NOW())
      ON CONFLICT (device_id, agent_id, customer_id)
      DO UPDATE SET
        link_id = EXCLUDED.link_id,
        device_platform = EXCLUDED.device_platform,
        app_version = EXCLUDED.app_version,
        status = 'active',
        connected_at = NOW(),
        last_active_at = NOW(),
        disconnected_at = NULL,
        updated_at = NOW()
      `,
      [Number(link.id), agentId, customerId, deviceId, devicePlatform || null, appVersion || null],
    )

    await pool.query(
      `
      UPDATE customer_app_links
      SET last_connected_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `,
      [Number(link.id)],
    )

    const profileRes = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), '담당 설계사') AS agent_name,
        COALESCE(NULLIF(TRIM(c.name), ''), '고객') AS customer_name
      FROM customers c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.id = $1
        AND u.id = $2
      LIMIT 1
      `,
      [customerId, agentId],
    )

    const agentName = String(profileRes.rows[0]?.agent_name ?? '담당 설계사')
    const customerName = String(profileRes.rows[0]?.customer_name ?? '고객')
    const appToken = jwt.sign(
      {
        kind: 'CUSTOMER_APP',
        linkId: Number(link.id),
        agentId,
        customerId,
        deviceId,
      },
      JWT_SECRET,
      { expiresIn: '180d' },
    )

    res.json({
      success: true,
      data: {
        agentId,
        customerId,
        agentName,
        customerName,
        appToken,
      },
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true })
})

async function attachTenantMembershipSignup(poolExec, params) {
  const userId = String(params?.userId ?? '').trim()
  const rbacRole = String(params?.rbacRole ?? 'user').trim().toLowerCase()
  const membershipType = String(params?.membershipType ?? 'agent').trim().toLowerCase()
  const customerAccess = String(params?.customerAccess ?? 'own').trim().toLowerCase()
  const gaParsed = parseGaId(params?.gaId)
  if (!userId || gaParsed == null) {
    return
  }

  /** @type {number | undefined} */
  let tenantDbId = params?.tenantDbId != null ? Number(params.tenantDbId) : undefined
  /** @type {number | undefined} */
  let industryId = params?.industryId != null ? Number(params.industryId) : undefined

  if (!(typeof tenantDbId === 'number' && Number.isSafeInteger(tenantDbId) && tenantDbId > 0)) {
    const lr = await systemQuery(
      poolExec,
      `SELECT id, industry_id FROM tenants WHERE legacy_ga_id = $1 ORDER BY id ASC LIMIT 1`,
      [gaParsed],
    )
    const tw = lr.rows[0]
    if (!tw) {
      return
    }
    tenantDbId = Number(tw.id)
    industryId = Number(tw.industry_id)
  }

  if (!(typeof industryId === 'number' && Number.isSafeInteger(industryId) && industryId > 0)) {
    const lr2 = await systemQuery(poolExec, `SELECT industry_id FROM tenants WHERE id = $1 LIMIT 1`, [
      tenantDbId,
    ])
    industryId = Number(lr2.rows[0]?.industry_id)
  }

  if (
    !(typeof tenantDbId === 'number' && Number.isSafeInteger(tenantDbId) && tenantDbId > 0) ||
    !(typeof industryId === 'number' && Number.isSafeInteger(industryId) && industryId > 0)
  ) {
    return
  }

  if (!rbacRole || !['user', 'staff', 'tenant_admin'].includes(rbacRole)) {
    return
  }

  const scopeId = String(tenantDbId)

  await poolExec.query(
    `
    INSERT INTO user_memberships (
      user_id, role, scope_type, scope_id, tenant_id, industry_id, status, membership_type, customer_access
    )
    SELECT
      $1::text,
      $2::text,
      'tenant',
      $3::text,
      $4::bigint,
      $5::bigint,
      'active',
      $6::text,
      $7::text
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_memberships m
      WHERE m.user_id = $1
        AND m.scope_type = 'tenant'
        AND m.tenant_id IS NOT DISTINCT FROM $4
        AND COALESCE(m.scope_id, '') IS NOT DISTINCT FROM $3
        AND LOWER(TRIM(COALESCE(m.role::text, ''))) = $2::text
    )
    `,
    [userId, rbacRole, scopeId, tenantDbId, industryId, membershipType, customerAccess],
  )
}


async function handleRegister(req, res) {
  try {
    const body = req.body ?? {}
    const {
      username,
      password,
      invite_code: inviteRaw,
      inviteCode: inviteAlt,
      ref_user_id: refUserSnake,
      refUserId: refUserCamel,
      name: nameRaw,
      display_name: displayNameRaw,
      phone_number: phoneSnake,
      phoneNumber: phoneCamel,
      signup_phone_proof: signupProofSnake,
      signupPhoneProof: signupProofCamel,
      invite_sig: inviteSigSnake,
      inviteSig: inviteSigCamel,
      invite_ts: inviteTsSnake,
      inviteTs: inviteTsCamel,
      sig: sigLoose,
      ts: tsLoose,
    } = body

    const displayName = String(nameRaw ?? displayNameRaw ?? '').trim()
    if (!displayName) {
      res.status(400).json({ message: '이름을 입력해 주세요.' })
      return
    }

    const phoneNorm = normalizeKrMobile(body?.phone_number ?? body?.phoneNumber)
    const phoneErr = validateKrMobileDigits(phoneNorm)
    if (phoneErr) {
      res.status(400).json({ message: phoneErr })
      return
    }

    const industrySignup = normalizeIndustryCodeParam(body.industry_code ?? body.industryCode ?? '')
    const regCodeNorm = normalizeTenantRegistrationCodeRaw(body.registration_code ?? body.registrationCode ?? '')
    /** 보험(legacy GA) 또는 기타 업종: industryCode + 가입 코드가 함께 오면 테넌트 코드 경로 */
    const tenantRegSignup = industrySignup.length > 0 && regCodeNorm.length >= 3

    /** @type {number | null} */
    let gaId = null
    let gaLegacyInviteCodeNormalized = ''
    /** @type {{ tenantPk: number; industryPk: number; codeRowId: number } | null} */
    let tenantRegMeta = null

    const proofRaw = String(signupProofSnake ?? signupProofCamel ?? '').trim()
    if (!proofRaw) {
      res.status(400).json({ message: '휴대폰 인증이 필요합니다.' })
      return
    }

    let invitedByUserId = null

    if (tenantRegSignup) {
      const refEarly = String(refUserSnake ?? refUserCamel ?? '').trim()
      if (refEarly) {
        res.status(400).json({ message: '초대 매개변수와 업종별 가입 코드를 함께 사용할 수 없습니다.' })
        return
      }

      const ev = await evaluateTenantRegistrationCodeForSignup(pool, {
        industryCodeNorm: industrySignup,
        registrationCodeNorm: regCodeNorm,
      })
      if (!ev.ok) {
        res.status(ev.status).json({ message: ev.message })
        return
      }
      gaId = ev.gaId
      tenantRegMeta = {
        tenantPk: Number(ev.row.tenant_pk),
        industryPk: Number(ev.row.tenant_industry_id),
        codeRowId: Number(ev.row.id),
      }

      let rp
      try {
        rp = verifyRegistrationSignupPhoneProof(proofRaw, JWT_SECRET)
      } catch {
        rp = null
      }
      if (!rp) {
        res.status(400).json({
          message: '휴대폰 인증이 만료되었거나 유효하지 않습니다. 인증부터 다시 진행해 주세요.',
        })
        return
      }
      if (rp.phoneDigits !== phoneNorm) {
        res.status(400).json({ message: '인증된 휴대폰 번호와 가입 폼의 번호가 일치하지 않습니다.' })
        return
      }
      if (rp.industryCodeNormalized !== industrySignup) {
        res.status(400).json({ message: '인증 업종 정보가 일치하지 않습니다.' })
        return
      }
      if (rp.registrationCodeNormalized !== regCodeNorm) {
        res.status(400).json({ message: '인증 시점 가입 코드와 현재 입력이 일치하지 않습니다.' })
        return
      }
      if (gaId == null || rp.gaId !== gaId) {
        res.status(400).json({ message: '가입 코드와 소속 정보가 일치하지 않습니다.' })
        return
      }
      if (tenantRegMeta.tenantPk !== rp.tenantId) {
        res.status(400).json({ message: '가입 코드와 소속 정보가 일치하지 않습니다.' })
        return
      }
      if (!isGovernmentIndustrySignup(industrySignup)) {
        const drCheck = String(ev.row.default_role ?? 'user').trim().toLowerCase()
        const dtCheck = String(ev.row.default_membership_type ?? 'agent').trim().toLowerCase()
        const daCheck = String(ev.row.default_customer_access ?? 'own').trim().toLowerCase()
        if (!(drCheck === 'user' && dtCheck === 'agent' && daCheck === 'own')) {
          res.status(400).json({ message: '이 경로에서는 일반 agent(본인 고객) 가입만 허용됩니다.' })
          return
        }
      }
    } else {
      gaLegacyInviteCodeNormalized = normalizeInviteCode(inviteRaw ?? inviteAlt ?? '')
      if (!gaLegacyInviteCodeNormalized) {
        res.status(400).json({ message: 'GA 코드 없음' })
        return
      }

      const gaCheck = await systemQuery(
        pool,
        `SELECT id, status FROM ga_companies WHERE code = $1 AND is_deleted = false`,
        [gaLegacyInviteCodeNormalized],
      )
      if (gaCheck.rows.length === 0) {
        res.status(400).json({ message: '유효하지 않은 코드입니다' })
        return
      }
      const gaRow = gaCheck.rows[0]
      if (String(gaRow.status ?? '').toLowerCase() !== 'active') {
        res.status(400).json({ message: '가입할 수 없는 GA입니다' })
        return
      }
      const parsedGaId = parseGaId(gaRow.id)
      if (parsedGaId == null) {
        res.status(400).json({ message: '유효하지 않은 코드입니다' })
        return
      }
      gaId = parsedGaId

      const refUserId = String(refUserSnake ?? refUserCamel ?? '').trim()
      if (refUserId) {
        const refUserRes = await systemQuery(
          pool,
          `
          SELECT id, role, ga_id, status, is_deleted
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [refUserId],
        )
        const refRow = refUserRes.rows[0]
        if (!refRow || refRow.is_deleted) {
          res.status(400).json({ message: '유효하지 않은 초대 링크입니다.' })
          return
        }
        if (String(refRow.status ?? '').toLowerCase() !== 'active') {
          res.status(400).json({ message: '초대를 받을 수 없는 계정 상태입니다.' })
          return
        }
        if (normalizeUserRole(refRow.role) !== 'USER') {
          res.status(400).json({ message: '일반 설계사(USER) 계정으로만 회원 초대가 가능합니다.' })
          return
        }
        const refGaId = parseGaId(refRow.ga_id)
        if (refGaId == null || gaId == null || refGaId !== gaId) {
          res.status(400).json({ message: '소속 GA가 초대 담당자와 일치하지 않습니다.' })
          return
        }

        const inviteSigRaw = String(inviteSigSnake ?? inviteSigCamel ?? sigLoose ?? '').trim()
        const inviteTsRaw = inviteTsSnake ?? inviteTsCamel ?? tsLoose
        const hasInviteSignaturePayload = Boolean(inviteSigRaw) || inviteTsRaw != null
        if (hasInviteSignaturePayload) {
          const inviteTsMs = Number(inviteTsRaw)
          const sigCheck = verifyInviteSignupSignature(INVITE_SIGNUP_SECRET, {
            gaCodeNormalized: gaLegacyInviteCodeNormalized,
            refUserId,
            tsMs: inviteTsMs,
            sig: inviteSigRaw,
          })
          if (!sigCheck.ok) {
            const msg =
              sigCheck.reason === 'expired'
                ? '초대 링크가 만료되었습니다. 담당자에게 새 링크를 요청해 주세요.'
                : '유효하지 않거나 변조된 초대 링크입니다. 담당자가 공유한 링크로 다시 시도해 주세요.'
            res.status(400).json({ message: msg })
            return
          }
        }

        invitedByUserId = refUserId
      }

      let signupProofLegacy
      try {
        signupProofLegacy = verifySignupPhoneProof(proofRaw, JWT_SECRET)
      } catch {
        signupProofLegacy = null
      }
      if (!signupProofLegacy) {
        res.status(400).json({
          message: '휴대폰 인증이 만료되었거나 유효하지 않습니다. 인증부터 다시 진행해 주세요.',
        })
        return
      }
      if (signupProofLegacy.phoneDigits !== phoneNorm) {
        res.status(400).json({ message: '인증된 휴대폰 번호와 가입 폼의 번호가 일치하지 않습니다.' })
        return
      }
      if (signupProofLegacy.inviteCodeNormalized !== gaLegacyInviteCodeNormalized) {
        res.status(400).json({
          message:
            '인증 시점의 GA 코드와 현재 입력이 일치하지 않습니다. 인증을 다시 진행해 주세요.',
        })
        return
      }
      if (signupProofLegacy.gaId !== gaId) {
        res.status(400).json({ message: 'GA 정보가 일치하지 않습니다. 인증을 다시 진행해 주세요.' })
        return
      }
    }

    const phoneDup = await systemQuery(
      pool,
      `
      SELECT 1
      FROM users
      WHERE is_deleted = false
        AND role = 'USER'
        AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $1
      LIMIT 1
      `,
      [phoneNorm],
    )
    if (phoneDup.rowCount > 0) {
      res.status(409).json({ message: '이미 가입된 휴대폰 번호입니다.' })
      return
    }

    const validationMessage = validateCredentials(username, password)
    if (validationMessage) {
      res.status(400).json({ message: validationMessage })
      return
    }

    const normalizedUsername = username.trim()
    if (await isUsernameTakenGlobally(pool, normalizedUsername)) {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const id = randomUUID()
    const effectiveInvitedByUserId = invitedByUserId ?? id

    const client = await pool.connect()
    let createdAtIso = ''
    try {
      await client.query('BEGIN')

      const insRow = await safeQuery(client,
        `
        INSERT INTO users (id, username, password_hash, role, ga_id, display_name, phone_number, invited_by_user_id)
        VALUES ($1, $2, $3, 'USER', $4, $5, $6, $7)
        RETURNING created_at
        `,
        [id, normalizedUsername, passwordHash, gaId, displayName, phoneNorm, effectiveInvitedByUserId],
      )
      createdAtIso = toIsoString(insRow.rows[0].created_at)

      if (tenantRegSignup && tenantRegMeta != null) {
        const evAgain = await evaluateTenantRegistrationCodeForSignup(client, {
          industryCodeNorm: industrySignup,
          registrationCodeNorm: regCodeNorm,
        })
        if (!evAgain.ok) {
          await client.query('ROLLBACK')
          res.status(evAgain.status).json({ message: evAgain.message })
          return
        }
        const bumped = await incrementTenantRegistrationUsedCount(client, tenantRegMeta.codeRowId)
        if (!bumped.incremented) {
          await client.query('ROLLBACK')
          res.status(400).json({ message: '가입 코드를 사용할 수 없습니다. 새 코드를 받아 주세요.' })
          return
        }
        if (isGovernmentIndustrySignup(industrySignup)) {
          await attachGovernmentProgramUserMembership(client, {
            userId: id,
            tenantDbId: tenantRegMeta.tenantPk,
            industryId: tenantRegMeta.industryPk,
          })
        } else {
          await attachTenantMembershipSignup(client, {
            userId: id,
            gaId,
            tenantDbId: tenantRegMeta.tenantPk,
            industryId: tenantRegMeta.industryPk,
            rbacRole: 'user',
            membershipType: 'agent',
            customerAccess: 'own',
          })
        }
      } else {
        await attachTenantMembershipSignup(client, {
          userId: id,
          gaId,
          rbacRole: 'user',
          membershipType: 'agent',
          customerAccess: 'own',
        })
      }

      await client.query('COMMIT')
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* */
      }
      client.release()
      throw e
    }
    client.release()

    if (phoneNorm) {
      await pool.query(`DELETE FROM sms_verification_codes WHERE purpose = 'SIGNUP' AND phone_number = $1`, [
        phoneNorm,
      ])
    }

    const payload = { id, username: normalizedUsername, ga_id: gaId, createdAt: createdAtIso }
    if (tenantRegSignup && industrySignup) {
      payload.industry_code = industrySignup
    }

    res.status(201).json(payload)
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
}


async function auditLoginFailure(pool, username, reason) {
  try {
    await writeSecurityAudit(pool, {
      actorUserId: String(username ?? '').slice(0, 120),
      actorRole: 'anonymous',
      action: 'LOGIN_FAILED',
      targetType: 'auth',
      meta: { reason, code: reason },
    })
  } catch (e) {
    console.error('[security_audit LOGIN_FAILED]', e)
  }
}

async function handleLogin(req, res) {
  try {
    const { username, password } = req.body ?? {}
    const validationMessage = validateCredentials(username, password)
    if (validationMessage) {
      res.status(400).json({ message: validationMessage })
      return
    }

    const normalizedUsername = username.trim()
    const loginDebug = process.env.INSURANCE_LOGIN_DEBUG === 'true'

    const result = await systemQuery(pool,
      `
      SELECT *
      FROM users
      WHERE username = $1
        AND is_deleted = false
        AND LOWER(TRIM(COALESCE(status::text, 'active'))) = 'active'
      `,
      [normalizedUsername],
    )

    let user = result.rows[0]

    if (!user) {
      const managerCandidates = [
        {
          role: 'INSURER_MANAGER',
          table: 'insurer_managers',
          nameField: 'insurer_name',
          failInvalidPassword: 'invalid_password_insurer_manager',
          failInactive: 'insurer_manager_inactive',
          failMissingCompany: 'insurer_missing_company_id',
        },
        {
          role: 'LOSS_ADJUSTER',
          table: 'loss_adjusters',
          nameField: 'adjuster_name',
          failInvalidPassword: 'invalid_password_loss_adjuster',
          failInactive: 'loss_adjuster_inactive',
        },
      ]
      let manager = null
      let managerMeta = null
      for (const candidate of managerCandidates) {
        const mRes = await systemQuery(
          pool,
          `
          SELECT m.*, g.code AS ga_code, g.name AS ga_name, g.status AS ga_status, g.is_deleted AS ga_deleted
          FROM ${candidate.table} m
          INNER JOIN ga_companies g ON g.id = m.ga_id
          WHERE m.username = $1 AND m.is_deleted = false
          `,
          [normalizedUsername],
        )
        if (mRes.rows[0]) {
          manager = mRes.rows[0]
          managerMeta = candidate
          break
        }
      }
      if (!manager || !managerMeta) {
        await auditLoginFailure(pool, normalizedUsername, 'unknown_user')
        res.status(401).json({
          error: 'Invalid credentials',
          message: '아이디 또는 비밀번호가 올바르지 않습니다.',
        })
        return
      }
      if (loginDebug) {
        console.log('입력 비번:', password)
        console.log(`DB hash (${managerMeta.role.toLowerCase()}):`, manager.password_hash)
      }
      const managerMatch = await bcrypt.compare(password, manager.password_hash)
      if (!managerMatch) {
        await auditLoginFailure(pool, normalizedUsername, managerMeta.failInvalidPassword)
        res.status(401).json({
          error: 'Invalid credentials',
          message: '아이디 또는 비밀번호가 올바르지 않습니다.',
        })
        return
      }
      if (String(manager.status ?? '').toUpperCase() !== 'ACTIVE') {
        await auditLoginFailure(pool, normalizedUsername, managerMeta.failInactive)
        res.status(401).json({ message: '접근이 제한된 계정입니다' })
        return
      }
      if (manager.ga_deleted === true || String(manager.ga_status ?? '').toLowerCase() !== 'active') {
        await auditLoginFailure(pool, normalizedUsername, 'ga_restricted_manager')
        res.status(401).json({ message: '해당 GA는 현재 사용이 제한되었습니다' })
        return
      }
      const managerCompanyIdRaw = manager.company_id != null ? Number(manager.company_id) : null
      const managerCompanyId =
        managerMeta.role === 'INSURER_MANAGER' &&
        Number.isInteger(managerCompanyIdRaw) &&
        Number(managerCompanyIdRaw) > 0
          ? Number(managerCompanyIdRaw)
          : null
      if (managerMeta.role === 'INSURER_MANAGER' && managerCompanyId == null) {
        await auditLoginFailure(pool, normalizedUsername, 'insurer_missing_company_id')
        res.status(403).json({
          error: 'FORBIDDEN',
          message: '담당자 계정에 회사(마스터)가 연결되지 않았습니다. 관리자에게 문의하세요.',
        })
        return
      }
      const managerGaCode =
        typeof manager.ga_code === 'string' && manager.ga_code.trim() ? manager.ga_code.trim().toUpperCase() : ''
      const managerGaName = typeof manager.ga_name === 'string' ? manager.ga_name.trim() : ''
      const managerGaId = parseGaId(manager.ga_id)
      const displayName = String(manager[managerMeta.nameField] ?? '').trim()
      const managerToken = jwt.sign(
        {
          userId: manager.id,
          sub: manager.id,
          username: manager.username,
          role: managerMeta.role,
          gaId: managerGaId,
          gaCode: managerGaCode,
          gaName: managerGaName,
          companyId: managerCompanyId ?? undefined,
          displayName,
          teamId: null,
        },
        JWT_SECRET,
        { expiresIn: '7d' },
      )
      void logSecurityEvent(pool, {
        actorUserId: String(manager.id),
        actorRole: managerMeta.role,
        action: 'login_success',
        targetType: 'auth',
        targetId: String(manager.id),
        gaId: Number.isInteger(managerGaId) ? managerGaId : null,
        companyId: managerCompanyId,
        meta: { username: manager.username },
      })
      void recordAnalyticsEvent(pool, {
        userId: String(manager.id),
        gaId: Number.isInteger(managerGaId) ? managerGaId : null,
        eventType: 'login',
      })
      const managerCrmBoot = await selectCrmBootstrapExtendedForLegacyGa(pool, managerGaId)
      res.json({
        token: managerToken,
        user: {
          id: String(manager.id),
          username: manager.username,
          role: managerMeta.role,
          ga_id: managerGaId,
          ga_code: managerGaCode,
          ga_name: managerGaName,
          company_id: managerCompanyId ?? undefined,
          display_name: displayName,
          team_id: null,
          crm_industry_code: managerCrmBoot.industryCode,
          tenant_crm: managerCrmBoot.tenantCrm,
          crm_dynamic_industry_template: managerCrmBoot.crmDynamicIndustryTemplate,
        },
      })
      return
    }

    if (loginDebug) {
      console.log('입력 비번:', password)
      console.log('DB hash:', user.password_hash)
    }

    const match = await bcrypt.compare(password, user.password_hash)

    if (!match) {
      await auditLoginFailure(pool, normalizedUsername, 'invalid_password_user')
      res.status(401).json({
        error: 'Invalid credentials',
        message: '아이디 또는 비밀번호가 올바르지 않습니다.',
      })
      return
    }

    if (user.is_deleted === true) {
      res.status(401).json({ message: '접근이 제한된 계정입니다' })
      return
    }
    const userStatus = String(user.status ?? 'active').toLowerCase()
    if (userStatus !== 'active') {
      res.status(401).json({ message: '접근이 제한된 계정입니다' })
      return
    }

    const uid = String(user.id)
    const role = normalizeUserRole(user.role)
    const gaId = parseGaId(user.ga_id)
    if (role !== 'SUPER_ADMIN' && gaId == null) {
      res.status(500).json({ message: '계정에 GA가 연결되지 않았습니다. 관리자에게 문의하세요.' })
      return
    }

    let gaCode = ''
    let gaName = ''
    if (gaId != null) {
      const gRow = await systemQuery(
        pool,
        `SELECT code, name, status, is_deleted FROM ga_companies WHERE id = $1`,
        [gaId],
      )
      const g0 = gRow.rows[0]
      if (!g0 || g0.is_deleted === true) {
        res.status(401).json({ message: '해당 GA는 현재 사용이 제한되었습니다' })
        return
      }
      if (String(g0.status ?? '').toLowerCase() !== 'active') {
        res.status(401).json({ message: '해당 GA는 현재 사용이 제한되었습니다' })
        return
      }
      const rawCode = g0?.code
      gaCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : ''
      gaName = typeof g0?.name === 'string' ? g0.name.trim() : ''
    }

    const userDisplayName = String(user.display_name ?? user.username ?? '').trim()
    const userTeamId = user.team_id != null ? String(user.team_id) : null
    const gaIdIntPre = gaId != null && Number.isInteger(gaId) ? gaId : null

    let userCrmBoot = {
      industryCode: null,
      tenantCrm: null,
      crmDynamicIndustryTemplate: null,
      tenantDbId: null,
    }
    if (gaIdIntPre != null) {
      userCrmBoot = await selectCrmBootstrapExtendedForLegacyGa(pool, gaIdIntPre)
    }

    if (role !== 'SUPER_ADMIN' && gaIdIntPre != null) {
      const blk = await evaluateTenantMembershipLoginBlock(pool, uid, gaIdIntPre)
      if (blk.blocked) {
        res.status(403).json({ message: '소속 테넌트 접근이 제한되어 로그인할 수 없습니다.' })
        return
      }
    }

    /** @type {number | null} */
    let tenantDbJwt = userCrmBoot.tenantDbId
    /** @type {string | null} */
    let tenantIndustryJwt =
      typeof userCrmBoot.industryCode === 'string' && userCrmBoot.industryCode.trim()
        ? userCrmBoot.industryCode.trim().toLowerCase()
        : null
    /** @type {Record<string, unknown> | null} */
    let membershipPayload = null
    let tenantMembershipRoleJwt = ''
    let membershipTypeJwt = ''
    const roleNormJwt = normalizeUserRole(role)
    let customerAccessJwt = 'own'
    if (roleNormJwt === 'USER') {
      membershipTypeJwt = 'agent'
      customerAccessJwt = 'own'
    } else if (roleNormJwt === 'GA_STAFF') {
      membershipTypeJwt = 'staff'
      customerAccessJwt = 'tenant'
    } else if (roleNormJwt === 'GA_ADMIN') {
      membershipTypeJwt = 'admin'
      customerAccessJwt = 'tenant'
    } else if (roleNormJwt === 'SUPER_ADMIN') {
      membershipTypeJwt = 'owner'
      customerAccessJwt = 'tenant'
    } else {
      membershipTypeJwt = 'staff'
      customerAccessJwt = 'tenant'
    }

    if (gaIdIntPre != null) {
      const pick = await pickPrimaryTenantMembershipForLogin(pool, uid, gaIdIntPre)
      if (pick != null && pick.tenant_id != null) {
        tenantDbJwt = typeof pick.tenant_id === 'number' ? pick.tenant_id : Number(pick.tenant_id)
        const tic = pick.tenant_industry_code != null ? String(pick.tenant_industry_code).trim() : ''
        if (tic) {
          tenantIndustryJwt = tic.toLowerCase()
        }
        const caJwt = String(pick.customer_access ?? '').trim().toLowerCase()
        if (caJwt === 'none' || caJwt === 'own' || caJwt === 'tenant' || caJwt === 'assigned') {
          customerAccessJwt = caJwt
        }
        const mtJwt = String(pick.membership_type ?? '').trim().toLowerCase()
        if (mtJwt === 'agent' || mtJwt === 'staff' || mtJwt === 'admin' || mtJwt === 'owner') {
          membershipTypeJwt = mtJwt
        }
        tenantMembershipRoleJwt = String(pick.membership_rbac_role ?? '').trim()

        membershipPayload = {
          id: pick.membership_id != null ? String(pick.membership_id) : '',
          tenantId:
            pick.tenant_id != null
              ? String(pick.tenant_id)
              : tenantDbJwt != null
                ? String(tenantDbJwt)
                : '',
          industryCode:
            tenantIndustryJwt != null && tenantIndustryJwt !== '' ? tenantIndustryJwt : '',
          tenantCode: pick.tenant_code != null ? String(pick.tenant_code) : '',
          rbacRole:
            tenantMembershipRoleJwt || String(pick.membership_rbac_role ?? '').trim(),
          membershipType: membershipTypeJwt || String(pick.membership_type ?? '').trim(),
          customerAccess:
            ['none', 'own', 'tenant', 'assigned'].includes(customerAccessJwt) ?
              customerAccessJwt
            : 'own',
          crm_customer_template_id:
            pick.crm_customer_template_id != null ?
              typeof pick.crm_customer_template_id === 'number'
                ? pick.crm_customer_template_id
                : Number(pick.crm_customer_template_id)
            : null,
        }
      }
    }

    const token = jwt.sign(
      {
        userId: user.id,
        sub: user.id,
        username: user.username,
        role,
        gaId,
        gaCode,
        gaName,
        displayName: userDisplayName,
        teamId: userTeamId,
        tenantDbId: tenantDbJwt,
        tenant_db_id: tenantDbJwt,
        tenantIndustryCode: tenantIndustryJwt,
        tenant_industry_code: tenantIndustryJwt,
        customerAccess: customerAccessJwt,
        customer_access: customerAccessJwt,
        tenantMembershipRole: tenantMembershipRoleJwt,
        tenant_membership_role: tenantMembershipRoleJwt,
        membershipType: membershipTypeJwt,
        membership_type: membershipTypeJwt,
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    const gaIdInt = gaIdIntPre
    void logSecurityEvent(pool, {
      actorUserId: uid,
      actorRole: role,
      action: 'login_success',
      targetType: 'auth',
      targetId: uid,
      gaId: gaIdInt,
      companyId: null,
      meta: { username: user.username },
    })
    void recordAnalyticsEvent(pool, { userId: uid, gaId: gaIdInt, eventType: 'login' })

    try {
      const cap = await resolveMinConcurrentSessionCapForUser(pool, uid)
      await recordSuccessfulUserLoginSession(pool, uid, req, cap)
    } catch (e) {
      console.error('[authSessions] login session audit failed', e)
    }

    res.json({
      token,
      user: {
        id: uid,
        username: user.username,
        role,
        ga_id: gaId,
        ga_code: gaCode,
        ga_name: gaName,
        display_name: userDisplayName,
        team_id: userTeamId,
        crm_industry_code: userCrmBoot.industryCode,
        tenant_crm: userCrmBoot.tenantCrm,
        crm_dynamic_industry_template: userCrmBoot.crmDynamicIndustryTemplate,
        tenant_db_id: tenantDbJwt,
        tenant_industry_code: tenantIndustryJwt,
        membership: membershipPayload,
        membership_customer_access: customerAccessJwt,
        membership_type: membershipTypeJwt,
        tenant_membership_role: tenantMembershipRoleJwt,
      },
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
}

apiRouter.post('/register', handleRegister)
apiRouter.post('/auth/register', handleRegister)
apiRouter.post('/auth/signup', handleRegister)

apiRouter.get('/auth/invite-signup-url', requireAuth, async (req, res) => {
  try {
    if (normalizeUserRole(req.user.role) !== 'USER') {
      res
        .status(403)
        .json({ message: '초대 링크는 일반 설계사(USER) 계정에서만 발급할 수 있습니다.' })
      return
    }
    let gaCode = normalizeInviteCode(req.user.gaCode ?? '')
    if (!gaCode) {
      const r = await systemQuery(
        pool,
        `
        SELECT g.code
        FROM users u
        INNER JOIN ga_companies g ON g.id = u.ga_id
        WHERE u.id = $1
        LIMIT 1
        `,
        [req.user.id],
      )
      gaCode = normalizeInviteCode(r.rows[0]?.code ?? '')
    }
    if (!gaCode) {
      res.status(400).json({ message: 'GA 코드를 확인할 수 없습니다.' })
      return
    }
    const refUserId = String(req.user.id).trim()
    const ts = Date.now()
    let sig
    try {
      sig = signInviteSignup(INVITE_SIGNUP_SECRET, gaCode, refUserId, ts)
    } catch (e) {
      if (e?.message === 'invite_signup_missing_secret') {
        res.status(500).json({ message: '서버 설정 오류입니다.' })
        return
      }
      throw e
    }
    const q = new URLSearchParams({
      ga: gaCode,
      ref: refUserId,
      ts: String(ts),
      sig,
    })
    res.json({ path: `/register?${q.toString()}` })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/login', handleLogin)
apiRouter.post('/auth/login', handleLogin)

apiRouter.get('/auth/username-availability', async (req, res) => {
  try {
    const raw = String(req.query.username ?? '').trim()
    if (!raw || raw.length < 3 || raw.length > 30 || /\s/.test(raw)) {
      res.json({ available: false })
      return
    }
    const taken = await isUsernameTakenGlobally(pool, raw)
    res.json({ available: !taken })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/health/insurer-managers', requireAuth, requireInsurerHealthReader, async (req, res) => {
  try {
    const gaIdFilter = isSuperAdminRole(req.user?.role) ? null : parseGaId(req.user?.gaId)
    if (!isSuperAdminRole(req.user?.role) && gaIdFilter == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const summary = await loadInsurerManagerHealthSummary(pool, gaIdFilter)
    res.json({
      total: summary.total,
      broken: summary.broken,
      invalidCategory: summary.invalidCategory,
      nullCompany: summary.nullCompany,
      fkBroken: summary.fkBroken,
      gaMismatch: summary.gaMismatch,
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/audit-logs', requireAuth, requireAuditLogReader, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50))
    const actionQ = String(req.query.action ?? '').trim()
    const actorUserIdQ = String(req.query.actor_user_id ?? '').trim()
    const sinceQ = String(req.query.since ?? '').trim()

    const superUser = isSuperAdminRole(req.user.role)
    const userGa = parseGaId(req.user.gaId)
    if (!superUser && userGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    let sql = `
      SELECT id, actor_user_id, actor_role, action, target_type, target_id, ga_id, company_id, meta, created_at
      FROM security_audit_logs
      WHERE 1=1
    `
    const params = []
    let i = 1
    if (!superUser) {
      sql += ` AND ga_id = $${i}`
      i += 1
      params.push(userGa)
    }
    if (actionQ) {
      sql += ` AND action = $${i}`
      i += 1
      params.push(actionQ)
    }
    if (actorUserIdQ) {
      sql += ` AND actor_user_id = $${i}`
      i += 1
      params.push(actorUserIdQ)
    }
    if (sinceQ) {
      const d = new Date(sinceQ)
      if (!Number.isNaN(d.getTime())) {
        sql += ` AND created_at >= $${i}`
        i += 1
        params.push(d.toISOString())
      }
    }
    sql += ` ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $${i}`
    params.push(limit)

    const r = await systemQuery(pool, sql, params)
    res.json(r.rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/insurer-managers', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const r = await safeQuery(
      pool,
      `
      SELECT im.id, im.company_id, im.insurer_type, im.insurer_name, im.username, im.password_plaintext, im.status, im.created_at, g.code AS ga_code
      FROM insurer_managers im
      INNER JOIN ga_companies g ON g.id = im.ga_id
      WHERE im.ga_id = $1 AND im.is_deleted = false
      ORDER BY im.created_at DESC
      `,
      [gaId],
    )
    res.json(r.rows.map(mapInsurerManagerRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/insurer-managers', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const body = req.body ?? {}
    if (!assertNoInsurerNameInPayload(body, res)) {
      return
    }
    const typeNorm = parseInsurerManagerType(body.insurer_type ?? body.insurerType)
    const companyIdRaw = body.company_id ?? body.companyId
    const companyMasterId = Number(companyIdRaw)
    const { username, password } = body
    if (!typeNorm) {
      res.status(400).json({ message: '보험사 유형을 선택해 주세요.' })
      return
    }
    const link = await validateInsurerManagerCompanyLink(pool, gaId, companyMasterId, typeNorm)
    if (!link.ok) {
      res.status(400).json({ message: link.message })
      return
    }
    const nameNorm = link.master.name
    const validationMessage = validateCredentials(username, password)
    if (validationMessage) {
      res.status(400).json({ message: validationMessage })
      return
    }
    const normalizedUsername = String(username).trim()
    if (await isUsernameTakenGlobally(pool, normalizedUsername)) {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    const dupGaInsurer = await safeQuery(
      pool,
      `
      SELECT 1 FROM insurer_managers
      WHERE ga_id = $1 AND company_id = $2 AND is_deleted = false
      LIMIT 1
      `,
      [gaId, link.master.id],
    )
    if (dupGaInsurer.rowCount > 0) {
      res.status(409).json({ message: '해당 보험사에 이미 등록된 담당자 계정이 있습니다.' })
      return
    }
    const id = randomUUID()
    const plainPw = String(password)
    const passwordHash = await bcrypt.hash(plainPw, 10)
    const ins = await safeQuery(
      pool,
      `
      INSERT INTO insurer_managers (id, ga_id, company_id, insurer_type, insurer_name, username, password_hash, password_plaintext, status, is_deleted)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', false)
      RETURNING id, company_id, insurer_type, insurer_name, username, password_plaintext, status, created_at
      `,
      [id, gaId, link.master.id, typeNorm, nameNorm, normalizedUsername, passwordHash, plainPw],
    )
    const g0 = await systemQuery(pool, `SELECT code FROM ga_companies WHERE id = $1`, [gaId])
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'insurer_manager_create',
        targetType: 'insurer_manager',
        targetId: id,
        gaId,
        companyId: link.master.id,
        meta: { username: normalizedUsername },
      })
    } catch (auditErr) {
      console.error('[audit insurer_manager_create]', auditErr)
    }
    res.status(201).json(
      mapInsurerManagerRow({
        ...ins.rows[0],
        ga_code: g0.rows[0]?.code ?? '',
      }),
    )
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디이거나 동일 보험사에 계정이 있습니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/insurer-managers/:id', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const exist = await safeQuery(
      pool,
      `
      SELECT id, username, insurer_type, insurer_name, status, company_id
      FROM insurer_managers
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    if (exist.rowCount === 0) {
      res.status(404).json({ message: '담당자를 찾을 수 없습니다.' })
      return
    }
    const cur = exist.rows[0]
    const body = req.body ?? {}
    if (!assertNoInsurerNameInPayload(body, res)) {
      return
    }

    let newUsername = null
    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      newUsername = String(body.username ?? '').trim()
      if (!newUsername || newUsername.length < 3 || newUsername.length > 30) {
        res.status(400).json({ message: '아이디는 3~30자여야 합니다.' })
        return
      }
    }
    let newType = null
    if (
      Object.prototype.hasOwnProperty.call(body, 'insurer_type') ||
      Object.prototype.hasOwnProperty.call(body, 'insurerType')
    ) {
      newType = parseInsurerManagerType(body.insurer_type ?? body.insurerType)
      if (!newType) {
        res.status(400).json({ message: '보험사 유형이 올바르지 않습니다.' })
        return
      }
    }
    let newStatus = null
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      newStatus = parseInsurerManagerStatusDb(body.status)
      if (!newStatus) {
        res.status(400).json({ message: 'status는 ACTIVE 또는 BLOCKED 여야 합니다.' })
        return
      }
    }
    let passwordUpdate = null
    if (Object.prototype.hasOwnProperty.call(body, 'password')) {
      const p = body.password
      if (typeof p === 'string' && p.trim() !== '') {
        if (p.length < 4 || p.length > 100) {
          res.status(400).json({ message: '비밀번호는 4~100자여야 합니다.' })
          return
        }
        passwordUpdate = p
      }
    }

    if (newUsername != null && newUsername !== cur.username) {
      if (await isUsernameTakenGlobally(pool, newUsername, { excludeInsurerManagerId: targetId })) {
        res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
        return
      }
    }

    const effectiveType = newType ?? cur.insurer_type
    let nextCompanyId = Number(cur.company_id)
    let nextInsurerName = String(cur.insurer_name ?? '').trim()

    const companyIdTouched =
      Object.prototype.hasOwnProperty.call(body, 'company_id') ||
      Object.prototype.hasOwnProperty.call(body, 'companyId')
    if (companyIdTouched) {
      const cid = Number(body.company_id ?? body.companyId)
      const link = await validateInsurerManagerCompanyLink(pool, gaId, cid, effectiveType)
      if (!link.ok) {
        res.status(400).json({ message: link.message })
        return
      }
      nextCompanyId = link.master.id
      nextInsurerName = link.master.name
    } else if (newType != null && newType !== cur.insurer_type) {
      const link = await validateInsurerManagerCompanyLink(pool, gaId, cur.company_id, newType)
      if (!link.ok) {
        res.status(400).json({ message: link.message })
        return
      }
    }

    if (nextCompanyId !== Number(cur.company_id)) {
      const dup = await safeQuery(
        pool,
        `
        SELECT 1 FROM insurer_managers
        WHERE ga_id = $1 AND company_id = $2 AND is_deleted = false AND id <> $3
        LIMIT 1
        `,
        [gaId, nextCompanyId, targetId],
      )
      if (dup.rowCount > 0) {
        res.status(409).json({ message: '해당 보험사에 이미 등록된 담당자 계정이 있습니다.' })
        return
      }
    }

    const setParts = []
    const vals = []
    let n = 1
    if (newType != null) {
      setParts.push(`insurer_type = $${n++}`)
      vals.push(newType)
    }
    if (nextCompanyId !== Number(cur.company_id)) {
      setParts.push(`company_id = $${n++}`)
      vals.push(nextCompanyId)
      setParts.push(`insurer_name = $${n++}`)
      vals.push(nextInsurerName)
    }
    if (newUsername != null) {
      setParts.push(`username = $${n++}`)
      vals.push(newUsername)
    }
    if (newStatus != null) {
      setParts.push(`status = $${n++}`)
      vals.push(newStatus)
    }
    if (passwordUpdate != null) {
      setParts.push(`password_hash = $${n++}`)
      vals.push(await bcrypt.hash(passwordUpdate, 10))
      setParts.push(`password_plaintext = $${n++}`)
      vals.push(passwordUpdate)
    }

    if (setParts.length === 0) {
      res.status(400).json({ message: '수정할 필드가 없습니다.' })
      return
    }
    setParts.push('updated_at = NOW()')
    const idPos = n
    const gaPos = n + 1
    vals.push(targetId, gaId)
    const upd = await safeQuery(
      pool,
      `
      UPDATE insurer_managers
      SET ${setParts.join(', ')}
      WHERE id = $${idPos} AND ga_id = $${gaPos} AND is_deleted = false
      RETURNING id, company_id, insurer_type, insurer_name, username, password_plaintext, status, created_at
      `,
      vals,
    )
    const g0 = await systemQuery(pool, `SELECT code FROM ga_companies WHERE id = $1`, [gaId])
    const prevCompanyId = Number(cur.company_id)
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'insurer_manager_update',
        targetType: 'insurer_manager',
        targetId,
        gaId,
        companyId: nextCompanyId,
        meta: {
          companyIdChanged: nextCompanyId !== prevCompanyId,
          prevCompanyId,
          statusTouched: newStatus != null,
          usernameTouched: newUsername != null,
        },
      })
    } catch (auditErr) {
      console.error('[audit insurer_manager_update]', auditErr)
    }
    if (newStatus === 'BLOCKED' && String(cur.status ?? '').toUpperCase() !== 'BLOCKED') {
      void logSecurityEvent(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'insurer_manager_deactivate',
        targetType: 'insurer_manager',
        targetId,
        gaId,
        companyId: nextCompanyId,
      })
    }
    res.json(
      mapInsurerManagerRow({
        ...upd.rows[0],
        ga_code: g0.rows[0]?.code ?? '',
      }),
    )
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디이거나 동일 보험사에 계정이 있습니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/insurer-managers/:id', requireAuth, requireGaStaffOrAdminOnly, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const exist = await safeQuery(
      pool,
      `
      SELECT id, company_id
      FROM insurer_managers
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    if (exist.rowCount === 0) {
      res.status(404).json({ message: '담당자를 찾을 수 없습니다.' })
      return
    }
    const companyId = Number(exist.rows[0].company_id)
    await safeQuery(
      pool,
      `
      UPDATE insurer_managers
      SET status = 'BLOCKED', is_deleted = true, updated_at = NOW()
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'insurer_manager_delete',
        targetType: 'insurer_manager',
        targetId,
        gaId,
        companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
      })
    } catch (auditErr) {
      console.error('[audit insurer_manager_delete]', auditErr)
    }
    res.json({ ok: true })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/loss-adjusters', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const r = await safeQuery(
      pool,
      `
      SELECT la.id, la.company_id, la.company_name, la.adjuster_type, la.adjuster_name, la.username, la.password_plaintext, la.status, la.created_at, g.code AS ga_code
      FROM loss_adjusters la
      INNER JOIN ga_companies g ON g.id = la.ga_id
      WHERE la.ga_id = $1 AND la.is_deleted = false
      ORDER BY la.created_at DESC
      `,
      [gaId],
    )
    res.json(r.rows.map(mapLossAdjusterRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/loss-adjusters', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const body = req.body ?? {}
    const companyName = normalizeLossAdjusterCompanyName(
      body.company_name ?? body.companyName ?? body.insurer_name ?? body.insurerName,
    )
    const adjusterName = normalizeLossAdjusterPersonName(
      body.adjuster_name ?? body.adjusterName ?? body.manager_name ?? body.managerName,
    )
    const username = body.username
    const password = body.password
    if (!companyName || !adjusterName) {
      res.status(400).json({ message: '회사명과 손해사정사 이름을 모두 입력해 주세요.' })
      return
    }
    const validationMessage = validateCredentials(username, password)
    if (validationMessage) {
      res.status(400).json({ message: validationMessage })
      return
    }
    const normalizedUsername = String(username).trim()
    if (await isUsernameTakenGlobally(pool, normalizedUsername)) {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    const id = randomUUID()
    const plainPw = String(password)
    const passwordHash = await bcrypt.hash(plainPw, 10)
    const ins = await safeQuery(
      pool,
      `
      INSERT INTO loss_adjusters (id, ga_id, company_id, company_name, adjuster_type, adjuster_name, username, password_hash, password_plaintext, status, is_deleted)
      VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, 'ACTIVE', false)
      RETURNING id, company_id, company_name, adjuster_type, adjuster_name, username, password_plaintext, status, created_at
      `,
      [id, gaId, companyName, LOSS_ADJUSTER_DEFAULT_TYPE, adjusterName, normalizedUsername, passwordHash, plainPw],
    )
    const g0 = await systemQuery(pool, `SELECT code FROM ga_companies WHERE id = $1`, [gaId])
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'loss_adjuster_create',
        targetType: 'loss_adjuster',
        targetId: id,
        gaId,
        companyId: null,
        meta: { username: normalizedUsername, companyName, adjusterName },
      })
    } catch (auditErr) {
      console.error('[audit loss_adjuster_create]', auditErr)
    }
    res.status(201).json(
      mapLossAdjusterRow({
        ...ins.rows[0],
        ga_code: g0.rows[0]?.code ?? '',
      }),
    )
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/loss-adjusters/:id', requireAuth, requireGaInsurerManagerMutator, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const exist = await safeQuery(
      pool,
      `
      SELECT id, username, company_name, adjuster_name, status, company_id
      FROM loss_adjusters
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    if (exist.rowCount === 0) {
      res.status(404).json({ message: '손해사정사 계정을 찾을 수 없습니다.' })
      return
    }
    const cur = exist.rows[0]
    const body = req.body ?? {}

    let newUsername = null
    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      newUsername = String(body.username ?? '').trim()
      if (!newUsername || newUsername.length < 3 || newUsername.length > 30) {
        res.status(400).json({ message: '아이디는 3~30자여야 합니다.' })
        return
      }
    }
    let newCompanyName = null
    const companyNameTouched =
      Object.prototype.hasOwnProperty.call(body, 'company_name') ||
      Object.prototype.hasOwnProperty.call(body, 'companyName') ||
      Object.prototype.hasOwnProperty.call(body, 'insurer_name') ||
      Object.prototype.hasOwnProperty.call(body, 'insurerName')
    if (companyNameTouched) {
      newCompanyName = normalizeLossAdjusterCompanyName(
        body.company_name ?? body.companyName ?? body.insurer_name ?? body.insurerName,
      )
      if (!newCompanyName) {
        res.status(400).json({ message: '회사명을 입력해 주세요.' })
        return
      }
    }
    let newAdjusterName = null
    const adjusterNameTouched =
      Object.prototype.hasOwnProperty.call(body, 'adjuster_name') ||
      Object.prototype.hasOwnProperty.call(body, 'adjusterName') ||
      Object.prototype.hasOwnProperty.call(body, 'manager_name') ||
      Object.prototype.hasOwnProperty.call(body, 'managerName')
    if (adjusterNameTouched) {
      newAdjusterName = normalizeLossAdjusterPersonName(
        body.adjuster_name ?? body.adjusterName ?? body.manager_name ?? body.managerName,
      )
      if (!newAdjusterName) {
        res.status(400).json({ message: '손해사정사 이름을 입력해 주세요.' })
        return
      }
    }
    let newStatus = null
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      newStatus = parseInsurerManagerStatusDb(body.status)
      if (!newStatus) {
        res.status(400).json({ message: 'status는 ACTIVE 또는 BLOCKED 여야 합니다.' })
        return
      }
    }
    let passwordUpdate = null
    if (Object.prototype.hasOwnProperty.call(body, 'password')) {
      const p = body.password
      if (typeof p === 'string' && p.trim() !== '') {
        if (p.length < 4 || p.length > 100) {
          res.status(400).json({ message: '비밀번호는 4~100자여야 합니다.' })
          return
        }
        passwordUpdate = p
      }
    }

    if (newUsername != null && newUsername !== cur.username) {
      if (
        await isUsernameTakenGlobally(pool, newUsername, {
          excludeLossAdjusterId: targetId,
        })
      ) {
        res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
        return
      }
    }

    const setParts = []
    const vals = []
    let n = 1
    if (newCompanyName != null) {
      setParts.push(`company_name = $${n++}`)
      vals.push(newCompanyName)
    }
    if (newAdjusterName != null) {
      setParts.push(`adjuster_name = $${n++}`)
      vals.push(newAdjusterName)
    }
    if (newUsername != null) {
      setParts.push(`username = $${n++}`)
      vals.push(newUsername)
    }
    if (newStatus != null) {
      setParts.push(`status = $${n++}`)
      vals.push(newStatus)
    }
    if (passwordUpdate != null) {
      setParts.push(`password_hash = $${n++}`)
      vals.push(await bcrypt.hash(passwordUpdate, 10))
      setParts.push(`password_plaintext = $${n++}`)
      vals.push(passwordUpdate)
    }

    if (setParts.length === 0) {
      res.status(400).json({ message: '수정할 필드가 없습니다.' })
      return
    }
    setParts.push('updated_at = NOW()')
    const idPos = n
    const gaPos = n + 1
    vals.push(targetId, gaId)
    const upd = await safeQuery(
      pool,
      `
      UPDATE loss_adjusters
      SET ${setParts.join(', ')}
      WHERE id = $${idPos} AND ga_id = $${gaPos} AND is_deleted = false
      RETURNING id, company_id, company_name, adjuster_type, adjuster_name, username, password_plaintext, status, created_at
      `,
      vals,
    )
    const g0 = await systemQuery(pool, `SELECT code FROM ga_companies WHERE id = $1`, [gaId])
    const currentCompanyId = cur.company_id != null ? Number(cur.company_id) : null
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'loss_adjuster_update',
        targetType: 'loss_adjuster',
        targetId,
        gaId,
        companyId: currentCompanyId,
        meta: {
          companyNameTouched: newCompanyName != null,
          adjusterNameTouched: newAdjusterName != null,
          statusTouched: newStatus != null,
          usernameTouched: newUsername != null,
        },
      })
    } catch (auditErr) {
      console.error('[audit loss_adjuster_update]', auditErr)
    }
    res.json(
      mapLossAdjusterRow({
        ...upd.rows[0],
        ga_code: g0.rows[0]?.code ?? '',
      }),
    )
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/loss-adjusters/:id', requireAuth, requireGaStaffOrAdminOnly, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const exist = await safeQuery(
      pool,
      `
      SELECT id, company_id
      FROM loss_adjusters
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    if (exist.rowCount === 0) {
      res.status(404).json({ message: '손해사정사 계정을 찾을 수 없습니다.' })
      return
    }
    const companyId = Number(exist.rows[0].company_id)
    await safeQuery(
      pool,
      `
      UPDATE loss_adjusters
      SET status = 'BLOCKED', is_deleted = true, updated_at = NOW()
      WHERE id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [targetId, gaId],
    )
    try {
      await writeSecurityAudit(pool, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'loss_adjuster_delete',
        targetType: 'loss_adjuster',
        targetId,
        gaId,
        companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
      })
    } catch (auditErr) {
      console.error('[audit loss_adjuster_delete]', auditErr)
    }
    res.json({ ok: true })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/ga', requireAuth, async (req, res) => {
  try {
    if (isSuperAdminRole(req.user.role)) {
      const r = await systemQuery(
        pool,
        `
        SELECT id, name, code, status, created_at
        FROM ga_companies
        WHERE is_deleted = false
        ORDER BY id ASC
        `,
      )
      res.json(r.rows)
      return
    }
    const gid = parseGaId(req.user?.gaId)
    if (gid == null) {
      res.json([])
      return
    }
    const r = await systemQuery(
      pool,
      `
      SELECT id, name, code, status, created_at
      FROM ga_companies
      WHERE id = $1 AND is_deleted = false
      `,
      [gid],
    )
    res.json(r.rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/admin/ga', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim()
    const code = String(req.body?.code ?? '').trim().toUpperCase()
    if (!name || !code) {
      res.status(400).json({ message: 'name과 code가 필요합니다.' })
      return
    }
    if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
      res.status(400).json({ message: 'code는 2~32자의 영문 대문자·숫자·밑줄만 사용할 수 있습니다.' })
      return
    }
    const ins = await systemQuery(
      pool,
      `
      INSERT INTO ga_companies (name, code, status, is_deleted)
      VALUES ($1, $2, 'active', false)
      RETURNING id, name, code, status, created_at
      `,
      [name, code],
    )
    res.status(201).json(ins.rows[0])
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 존재하는 코드입니다' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/admin/ga/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 GA ID입니다.' })
      return
    }
    const exists = await systemQuery(
      pool,
      `SELECT id, name, code FROM ga_companies WHERE id = $1 AND is_deleted = false`,
      [id],
    )
    if (exists.rowCount === 0) {
      res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const beforeName = String(exists.rows[0].name ?? '')
    const beforeCode = String(exists.rows[0].code ?? '')
    let nextName = beforeName
    let nextCode = beforeCode

    const parts = []
    const vals = []
    let n = 1
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name ?? '').trim()
      if (!name) {
        res.status(400).json({ message: 'name이 비어 있을 수 없습니다.' })
        return
      }
      nextName = name
      parts.push(`name = $${n++}`)
      vals.push(name)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'code')) {
      const code = String(body.code ?? '').trim().toUpperCase()
      if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
        res.status(400).json({ message: 'code는 2~32자의 영문 대문자·숫자·밑줄만 사용할 수 있습니다.' })
        return
      }
      const dupCode = await systemQuery(
        pool,
        `
        SELECT 1 FROM ga_companies
        WHERE code = $1 AND id <> $2 AND is_deleted = false
        LIMIT 1
        `,
        [code, id],
      )
      if (dupCode.rowCount > 0) {
        res.status(409).json({ message: '이미 존재하는 코드입니다' })
        return
      }
      nextCode = code
      parts.push(`code = $${n++}`)
      vals.push(code)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const st = parseEntityStatus(body.status)
      if (!st) {
        res.status(400).json({ message: 'status는 active, blocked, inactive 중 하나여야 합니다.' })
        return
      }
      parts.push(`status = $${n++}`)
      vals.push(st)
    }

    if (parts.length === 0) {
      res.status(400).json({ message: '수정할 필드가 없습니다.' })
      return
    }

    const shouldWriteHistory = beforeName !== nextName || beforeCode !== nextCode
    const changedBy = String(req.user?.id ?? '').trim() || 'system'

    const client = await pool.connect()
    let upd
    try {
      await client.query('BEGIN')

      if (shouldWriteHistory) {
        await systemQuery(
          client,
          `
          INSERT INTO ga_history (
            ga_id,
            old_code,
            new_code,
            old_name,
            new_name,
            changed_by,
            changed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `,
          [id, beforeCode, nextCode, beforeName, nextName, changedBy],
        )
      }

      vals.push(id)
      upd = await systemQuery(
        client,
        `
        UPDATE ga_companies
        SET ${parts.join(', ')}
        WHERE id = $${n} AND is_deleted = false
        RETURNING id, name, code, status, created_at
        `,
        vals,
      )
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
        return
      }
      await client.query('COMMIT')
    } catch (txError) {
      await client.query('ROLLBACK')
      throw txError
    } finally {
      client.release()
    }

    res.json(upd.rows[0])
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 존재하는 코드입니다' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/ga/:id/history', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 GA ID입니다.' })
      return
    }
    const rows = await systemQuery(
      pool,
      `
      SELECT id, ga_id, old_code, new_code, old_name, new_name, changed_by, changed_at
      FROM ga_history
      WHERE ga_id = $1
      ORDER BY changed_at DESC, id DESC
      `,
      [id],
    )
    res.json(rows.rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/admin/ga/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 GA ID입니다.' })
      return
    }
    const upd = await systemQuery(
      pool,
      `
      UPDATE ga_companies
      SET is_deleted = true
      WHERE id = $1 AND is_deleted = false
      RETURNING id
      `,
      [id],
    )
    if (upd.rowCount === 0) {
      res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
      return
    }
    res.status(204).send()
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/users', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const filterGa = parseGaId(req.query.ga_id ?? req.query.gaId)
    const r = await safeQuery(pool,
      `
      SELECT
        u.id,
        u.ga_id,
        u.display_name,
        g.name AS ga_company_name,
        u.username,
        u.role,
        u.status,
        u.created_at
      FROM users u
      INNER JOIN ga_companies g ON g.id = u.ga_id
      WHERE u.is_deleted = false AND g.is_deleted = false
        AND ($1::int IS NULL OR u.ga_id = $1::int)
      ORDER BY g.name ASC, u.username ASC
      `,
      [filterGa],
    )
    const rows = r.rows.map((row) => ({
      id: String(row.id),
      ga_id: row.ga_id,
      display_name: String(row.display_name ?? '').trim(),
      ga_company_name: row.ga_company_name,
      username: row.username,
      role: normalizeUserRole(row.role),
      status: String(row.status ?? 'active').toLowerCase(),
      created_at: toIsoString(row.created_at),
    }))
    res.json(rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/admin/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 사용자 ID입니다.' })
      return
    }

    const body = req.body ?? {}
    const hasGa = Object.prototype.hasOwnProperty.call(body, 'ga_id') || Object.prototype.hasOwnProperty.call(body, 'gaId')
    const hasRole = Object.prototype.hasOwnProperty.call(body, 'role')
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status')

    const gaId = hasGa ? parseGaId(body.ga_id ?? body.gaId) : null
    const roleNorm = hasRole ? parseAdminPatchRole(body.role) : null
    const statusNorm = hasStatus ? parseEntityStatus(body.status) : null

    if (!hasGa && !hasRole && !hasStatus) {
      res.status(400).json({ message: 'ga_id, role, status 중 하나 이상이 필요합니다.' })
      return
    }
    if (hasGa && gaId == null) {
      res.status(400).json({ message: 'ga_id가 올바르지 않습니다.' })
      return
    }
    if (hasRole && !roleNorm) {
      res.status(400).json({
        message: 'role이 올바르지 않습니다. (USER, GA_ADMIN, GA_STAFF, SUPER_ADMIN 또는 user, admin, super_admin)',
      })
      return
    }
    if (hasStatus && !statusNorm) {
      res.status(400).json({ message: 'status는 active, blocked, inactive 중 하나여야 합니다.' })
      return
    }

    if (gaId != null) {
      const gaOk = await systemQuery(
        pool,
        `SELECT 1 FROM ga_companies WHERE id = $1 AND is_deleted = false`,
        [gaId],
      )
      if (gaOk.rows.length === 0) {
        res.status(400).json({ message: '유효하지 않은 GA입니다.' })
        return
      }
    }

    const before = await systemQuery(pool,
      `SELECT id, ga_id FROM users WHERE id = $1 AND is_deleted = false`,
      [targetId],
    )
    if (before.rows.length === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
      return
    }
    const prevGaId = parseGaId(before.rows[0].ga_id)
    if (prevGaId == null) {
      res.status(400).json({ message: '사용자 GA 정보가 올바르지 않습니다.' })
      return
    }

    const parts = []
    const vals = []
    let n = 1
    if (gaId != null) {
      parts.push(`ga_id = $${n++}`)
      vals.push(gaId)
    }
    if (roleNorm) {
      parts.push(`role = $${n++}`)
      vals.push(roleNorm)
      if (roleNorm !== 'GA_ADMIN' && roleNorm !== 'GA_STAFF') {
        parts.push('delegate_password_plaintext = NULL')
      }
    }
    if (statusNorm) {
      parts.push(`status = $${n++}`)
      vals.push(statusNorm)
    }

    vals.push(targetId, prevGaId)
    const upd = await safeQuery(pool,
      `
      UPDATE users
      SET ${parts.join(', ')}
      WHERE id = $${n} AND ga_id = $${n + 1} AND is_deleted = false
      RETURNING id, username, ga_id, display_name, role, status, created_at
      `,
      vals,
    )
    if (upd.rowCount === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
      return
    }
    const row = upd.rows[0]
    const g = await systemQuery(pool, `SELECT name FROM ga_companies WHERE id = $1`, [row.ga_id])
    res.json({
      id: String(row.id),
      username: row.username,
      display_name: String(row.display_name ?? '').trim(),
      ga_id: row.ga_id,
      ga_company_name: g.rows[0]?.name ?? '',
      role: normalizeUserRole(row.role),
      status: String(row.status ?? 'active').toLowerCase(),
      created_at: toIsoString(row.created_at),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/admin/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const targetId = String(req.params.id ?? '').trim()
    const actorId = String(req.user?.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 사용자 ID입니다.' })
      return
    }
    if (actorId && targetId === actorId) {
      res.status(400).json({ message: '자기 자신은 삭제할 수 없습니다.' })
      return
    }

    const scope = await systemQuery(pool,
      `SELECT id, username FROM users WHERE id = $1 AND is_deleted = false`,
      [targetId],
    )
    if (scope.rowCount === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
      return
    }
    const bootstrapUsername = String(process.env.INSURANCE_ADMIN_BOOTSTRAP_USERNAME || 'admin').trim()
    if (String(scope.rows[0].username ?? '').trim() === bootstrapUsername) {
      res.status(403).json({ message: '시스템에서 보호되는 관리자 계정은 삭제할 수 없습니다.' })
      return
    }

    await client.query('BEGIN')
    await client.query(`DELETE FROM sms_verification_codes WHERE user_id = $1`, [targetId])
    await client.query(`DELETE FROM sms_verification_logs WHERE user_id = $1`, [targetId])
    const soft = await client.query(
      `
      UPDATE users
      SET is_deleted = true, status = 'inactive'
      WHERE id = $1 AND is_deleted = false
      RETURNING id
      `,
      [targetId],
    )
    await client.query('COMMIT')
    if (soft.rowCount === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
      return
    }
    res.status(204).send()
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    handleDbError(error, req, res)
  } finally {
    client.release()
  }
})

/**
 * GA 담당자(GA_ADMIN/GA_STAFF) 계정 생성 공통 검증·삽입.
 * @returns {{ ok: true, id: string, username: string, role: string, ga_id: number, displayName: string } | { ok: false, status: number, message: string }}
 */
async function tryCreateGaDelegateFromRequest(req) {
  const isSuper = isSuperAdminRole(req.user?.role)
  const actorGaId = parseGaId(req.user?.gaId)
  if (!isSuper && actorGaId == null) {
    return { ok: false, status: 400, message: 'GA 컨텍스트가 없습니다.' }
  }
  const { username, password, name, ga_id: gaRaw, gaId: gaBody, role: roleRaw } = req.body ?? {}
  const targetGaId = parseGaId(gaRaw ?? gaBody)
  if (targetGaId == null) {
    return { ok: false, status: 400, message: 'ga_id가 필요합니다.' }
  }
  if (!isSuper && targetGaId !== actorGaId) {
    return { ok: false, status: 403, message: '자신이 속한 GA에만 사용자를 생성할 수 있습니다.' }
  }
  const gaOk = await systemQuery(
    pool,
    `
    SELECT 1 FROM ga_companies
    WHERE id = $1 AND is_deleted = false AND status = 'active'
    `,
    [targetGaId],
  )
  if (gaOk.rowCount === 0) {
    return { ok: false, status: 400, message: '유효하지 않은 GA입니다.' }
  }

  const roleNorm = typeof roleRaw === 'string' ? roleRaw.trim().toUpperCase() : ''
  const targetRole = GA_DELEGATE_ROLES.includes(roleNorm) ? roleNorm : null
  if (!targetRole) {
    return { ok: false, status: 400, message: 'role은 GA_ADMIN 또는 GA_STAFF 여야 합니다.' }
  }

  const validationMessage = validateCredentials(username, password)
  if (validationMessage) {
    return { ok: false, status: 400, message: validationMessage }
  }

  const normalizedUsername = String(username).trim()
  const displayName = String(name ?? '').trim()
  if (await isUsernameTakenGlobally(pool, normalizedUsername)) {
    return { ok: false, status: 409, message: '이미 사용 중인 아이디입니다.' }
  }
  const plainPassword = String(password)
  const passwordHash = await bcrypt.hash(plainPassword, 10)
  const id = randomUUID()

  const invitedBy = String(req.user?.id ?? '').trim()
  if (!invitedBy) {
    return { ok: false, status: 401, message: '생성 주체를 확인할 수 없습니다.' }
  }

  await safeQuery(pool,
    `
    INSERT INTO users (id, username, password_hash, role, display_name, ga_id, delegate_password_plaintext, invited_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [id, normalizedUsername, passwordHash, targetRole, displayName, targetGaId, plainPassword, invitedBy],
  )

  return { ok: true, id, username: normalizedUsername, role: targetRole, ga_id: targetGaId, displayName }
}

async function postAdminCreateDelegateUser(req, res) {
  try {
    const result = await tryCreateGaDelegateFromRequest(req)
    if (!result.ok) {
      res.status(result.status).json({ message: result.message })
      return
    }
    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        username: result.username,
        role: result.role,
        ga_id: result.ga_id,
        displayName: result.displayName,
      },
    })
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
}

apiRouter.post('/admin/user', requireAuth, requireSuperAdmin, postAdminCreateDelegateUser)

apiRouter.get('/admin/delegates', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await systemQuery(
      pool,
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.status,
        u.created_at,
        u.ga_id,
        u.delegate_password_plaintext,
        g.name AS ga_name,
        g.code AS ga_code
      FROM users u
      INNER JOIN ga_companies g ON g.id = u.ga_id
      WHERE u.is_deleted = false
        AND g.is_deleted = false
        AND u.role IN ('GA_ADMIN', 'GA_STAFF')
      ORDER BY g.name ASC, u.username ASC
      `,
    )
    res.json(r.rows.map(mapGaDelegateAdminRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/admin/delegates', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await tryCreateGaDelegateFromRequest(req)
    if (!result.ok) {
      res.status(result.status).json({ message: result.message })
      return
    }
    const rowQ = await systemQuery(
      pool,
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.status,
        u.created_at,
        u.ga_id,
        u.delegate_password_plaintext,
        g.name AS ga_name,
        g.code AS ga_code
      FROM users u
      INNER JOIN ga_companies g ON g.id = u.ga_id
      WHERE u.id = $1
      `,
      [result.id],
    )
    res.status(201).json(mapGaDelegateAdminRow(rowQ.rows[0]))
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/admin/delegates/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id ?? '').trim()
    if (!targetId) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const curQ = await systemQuery(
      pool,
      `
      SELECT id, username, role, status, ga_id, delegate_password_plaintext
      FROM users
      WHERE id = $1 AND is_deleted = false
      `,
      [targetId],
    )
    if (curQ.rowCount === 0) {
      res.status(404).json({ message: '담당자를 찾을 수 없습니다.' })
      return
    }
    const cur = curQ.rows[0]
    const roleNorm = normalizeUserRole(cur.role)
    if (roleNorm !== 'GA_ADMIN' && roleNorm !== 'GA_STAFF') {
      res.status(400).json({ message: 'GA 담당자 계정만 수정할 수 있습니다.' })
      return
    }

    const body = req.body ?? {}
    let newUsername = null
    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      newUsername = String(body.username ?? '').trim()
      if (!newUsername || newUsername.length < 3 || newUsername.length > 30) {
        res.status(400).json({ message: '아이디는 3~30자여야 합니다.' })
        return
      }
    }
    let newStatus = null
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      newStatus = parseEntityStatus(body.status)
      if (!newStatus) {
        res.status(400).json({ message: 'status는 active, blocked, inactive 중 하나여야 합니다.' })
        return
      }
    }
    let passwordUpdate = null
    if (Object.prototype.hasOwnProperty.call(body, 'password')) {
      const p = body.password
      if (typeof p === 'string' && p.trim() !== '') {
        if (p.length < 4 || p.length > 100) {
          res.status(400).json({ message: '비밀번호는 4~100자여야 합니다.' })
          return
        }
        passwordUpdate = p
      }
    }

    if (newUsername != null && newUsername !== cur.username) {
      if (await isUsernameTakenGlobally(pool, newUsername, { excludeUserId: targetId })) {
        res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
        return
      }
    }

    const setParts = []
    const vals = []
    let n = 1
    if (newUsername != null && newUsername !== cur.username) {
      setParts.push(`username = $${n++}`)
      vals.push(newUsername)
    }
    const curStatus = String(cur.status ?? 'active').toLowerCase()
    if (newStatus != null && newStatus !== curStatus) {
      setParts.push(`status = $${n++}`)
      vals.push(newStatus)
    }
    if (passwordUpdate != null) {
      setParts.push(`password_hash = $${n++}`)
      vals.push(await bcrypt.hash(passwordUpdate, 10))
      setParts.push(`delegate_password_plaintext = $${n++}`)
      vals.push(passwordUpdate)
    }
    if (setParts.length > 0) {
      const curGaId = parseGaId(cur.ga_id)
      if (curGaId == null) {
        res.status(400).json({ message: '담당자 GA 정보가 올바르지 않습니다.' })
        return
      }
      vals.push(targetId, curGaId)
      await safeQuery(
        pool,
        `
        UPDATE users
        SET ${setParts.join(', ')}
        WHERE id = $${n} AND ga_id = $${n + 1} AND is_deleted = false
        RETURNING id
        `,
        vals,
      )
    }
    const rowQ = await systemQuery(
      pool,
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.status,
        u.created_at,
        u.ga_id,
        u.delegate_password_plaintext,
        g.name AS ga_name,
        g.code AS ga_code
      FROM users u
      INNER JOIN ga_companies g ON g.id = u.ga_id
      WHERE u.id = $1
      `,
      [targetId],
    )
    res.json(mapGaDelegateAdminRow(rowQ.rows[0]))
  } catch (error) {
    if (error?.code === '23505') {
      res.status(409).json({ message: '이미 사용 중인 아이디입니다.' })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.post('/feature-request', requireAuth, async (req, res) => {
  try {
    const gaId = parseGaId(req.user?.gaId)
    const userId = req.user?.id
    if (gaId == null || !userId) {
      res.status(400).json({ message: '세션 정보가 올바르지 않습니다.' })
      return
    }
    const content = String(req.body?.content ?? '').trim()
    if (!content) {
      res.status(400).json({ message: '내용을 입력해 주세요.' })
      return
    }
    if (content.length > 8000) {
      res.status(400).json({ message: '내용은 8000자 이하로 입력해 주세요.' })
      return
    }
    let title = String(req.body?.title ?? '').trim()
    if (title.length > 200) {
      res.status(400).json({ message: '제목은 200자 이하로 입력해 주세요.' })
      return
    }
    if (!title) {
      title = content.length > 120 ? `${content.slice(0, 117)}...` : content
    }
    const ins = await safeQuery(pool,
      `
      INSERT INTO feature_requests (ga_id, user_id, title, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
      `,
      [gaId, userId, title, content],
    )
    res.status(201).json({
      id: ins.rows[0].id,
      created_at: toIsoString(ins.rows[0].created_at),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/feature-requests/my', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    const gaId = parseGaId(req.user?.gaId)
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const r = await safeQuery(pool,
      `
      SELECT
        fr.id,
        fr.title,
        fr.content,
        fr.status,
        fr.created_at,
        (
          SELECT COUNT(*)
          FROM feature_request_comments c
          WHERE c.feature_request_id = fr.id
        )::int AS comment_count
      FROM feature_requests fr
      WHERE fr.user_id = $1 AND fr.ga_id = $2
      ORDER BY fr.created_at DESC
      LIMIT 200
      `,
      [userId, gaId],
    )
    const rows = r.rows.map((row) => ({
      id: row.id,
      title: String(row.title ?? ''),
      content: row.content,
      status: row.status,
      created_at: toIsoString(row.created_at),
      comment_count: Number(row.comment_count ?? 0),
    }))
    res.json(rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/feature-requests/my/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const userId = req.user?.id
    const gaId = parseGaId(req.user?.gaId)
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const del = await safeQuery(
      pool,
      `
      DELETE FROM feature_requests
      WHERE id = $1 AND user_id = $2 AND ga_id = $3
      `,
      [id, userId, gaId],
    )
    if (del.rowCount === 0) {
      res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
      return
    }
    res.status(204).send()
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/admin/feature-requests', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const actorGa = parseGaId(req.user?.gaId)
    if (actorGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const r = await safeQuery(pool,
      `
      SELECT
        fr.id,
        fr.ga_id,
        g.name AS ga_name,
        u.username,
        COALESCE(fr.title, '') AS title,
        fr.content,
        fr.status,
        fr.created_at,
        (
          SELECT COUNT(*)
          FROM feature_request_comments c
          WHERE c.feature_request_id = fr.id
        )::int AS comment_count
      FROM feature_requests fr
      INNER JOIN ga_companies g ON g.id = fr.ga_id
      INNER JOIN users u ON u.id = fr.user_id
      WHERE fr.ga_id = $1
      ORDER BY fr.created_at DESC
      LIMIT 500
      `,
      [actorGa],
    )
    const rows = r.rows.map((row) => ({
      id: row.id,
      ga_id: row.ga_id,
      ga_name: row.ga_name,
      username: row.username,
      title: String(row.title ?? ''),
      content: row.content,
      status: row.status,
      created_at: toIsoString(row.created_at),
      comment_count: Number(row.comment_count ?? 0),
    }))
    res.json(rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/admin/feature-requests/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const status = String(req.body?.status ?? '').trim()
    if (!FEATURE_REQUEST_STATUSES.includes(status)) {
      res.status(400).json({ message: 'status는 pending, reviewed, done 중 하나여야 합니다.' })
      return
    }
    const actorGa = parseGaId(req.user?.gaId)
    if (actorGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const upd = await safeQuery(pool,
      `
      UPDATE feature_requests
      SET status = $1
      WHERE id = $2 AND ga_id = $3
      RETURNING id, ga_id, user_id, title, content, status, created_at
      `,
      [status, id, actorGa],
    )
    if (upd.rowCount === 0) {
      res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
      return
    }
    const row = upd.rows[0]
    res.json({
      id: row.id,
      ga_id: row.ga_id,
      user_id: row.user_id,
      title: String(row.title ?? ''),
      content: row.content,
      status: row.status,
      created_at: toIsoString(row.created_at),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

// ─── 문의/요청 댓글 ─────────────────────────────────────────────────────────
// - 요청자는 자신이 올린 요청의 댓글만 조회(읽기 전용).
// - 관리자(SUPER_ADMIN)는 본인 GA 범위의 요청에 대해서만 조회/작성.
// - 현재는 관리자 답변만 허용하므로 POST 라우트는 admin 쪽에만 둔다.
//   추후 요청자 회신을 허용하고 싶다면 "POST /feature-requests/my/:id/comments"
//   라우트를 추가하고 author_role = 'user' 로 기록하면 된다.
const FEATURE_REQUEST_COMMENT_MAX_LEN = 4000

function mapFeatureRequestCommentRow(row) {
  return {
    id: row.id,
    authorRole: row.author_role,
    authorUsername: row.author_username ?? null,
    authorId: row.author_user_id,
    createdAt: toIsoString(row.created_at),
    content: row.content,
  }
}

apiRouter.get('/feature-requests/my/:id/comments', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: '잘못된 ID입니다.' })
      return
    }
    const userId = req.user?.id
    const gaId = parseGaId(req.user?.gaId)
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    // 소유권 확인: 자신의 GA · 자신의 요청에 대해서만 허용.
    const own = await safeQuery(
      pool,
      `SELECT 1 FROM feature_requests WHERE id = $1 AND user_id = $2 AND ga_id = $3`,
      [id, userId, gaId],
    )
    if (own.rowCount === 0) {
      res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
      return
    }
    const r = await safeQuery(
      pool,
      `
      SELECT id, feature_request_id, author_user_id, author_role, author_username, content, created_at
      FROM feature_request_comments
      WHERE feature_request_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT 500
      `,
      [id],
    )
    res.json(r.rows.map(mapFeatureRequestCommentRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get(
  '/admin/feature-requests/:id/comments',
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ message: '잘못된 ID입니다.' })
        return
      }
      const actorGa = parseGaId(req.user?.gaId)
      if (actorGa == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const own = await safeQuery(
        pool,
        `SELECT 1 FROM feature_requests WHERE id = $1 AND ga_id = $2`,
        [id, actorGa],
      )
      if (own.rowCount === 0) {
        res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
        return
      }
      const r = await safeQuery(
        pool,
        `
        SELECT id, feature_request_id, author_user_id, author_role, author_username, content, created_at
        FROM feature_request_comments
        WHERE feature_request_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT 500
        `,
        [id],
      )
      res.json(r.rows.map(mapFeatureRequestCommentRow))
    } catch (error) {
      handleDbError(error, req, res)
    }
  },
)

apiRouter.post(
  '/admin/feature-requests/:id/comments',
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ message: '잘못된 ID입니다.' })
        return
      }
      const rawContent = String(req.body?.content ?? '').trim()
      if (!rawContent) {
        res.status(400).json({ message: '내용을 입력해 주세요.' })
        return
      }
      if (rawContent.length > FEATURE_REQUEST_COMMENT_MAX_LEN) {
        res.status(400).json({
          message: `내용은 ${FEATURE_REQUEST_COMMENT_MAX_LEN}자 이하로 입력해 주세요.`,
        })
        return
      }
      const actorId = req.user?.id
      const actorUsername = req.user?.username ?? null
      const actorGa = parseGaId(req.user?.gaId)
      if (!actorId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      if (actorGa == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const own = await safeQuery(
        pool,
        `SELECT 1 FROM feature_requests WHERE id = $1 AND ga_id = $2`,
        [id, actorGa],
      )
      if (own.rowCount === 0) {
        res.status(404).json({ message: '요청을 찾을 수 없습니다.' })
        return
      }
      const ins = await safeQuery(
        pool,
        `
        INSERT INTO feature_request_comments
          (feature_request_id, author_user_id, author_role, author_username, content)
        VALUES ($1, $2, 'admin', $3, $4)
        RETURNING id, feature_request_id, author_user_id, author_role, author_username, content, created_at
        `,
        [id, actorId, actorUsername, rawContent],
      )
      res.status(201).json(mapFeatureRequestCommentRow(ins.rows[0]))
    } catch (error) {
      handleDbError(error, req, res)
    }
  },
)

apiRouter.get('/company/list', requireAuth, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    let scope = {}
    if (isNewsManagerRole(req.user?.role)) {
      const cid = parseCompanyScopeId(req.user?.companyId)
      if (cid == null) {
        forbiddenResponse(req, res, '담당자 계정에 연결된 회사가 없습니다.', { route: 'GET /company/list' })
        return
      }
      scope = { onlyCompanyId: cid }
    }
    const list = await loadCompanyDirectoryNestedList(gaId, scope)
    res.json(list)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/company/recent-updates', requireAuth, async (req, res) => {
  try {
    const gaId = await resolveTenantGaIdForRequest(pool, req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const params = [gaId]
    let extra = ''
    if (isNewsManagerRole(req.user?.role)) {
      const cid = parseCompanyScopeId(req.user?.companyId)
      if (cid == null) {
        forbiddenResponse(req, res, '담당자 계정에 연결된 회사가 없습니다.', {
          route: 'GET /company/recent-updates',
        })
        return
      }
      params.push(cid)
      extra = ' AND company_id = $2'
    }
    const result = await safeQuery(pool,
      `
      SELECT
        id,
        company_id,
        company_name,
        category,
        updated_at,
        updated_by_username,
        before_payload,
        after_payload
      FROM insurance_company_update_log
      WHERE ga_id = $1${extra}
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 200
      `,
      params,
    )
    const rows = result.rows.map((row) => {
      const ts = row.updated_at
      const d = ts instanceof Date ? ts : new Date(ts)
      const dateStr = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
      return {
        id: String(row.id),
        companyId: row.company_id != null ? String(row.company_id) : '',
        companyName: row.company_name ?? '',
        category: row.category ?? '',
        updatedAt: dateStr,
        updatedBy: String(row.updated_by_username ?? '').trim() || '—',
        before: normalizeHistoryPayload(row.before_payload),
        after: normalizeHistoryPayload(row.after_payload),
      }
    })
    res.json(rows)
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/company/full-save', requireAuth, requireGaTenantAdmin, async (req, res) => {
  try {
    const tenantGa = await resolveTenantGaIdForRequest(pool, req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const editor = String(req.user?.username ?? '').trim() || 'staff'
    const { company: co, contacts: contactsIn } = req.body ?? {}
    const name = String(co?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ message: '보험사를 선택하세요.' })
      return
    }

    const category = resolveInsuranceCategoryForApi(co?.category, name)
    if (!category || !['LIFE', 'NON_LIFE', 'GENERAL'].includes(category)) {
      res.status(400).json({ message: '보험 종류(생명/손해/일반)를 선택하세요.' })
      return
    }

    const customerCenter = String(co?.customerCenter ?? co?.customer_center ?? '').trim()
    const systemPhone = String(co?.systemPhone ?? co?.system_phone ?? '').trim()
    const incallNumber = String(co?.incallNumber ?? co?.incall_number ?? '').trim()
    const visitInfo = String(co?.visitInfo ?? co?.visit_info ?? '').trim()

    const rawId = co?.id
    let existingId =
      rawId != null && rawId !== '' && Number.isInteger(Number(rawId)) && Number(rawId) > 0
        ? Number(rawId)
        : null

    const codeIn = String(co?.companyCode ?? co?.company_code ?? '').trim()

    const contactsList = Array.isArray(contactsIn) ? contactsIn : []

    const companyId = await withTransaction(async (client) => {
      if (!existingId && /^INS\d+$/.test(codeIn)) {
        const foundByCode = await safeQuery(client,
          `SELECT id FROM insurance_company_master WHERE ga_id = $1 AND company_code = $2`,
          [tenantGa, codeIn],
        )
        if (foundByCode.rowCount > 0) {
          existingId = Number(foundByCode.rows[0].id)
        }
      }

      let beforeSnap = emptyCompanySnapshot()
      if (existingId) {
        beforeSnap = await loadCompanySnapshot(client, existingId, tenantGa)
      }

      let cid
      if (existingId) {
        const updated = await safeQuery(client,
          `
          UPDATE insurance_company_master
          SET
            category = $1,
            name = $2,
            customer_center = $3,
            system_phone = $4,
            incall_number = $5,
            visit_info = $6,
            updated_at = NOW(),
            updated_by_username = $7
          WHERE id = $8 AND ga_id = $9
          RETURNING id
          `,
          [
            category,
            name,
            customerCenter,
            systemPhone,
            incallNumber,
            visitInfo,
            editor,
            existingId,
            tenantGa,
          ],
        )
        if (updated.rowCount === 0) {
          const err = new Error('해당 보험사를 찾을 수 없습니다.')
          err.httpStatus = 404
          throw err
        }
        cid = existingId
        await ensureMasterCompanyCode(client, cid)
        await safeQuery(
          client,
          `
          DELETE FROM insurance_company_contacts ic
          USING insurance_company_master m
          WHERE ic.company_id = m.id AND ic.company_id = $1 AND m.ga_id = $2
          `,
          [cid, tenantGa],
        )
      } else {
        let inserted
        try {
          inserted = await safeQuery(client,
            `
            INSERT INTO insurance_company_master (
              ga_id, category, name, customer_center, system_phone, incall_number, visit_info,
              updated_at, updated_by_username
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
            RETURNING id
            `,
            [tenantGa, category, name, customerCenter, systemPhone, incallNumber, visitInfo, editor],
          )
        } catch (e) {
          if (e.code !== '23505') {
            throw e
          }
          const dedupe = await safeQuery(client,
            `
            SELECT id
            FROM insurance_company_master
            WHERE ga_id = $1 AND category = $2 AND TRIM(name) = TRIM($3)
            LIMIT 1
            `,
            [tenantGa, category, name],
          )
          if (dedupe.rowCount === 0) {
            throw e
          }
          existingId = Number(dedupe.rows[0].id)
          beforeSnap = await loadCompanySnapshot(client, existingId, tenantGa)
          const updatedIns = await safeQuery(client,
            `
            UPDATE insurance_company_master
            SET
              category = $1,
              name = $2,
              customer_center = $3,
              system_phone = $4,
              incall_number = $5,
              visit_info = $6,
              updated_at = NOW(),
              updated_by_username = $7
            WHERE id = $8 AND ga_id = $9
            RETURNING id
            `,
            [
              category,
              name,
              customerCenter,
              systemPhone,
              incallNumber,
              visitInfo,
              editor,
              existingId,
              tenantGa,
            ],
          )
          if (updatedIns.rowCount === 0) {
            throw e
          }
          cid = existingId
          await ensureMasterCompanyCode(client, cid)
          await safeQuery(
            client,
            `
            DELETE FROM insurance_company_contacts ic
            USING insurance_company_master m
            WHERE ic.company_id = m.id AND ic.company_id = $1 AND m.ga_id = $2
            `,
            [cid, tenantGa],
          )
          inserted = null
        }
        if (inserted) {
          cid = inserted.rows[0].id
          await ensureMasterCompanyCode(client, cid)
        }
      }

      for (const c of contactsList) {
        const cn = String(c?.name ?? '').trim()
        const cp = String(c?.position ?? '').trim()
        const cph = String(c?.phone ?? '').trim()
        if (!cn && !cp && !cph) {
          continue
        }
        await safeQuery(client,
          `
          INSERT INTO insurance_company_contacts (company_id, name, position, phone)
          SELECT $1, $2, $3, $4
          FROM insurance_company_master m
          WHERE m.id = $1 AND m.ga_id = $5
          `,
          [cid, cn, cp, cph, tenantGa],
        )
      }

      const afterSnap = buildCompanySnapshotFromPayload(
        customerCenter,
        systemPhone,
        incallNumber,
        visitInfo,
        contactsList,
      )

      await safeQuery(client,
        `
        INSERT INTO insurance_company_update_log (
          ga_id, company_id, company_name, category, updated_by_username, before_payload, after_payload
        )
        VALUES ($1, $2, $3, $4, $5, CAST($6 AS jsonb), CAST($7 AS jsonb))
        `,
        [
          tenantGa,
          cid,
          name,
          category,
          editor,
          JSON.stringify(beforeSnap),
          JSON.stringify(afterSnap),
        ],
      )

      return cid
    })

    const list = await loadCompanyDirectoryNestedList(tenantGa)
    const data = list.find((x) => x.id === companyId) ?? null

    const wasUpdate = Boolean(existingId)
    if (wasUpdate) {
      res.json({ success: true, data })
      return
    }
    res.status(201).json({ success: true, data })
  } catch (error) {
    if (error.httpStatus === 404) {
      res.status(404).json({ message: error.message })
      return
    }
    handleDbError(error, req, res)
  }
})

/** 원수사 마스터 행 완전 삭제 — 소식지 등은 company_id 해제·이름 스냅샷만 유지, 담당자는 비활성·연결 해제 */
apiRouter.delete('/company/masters/:companyId', requireAuth, requireGaTenantAdmin, async (req, res) => {
  try {
    const tenantGa = await resolveTenantGaIdForRequest(pool, req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const companyId = Number(req.params.companyId)
    if (!Number.isInteger(companyId) || companyId < 1) {
      res.status(400).json({ message: '유효하지 않은 보험사 id입니다.' })
      return
    }

    const meta = await withTransaction(async (client) => {
      const lock = await safeQuery(
        client,
        `SELECT id, name, ga_id FROM insurance_company_master WHERE id = $1 AND ga_id = $2 FOR UPDATE`,
        [companyId, tenantGa],
      )
      if (lock.rowCount === 0) {
        const err = new Error('해당 보험사를 찾을 수 없습니다.')
        err.httpStatus = 404
        throw err
      }
      const row = lock.rows[0]
      const nameSnap = String(row.name ?? '').trim()

      await safeQuery(
        client,
        `
        UPDATE insurer_managers
        SET company_id = NULL,
            is_deleted = true,
            updated_at = NOW()
        WHERE company_id = $1 AND ga_id = $2
        `,
        [companyId, tenantGa],
      )

      await safeQuery(
        client,
        `
        UPDATE insurance_company_newsletters
        SET
          company_id = NULL,
          company_name_snapshot = COALESCE(NULLIF(TRIM(company_name_snapshot), ''), $3),
          updated_at = NOW()
        WHERE company_id = $1 AND ga_id = $2
        `,
        [companyId, tenantGa, nameSnap],
      )

      await safeQuery(
        client,
        `DELETE FROM insurance_company_master WHERE id = $1 AND ga_id = $2`,
        [companyId, tenantGa],
      )

      return { nameSnap }
    })

    void logSecurityEvent(pool, {
      actorUserId: String(req.user?.id ?? '').slice(0, 200),
      actorRole: String(req.user?.role ?? '').slice(0, 64),
      action: 'HARD_DELETE_COMPANY',
      targetType: 'insurance_company_master',
      targetId: String(companyId),
      gaId: tenantGa,
      companyId,
      meta: { companyName: meta.nameSnap },
    })

    res.json({ success: true })
  } catch (error) {
    if (error.httpStatus === 404) {
      res.status(404).json({ message: error.message })
      return
    }
    if (error.httpStatus === 403) {
      res.status(403).json({ message: error.message })
      return
    }
    handleDbError(error, req, res)
  }
})

apiRouter.post('/company/general-save', requireAuth, requireGaTenantAdmin, async (req, res) => {
  try {
    const tenantGa = await resolveTenantGaIdForRequest(pool, req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const { company: co, general: g } = req.body ?? {}
    const code = String(co?.companyCode ?? co?.company_code ?? '').trim()
    if (!code || !/^INS\d+$/.test(code)) {
      res.status(400).json({ message: '보험사 코드(companyCode)가 필요합니다.' })
      return
    }

    const found = await safeQuery(pool,
      `SELECT id, category, name FROM insurance_company_master WHERE ga_id = $1 AND company_code = $2`,
      [tenantGa, code],
    )
    if (found.rowCount === 0) {
      res.status(404).json({
        message: '먼저 「보험사 연락처」 화면에서 해당 보험사를 등록해 주세요.',
      })
      return
    }

    const companyId = found.rows[0].id
    const gen = g && typeof g === 'object' && !Array.isArray(g) ? g : {}
    const gDesc = String(gen.description ?? '').trim()
    const gPhone = String(gen.phone ?? '').trim()
    const gFax = String(gen.fax ?? '').trim()
    const gEmail = String(gen.email ?? '').trim()

    await safeQuery(pool,
      `
      INSERT INTO insurance_general_request (company_id, description, phone, fax, email)
      SELECT $1, $2, $3, $4, $5
      FROM insurance_company_master m
      WHERE m.id = $1 AND m.ga_id = $6
      ON CONFLICT (company_id)
      DO UPDATE SET
        description = EXCLUDED.description,
        phone = EXCLUDED.phone,
        fax = EXCLUDED.fax,
        email = EXCLUDED.email
      `,
      [companyId, gDesc, gPhone, gFax, gEmail, tenantGa],
    )

    res.json({ success: true })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/insurance/contacts', requireAuth, async (req, res) => {
  try {
    if (isNewsManagerRole(req.user?.role)) {
      forbiddenResponse(req, res, '채널 담당자는 이 목록에 접근할 수 없습니다.', {
        route: 'GET /insurance/contacts',
      })
      return
    }
    const gaId = effectiveTenantGaId(req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const contactsResult = await safeQuery(pool,
      `
      SELECT id, category, company_name, manager_name, position, phone_number, created_at, updated_at
      FROM insurance_contacts
      WHERE ga_id = $1
      ORDER BY
        CASE category
          WHEN 'LIFE' THEN 1
          WHEN 'NON_LIFE' THEN 2
          WHEN 'GENERAL' THEN 3
          ELSE 4
        END,
        company_name ASC,
        manager_name ASC
      `,
      [gaId],
    )

    const metaResult = await safeQuery(pool,
      `
      SELECT meta_value, $2 AS ga_id
      FROM insurance_contact_meta
      WHERE meta_key = $1
      `,
      [`contact_last_updated_at:${gaId}`, gaId],
    )

    const fallbackUpdatedAt =
      contactsResult.rows.length > 0
        ? contactsResult.rows.reduce((latest, row) => {
            const candidate = toIsoString(row.updated_at)
            return candidate > latest ? candidate : latest
          }, '')
        : ''

    res.json({
      lastUpdatedAt: metaResult.rows[0]?.meta_value
        ? toIsoString(metaResult.rows[0].meta_value)
        : fallbackUpdatedAt,
      contacts: contactsResult.rows.map(mapContactRow),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/insurance/updates', requireAuth, async (req, res) => {
  try {
    const gaId = effectiveTenantGaId(req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const result = await safeQuery(pool,
      `
      SELECT
        id,
        contact_id,
        action_type,
        category,
        company_name,
        manager_name,
        position,
        old_phone_number,
        new_phone_number,
        description,
        created_at
      FROM insurance_contact_updates
      WHERE ga_id = $1
      ORDER BY created_at DESC
      `,
      [gaId],
    )

    res.json(result.rows.map(mapContactUpdateRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/insurance/contacts/:id/vcard', requireAuth, async (req, res) => {
  try {
    const gaId = effectiveTenantGaId(req)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }
    const result = await safeQuery(pool,
      `
      SELECT id, company_name, manager_name, position, phone_number
      FROM insurance_contacts
      WHERE id = $1 AND ga_id = $2
      `,
      [req.params.id, gaId],
    )

    if (result.rowCount === 0) {
      res.status(404).json({ message: '연락처를 찾을 수 없습니다.' })
      return
    }

    const contact = result.rows[0]
    const safeName = `${contact.company_name}_${contact.manager_name}`
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80)

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.vcf"`)
    res.send(createVCardContent(contact))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

/** 하위 호환: 항상 GA_ADMIN으로 생성 (신규 연동은 POST /admin/user 사용) */
apiRouter.post('/admin/create-staff', requireAuth, requireSuperAdmin, async (req, res) => {
  req.body = { ...(req.body ?? {}), role: 'GA_ADMIN' }
  return postAdminCreateDelegateUser(req, res)
})

apiRouter.post('/admin/insurance/contacts', requireAuth, requireGaAdminOrSuper, async (req, res) => {
  try {
    const tenantGa = effectiveTenantGaId(req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const companyName = String(req.body?.companyName ?? req.body?.company_name ?? '').trim()
    let category = normalizeCategory(req.body?.category)
    category = coerceMeritzFireToNonLifeCategory(category, companyName)
    const managerName = String(req.body?.managerName ?? req.body?.manager_name ?? '').trim()
    const position = String(req.body?.position ?? '').trim()
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber ?? req.body?.phone_number ?? '')
    const description = String(req.body?.description ?? '연락처 등록').trim()

    if (!['LIFE', 'NON_LIFE', 'GENERAL'].includes(category)) {
      res.status(400).json({ message: '카테고리 값이 올바르지 않습니다.' })
      return
    }
    if (!companyName || !managerName || !phoneNumber) {
      res.status(400).json({ message: '보험사명, 담당자명, 전화번호는 필수입니다.' })
      return
    }

    const inserted = await withTransaction(async (client) => {
      const contactId = randomUUID()
      const contactResult = await safeQuery(client,
        `
        INSERT INTO insurance_contacts (
          id, ga_id, category, company_name, manager_name, position, phone_number, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, category, company_name, manager_name, position, phone_number, created_at, updated_at
        `,
        [contactId, tenantGa, category, companyName, managerName, position, phoneNumber],
      )

      await safeQuery(client,
        `
        INSERT INTO insurance_contact_updates (
          id, ga_id, contact_id, action_type, category, company_name, manager_name, position,
          old_phone_number, new_phone_number, description, created_at
        ) VALUES ($1, $2, $3, 'CREATE', $4, $5, $6, $7, NULL, $8, $9, NOW())
        `,
        [
          randomUUID(),
          tenantGa,
          contactId,
          category,
          companyName,
          managerName,
          position,
          phoneNumber,
          description,
        ],
      )

      await touchContactLastUpdatedAt(client, tenantGa)
      return contactResult.rows[0]
    })

    res.status(201).json(mapContactRow(inserted))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.put('/admin/insurance/contacts/:id', requireAuth, requireGaAdminOrSuper, async (req, res) => {
  try {
    const tenantGa = effectiveTenantGaId(req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const contactId = req.params.id
    const companyName = String(req.body?.companyName ?? req.body?.company_name ?? '').trim()
    let category = normalizeCategory(req.body?.category)
    category = coerceMeritzFireToNonLifeCategory(category, companyName)
    const managerName = String(req.body?.managerName ?? req.body?.manager_name ?? '').trim()
    const position = String(req.body?.position ?? '').trim()
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber ?? req.body?.phone_number ?? '')
    const description = String(req.body?.description ?? '연락처 수정').trim()

    if (!['LIFE', 'NON_LIFE', 'GENERAL'].includes(category)) {
      res.status(400).json({ message: '카테고리 값이 올바르지 않습니다.' })
      return
    }
    if (!companyName || !managerName || !phoneNumber) {
      res.status(400).json({ message: '보험사명, 담당자명, 전화번호는 필수입니다.' })
      return
    }

    const updatedContact = await withTransaction(async (client) => {
      const existing = await safeQuery(client,
        `
        SELECT id, category, company_name, manager_name, position, phone_number
        FROM insurance_contacts
        WHERE id = $1 AND ga_id = $2
        `,
        [contactId, tenantGa],
      )

      if (existing.rowCount === 0) {
        return null
      }

      const updated = await safeQuery(client,
        `
        UPDATE insurance_contacts
        SET
          category = $1,
          company_name = $2,
          manager_name = $3,
          position = $4,
          phone_number = $5,
          updated_at = NOW()
        WHERE id = $6 AND ga_id = $7
        RETURNING id, category, company_name, manager_name, position, phone_number, created_at, updated_at
        `,
        [category, companyName, managerName, position, phoneNumber, contactId, tenantGa],
      )

      const prev = existing.rows[0]
      await safeQuery(client,
        `
        INSERT INTO insurance_contact_updates (
          id, ga_id, contact_id, action_type, category, company_name, manager_name, position,
          old_phone_number, new_phone_number, description, created_at
        ) VALUES ($1, $2, $3, 'UPDATE', $4, $5, $6, $7, $8, $9, $10, NOW())
        `,
        [
          randomUUID(),
          tenantGa,
          contactId,
          category,
          companyName,
          managerName,
          position,
          normalizePhoneNumber(prev.phone_number),
          phoneNumber,
          description,
        ],
      )

      await touchContactLastUpdatedAt(client, tenantGa)
      return updated.rows[0]
    })

    if (!updatedContact) {
      res.status(404).json({ message: '수정할 연락처를 찾을 수 없습니다.' })
      return
    }

    res.json(mapContactRow(updatedContact))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/admin/insurance/contacts/:id', requireAuth, requireGaAdminOrSuper, async (req, res) => {
  try {
    const tenantGa = effectiveTenantGaId(req)
    if (tenantGa == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const contactId = req.params.id
    const description = String(req.body?.description ?? '연락처 삭제').trim()

    const deletedContact = await withTransaction(async (client) => {
      const existing = await safeQuery(client,
        `
        SELECT id, category, company_name, manager_name, position, phone_number
        FROM insurance_contacts
        WHERE id = $1 AND ga_id = $2
        `,
        [contactId, tenantGa],
      )

      if (existing.rowCount === 0) {
        return null
      }

      await safeQuery(client,
        `
        DELETE FROM insurance_contacts
        WHERE id = $1 AND ga_id = $2
        `,
        [contactId, tenantGa],
      )

      const prev = existing.rows[0]
      await safeQuery(client,
        `
        INSERT INTO insurance_contact_updates (
          id, ga_id, contact_id, action_type, category, company_name, manager_name, position,
          old_phone_number, new_phone_number, description, created_at
        ) VALUES ($1, $2, $3, 'DELETE', $4, $5, $6, $7, $8, NULL, $9, NOW())
        `,
        [
          randomUUID(),
          tenantGa,
          contactId,
          prev.category,
          prev.company_name,
          prev.manager_name,
          prev.position ?? '',
          normalizePhoneNumber(prev.phone_number),
          description,
        ],
      )

      await touchContactLastUpdatedAt(client, tenantGa)
      return prev
    })

    if (!deletedContact) {
      res.status(404).json({ message: '삭제할 연락처를 찾을 수 없습니다.' })
      return
    }

    res.status(204).send()
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/forms', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const result = await safeQuery(pool,
      `
      SELECT id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      FROM insurance_forms
      WHERE user_id = $1 AND ga_id = $2
      ORDER BY created_at DESC, id DESC
      `,
      [userId, gaId],
    )

    res.json(result.rows.map(mapFormRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/forms/expiring', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const result = await safeQuery(pool,
      `
      SELECT id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      FROM insurance_forms
      WHERE user_id = $1 AND ga_id = $2
        AND expiry_date IS NOT NULL
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY expiry_date ASC, updated_at DESC
      `,
      [userId, gaId],
    )

    res.json(result.rows.map(mapFormRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/forms', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const formData = extractFormData(req.body)
    if (!formData) {
      res.status(400).json({ message: 'form_data가 필요합니다.' })
      return
    }

    const linkedId = resolveLinkedCustomerIdFromRequest(req.body, formData)
    let customerIdFk = null
    if (linkedId != null) {
      const usable = await assertCustomerActiveAndOwnedByUser(req, linkedId)
      if (!usable) {
        res.status(400).json({ message: '유효하지 않은 고객 연결입니다.' })
        return
      }
      customerIdFk = linkedId
    }

    const mergedForm = { ...formData, customerId: customerIdFk ?? 0 }

    const id = randomUUID()
    const customerName = String(
      req.body.customer_name ?? req.body.customerName ?? mergedForm.ownerName ?? '',
    )
    const carNumber = String(
      req.body.car_number ?? req.body.carNumber ?? mergedForm.vehicleNumber ?? '',
    )
    const expiryDate = normalizeExpiryDate(
      req.body.expiry_date ?? req.body.expiryDate ?? mergedForm.expiryDate ?? '',
    )

    const inserted = await safeQuery(pool,
      `
      INSERT INTO insurance_forms (
        id, user_id, ga_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS jsonb), NOW(), NOW())
      RETURNING id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      `,
      [
        id,
        userId,
        gaId,
        customerIdFk,
        customerName,
        carNumber,
        expiryDate || null,
        JSON.stringify(mergedForm),
      ],
    )

    await logInsuranceFormsDbDiagnostics('post')

    void recordAnalyticsEvent(pool, { userId, gaId, eventType: 'document_created' })
    res.status(201).json(mapFormRow(inserted.rows[0]))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/forms/:id/renew', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }

    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const result = await safeQuery(pool,
      `
      SELECT id, user_id, ga_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      FROM insurance_forms
      WHERE id = $1 AND user_id = $2 AND ga_id = $3
      `,
      [req.params.id, userId, gaId],
    )

    const original = result.rows[0]
    if (!original) {
      res.status(404).json({ message: '신청서를 찾을 수 없습니다.' })
      return
    }

    const renewedCustomerId =
      original.customer_id != null && original.customer_id !== '' ? Number(original.customer_id) : null

    let newExpiry = ''
    const rawExpiry = original.expiry_date ?? original.form_data?.expiryDate ?? ''
    const normalizedBase = normalizeExpiryDate(
      rawExpiry instanceof Date ? rawExpiry.toISOString().slice(0, 10) : String(rawExpiry),
    )
    if (normalizedBase) {
      const d = new Date(`${normalizedBase}T12:00:00.000Z`)
      if (!Number.isNaN(d.getTime())) {
        d.setUTCFullYear(d.getUTCFullYear() + 1)
        newExpiry = d.toISOString().slice(0, 10)
      }
    }

    const prevFormData =
      original.form_data && typeof original.form_data === 'object' && !Array.isArray(original.form_data)
        ? { ...original.form_data }
        : {}
    if (newExpiry) {
      prevFormData.expiryDate = newExpiry
    }
    if (Number.isInteger(renewedCustomerId) && renewedCustomerId > 0) {
      prevFormData.customerId = renewedCustomerId
    } else {
      prevFormData.customerId = 0
    }

    if (newExpiry) {
      const check = await safeQuery(pool,
        `
        SELECT id FROM insurance_forms
        WHERE user_id = $1 AND ga_id = $3 AND expiry_date = $2
        `,
        [userId, newExpiry, gaId],
      )
      if (check.rowCount > 0) {
        res.status(400).json({ error: '이미 갱신된 신청서 있음' })
        return
      }
    }

    const newId = randomUUID()
    const customerName = String(original.customer_name ?? prevFormData.ownerName ?? '')
    const carNumber = String(original.car_number ?? prevFormData.vehicleNumber ?? '')

    const formGaId = parseGaId(original.ga_id) ?? gaId

    const insert = await safeQuery(pool,
      `
      INSERT INTO insurance_forms (
        id, user_id, ga_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS jsonb), NOW(), NOW())
      RETURNING id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      `,
      [
        newId,
        userId,
        formGaId,
        Number.isInteger(renewedCustomerId) && renewedCustomerId > 0 ? renewedCustomerId : null,
        customerName,
        carNumber,
        newExpiry || null,
        JSON.stringify(prevFormData),
      ],
    )

    await logInsuranceFormsDbDiagnostics('renew')

    void recordAnalyticsEvent(pool, { userId, gaId: formGaId, eventType: 'document_created' })
    res.status(201).json({ success: true, data: mapFormRow(insert.rows[0]) })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.post('/customers', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    if ((req.user?.customerAccess ?? 'own') === 'none') {
      res.status(403).json({ message: '고객 정보에 접근할 수 없는 계정입니다.' })
      return
    }

    let custTenantId = Number(req.user?.customerTenantDbId)
    if (!Number.isSafeInteger(custTenantId) || custTenantId < 1) {
      const tr = await safeQuery(
        pool,
        `SELECT id FROM tenants WHERE legacy_ga_id = $1 ORDER BY id ASC LIMIT 1`,
        [gaId],
      )
      custTenantId = Number(tr.rows[0]?.id ?? 0)
      if (!(Number.isSafeInteger(custTenantId) && custTenantId > 0)) {
        custTenantId = null
      }
    }

    const data = req.body ?? {}
    const name = String(data.name ?? '').trim()
    if (!name) {
      res.status(400).json({ message: '이름은 필수입니다' })
      return
    }

    const ssn = String(data.ssn ?? '').trim()

    let isDriver = null
    if (data.isDriver === true || data.is_driver === true) {
      isDriver = true
    } else if (data.isDriver === false || data.is_driver === false) {
      isDriver = false
    }
    const carType = String(data.carType ?? data.car_type ?? '').trim()

    const { age: insuranceAge, nextAgeDate: nextAgeDateObj } = calculateInsuranceInfoFromRrn(ssn)
    const nextAgeSql = nextAgeDateToSqlDate(nextAgeDateObj)

    const genderRaw = String(data.gender ?? '').trim()
    const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : ''

    const notes = normalizeCustomerNotesInput(data.notes)
    const driving =
      isDriver === true ? '운전함' : isDriver === false ? '운전 안함' : String(data.driving ?? '').trim()

    const carNumber = String(data.carNumber ?? data.car_number ?? '').trim()
    const carModel = String(data.carModel ?? data.car_model ?? '').trim()
    const carYear = String(data.carYear ?? data.car_year ?? '').trim()
    const renewalDateRaw = normalizeExpiryDate(String(data.renewalDate ?? data.renewal_date ?? ''))
    const renewalDateSql = renewalDateRaw || null

    const birthRaw = String(data.birthDate ?? data.birth_date ?? '').trim()
    const birthDateSql = birthRaw ? normalizeExpiryDate(birthRaw.slice(0, 10)) || null : null

    const crmExtSql = stringifyCrmExtensionForDb(data.crmExtension ?? data.crm_extension)

    const inserted = await safeQuery(pool,
      `
      INSERT INTO customers (
        user_id, ga_id, name, ssn, phone, carrier, address, height, weight, job, driving, medical,
        gender, insurance_age, next_age_date, is_driver, car_type,
        car_number, car_model, car_year, renewal_date,
        notes,
        birth_date,
        crm_extension,
        tenant_id, owner_user_id, created_by_user_id, visibility_scope
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CAST($22 AS jsonb), $23, CAST($24 AS jsonb), $25, $26, $27, $28)
      RETURNING
        id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
        car_number, car_model, car_year, renewal_date,
        gender, insurance_age, next_age_date, is_driver, car_type, notes,
        is_favorite, created_at,
        crm_extension
      `,
      [
        userId,
        gaId,
        name,
        ssn,
        String(data.phone ?? '').trim(),
        String(data.carrier ?? '').trim(),
        String(data.address ?? '').trim(),
        String(data.height ?? '').trim(),
        String(data.weight ?? '').trim(),
        String(data.job ?? '').trim(),
        driving,
        String(data.medical ?? '').trim(),
        gender,
        insuranceAge,
        nextAgeSql,
        isDriver,
        carType,
        carNumber,
        carModel,
        carYear,
        renewalDateSql,
        JSON.stringify(notes),
        birthDateSql,
        crmExtSql,
        custTenantId,
        userId,
        userId,
        String(req.user?.customerAccess ?? 'own').trim().toLowerCase() || 'own',
      ],
    )

    void recordAnalyticsEvent(pool, { userId, gaId, eventType: 'customer_created' })
    res.status(201).json({ success: true, data: mapCustomerRow(inserted.rows[0]) })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

function logExternalCreateError(reason, details = {}) {
  console.warn('[external-create-error]', { reason, ...details })
}

apiRouter.post('/customer/external-create', async (req, res) => {
  try {
    const data = req.body ?? {}
    const refUsername = String(data.refUsername ?? '').trim()
    const refUserIdLegacy = String(data.refUserId ?? data.ref_user_id ?? '').trim()
    const gaFromBodyRaw = String(data.gaCode ?? data.ga ?? data.ga_code ?? '').trim()

    let refUserId = ''
    let refGaId = null

    if (refUsername) {
      const gaCodeNorm = normalizeInviteCode(gaFromBodyRaw)
      if (!gaCodeNorm) {
        logExternalCreateError('MISSING_GA_CODE', { refUsername, gaCode: gaFromBodyRaw || null })
        res.status(400).json({ message: '잘못된 접근입니다' })
        return
      }

      const userByName = await systemQuery(
        pool,
        `SELECT id, role, ga_id FROM users WHERE username = $1 AND is_deleted = false`,
        [refUsername],
      )
      if (userByName.rowCount === 0) {
        logExternalCreateError('REF_USER_NOT_FOUND', { refUsername, gaCode: gaCodeNorm })
        res.status(400).json({ message: '유효하지 않은 소개 링크입니다.' })
        return
      }
      if (normalizeUserRole(userByName.rows[0].role) !== 'USER') {
        logExternalCreateError('REF_USER_NOT_ALLOWED_ROLE', {
          refUsername,
          gaCode: gaCodeNorm,
          refUserId: String(userByName.rows[0].id),
          role: userByName.rows[0].role,
        })
        res.status(400).json({ message: '고객 정보를 받을 수 있는 계정이 아닙니다.' })
        return
      }
      const userGaId = parseGaId(userByName.rows[0].ga_id)
      if (userGaId == null) {
        logExternalCreateError('REF_USER_NO_GA', { refUsername, gaCode: gaCodeNorm, refUserId: String(userByName.rows[0].id) })
        res.status(400).json({ message: '소개 계정에 GA가 연결되지 않았습니다.' })
        return
      }

      const gaRow = await systemQuery(
        pool,
        `SELECT id, status FROM ga_companies WHERE code = $1 AND is_deleted = false`,
        [gaCodeNorm],
      )
      if (gaRow.rowCount === 0) {
        logExternalCreateError('GA_CODE_UNKNOWN', { refUsername, gaCode: gaCodeNorm, refUserId: String(userByName.rows[0].id) })
        res.status(400).json({ message: '잘못된 접근입니다' })
        return
      }
      if (String(gaRow.rows[0].status ?? '').toLowerCase() !== 'active') {
        logExternalCreateError('GA_INACTIVE', {
          refUsername,
          gaCode: gaCodeNorm,
          refUserId: String(userByName.rows[0].id),
          gaId: gaRow.rows[0].id,
          status: gaRow.rows[0].status,
        })
        res.status(400).json({ message: '잘못된 접근입니다' })
        return
      }
      const gaIdFromCode = parseGaId(gaRow.rows[0].id)
      if (gaIdFromCode == null || gaIdFromCode !== userGaId) {
        logExternalCreateError('GA_MISMATCH', {
          refUsername,
          gaCode: gaCodeNorm,
          refUserId: String(userByName.rows[0].id),
          userGaId,
          gaIdFromCode: gaIdFromCode ?? null,
        })
        res.status(400).json({ message: '잘못된 접근입니다' })
        return
      }

      refUserId = String(userByName.rows[0].id)
      refGaId = gaIdFromCode
    } else if (refUserIdLegacy) {
      const userRow = await systemQuery(pool, `SELECT id, role, ga_id FROM users WHERE id = $1`, [refUserIdLegacy])
      if (userRow.rowCount === 0) {
        logExternalCreateError('REF_USER_ID_NOT_FOUND', { refUserId: refUserIdLegacy, gaCode: gaFromBodyRaw || null })
        res.status(400).json({ message: '유효하지 않은 소개 링크입니다.' })
        return
      }
      if (normalizeUserRole(userRow.rows[0].role) !== 'USER') {
        logExternalCreateError('REF_USER_ID_NOT_ALLOWED_ROLE', {
          refUserId: refUserIdLegacy,
          gaCode: gaFromBodyRaw || null,
          role: userRow.rows[0].role,
        })
        res.status(400).json({ message: '고객 정보를 받을 수 있는 계정이 아닙니다.' })
        return
      }
      refGaId = parseGaId(userRow.rows[0].ga_id)
      if (refGaId == null) {
        logExternalCreateError('REF_USER_ID_NO_GA', { refUserId: refUserIdLegacy, gaCode: gaFromBodyRaw || null })
        res.status(400).json({ message: '소개 계정에 GA가 연결되지 않았습니다.' })
        return
      }

      if (gaFromBodyRaw) {
        const gaFromBody = normalizeInviteCode(gaFromBodyRaw)
        const gaRowRef = await systemQuery(
          pool,
          `
          SELECT code FROM ga_companies
          WHERE id = $1 AND is_deleted = false
          LIMIT 1
          `,
          [refGaId],
        )
        const refCodeNorm = normalizeInviteCode(gaRowRef.rows[0]?.code ?? '')
        if (!refCodeNorm || refCodeNorm !== gaFromBody) {
          logExternalCreateError('LEGACY_GA_BODY_MISMATCH', {
            refUserId: refUserIdLegacy,
            gaCode: gaFromBody,
            refGaId,
            expectedCodeNorm: refCodeNorm || null,
          })
          res.status(400).json({ message: 'GA 정보가 초대 링크와 일치하지 않습니다.' })
          return
        }
      }

      refUserId = refUserIdLegacy
    } else {
      logExternalCreateError('MISSING_REF', { gaCode: gaFromBodyRaw || null })
      res.status(400).json({ message: '소개 링크 정보가 없습니다.' })
      return
    }

    const inviteRegistration = Boolean(data.inviteRegistration ?? data.invite_registration)
    if (inviteRegistration) {
      /* GA 초대 /customer/register 전용 — refUsername·GA 검증 분기만 허용 */
      if (!refUsername) {
        logExternalCreateError('INVITE_REG_REQUIRES_USERNAME', {})
        res.status(400).json({ message: '잘못된 접근입니다.' })
        return
      }
      const secureInviteCookie = RUNNING_IN_PRODUCTION
      const incomingTok = readCookieFromHeader(req.headers.cookie, PUBLIC_INVITE_REG_COOKIE)
      if (incomingTok) {
        const exist = await safeQuery(
          pool,
          `
          SELECT s.ref_user_id, s.ga_id, s.first_submitted_at
          FROM public_customer_invite_sessions s
          JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
          WHERE s.secret_token = $1
          LIMIT 1
          `,
          [incomingTok],
        )
        if (exist.rowCount > 0) {
          const er = exist.rows[0]
          const sameScope = String(er.ref_user_id) === refUserId && Number(er.ga_id) === Number(refGaId)
          if (sameScope) {
            const ded = editableDeadlineMsFromFirstSubmitted(er.first_submitted_at)
            res.status(409).json({
              success: false,
              code: 'ALREADY_SUBMITTED',
              message:
                Date.now() < ded
                  ? '이미 등록 정보가 있습니다. 수정은 아래 수정하기로 진행해 주세요.'
                  : '이미 등록이 완료되었습니다.',
              editableUntil: new Date(ded).toISOString(),
              canEdit: Date.now() < ded,
            })
            return
          }
          res.append('Set-Cookie', buildInviteRegClearCookieHeader({ secure: secureInviteCookie }))
        }
      }
    }

    const name = String(data.name ?? '').trim()
    if (!name) {
      res.status(400).json({ message: '이름은 필수입니다' })
      return
    }

    const ssn = String(data.ssn ?? '').trim()

    let isDriver = null
    if (data.isDriver === true || data.is_driver === true) {
      isDriver = true
    } else if (data.isDriver === false || data.is_driver === false) {
      isDriver = false
    }
    const carType = String(data.carType ?? data.car_type ?? '').trim()

    const { age: insuranceAge, nextAgeDate: nextAgeDateObj } = calculateInsuranceInfoFromRrn(ssn)
    const nextAgeSql = nextAgeDateToSqlDate(nextAgeDateObj)

    const genderRaw = String(data.gender ?? '').trim()
    const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : ''

    const notes = normalizeCustomerNotesInput(data.notes)
    const driving =
      isDriver === true ? '운전함' : isDriver === false ? '운전 안함' : String(data.driving ?? '').trim()

    const carNumber = String(data.carNumber ?? data.car_number ?? '').trim()
    const carModel = String(data.carModel ?? data.car_model ?? '').trim()
    const carYear = String(data.carYear ?? data.car_year ?? '').trim()
    const renewalDateRaw = normalizeExpiryDate(String(data.renewalDate ?? data.renewal_date ?? ''))
    const renewalDateSql = renewalDateRaw || null

    const birthRaw = String(data.birthDate ?? data.birth_date ?? '').trim()
    const birthDateSql = birthRaw ? normalizeExpiryDate(birthRaw.slice(0, 10)) || null : null

    const crmExtSql = stringifyCrmExtensionForDb(data.crmExtension ?? data.crm_extension)

    const inserted = await safeQuery(pool,
      `
      INSERT INTO customers (
        user_id, ga_id, name, ssn, phone, carrier, address, height, weight, job, driving, medical,
        gender, insurance_age, next_age_date, is_driver, car_type,
        car_number, car_model, car_year, renewal_date,
        notes,
        birth_date,
        crm_extension
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CAST($22 AS jsonb), $23, CAST($24 AS jsonb))
      RETURNING
        id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
        car_number, car_model, car_year, renewal_date,
        gender, insurance_age, next_age_date, is_driver, car_type, notes,
        is_favorite, created_at,
        crm_extension
      `,
      [
        refUserId,
        refGaId,
        name,
        ssn,
        String(data.phone ?? '').trim(),
        String(data.carrier ?? '').trim(),
        String(data.address ?? '').trim(),
        String(data.height ?? '').trim(),
        String(data.weight ?? '').trim(),
        String(data.job ?? '').trim(),
        driving,
        String(data.medical ?? '').trim(),
        gender,
        insuranceAge,
        nextAgeSql,
        isDriver,
        carType,
        carNumber,
        carModel,
        carYear,
        renewalDateSql,
        JSON.stringify(notes),
        birthDateSql,
        crmExtSql,
      ],
    )

    void recordAnalyticsEvent(pool, { userId: refUserId, gaId: refGaId, eventType: 'customer_created' })

    let inviteSessionMeta = null
    if (inviteRegistration) {
      const newTok = randomBytes(32).toString('hex')
      const sessIns = await safeQuery(
        pool,
        `
        INSERT INTO public_customer_invite_sessions (secret_token, customer_id, ref_user_id, ga_id)
        VALUES ($1, $2, $3, $4)
        RETURNING first_submitted_at
        `,
        [newTok, inserted.rows[0].id, refUserId, refGaId],
      )
      const firstSubmittedAt = sessIns.rows[0].first_submitted_at
      const deadlineMs = editableDeadlineMsFromFirstSubmitted(firstSubmittedAt)
      const maxAgeSec = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      res.append(
        'Set-Cookie',
        buildInviteRegSetCookieHeader(newTok, maxAgeSec, { secure: RUNNING_IN_PRODUCTION }),
      )
      inviteSessionMeta = {
        editableUntil: new Date(deadlineMs).toISOString(),
        canEdit: Date.now() < deadlineMs,
      }
    }

    res.status(201).json({
      success: true,
      data: mapCustomerRow(inserted.rows[0]),
      ...(inviteSessionMeta ? { inviteRegistration: inviteSessionMeta } : {}),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/customer/external-invite-session', async (req, res) => {
  try {
    const token = readCookieFromHeader(req.headers.cookie, PUBLIC_INVITE_REG_COOKIE)
    if (!token) {
      res.json({ hasSubmission: false })
      return
    }
    const sess = await safeQuery(
      pool,
      `
      SELECT s.customer_id, s.ref_user_id, s.ga_id, s.first_submitted_at
      FROM public_customer_invite_sessions s
      INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
      WHERE s.secret_token = $1
      LIMIT 1
      `,
      [token],
    )
    if (sess.rowCount === 0) {
      res.json({ hasSubmission: false })
      return
    }
    const row = sess.rows[0]
    const deadlineMs = editableDeadlineMsFromFirstSubmitted(row.first_submitted_at)
    const canEdit = Date.now() < deadlineMs
    if (!canEdit) {
      res.json({
        hasSubmission: true,
        locked: true,
        editableUntil: new Date(deadlineMs).toISOString(),
        canEdit: false,
      })
      return
    }
    const cust = await safeQuery(
      pool,
      `
      SELECT
        id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
        car_number, car_model, car_year, renewal_date,
        gender, insurance_age, next_age_date, is_driver, car_type, notes,
        is_favorite, created_at,
        crm_extension
      FROM customers
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [row.customer_id],
    )
    if (cust.rowCount === 0) {
      res.json({ hasSubmission: false })
      return
    }
    res.json({
      hasSubmission: true,
      locked: false,
      editableUntil: new Date(deadlineMs).toISOString(),
      canEdit: true,
      customer: mapCustomerRow(cust.rows[0]),
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.patch('/customer/external-invite-registration', async (req, res) => {
  try {
    const data = req.body ?? {}
    const token = readCookieFromHeader(req.headers.cookie, PUBLIC_INVITE_REG_COOKIE)
    if (!token) {
      res.status(401).json({ message: '세션이 없습니다. 담당자가 보낸 링크로 다시 접속해 주세요.' })
      return
    }
    const tokRow = await safeQuery(
      pool,
      `
      SELECT s.customer_id, s.ref_user_id, s.ga_id, s.first_submitted_at
      FROM public_customer_invite_sessions s
      INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
      WHERE s.secret_token = $1
      LIMIT 1
      `,
      [token],
    )
    if (tokRow.rowCount === 0) {
      res.status(401).json({ message: '유효하지 않은 초대 세션입니다.' })
      return
    }
    const sid = tokRow.rows[0]
    const deadlineMs = editableDeadlineMsFromFirstSubmitted(sid.first_submitted_at)
    if (Date.now() >= deadlineMs) {
      res.status(403).json({
        message: '수정 가능 시간이 지났습니다.',
        code: 'EDIT_WINDOW_CLOSED',
      })
      return
    }

    const name = String(data.name ?? '').trim()
    if (!name) {
      res.status(400).json({ message: '이름은 필수입니다' })
      return
    }
    const ssn = String(data.ssn ?? '').trim()
    let isDriver = null
    if (data.isDriver === true || data.is_driver === true) {
      isDriver = true
    } else if (data.isDriver === false || data.is_driver === false) {
      isDriver = false
    }
    const carType = String(data.carType ?? data.car_type ?? '').trim()
    const { age: insuranceAge, nextAgeDate: nextAgeDateObj } = calculateInsuranceInfoFromRrn(ssn)
    const nextAgeSql = nextAgeDateToSqlDate(nextAgeDateObj)
    const genderRaw = String(data.gender ?? '').trim()
    const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : ''
    const notes = normalizeCustomerNotesInput(data.notes)
    const driving =
      isDriver === true ? '운전함' : isDriver === false ? '운전 안함' : String(data.driving ?? '').trim()
    const carNumber = String(data.carNumber ?? data.car_number ?? '').trim()
    const carModel = String(data.carModel ?? data.car_model ?? '').trim()
    const carYear = String(data.carYear ?? data.car_year ?? '').trim()
    const renewalDateRaw = normalizeExpiryDate(String(data.renewalDate ?? data.renewal_date ?? ''))
    const renewalDateSql = renewalDateRaw || null
    const birthRaw = String(data.birthDate ?? data.birth_date ?? '').trim()
    const birthDateSql = birthRaw ? normalizeExpiryDate(birthRaw.slice(0, 10)) || null : null
    const crmExtSql = stringifyCrmExtensionForDb(data.crmExtension ?? data.crm_extension)

    const customerId = Number(sid.customer_id)
    const refAgentId = String(sid.ref_user_id)
    const refGaPk = Number(sid.ga_id)

    const updated = await safeQuery(
      pool,
      `
      UPDATE customers
      SET
        name = $1,
        ssn = $2,
        phone = $3,
        carrier = $4,
        address = $5,
        height = $6,
        weight = $7,
        job = $8,
        driving = $9,
        medical = $10,
        gender = $11,
        insurance_age = $12,
        next_age_date = $13,
        is_driver = $14,
        car_type = $15,
        car_number = $16,
        car_model = $17,
        car_year = $18,
        renewal_date = $19,
        notes = CAST($20 AS jsonb),
        birth_date = $21,
        crm_extension = CAST($22 AS jsonb)
      WHERE id = $23 AND user_id = $24 AND ga_id = $25 AND deleted_at IS NULL
      RETURNING
        id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
        car_number, car_model, car_year, renewal_date,
        gender, insurance_age, next_age_date, is_driver, car_type, notes,
        is_favorite, created_at,
        crm_extension
      `,
      [
        name,
        ssn,
        String(data.phone ?? '').trim(),
        String(data.carrier ?? '').trim(),
        String(data.address ?? '').trim(),
        String(data.height ?? '').trim(),
        String(data.weight ?? '').trim(),
        String(data.job ?? '').trim(),
        driving,
        String(data.medical ?? '').trim(),
        gender,
        insuranceAge,
        nextAgeSql,
        isDriver,
        carType,
        carNumber,
        carModel,
        carYear,
        renewalDateSql,
        JSON.stringify(notes),
        birthDateSql,
        crmExtSql,
        customerId,
        refAgentId,
        refGaPk,
      ],
    )
    if (updated.rowCount === 0) {
      res.status(404).json({ message: '고객 정보를 수정할 수 없습니다.' })
      return
    }

    res.json({
      success: true,
      data: mapCustomerRow(updated.rows[0]),
      inviteRegistration: {
        editableUntil: new Date(deadlineMs).toISOString(),
        canEdit: true,
      },
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.put('/customers/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId < 1) {
      res.status(400).json({ message: '잘못된 고객 ID입니다.' })
      return
    }

    const data = req.body ?? {}
    const hasKey = (k) => Object.prototype.hasOwnProperty.call(data, k)

    const parts = []
    const vals = []
    let n = 1

    if (hasKey('name')) {
      const name = String(data.name ?? '').trim()
      if (!name) {
        res.status(400).json({ message: '이름은 필수입니다' })
        return
      }
      parts.push(`name = $${n++}`)
      vals.push(name)
    }

    const stringCols = [
      ['ssn', 'ssn'],
      ['phone', 'phone'],
      ['carrier', 'carrier'],
      ['address', 'address'],
      ['height', 'height'],
      ['weight', 'weight'],
      ['job', 'job'],
      ['driving', 'driving'],
      ['medical', 'medical'],
    ]
    for (const [key, col] of stringCols) {
      if (hasKey(key)) {
        parts.push(`${col} = $${n++}`)
        vals.push(String(data[key] ?? '').trim())
      }
    }

    if (hasKey('carNumber') || hasKey('car_number')) {
      parts.push(`car_number = $${n++}`)
      vals.push(String(data.carNumber ?? data.car_number ?? '').trim())
    }
    if (hasKey('carModel') || hasKey('car_model')) {
      parts.push(`car_model = $${n++}`)
      vals.push(String(data.carModel ?? data.car_model ?? '').trim())
    }
    if (hasKey('carYear') || hasKey('car_year')) {
      parts.push(`car_year = $${n++}`)
      vals.push(String(data.carYear ?? data.car_year ?? '').trim())
    }
    if (hasKey('renewalDate') || hasKey('renewal_date')) {
      const renewalDate = normalizeExpiryDate(String(data.renewalDate ?? data.renewal_date ?? ''))
      parts.push(`renewal_date = $${n++}`)
      vals.push(renewalDate || null)
    }

    if (hasKey('birthDate') || hasKey('birth_date')) {
      const rawBd = String(data.birthDate ?? data.birth_date ?? '').trim()
      const normBd = rawBd ? normalizeExpiryDate(rawBd.slice(0, 10)) : ''
      parts.push(`birth_date = $${n++}`)
      vals.push(normBd || null)
    }

    if (hasKey('gender')) {
      const genderRaw = String(data.gender ?? '').trim()
      const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : ''
      parts.push(`gender = $${n++}`)
      vals.push(gender)
    }

    if (hasKey('isDriver') || hasKey('is_driver')) {
      const v = hasKey('isDriver') ? data.isDriver : data.is_driver
      let isDriver = null
      if (v === true) {
        isDriver = true
      } else if (v === false) {
        isDriver = false
      }
      parts.push(`is_driver = $${n++}`)
      vals.push(isDriver)
    }

    if (hasKey('carType') || hasKey('car_type')) {
      parts.push(`car_type = $${n++}`)
      vals.push(String(data.carType ?? data.car_type ?? '').trim())
    }

    if (hasKey('isFavorite') || hasKey('is_favorite')) {
      const v = hasKey('isFavorite') ? data.isFavorite : data.is_favorite
      let b = null
      if (v === true) b = true
      else if (v === false) b = false
      else if (typeof v === 'string') {
        const s = v.trim().toLowerCase()
        if (s === 'true') b = true
        else if (s === 'false') b = false
      }
      if (b === null) {
        res.status(400).json({ message: '즐겨찾기(isFavorite) 값은 true/false만 허용됩니다.' })
        return
      }
      parts.push(`is_favorite = $${n++}`)
      vals.push(b)
    }

    if (hasKey('notes')) {
      parts.push(`notes = CAST($${n++} AS jsonb)`)
      vals.push(JSON.stringify(normalizeCustomerNotesInput(data.notes)))
    }

    if (hasKey('ssn')) {
      const ssnVal = String(data.ssn ?? '').trim()
      const { age: insuranceAge, nextAgeDate: nextAgeDateObj } = calculateInsuranceInfoFromRrn(ssnVal)
      parts.push(`insurance_age = $${n++}`)
      vals.push(insuranceAge)
      parts.push(`next_age_date = $${n++}`)
      vals.push(nextAgeDateToSqlDate(nextAgeDateObj))
    }

    if (hasKey('crmExtension') || hasKey('crm_extension')) {
      const rawExt = hasKey('crmExtension') ? data.crmExtension : data.crm_extension
      parts.push(`crm_extension = CAST($${n++} AS jsonb)`)
      vals.push(stringifyCrmExtensionForDb(rawExt))
    }

    if (parts.length === 0) {
      res.status(400).json({ message: '수정할 필드가 없습니다.' })
      return
    }

    if ((req.user?.customerAccess ?? 'own') === 'none') {
      res.status(403).json({ message: '고객 정보에 접근할 수 없는 계정입니다.' })
      return
    }

    const visCtx = resolveCustomerVisibilitySqlForUpdate(req, userId, gaId)
    if (visCtx.blocked) {
      res.status(403).json({ message: '고객 정보에 접근할 수 없는 계정입니다.' })
      return
    }

    const fieldParamCount = n - 1
    const visWhere = offsetSqlPlaceholders(visCtx.clause, fieldParamCount)
    vals.push(...visCtx.params, customerId)
    const idPh = `$${vals.length}`
    const updated = await safeQuery(pool,
      `
      UPDATE customers
      SET ${parts.join(', ')}
      WHERE id = ${idPh}::integer AND (${visWhere}) AND deleted_at IS NULL
      RETURNING
        id, user_id, name, birth_date, ssn, phone, carrier, address, height, weight, job, driving, medical,
        car_number, car_model, car_year, renewal_date,
        gender, insurance_age, next_age_date, is_driver, car_type, notes,
        is_favorite, created_at,
        crm_extension
      `,
      vals,
    )

    if (updated.rowCount === 0) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    res.json({ success: true, data: mapCustomerRow(updated.rows[0]) })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/customers/search', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const role = normalizeUserRole(req.user?.role)
    const jwtGaId = parseGaId(req.user?.gaId)

    let gaId = jwtGaId
    if (role === 'SUPER_ADMIN') {
      gaId = parseGaId(req.query.scope_ga_id ?? req.query.tenant_ga_id)
      if (gaId == null) {
        res.status(400).json({
          message: '고객 검색 범위(GA)가 필요합니다. scope_ga_id(또는 tenant_ga_id)를 지정해 주세요.',
        })
        return
      }
    } else if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const accessJwt = req.user?.customerAccess ?? 'own'
    if (role !== 'SUPER_ADMIN' && accessJwt === 'none') {
      res.json([])
      return
    }

    const q = String(req.query.q ?? '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const isGaWide =
      role === 'SUPER_ADMIN' ||
      (GA_DELEGATE_ROLES.includes(role) && accessJwt !== 'none' && accessJwt !== 'own' && accessJwt !== 'assigned')

    const selectList = `
          c.id, c.user_id, c.name, c.birth_date, c.ssn, c.phone, c.carrier, c.address, c.height, c.weight, c.job, c.driving, c.medical,
          c.car_number, c.car_model, c.car_year, c.renewal_date,
          c.gender, c.insurance_age, c.next_age_date, c.is_driver, c.car_type, c.notes,
          c.is_favorite, c.created_at,
          c.customer_code,
          c.crm_extension
    `

    let result
    if (!q) {
      if (isGaWide) {
        result = await safeQuery(
          pool,
          `
        SELECT
          ${selectList}
        FROM customers c
        WHERE c.ga_id = $1 AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT $2
        `,
          [gaId, limit],
        )
      } else {
        const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
        if (vis.blocked) {
          res.json([])
          return
        }
        const limPh = `$${vis.params.length + 1}`
        result = await safeQuery(
          pool,
          `
        SELECT
          ${selectList}
        FROM customers c
        WHERE (${vis.clause}) AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT ${limPh}
        `,
          [...vis.params, limit],
        )
      }
    } else {
      const pattern = `%${escapeIlikePattern(q)}%`
      const rawId = /^\d+$/.test(q) ? Number(q) : null
      const idParam = rawId != null && Number.isInteger(rawId) && rawId > 0 ? rawId : null
      if (isGaWide) {
        result = await safeQuery(
          pool,
          `
        SELECT
          ${selectList}
        FROM customers c
        WHERE c.ga_id = $1 AND c.deleted_at IS NULL
          AND (
            c.name ILIKE $2 ESCAPE '\\'
            OR c.phone ILIKE $2 ESCAPE '\\'
            OR (c.customer_code IS NOT NULL AND c.customer_code ILIKE $2 ESCAPE '\\')
            OR ($3::int IS NOT NULL AND c.id = $3)
          )
        ORDER BY c.created_at DESC
        LIMIT $4
        `,
          [gaId, pattern, idParam, limit],
        )
      } else {
        const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
        if (vis.blocked) {
          res.json([])
          return
        }
        const p0 = vis.params.length
        const patPh = `$${p0 + 1}`
        const idPh = `$${p0 + 2}`
        const limPh = `$${p0 + 3}`
        result = await safeQuery(
          pool,
          `
        SELECT
          ${selectList}
        FROM customers c
        WHERE (${vis.clause}) AND c.deleted_at IS NULL
          AND (
            c.name ILIKE ${patPh} ESCAPE '\\'
            OR c.phone ILIKE ${patPh} ESCAPE '\\'
            OR (c.customer_code IS NOT NULL AND c.customer_code ILIKE ${patPh} ESCAPE '\\')
            OR (${idPh}::int IS NOT NULL AND c.id = ${idPh})
          )
        ORDER BY c.created_at DESC
        LIMIT ${limPh}
        `,
          [...vis.params, pattern, idParam, limit],
        )
      }
    }

    res.json(result.rows.map(mapCustomerRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/customers', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000)

    const accessEarly = req.user?.customerAccess ?? 'own'
    if (accessEarly === 'none') {
      res.json({ data: [], total: 0 })
      return
    }

    const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
    if (vis.blocked) {
      res.json({ data: [], total: 0 })
      return
    }

    const plc = vis.params.length
    // listParams = [...vis.params, userId, gaId, limit] → placeholders $1..$plc, then userId, gaId, limit
    const lcUserPlace = `$${plc + 1}`
    const lcGaPlace = `$${plc + 2}`
    const limitPlace = `$${plc + 3}`
    const listParams = [...vis.params, userId, gaId, limit]

    const [result, countResult] = await Promise.all([
      safeQuery(
        pool,
        `
        SELECT
          c.id, c.user_id, c.name, c.birth_date, c.ssn, c.phone, c.carrier, c.address, c.height, c.weight, c.job, c.driving, c.medical,
          c.car_number, c.car_model, c.car_year, c.renewal_date,
          c.gender, c.insurance_age, c.next_age_date, c.is_driver, c.car_type, c.notes,
          c.is_favorite, c.created_at,
          c.crm_extension,
          lc.last_consult_date
        FROM customers c
        LEFT JOIN (
          SELECT
            cc.customer_id,
            MAX(cc.consultation_date) AS last_consult_date
          FROM customer_consultations cc
          WHERE cc.user_id = ${lcUserPlace}::text AND cc.ga_id = ${lcGaPlace}::integer
          GROUP BY cc.customer_id
        ) lc ON lc.customer_id = c.id
        WHERE (${vis.clause}) AND c.deleted_at IS NULL
        ORDER BY lc.last_consult_date DESC NULLS LAST, c.renewal_date ASC NULLS LAST, c.created_at DESC
        LIMIT ${limitPlace}::integer
        `,
        listParams,
      ),
      safeQuery(
        pool,
        `
        SELECT COUNT(*) AS c
        FROM customers c
        WHERE (${vis.clause}) AND c.deleted_at IS NULL
        `,
        vis.params,
      ),
    ])

    const total = Number(countResult.rows[0]?.c ?? 0) || 0
    res.json({
      data: result.rows.map(mapCustomerRow),
      total,
    })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/customers/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId < 1) {
      res.status(400).json({ message: '잘못된 고객 ID입니다.' })
      return
    }

    const accessEarly = req.user?.customerAccess ?? 'own'
    if (accessEarly === 'none') {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    const vis = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
    if (vis.blocked) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    const plc = vis.params.length
    const cidPlace = `$${plc + 1}`
    const lcUserPlace = `$${plc + 2}`
    const lcGaPlace = `$${plc + 3}`
    const detailParams = [...vis.params, customerId, userId, gaId]

    const result = await safeQuery(
      pool,
      `
      SELECT
        c.id, c.user_id, c.name, c.birth_date, c.ssn, c.phone, c.carrier, c.address, c.height, c.weight, c.job, c.driving, c.medical,
        c.car_number, c.car_model, c.car_year, c.renewal_date,
        c.gender, c.insurance_age, c.next_age_date, c.is_driver, c.car_type, c.notes,
        c.is_favorite, c.created_at,
        c.crm_extension,
        lc.last_consult_date
      FROM customers c
      LEFT JOIN (
        SELECT
          cc.customer_id,
          MAX(cc.consultation_date) AS last_consult_date
        FROM customer_consultations cc
        WHERE cc.user_id = ${lcUserPlace}::text AND cc.ga_id = ${lcGaPlace}::integer
        GROUP BY cc.customer_id
      ) lc ON lc.customer_id = c.id
      WHERE c.id = ${cidPlace} AND (${vis.clause}) AND c.deleted_at IS NULL
      LIMIT 1
      `,
      detailParams,
    )

    if (result.rowCount === 0) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    res.json(mapCustomerRow(result.rows[0]))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/customers/:id/forms', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId < 1) {
      res.status(400).json({ message: '잘못된 고객 ID입니다.' })
      return
    }

    if ((req.user?.customerAccess ?? 'own') === 'none') {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    const visCk = resolveCustomerVisibilitySqlForSelect(req, userId, gaId)
    if (visCk.blocked) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }
    const ckPlc = visCk.params.length
    const ckIdPh = `$${ckPlc + 1}`
    const check = await safeQuery(
      pool,
      `
      SELECT 1 FROM customers c
      WHERE c.id = ${ckIdPh} AND (${visCk.clause}) AND c.deleted_at IS NULL
      LIMIT 1
      `,
      [...visCk.params, customerId],
    )

    if (check.rowCount === 0) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    const forms = await safeQuery(pool,
      `
      SELECT id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      FROM insurance_forms
      WHERE user_id = $1 AND customer_id = $2 AND ga_id = $3
      ORDER BY created_at DESC
      `,
      [userId, customerId, gaId],
    )

    res.json(forms.rows.map(mapFormRow))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/customers/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId < 1) {
      res.status(400).json({ message: '잘못된 고객 ID입니다.' })
      return
    }

    const visCtx = resolveCustomerVisibilitySqlForUpdate(req, userId, gaId)
    if (visCtx.blocked) {
      res.status(404).json({ message: '고객을 찾을 수 없습니다.' })
      return
    }

    const plc = visCtx.params.length
    const idPh = `$${plc + 1}`
    const deleted = await safeQuery(pool,
      `
      UPDATE customers
      SET deleted_at = NOW()
      WHERE id = ${idPh}
        AND (${visCtx.clause})
        AND deleted_at IS NULL
      `,
      [...visCtx.params, customerId],
    )

    if (deleted.rowCount === 0) {
      res.status(404).json({ message: '고객을 찾을 수 없거나 이미 삭제되었습니다.' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.get('/forms/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const result = await safeQuery(pool,
      `
      SELECT id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      FROM insurance_forms
      WHERE id = $1 AND user_id = $2 AND ga_id = $3
      `,
      [req.params.id, userId, gaId],
    )

    if (result.rowCount === 0) {
      res.status(404).json({ message: '신청서를 찾을 수 없습니다.' })
      return
    }

    res.json(mapFormRow(result.rows[0]))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.put('/forms/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const formData = extractFormData(req.body)
    if (!formData) {
      res.status(400).json({ message: 'form_data가 필요합니다.' })
      return
    }

    const existingForm = await safeQuery(pool,
      `SELECT customer_id FROM insurance_forms WHERE id = $1 AND user_id = $2 AND ga_id = $3`,
      [req.params.id, userId, gaId],
    )
    if (existingForm.rowCount === 0) {
      res.status(404).json({ message: '수정할 신청서를 찾을 수 없습니다.' })
      return
    }
    const prevFormCustomerId =
      existingForm.rows[0].customer_id != null && existingForm.rows[0].customer_id !== ''
        ? Number(existingForm.rows[0].customer_id)
        : null

    const linkedId = resolveLinkedCustomerIdFromRequest(req.body, formData)
    let customerIdFk = null
    if (linkedId != null) {
      const owned = await assertCustomerOwnedByUser(req, linkedId)
      if (!owned) {
        res.status(400).json({ message: '유효하지 않은 고객 연결입니다.' })
        return
      }
      const active = await assertCustomerActiveAndOwnedByUser(req, linkedId)
      if (!active) {
        const sameAsBefore =
          prevFormCustomerId != null && Number.isInteger(prevFormCustomerId) && prevFormCustomerId === linkedId
        if (!sameAsBefore) {
          res.status(400).json({ message: '삭제 처리된 고객에는 새로 연결할 수 없습니다.' })
          return
        }
      }
      customerIdFk = linkedId
    }

    const mergedForm = { ...formData, customerId: customerIdFk ?? 0 }

    const customerName = String(
      req.body.customer_name ?? req.body.customerName ?? mergedForm.ownerName ?? '',
    )
    const carNumber = String(
      req.body.car_number ?? req.body.carNumber ?? mergedForm.vehicleNumber ?? '',
    )
    const expiryDate = normalizeExpiryDate(
      req.body.expiry_date ?? req.body.expiryDate ?? mergedForm.expiryDate ?? '',
    )

    const updated = await safeQuery(pool,
      `
      UPDATE insurance_forms
      SET
        customer_id = $1,
        customer_name = $2,
        car_number = $3,
        expiry_date = $4,
        form_data = CAST($5 AS jsonb),
        updated_at = NOW()
      WHERE id = $6 AND user_id = $7 AND ga_id = $8
      RETURNING id, user_id, customer_id, customer_name, car_number, expiry_date, form_data, created_at, updated_at
      `,
      [
        customerIdFk,
        customerName,
        carNumber,
        expiryDate || null,
        JSON.stringify(mergedForm),
        req.params.id,
        userId,
        gaId,
      ],
    )

    if (updated.rowCount === 0) {
      res.status(404).json({ message: '수정할 신청서를 찾을 수 없습니다.' })
      return
    }

    await logInsuranceFormsDbDiagnostics('put')

    res.json(mapFormRow(updated.rows[0]))
  } catch (error) {
    handleDbError(error, req, res)
  }
})

apiRouter.delete('/forms/:id', requireAuth, async (req, res) => {
  try {
    const userId = requireInsuranceFormUserId(req, res)
    if (!userId) {
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
      return
    }

    const deleted = await safeQuery(pool,
      `
      DELETE FROM insurance_forms
      WHERE id = $1 AND user_id = $2 AND ga_id = $3
      RETURNING id
      `,
      [req.params.id, userId, gaId],
    )

    if (deleted.rowCount === 0) {
      res.status(404).json({ message: '삭제할 신청서를 찾을 수 없습니다.' })
      return
    }

    res.status(204).send()
  } catch (error) {
    handleDbError(error, req, res)
  }
})

/**
 * 고객 상담/관계/고급검색 (GET·POST /customers/:id/consultations 등)
 * 반드시 app.use 로 apiRouter 를 붙이기 **전에** 등록한다. (등록이 뒤에 가면 라우트가 붙지 않음)
 */
registerCustomerExtraApi(apiRouter, { pool, requireAuth, handleDbError })

app.use('/uploads', express.static(UPLOADS_PUBLIC_PATH))

app.use('/api', apiRouter)
app.use('/backend', apiRouter)
// 배포 환경에서 API base가 '/api' 또는 '/backend'로 중복 설정돼도 404 없이 수용
app.use('/api/api', apiRouter)
app.use('/backend/api', apiRouter)

if (fs.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    const p = req.path ?? ''

    if (
      p === '/api' ||
      p.startsWith('/api/') ||
      p === '/backend' ||
      p.startsWith('/backend/')
    ) {
      return next()
    }

    if (p.includes('.') || p.startsWith('/assets/')) {
      return next()
    }

    if (p.startsWith('/customer/register')) {
      try {
        const htmlPath = path.join(DIST_PATH, 'index.html')
        const raw = fs.readFileSync(htmlPath, 'utf8')
        res.type('html').send(injectCustomerRegisterInviteMeta(raw))
        return
      } catch (err) {
        console.warn(
          '[spa] customer/register meta inject failed:',
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    res.sendFile(path.join(DIST_PATH, 'index.html'))
  })
} else if (RUNNING_IN_PRODUCTION) {
  console.error(
    '[deploy��가 없습니다. 배�드에 vite build(���는 npm run build)가 포함되는지 확인하세요.��� URL(/customer/...)은����이 필요합니다.',
  )
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: '서버 오류가 발생했습니다.' })
})

async function runInitDbOnStartup() {
  const skipRequested = process.env.INSURANCE_SKIP_INIT_DB === 'true'
  const maySkipInitDb =
    skipRequested && process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT

  if (skipRequested && !maySkipInitDb) {
    console.warn(
      '[server] INSURANCE_SKIP_INIT_DB=true 무시됨 — production 또는 Railway 환경에서는 initDb를 생략하지 않습니다.',
    )
  }

  if (maySkipInitDb) {
    console.warn(
      '[server] INSURANCE_SKIP_INIT_DB=true — initDb 생략(로컬 개발 전용). 스키마 변경 후에는 false 로 재기동하세요.',
    )
    return
  }

  const t0 = Date.now()
  console.log('[server] initDb 시작…')
  await initDb()
  const { ensureGovernmentAdminBootstrap } = await import(
    './lib/governmentSupport/ensureGovernmentAdminBootstrap.js'
  )
  await ensureGovernmentAdminBootstrap(pool)
  console.log(`[server] initDb 완료 (${Date.now() - t0}ms)`)
}

async function startServer() {
  if (JWT_SECRET === DEFAULT_JWT_SECRET && RUNNING_IN_PRODUCTION) {
    console.error('='.repeat(70))
    console.error('[DEPLOY-BLOCKER] JWT_SECRET이 기본값입니다.')
    console.error('[DEPLOY-BLOCKER] 배포 전 Railway 환경변수 JWT_SECRET을 반드시 변경하세요.')
    console.error('='.repeat(70))
    throw new Error('보안 차단: 기본 JWT_SECRET 사용 금지')
  }

  await runInitDbOnStartup()
  await seedInsuranceCompanyDirectory()
  await logInsuranceFormsDbDiagnostics('startup')
  await ensureYesterdayAnalyticsAggregated(pool)

  app.listen(PORT, () => {
    console.log(formatServerListeningMessage(PORT))
    console.log(formatDbEngineMessage())
  })

  const SMS_CODE_PURGE_MS = 15 * 60 * 1000
  void runScheduledSmsCleanup(pool)
  setInterval(() => {
    void runScheduledSmsCleanup(pool)
  }, SMS_CODE_PURGE_MS)

  const analyticsScheduleState = { lastRunSeoulYmd: null }
  const ANALYTICS_TICK_MS = 60 * 60 * 1000
  void tickAnalyticsAggregationScheduler(pool, analyticsScheduleState)
  setInterval(() => {
    void tickAnalyticsAggregationScheduler(pool, analyticsScheduleState)
  }, ANALYTICS_TICK_MS)
}

startServer().catch((error) => {
  console.error('서버 시작 실패:', error)
  process.exit(1)
})
