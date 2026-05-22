/**
 * 주류 tenant company profile → 전자서명 발송 필드 기본값 매핑.
 * PDF/확인서 fieldKey·label 패턴으로 회사·발신 정보를 연결한다.
 */
import type { LiquorTenantCompanyProfile } from './liquorTenantCompanyProfileClient'
import type { LiquorSignatureSenderFieldDef, UserContractConfirmationFieldRow } from '../signatures/liquorSignatureSendClient'

export type LiquorTenantCompanyContext = {
  profile: LiquorTenantCompanyProfile
  companyName: string
  representativeName: string
  businessRegistrationNumber: string
  businessAddress: string
  signatureSenderName: string
  signatureSenderPhone: string
}

export function buildLiquorTenantCompanyContext(profile: LiquorTenantCompanyProfile): LiquorTenantCompanyContext {
  return {
    profile,
    companyName: profile.businessName.trim(),
    representativeName: profile.representativeName.trim(),
    businessRegistrationNumber: profile.businessRegistrationNumber.trim(),
    businessAddress: profile.businessAddress.trim(),
    signatureSenderName: profile.signatureSenderName.trim(),
    signatureSenderPhone: profile.signatureSenderPhone.trim(),
  }
}

function normKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}

type DefaultKind =
  | 'signatureSenderName'
  | 'signatureSenderPhone'
  | 'companyName'
  | 'representativeName'
  | 'businessRegistrationNumber'
  | 'businessAddress'

const FIELD_KEY_HINTS: Record<DefaultKind, string[]> = {
  signatureSenderName: ['signaturesendername', 'sender_name', 'sendername', 'signer_name', 'signername', '발신자명', '발신자'],
  signatureSenderPhone: [
    'signaturesenderphone',
    'sender_phone',
    'senderphone',
    'signer_phone',
    'signerphone',
    'representative_phone',
    '발신연락처',
    '발신처',
    '발신자연락처',
  ],
  companyName: ['company_name', 'companyname', 'business_name', 'businessname', '사업자명', '상호', '상호명'],
  representativeName: ['representative_name', 'representativename', 'rep_name', '대표자명', '대표자'],
  businessRegistrationNumber: [
    'business_registration_number',
    'businessregistrationnumber',
    'biz_no',
    'bizno',
    'registration_number',
    '사업자등록번호',
    '사업자번호',
  ],
  businessAddress: ['business_address', 'businessaddress', 'company_address', 'companyaddress', '사업장주소'],
}

const LABEL_HINTS: Record<DefaultKind, string[]> = {
  signatureSenderName: ['발신자명', '발신자', '발송자명', '발송자'],
  signatureSenderPhone: ['발신연락처', '발신처', '발신자연락처', '발송연락처', '발송자연락처'],
  companyName: ['사업자명', '상호', '상호명', '회사명'],
  representativeName: ['대표자명', '대표자'],
  businessRegistrationNumber: ['사업자등록번호', '사업자번호'],
  businessAddress: ['사업장주소', '주소'],
}

function classifySenderField(fieldKey: string, label: string): DefaultKind | null {
  const key = normKey(fieldKey)
  const lab = normKey(label)
  const kinds = Object.keys(FIELD_KEY_HINTS) as DefaultKind[]
  for (const kind of kinds) {
    if (includesAny(key, FIELD_KEY_HINTS[kind]) || includesAny(lab, LABEL_HINTS[kind])) {
      return kind
    }
  }
  return null
}

function valueForKind(ctx: LiquorTenantCompanyContext, kind: DefaultKind): string {
  switch (kind) {
    case 'signatureSenderName':
      return ctx.signatureSenderName
    case 'signatureSenderPhone':
      return ctx.signatureSenderPhone
    case 'companyName':
      return ctx.companyName
    case 'representativeName':
      return ctx.representativeName
    case 'businessRegistrationNumber':
      return ctx.businessRegistrationNumber
    case 'businessAddress':
      return ctx.businessAddress
    default:
      return ''
  }
}

/** fieldKey/label 패턴에 맞는 tenant 기본값. 없으면 빈 문자열. */
export function resolveLiquorTenantDefaultForField(
  fieldKey: string,
  label: string,
  ctx: LiquorTenantCompanyContext | null | undefined,
): string {
  if (!ctx) return ''
  const kind = classifySenderField(fieldKey, label)
  if (!kind) return ''
  return valueForKind(ctx, kind)
}

export function buildLiquorSenderFieldDefaults(
  fields: LiquorSignatureSenderFieldDef[],
  ctx: LiquorTenantCompanyContext | null | undefined,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (const f of fields) {
    if (f.fieldType === 'checkbox') {
      out[f.fieldKey] = false
      continue
    }
    out[f.fieldKey] = resolveLiquorTenantDefaultForField(f.fieldKey, f.label, ctx)
  }
  return out
}

export function buildLiquorConfirmationSenderDefaults(
  fields: UserContractConfirmationFieldRow[],
  ctx: LiquorTenantCompanyContext | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    if (f.inputRole !== 'sender') continue
    out[f.fieldKey] = resolveLiquorTenantDefaultForField(f.fieldKey, f.label, ctx)
  }
  return out
}

/** 문서/템플릿 fixed 필드 등에서 재사용할 수 있는 회사 정보 맵 */
export function liquorTenantCompanyReferenceMap(
  ctx: LiquorTenantCompanyContext | null | undefined,
): Record<string, string> {
  if (!ctx) return {}
  return {
    companyName: ctx.companyName,
    businessName: ctx.companyName,
    representativeName: ctx.representativeName,
    businessRegistrationNumber: ctx.businessRegistrationNumber,
    businessAddress: ctx.businessAddress,
    signatureSenderName: ctx.signatureSenderName,
    signatureSenderPhone: ctx.signatureSenderPhone,
  }
}
