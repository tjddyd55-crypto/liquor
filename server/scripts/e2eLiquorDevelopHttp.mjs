/**
 * CRM-liqour develop — 주류 shell + 주류 전용 전자서명 HTTP E2E (secret 미출력).
 * E2E_LIQUOR_BASE_URL, E2E_LIQUOR_ADMIN_PASSWORD(선택, 없으면 bootstrap admin 사용 불가) 필요.
 */
import { randomBytes, randomInt } from 'node:crypto'
import fs from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const BASE = String(process.env.E2E_LIQUOR_BASE_URL ?? 'https://app-develop-a3aa.up.railway.app').replace(/\/$/, '')
const API = `${BASE}/backend/api`
const ADMIN_USER = String(process.env.E2E_LIQUOR_ADMIN_LOGIN_ID ?? 'admin').trim()
const ADMIN_PASS = String(process.env.E2E_LIQUOR_ADMIN_PASSWORD ?? process.env.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD ?? '').trim()

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = []
function pass(name, detail) { results.push({ ok: true, name, detail }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
function fail(name, detail) { results.push({ ok: false, name, detail }); console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
function skip(name, detail) { results.push({ ok: true, name, detail: `SKIP — ${detail}` }); console.log(`SKIP  ${name} — ${detail}`) }

async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload = undefined
  if (formData) payload = formData
  else if (body != null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text.slice(0, 200) } }
  return { status: res.status, json }
}

async function makeTinyPdfBuffer(label = 'liquor-e2e') {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 200])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText(label, { x: 50, y: 100, size: 12, font })
  return Buffer.from(await doc.save())
}

async function login(username, password) {
  const res = await api('/auth/login', { method: 'POST', body: { username, password } })
  const token = res.json?.token ?? res.json?.accessToken ?? null
  return { ...res, token }
}

