/** @param {Record<string, unknown>} row */
export function mapGovSupportProfileRow(row) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerName: String(row.customer_name ?? ''),
    phone: String(row.phone ?? ''),
    carrier: String(row.carrier ?? ''),
    ssn: String(row.ssn ?? ''),
    homeAddress: String(row.home_address ?? ''),
    homeType: String(row.home_type ?? ''),
    deposit: String(row.deposit ?? ''),
    monthlyRent: String(row.monthly_rent ?? ''),
    creditScore1: String(row.credit_score_1 ?? ''),
    creditScore2: String(row.credit_score_2 ?? ''),
    businessName: String(row.business_name ?? ''),
    businessOpenedAt: String(row.business_opened_at ?? ''),
    businessNumber: String(row.business_number ?? ''),
    businessAddress: String(row.business_address ?? ''),
    businessCategory: String(row.business_category ?? ''),
    businessType: String(row.business_type ?? ''),
    businessForm: String(row.business_form ?? ''),
    businessPhone: String(row.business_phone ?? ''),
    productName: String(row.product_name ?? ''),
    availableProduct: String(row.available_product ?? ''),
    progressStatus: String(row.progress_status ?? ''),
    scheduleAt: String(row.schedule_at ?? ''),
    agencyOrg: String(row.agency_org ?? ''),
    assigneeUserId: row.assignee_user_id != null ? String(row.assignee_user_id) : null,
    region: String(row.region ?? ''),
    note: String(row.note ?? ''),
    specialNote: String(row.special_note ?? ''),
    vatReport: String(row.vat_report ?? ''),
    annualIncome: String(row.annual_income ?? ''),
    incomeCert: String(row.income_cert ?? ''),
    taxArrears: String(row.tax_arrears ?? ''),
    requiredFunds: String(row.required_funds ?? ''),
    fee: String(row.fee ?? ''),
    certDelegate: String(row.cert_delegate ?? ''),
    certType: String(row.cert_type ?? ''),
    delegateStatus: String(row.delegate_status ?? ''),
    delegationMemo: String(row.delegation_memo ?? ''),
    edocStatus: String(row.edoc_status ?? ''),
    docStatus: String(row.doc_status ?? ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** camelCase body → snake columns for UPDATE */
export function profilePatchFromBody(body) {
  const b = body && typeof body === 'object' ? body : {}
  const pick = (camel, snake) => {
    if (b[camel] !== undefined) return [snake, String(b[camel] ?? '')]
    if (b[snake] !== undefined) return [snake, String(b[snake] ?? '')]
    return null
  }
  const pairs = [
    pick('customerName', 'customer_name'),
    pick('phone', 'phone'),
    pick('carrier', 'carrier'),
    pick('ssn', 'ssn'),
    pick('homeAddress', 'home_address'),
    pick('homeType', 'home_type'),
    pick('deposit', 'deposit'),
    pick('monthlyRent', 'monthly_rent'),
    pick('creditScore1', 'credit_score_1'),
    pick('creditScore2', 'credit_score_2'),
    pick('businessName', 'business_name'),
    pick('businessOpenedAt', 'business_opened_at'),
    pick('businessNumber', 'business_number'),
    pick('businessAddress', 'business_address'),
    pick('businessCategory', 'business_category'),
    pick('businessType', 'business_type'),
    pick('businessForm', 'business_form'),
    pick('businessPhone', 'business_phone'),
    pick('productName', 'product_name'),
    pick('availableProduct', 'available_product'),
    pick('progressStatus', 'progress_status'),
    pick('scheduleAt', 'schedule_at'),
    pick('agencyOrg', 'agency_org'),
    pick('region', 'region'),
    pick('note', 'note'),
    pick('specialNote', 'special_note'),
    pick('vatReport', 'vat_report'),
    pick('annualIncome', 'annual_income'),
    pick('incomeCert', 'income_cert'),
    pick('taxArrears', 'tax_arrears'),
    pick('requiredFunds', 'required_funds'),
    pick('fee', 'fee'),
    pick('certDelegate', 'cert_delegate'),
    pick('certType', 'cert_type'),
    pick('delegateStatus', 'delegate_status'),
    pick('delegationMemo', 'delegation_memo'),
    pick('edocStatus', 'edoc_status'),
    pick('docStatus', 'doc_status'),
  ].filter(Boolean)
  if (b.assigneeUserId !== undefined || b.assignee_user_id !== undefined) {
    const v = b.assigneeUserId ?? b.assignee_user_id
    pairs.push(['assignee_user_id', v == null || String(v).trim() === '' ? null : String(v).trim()])
  }
  return pairs
}
