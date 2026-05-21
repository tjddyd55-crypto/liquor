import type { CustomerRecord } from '../domain/types'
import { normalizeCustomerNotesBag } from '../domain/types'
import { calculateInsuranceInfo, formatDateYmdInput, formatInsuranceUiDate } from './insuranceInfo'
import {
  CUSTOMER_MEDICAL_QUESTION_HINT,
  CUSTOMER_MEDICAL_QUESTION_TEXT,
} from './customerDisplayFormat'

/** 고객 관리 · 카톡 붙여넣기용 (필요 필드만) */
export function buildKakaoCustomerCopyText(data: CustomerRecord | Partial<CustomerRecord>) {
  const c = data as Partial<CustomerRecord>
  const name = String(c.name ?? '')
  const ssn = String(c.ssn ?? '')
  const phone = String(c.phone ?? '')
  const address = String(c.address ?? '')
  const height = String(c.height ?? '').trim()
  const weight = String(c.weight ?? '').trim()
  const job = String(c.job ?? '')
  const medical = String(c.medical ?? '').trim()
  const isDriver = c.isDriver
  const carType = String(c.carType ?? '').trim()
  const drivingLine =
    isDriver === true ? '운전함' : isDriver === false ? '운전 안함' : String(c.driving ?? '').trim() || '—'

  const heightWeight =
    height || weight ? `${height || '—'}/${weight || '—'}` : '—'

  const lines = [
    `이름: ${name}`,
    `주민번호: ${ssn}`,
    `핸드폰번호: ${phone}`,
    `주소: ${address || '—'}`,
    `키/몸무게: ${heightWeight}`,
    `직업/회사명/하는일/지역: ${job || '—'}`,
    `운전여부: ${drivingLine}`,
    `차종: ${carType || '—'}`,
    `${CUSTOMER_MEDICAL_QUESTION_TEXT}`,
    `${CUSTOMER_MEDICAL_QUESTION_HINT}`,
    `${medical || '—'}`,
  ]
  return lines.join('\n').trim()
}

function resolveInsuranceForCopy(data: Partial<CustomerRecord>) {
  const storedAge = data.insuranceAge
  const storedNext = data.nextAgeDate
  if (storedAge != null && storedNext) {
    return {
      age: storedAge,
      dateLabel: formatDateYmdInput(storedNext),
      ok: true,
    }
  }
  const fromRrn = calculateInsuranceInfo(String(data.ssn ?? ''))
  if (fromRrn.age != null && fromRrn.nextAgeDate) {
    return {
      age: fromRrn.age,
      dateLabel: formatInsuranceUiDate(fromRrn.nextAgeDate),
      ok: true,
    }
  }
  return { age: null as number | null, dateLabel: '', ok: false }
}

function genderLabel(g: CustomerRecord['gender']): string {
  if (g === 'male') {
    return '남'
  }
  if (g === 'female') {
    return '여'
  }
  return '확인 필요'
}

export function generateCustomerText(data: Partial<CustomerRecord> | Record<string, unknown>) {
  const name = String(data.name ?? '')
  const gender = (data as Partial<CustomerRecord>).gender
  const bag = normalizeCustomerNotesBag((data as Partial<CustomerRecord>).notes)
  const notes = bag.items

  const isDriver = (data as Partial<CustomerRecord>).isDriver
  const carType = String((data as Partial<CustomerRecord>).carType ?? '').trim()

  const ins = resolveInsuranceForCopy(data as Partial<CustomerRecord>)
  const insuranceLine = ins.ok
    ? `보험나이: ${ins.age}세 · 상령일: ${ins.dateLabel}`
    : '보험나이: 확인 필요 · 상령일: 확인 필요'

  const driverLine =
    isDriver === true
      ? `운전함${carType ? ` (${carType})` : ''}`
      : isDriver === false
        ? '운전 안함'
        : '확인 필요'

  const memoBlock = notes.length > 0 ? notes.map((n) => `- ${n.content}`).join('\n') : ''

  const text = `
이름: ${name}
성별: ${genderLabel(gender ?? null)}
${insuranceLine}
운전여부: ${driverLine}

[메모]
${memoBlock}
`
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}
