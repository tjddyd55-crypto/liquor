import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const init = fs.readFileSync(path.join(ROOT, 'server/initDb.js'), 'utf8')

function extractFn(name) {
  const re = new RegExp(`async function ${name}\\(executor\\) \\{([\\s\\S]*?)\\n\\}`)
  const m = init.match(re)
  if (!m) throw new Error(`missing ${name}`)
  return m[1]
}

const REPS = [
  ['contract_send_session_confirmation_field_values', 'liquor_signature_send_session_confirmation_field_values'],
  ['contract_template_confirmation_fields', 'liquor_signature_template_confirmation_fields'],
  ['contract_template_field_settings', 'liquor_signature_template_field_settings'],
  ['contract_confirmation_item_values', 'liquor_signature_confirmation_item_values'],
  ['contract_confirmation_items', 'liquor_signature_confirmation_items'],
  ['contract_send_session_attachments', 'liquor_signature_send_session_attachments'],
  ['contract_document_instances', 'liquor_signature_document_instances'],
  ['contract_document_values', 'liquor_signature_document_values'],
  ['contract_package_items', 'liquor_signature_package_items'],
  ['contract_template_fields', 'liquor_signature_template_fields'],
  ['contract_send_sessions', 'liquor_signature_send_sessions'],
  ['contract_templates', 'liquor_signature_templates'],
  ['contract_packages', 'liquor_signature_packages'],
  ['identity_verification_sessions', 'liquor_signature_identity_sessions'],
  ['signature_evidences', 'liquor_signature_evidences'],
  ["purpose TEXT NOT NULL DEFAULT 'contract_signature'", "purpose TEXT NOT NULL DEFAULT 'liquor_signature'"],
  ['REFERENCES pdf_templates(id)', 'REFERENCES liquor_pdf_templates(id)'],
  ['idx_contract_', 'idx_liquor_signature_'],
  ['idx_signature_evidences_', 'idx_liquor_signature_evidences_'],
  ['idx_identity_sessions_', 'idx_liquor_signature_identity_'],
  ['uq_signature_evidences_', 'uq_liquor_signature_evidences_'],
  ['CONSTRAINT contract_', 'CONSTRAINT liquor_signature_'],
]

function applyReps(body) {
  let out = body
  for (const [a, b] of REPS) out = out.split(a).join(b)
  return out
}

let pdfBody = extractFn('ensurePdfTemplateSchema')
pdfBody = pdfBody.replace(/pdf_templates/g, 'liquor_pdf_templates').replace(/pdf_template_fields/g, 'liquor_pdf_template_fields')

let contractBody = applyReps(extractFn('ensureContractSelfSmsSchema'))

const out = `/**
 * 주류회사 CRM 전자서명 전용 DB 스키마 (보험 contract_* / 정부 gov_signature_* 와 분리).
 * @module liquorSignatures/schema
 */

/**
 * @param {import('pg').Pool | { query: Function }} executor
 */
export async function ensureLiquorSignatureSchema(executor) {
${pdfBody}
${contractBody}
}
`

const dest = path.join(ROOT, 'server/lib/liquorSignatures/schema.js')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, out, 'utf8')
console.log('wrote', dest, out.length)
