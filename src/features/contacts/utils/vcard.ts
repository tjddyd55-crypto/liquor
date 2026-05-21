import type { InsuranceContact } from '../domain/types'
import { normalizePhoneNumber } from './phone'

/**
 * 모바일 등에서 연락처 앱/import 화면을 열기 위한 방식 (파일 다운로드 링크 대신 navigation).
 */
export function openVCardInContactsApp(vcardRaw: string): void {
  const body = vcardRaw.endsWith('\n') ? vcardRaw : `${vcardRaw}\r\n`
  const blob = new Blob([body], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.location.assign(url)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function createVCardContent(contact: InsuranceContact): string {
  const tel = normalizePhoneNumber(contact.phoneNumber)
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.managerName}`,
    `ORG:${contact.companyName}`,
    contact.position ? `TITLE:${contact.position}` : '',
    tel ? `TEL:${tel}` : '',
    'END:VCARD',
  ].filter(Boolean)

  return `${lines.join('\r\n')}\r\n`
}