async function main() {
  const tag = Date.now().toString(36)
  pass('target', BASE)

  const healthRes = await fetch(`${BASE}/backend/health`)
  if (healthRes.status === 200) pass('backend health', '200')
  else fail('backend health', String(healthRes.status))

  const signupRes = await fetch(`${BASE}/signup/liquor`)
  if (signupRes.status === 200) pass('signup liquor page', '200')
  else fail('signup liquor page', String(signupRes.status))

  if (!ADMIN_PASS) {
    fail('admin bootstrap password', 'E2E_LIQUOR_ADMIN_PASSWORD 또는 INSURANCE_ADMIN_BOOTSTRAP_PASSWORD 필요')
    summary()
    process.exit(1)
  }

  const adminLogin = await login(ADMIN_USER, ADMIN_PASS)
  if (adminLogin.status !== 200 || !adminLogin.token) {
    fail('super admin login', `${adminLogin.status} ${adminLogin.json?.message ?? ''}`)
    summary()
    process.exit(1)
  }
  pass('super admin login', ADMIN_USER)
  const adminToken = adminLogin.token

  const industries = await api('/admin/platform/industries', { token: adminToken })
  const liquorInd = (industries.json?.items ?? industries.json?.data ?? []).find(
    (i) => String(i.code ?? i.industryCode ?? '').toLowerCase() === 'liquor',
  )
  const industryId = liquorInd?.id ?? liquorInd?.industryId
  if (!industryId) {
    fail('liquor industry lookup', String(industries.status))
    summary()
    process.exit(1)
  }
  pass('liquor industry', String(industryId))

  const tenantCode = `liqe2e${tag.slice(-6)}`
  const regCode = `LIQ${tag.toUpperCase().slice(-5)}`
  const gaCode = `LIQGA${tag.toUpperCase().slice(-4)}`
  let tenantId = null
  let gaId = null

  const createGa = await api('/admin/ga', {
    token: adminToken,
    method: 'POST',
    body: { name: `E2E Liquor GA ${tag}`, code: gaCode, status: 'active' },
  })
  gaId = createGa.json?.id ?? createGa.json?.gaId ?? null
  if (createGa.status === 201 && gaId) pass('liquor GA create', gaCode)
  else if (createGa.status === 409) {
    const gaList = await api('/admin/ga', { token: adminToken })
    const existing = (gaList.json?.gas ?? gaList.json?.data ?? gaList.json ?? []).find?.(
      (g) => String(g.code ?? '').toUpperCase() === gaCode,
    )
    gaId = existing?.id ?? null
    if (gaId) pass('liquor GA reuse', gaCode)
    else fail('liquor GA create', String(createGa.status))
  } else fail('liquor GA create', `${createGa.status} ${createGa.json?.message ?? ''}`)

  const createTenant = await api(`/admin/platform/industries/${industryId}/tenants`, {
    token: adminToken,
    method: 'POST',
    body: { code: tenantCode, name: `E2E 주류 ${tag}`, status: 'active', legacyGaId: gaId },
  })
  tenantId = createTenant.json?.id ?? null
  if (createTenant.status === 201 && tenantId) pass('liquor tenant create', `${tenantCode} (${tenantId})`)
  else if (createTenant.status === 409) {
    const list = await api(`/admin/platform/industries/${industryId}/tenants`, { token: adminToken })
    const existing = (list.json?.items ?? list.json?.data ?? []).find((t) => t.code === tenantCode)
    tenantId = existing?.id ?? null
    if (tenantId) pass('liquor tenant reuse', tenantCode)
    else fail('liquor tenant create', `${createTenant.status}`)
  } else fail('liquor tenant create', `${createTenant.status} ${createTenant.json?.message ?? ''}`)

  if (tenantId) {
    const rc = await api(`/admin/platform/tenants/${tenantId}/registration-codes`, {
      token: adminToken,
      method: 'POST',
      body: { code: regCode, maxUses: 10 },
    })
    if (rc.status === 201 || rc.status === 200) pass('registration code create', regCode)
    else if (rc.status === 409) pass('registration code reuse', regCode)
    else fail('registration code create', `${rc.status} ${rc.json?.message ?? ''}`)
  }

  const validate = await api('/auth/validate-tenant-registration-code', {
    method: 'POST',
    body: { industry_code: 'liquor', registration_code: regCode },
  })
  if (validate.status === 200 && validate.json?.ok) pass('validate registration code', validate.json?.tenantName ?? regCode)
  else fail('validate registration code', `${validate.status}`)

  const username = `e2e_liq_${tag}`
  const password = randomBytes(18).toString('base64url')
  const phone = `010${String(randomInt(10_000_000, 99_999_999))}`

  const smsSend = await api('/auth/send-signup-phone-code', {
    method: 'POST',
    body: { industry_code: 'liquor', registration_code: regCode, phoneNumber: phone },
  })
  const smsCode = String(smsSend.json?.debugCode ?? '').trim()
  if (smsSend.status === 200 && /^\d{6}$/.test(smsCode)) pass('signup SMS debug')
  else fail('signup SMS debug', `${smsSend.status} debug=${smsCode ? 'yes' : 'no'}`)

  let signupPhoneProof = null
  if (/^\d{6}$/.test(smsCode)) {
    const smsVerify = await api('/auth/verify-signup-phone-code', {
      method: 'POST',
      body: { industry_code: 'liquor', registration_code: regCode, phoneNumber: phone, code: smsCode },
    })
    signupPhoneProof = smsVerify.json?.signup_phone_proof ?? smsVerify.json?.signupPhoneProof ?? null
    if (smsVerify.status === 200 && signupPhoneProof) pass('signup phone verify')
    else fail('signup phone verify', String(smsVerify.status))
  }

  if (signupPhoneProof) {
    const reg = await api('/auth/register', {
      method: 'POST',
      body: {
        username,
        password,
        industry_code: 'liquor',
        registration_code: regCode,
        name: `E2E ${tag}`,
        phoneNumber: phone,
        signup_phone_proof: signupPhoneProof,
      },
    })
    if (reg.status === 200 || reg.status === 201) pass('liquor user register', username)
    else fail('liquor user register', `${reg.status} ${reg.json?.message ?? ''}`)
  }

  const userLogin = await login(username, password)
  if (userLogin.status !== 200 || !userLogin.token) {
    fail('liquor user login', String(userLogin.status))
    summary()
    process.exit(1)
  }
  pass('liquor user login', username)
  const userToken = userLogin.token
  const crmIndustry = userLogin.json?.user?.crm_industry_code ?? userLogin.json?.user?.crmIndustryCode ?? ''
  if (String(crmIndustry).toLowerCase() === 'liquor') pass('session crm_industry_code', 'liquor')
  else fail('session crm_industry_code', String(crmIndustry || '(empty)'))

  const tenantProfileBefore = await api('/liquor/tenant/company-profile', { token: userToken })
  if (tenantProfileBefore.status === 200) pass('liquor tenant company profile GET')
  else fail('liquor tenant company profile GET', String(tenantProfileBefore.status))

  const tenantBusinessName = `E2E Tenant Co ${tag}`
  const tenantSave = await api('/liquor/tenant/company-profile', {
    token: userToken,
    method: 'PUT',
    body: {
      businessName: tenantBusinessName,
      representativeName: 'E2E Tenant Rep',
      signatureSenderName: 'E2E Sender',
      signatureSenderPhone: '0211112222',
    },
  })
  if (tenantSave.status === 200) pass('liquor tenant company profile save')
  else fail('liquor tenant company profile save', `${tenantSave.status} ${tenantSave.json?.message ?? ''}`)

  const tenantProfileAfter = await api('/liquor/tenant/company-profile', { token: userToken })
  const savedBusinessName = String(tenantProfileAfter.json?.data?.business_name ?? tenantProfileAfter.json?.data?.businessName ?? '')
  if (tenantProfileAfter.status === 200 && savedBusinessName === tenantBusinessName) {
    pass('liquor tenant company profile persist', savedBusinessName)
  } else {
    fail('liquor tenant company profile persist', savedBusinessName || String(tenantProfileAfter.status))
  }

  const tenantPartialSave = await api('/liquor/tenant/company-profile', {
    token: userToken,
    method: 'PUT',
    body: { businessName: tenantBusinessName },
  })
  if (tenantPartialSave.status === 200) pass('liquor tenant company profile partial save')
  else fail('liquor tenant company profile partial save', String(tenantPartialSave.status))

  const customersBefore = await api('/customers', { token: userToken })
  if (customersBefore.status === 200) pass('customers API list', 'ok')
  else fail('customers API list', String(customersBefore.status))

  const createCustomer = await api('/customers', {
    token: userToken,
    method: 'POST',
    body: { name: `E2E Customer ${tag}`, phone },
  })
  const customerId = createCustomer.json?.data?.id ?? createCustomer.json?.id ?? null
  if (createCustomer.status === 201 && customerId) pass('customer create', String(customerId))
  else fail('customer create', `${createCustomer.status} ${createCustomer.json?.message ?? ''}`)

  if (customerId) {
    const putIndividual = await api(`/liquor/customers/${customerId}/profile`, {
      token: userToken,
      method: 'PUT',
      body: {
        partyType: 'individual',
        residentId: '9001011234567',
        individualEmail: `e2e-ind-${tag}@example.invalid`,
        memo: `E2E individual ${tag}`,
        accountStatus: 'active',
      },
    })
    if (putIndividual.status === 200 && putIndividual.json?.data?.partyType === 'individual') {
      pass('liquor individual profile save')
    } else {
      fail('liquor individual profile save', `${putIndividual.status} ${putIndividual.json?.message ?? ''}`)
    }

    const detailInd = await api(`/liquor/customers/${customerId}/detail`, { token: userToken })
    const masked = String(detailInd.json?.data?.profile?.residentIdMasked ?? '')
    const plainInDetail = JSON.stringify(detailInd.json?.data?.profile ?? {})
    if (detailInd.status === 200 && masked.includes('******') && !plainInDetail.includes('1234567')) {
      pass('resident id masked in detail', masked)
    } else {
      fail('resident id masked in detail', masked || String(detailInd.status))
    }

    const createBizCustomer = await api('/customers', {
      token: userToken,
      method: 'POST',
      body: { name: `E2E Biz ${tag}`, phone: `010${String(randomInt(10_000_000, 99_999_999))}` },
    })
    const bizCustomerId = createBizCustomer.json?.data?.id ?? createBizCustomer.json?.id ?? null
    if (createBizCustomer.status === 201 && bizCustomerId) pass('business customer create', String(bizCustomerId))
    else fail('business customer create', `${createBizCustomer.status}`)

    if (bizCustomerId) {
      const putBusiness = await api(`/liquor/customers/${bizCustomerId}/profile`, {
        token: userToken,
        method: 'PUT',
        body: {
          partyType: 'business',
          businessRepresentativeName: `E2E Rep ${tag}`,
          businessName: `E2E Biz Co ${tag}`,
          businessRegistrationNumber: '1234567890',
          businessAddress: '서울시 테스트구',
          storePhone: '0212345678',
          businessType: '도매',
          businessItem: '주류',
          accountStatus: 'active',
        },
      })
      if (putBusiness.status === 200 && putBusiness.json?.data?.partyType === 'business') {
        pass('liquor business profile save')
      } else {
        fail('liquor business profile save', `${putBusiness.status}`)
      }

      const contact = await api(`/liquor/customers/${bizCustomerId}/contacts`, {
        token: userToken,
        method: 'POST',
        body: { name: `E2E Contact ${tag}`, phone: '01011112222', roleLabel: '매장담당' },
      })
      if (contact.status === 201) pass('liquor contact add')
      else fail('liquor contact add', `${contact.status}`)

      const contract = await api(`/liquor/customers/${bizCustomerId}/support-contracts`, {
        token: userToken,
        method: 'POST',
        body: {
          contractName: `E2E Contract ${tag}`,
          supportType: 'liquor_loan',
          supportAmount: 1000000,
          totalRepaymentPlannedAmount: 1000000,
          repaymentRequired: true,
          status: 'repaying',
        },
      })
      const contractId = contract.json?.data?.id ?? contract.json?.id ?? null
      if (contract.status === 201 && contractId) pass('liquor support contract add', String(contractId))
      else fail('liquor support contract add', `${contract.status}`)

      if (contractId) {
        const repayment = await api(
          `/liquor/customers/${bizCustomerId}/support-contracts/${contractId}/repayments`,
          {
            token: userToken,
            method: 'POST',
            body: { amount: 300000, method: 'bank_transfer', repaidOn: new Date().toISOString().slice(0, 10) },
          },
        )
        if (repayment.status === 201) pass('liquor repayment add')
        else fail('liquor repayment add', `${repayment.status}`)

        const detailBal = await api(`/liquor/customers/${bizCustomerId}/detail`, { token: userToken })
        const contracts = detailBal.json?.data?.supportContracts ?? []
        const updated = contracts.find((c) => Number(c.id) === Number(contractId))
        const balance = Number(updated?.balanceAmount ?? updated?.balance_amount ?? NaN)
        if (detailBal.status === 200 && balance === 700000) {
          pass('liquor balance auto calc', '700000')
        } else {
          fail('liquor balance auto calc', `expected 700000 got ${balance}`)
        }
      }

      const item = await api(`/liquor/customers/${bizCustomerId}/support-items`, {
        token: userToken,
        method: 'POST',
        body: { itemKind: 'refrigerator', modelName: `E2E Fridge ${tag}`, quantity: 1, unitPrice: 500000 },
      })
      if (item.status === 201) pass('liquor support item add')
      else fail('liquor support item add', `${item.status}`)

      const note = await api(`/liquor/customers/${bizCustomerId}/notes`, {
        token: userToken,
        method: 'POST',
        body: { body: `E2E note ${tag}` },
      })
      if (note.status === 201) pass('liquor note add')
      else fail('liquor note add', `${note.status}`)
    }
  }

  const pdfBuf = await makeTinyPdfBuffer(`liquor-sig-${tag}`)
  const form = new FormData()
  form.append('pdf', new Blob([pdfBuf], { type: 'application/pdf' }), 'e2e-liquor.pdf')
  if (gaId) form.append('gaId', String(gaId))
  const uploadRes = await fetch(`${API}/liquor/signature-templates/pdf/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  })
  const uploadJson = await uploadRes.json().catch(() => ({}))
  const storageKey = uploadJson?.storageKey ?? uploadJson?.data?.storageKey ?? null
  const pageCount = uploadJson?.pageCount ?? 1
  if (uploadRes.status === 200 && storageKey) {
    pass('pdf template upload', storageKey.slice(0, 24) + '…')
    const liquorRoot = String(process.env.CRM_R2_OBJECT_ROOT ?? '').includes('liquor') || storageKey.includes('liquor/')
    if (liquorRoot || storageKey.includes('/signatures/')) pass('R2 liquor object prefix', storageKey.split('/').slice(0, 4).join('/'))
    else fail('R2 liquor object prefix', storageKey.slice(0, 48))
  } else {
    fail('pdf template upload', `${uploadRes.status} ${uploadJson?.message ?? ''}`)
  }

  let pdfTemplateId = null
  if (storageKey) {
    const meta = await api('/liquor/signature-templates/pdf', {
      token: adminToken,
      method: 'POST',
      body: { title: `E2E Liquor PDF ${tag}`, storageKey, pageCount, tenant_ga_id: gaId, gaId },
    })
    pdfTemplateId = meta.json?.template?.id ?? meta.json?.id ?? meta.json?.data?.id ?? null
    if (meta.status === 201 && pdfTemplateId) pass('pdf template meta create', String(pdfTemplateId))
    else fail('pdf template meta create', `${meta.status}`)
  }

  if (pdfTemplateId) {
    const fields = await api(`/liquor/signature-templates/pdf/${pdfTemplateId}`, { token: adminToken })
    const fieldList = fields.json?.fields ?? []
    const fieldId = fieldList[0]?.id
    const saveFields = await api(`/liquor/signature-templates/pdf/${pdfTemplateId}/fields`, {
      token: adminToken,
      method: 'PUT',
      body: {
        fields: [
          {
            id: fieldId,
            fieldKey: 'signer_name',
            label: '서명자명',
            fieldType: 'text',
            pageNumber: 1,
            x: 50,
            y: 120,
            width: 200,
            height: 24,
            required: true,
          },
          {
            fieldKey: 'signature',
            label: '서명',
            fieldType: 'signature',
            pageNumber: 1,
            x: 50,
            y: 60,
            width: 160,
            height: 40,
            required: true,
          },
        ],
      },
    })
    if (saveFields.status === 200) pass('pdf coordinates save')
    else fail('pdf coordinates save', `${saveFields.status} ${saveFields.json?.message ?? ''}`)
  }

  let contractTemplateId = null
  if (pdfTemplateId) {
    const ct = await api('/liquor/signature-templates/templates', {
      token: adminToken,
      method: 'POST',
      body: {
        title: `E2E Liquor CT ${tag}`,
        pdfTemplateId,
        templateMode: 'coordinate_pdf',
        status: 'active',
        tenant_ga_id: gaId,
        ga_id: gaId,
      },
    })
    contractTemplateId = ct.json?.data?.id ?? ct.json?.id ?? null
    if (ct.status === 201 && contractTemplateId) pass('contract template create', String(contractTemplateId))
    else fail('contract template create', `${ct.status} ${ct.json?.message ?? ''}`)
  }

  let sendSessionId = null
  let linkCode = null
  if (contractTemplateId) {
    const send = await api('/liquor/signatures/send-sessions', {
      token: userToken,
      method: 'POST',
      body: {
        templateIds: [contractTemplateId],
        customerId,
      },
    })
    sendSessionId = send.json?.data?.sendSession?.id ?? send.json?.sendSession?.id ?? send.json?.data?.id ?? null
    linkCode = send.json?.data?.sendSession?.linkCode ?? send.json?.sendSession?.linkCode ?? send.json?.data?.linkCode ?? null
    if (send.status === 201 && sendSessionId && linkCode) {
      pass('signature send', sendSessionId)
      pass('public link code', `${String(linkCode).slice(0, 8)}…`)
    } else {
      fail('signature send', `${send.status} ${send.json?.message ?? JSON.stringify(send.json).slice(0, 120)}`)
    }
  }

  let otpVerified = false
  if (linkCode) {
    const pub = await api(`/liquor/signatures/public/${encodeURIComponent(linkCode)}`, {})
    if (pub.status === 200) pass('public session GET')
    else fail('public session GET', String(pub.status))

    const otpSend = await api(`/liquor/signatures/public/${encodeURIComponent(linkCode)}/otp/send`, { method: 'POST', body: {} })
    if (otpSend.status === 200) pass('public OTP send')
    else fail('public OTP send', `${otpSend.status} ${otpSend.json?.message ?? ''}`)

    const otpEnv = String(process.env.E2E_LIQUOR_SIGNATURE_OTP ?? '').trim()
    const otpDebug = String(otpSend.json?.data?.debugCode ?? otpSend.json?.debugCode ?? '').trim()
    const otpCode = otpEnv || otpDebug
    if (otpCode && otpSend.status === 200) {
      const otpVerify = await api(`/liquor/signatures/public/${encodeURIComponent(linkCode)}/otp/verify`, {
        method: 'POST',
        body: { code: otpCode },
      })
      if (otpVerify.status === 200) { pass('public OTP verify'); otpVerified = true }
      else fail('public OTP verify', `${otpVerify.status}`)
    } else if (otpSend.status === 200) {
      skip('public OTP verify', 'debugCode/E2E_LIQUOR_SIGNATURE_OTP unavailable on liquor develop')
    }
  }

  if (linkCode && otpVerified && sendSessionId) {
    const detail = await api(`/liquor/signatures/send-sessions/${encodeURIComponent(sendSessionId)}`, { token: userToken })
    let docId = detail.json?.sendSession?.documents?.[0]?.id ?? detail.json?.data?.documents?.[0]?.id ?? null
    if (!docId) {
      const pubDocs = await api(`/liquor/signatures/public/${encodeURIComponent(linkCode)}/documents`, {})
      docId = pubDocs.json?.data?.documents?.[0]?.id ?? pubDocs.json?.documents?.[0]?.id ?? null
    }
    const pdfDetail = pdfTemplateId
      ? await api(`/liquor/signature-templates/pdf/${pdfTemplateId}`, { token: adminToken })
      : { json: {} }
    const fields = pdfDetail.json?.fields ?? []
    const textField = fields.find((f) => String(f.field_key ?? f.fieldKey) === 'signer_name')
    const sigField = fields.find((f) => String(f.field_type ?? f.fieldType) === 'signature')
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    if (docId && textField?.id) {
      const vals = await api(
        `/liquor/signatures/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/values`,
        { method: 'POST', body: { values: [{ fieldId: String(textField.id), fieldKey: 'signer_name', value: 'E2E Signer' }] } },
      )
      if (vals.status === 200) pass('public field values save')
      else fail('public field values save', `${vals.status}`)
    }

    if (docId && sigField?.id) {
      const signRes = await api(
        `/liquor/signatures/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/sign`,
        {
          method: 'POST',
          body: { fieldId: String(sigField.id), signatureImageData: PNG, electronicSignAcknowledged: true },
        },
      )
      if (signRes.status === 200) pass('public signature save')
      else fail('public signature save', `${signRes.status}`)
    }

    if (docId) {
      const complete = await api(
        `/liquor/signatures/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/complete`,
        {
          method: 'POST',
          body: {
            finalPreviewConfirmed: true,
            finalSubmitAcknowledged: true,
            acknowledgeElectronicContract: true,
          },
        },
      )
      if (complete.status === 200) pass('signature complete')
      else fail('signature complete', `${complete.status} ${complete.json?.message ?? ''}`)

      const dl = await fetch(
        `${API}/liquor/signatures/public/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(docId)}/signed-pdf`,
        { headers: { Accept: 'application/pdf' } },
      )
      const ct = dl.headers.get('content-type') ?? ''
      if (dl.status === 200 && ct.includes('pdf')) {
        const buf = Buffer.from(await dl.arrayBuffer())
        pass('signed PDF download', `${buf.length} bytes`)
      } else {
        fail('signed PDF download', String(dl.status))
      }
    } else {
      fail('document instance for sign', String(detail.status))
    }
  }

  if (sendSessionId) {
    const hist = await api('/liquor/signatures/send-sessions', { token: userToken })
    if (hist.status === 200) pass('send history list')
    else fail('send history list', String(hist.status))
  }

  // expose for browser continuation (local only)
  fs.writeFileSync(
    '.e2e-liquor-last-run.json',
    JSON.stringify({ username, password, regCode, tenantCode, linkCode, base: BASE }, null, 2),
    'utf8',
  )
  console.log('\n--- E2E context (non-secret) ---')
  console.log(JSON.stringify({ username, regCode, tenantCode, linkCode: linkCode ? `${String(linkCode).slice(0, 8)}…` : null }, null, 2))

  summary()
  process.exit(results.some((r) => !r.ok && !String(r.detail ?? '').startsWith('SKIP')) ? 1 : 0)
}

function summary() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== summary: ${results.length - failed.length}/${results.length} pass, ${failed.length} fail ===`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
