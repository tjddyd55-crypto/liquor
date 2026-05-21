import { normalizePhoneNumber } from '../../contacts/utils/phone'
import { openVCardInContactsApp } from '../../contacts/utils/vcard'

/** 모바일/데스크톱 tel: 링크용 (숫자·+ 만 유지) */
export function toTelHref(phone: string): string {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : '#'
}

function buildCompanyManagerVCard(params: {
  name: string
  phone: string
  companyName: string
  position?: string
}): string {
  const name = String(params.name ?? '').trim() || '담당자'
  const org = String(params.companyName ?? '').trim()
  const title = params.position ? String(params.position).trim() : ''
  const telDigits = normalizePhoneNumber(String(params.phone ?? ''))

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    org ? `ORG:${org}` : '',
    title ? `TITLE:${title}` : '',
    telDigits ? `TEL:${telDigits}` : '',
    'END:VCARD',
  ].filter(Boolean)

  return `${lines.join('\r\n')}\r\n`
}

/** vCard를 다운로드하지 않고 기기 연락처 흐름으로 연결 */
export function openCompanyContactVcard(params: {
  name: string
  phone: string
  companyName: string
  position?: string
}): void {
  openVCardInContactsApp(buildCompanyManagerVCard(params))
}
