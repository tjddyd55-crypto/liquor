/**
 * 엑셀/CSV 상환 import 파싱.
 */
import * as XLSX from 'xlsx'
import { mapParsedRowToImportRow } from '../repaymentImportMapper.js'

export const REPAYMENT_IMPORT_MAX_BYTES = 10 * 1024 * 1024

const HEADER_ALIASES = {
  transactionDate: ['거래일자', '거래일', 'date', 'transaction_date'],
  transactionTime: ['거래시간', 'time', 'transaction_time'],
  depositAmount: ['입금액', '입금', 'deposit', 'deposit_amount'],
  withdrawalAmount: ['출금액', '출금', 'withdrawal', 'withdrawal_amount'],
  depositorName: ['입금자명', '입금자', 'depositor', 'depositor_name'],
  description: ['거래내용', '적요', 'memo', 'description', '내용'],
  bankName: ['은행명', '은행', 'bank', 'bank_name'],
  accountNumber: ['계좌번호', '계좌', 'account', 'account_number'],
  balanceAfter: ['거래 후 잔액', '잔액', 'balance', 'balance_after'],
  memo: ['메모', 'note'],
}

/**
 * @param {string} header
 */
function normalizeHeaderKey(header) {
  return String(header ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

/**
 * @param {Record<string, unknown>} rowObj
 */
function mapHeaderRow(rowObj) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [rawKey, field] of Object.entries(rowObj)) {
    const nk = normalizeHeaderKey(rawKey)
    for (const [target, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => normalizeHeaderKey(a) === nk)) {
        out[target] = rawKey
        break
      }
    }
  }
  return out
}

/**
 * @param {unknown} v
 */
function cellToString(v) {
  if (v == null) return ''
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).trim()
}

/**
 * @param {unknown} v
 */
function parseAmount(v) {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {number | string} gaId
 */
export function parseRepaymentExcelBuffer(buffer, fileName, gaId) {
  const lower = String(fileName ?? '').toLowerCase()
  const bookType = lower.endsWith('.csv') ? 'csv' : 'xlsx'
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], errors: ['시트가 없습니다.'] }
  }
  const sheet = wb.Sheets[sheetName]
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!jsonRows.length) {
    return { rows: [], errors: ['데이터 행이 없습니다.'] }
  }

  const headerMap = mapHeaderRow(jsonRows[0])
  /** @type {import('../repaymentImportMapper.js').RepaymentImportMappedRow[]} */
  const rows = []
  const errors = []

  for (let i = 0; i < jsonRows.length; i++) {
    const src = jsonRows[i]
    const deposit = parseAmount(headerMap.depositAmount ? src[headerMap.depositAmount] : 0)
    const withdrawal = parseAmount(headerMap.withdrawalAmount ? src[headerMap.withdrawalAmount] : 0)
    let direction = 'deposit'
    let amount = deposit
    if (withdrawal > 0 && deposit <= 0) {
      direction = 'withdrawal'
      amount = withdrawal
    } else if (deposit <= 0 && withdrawal <= 0) {
      continue
    }

    const depositorName = cellToString(headerMap.depositorName ? src[headerMap.depositorName] : '')
    const description = cellToString(headerMap.description ? src[headerMap.description] : '')
    const transactionDate = cellToString(headerMap.transactionDate ? src[headerMap.transactionDate] : '')

    const mapped = mapParsedRowToImportRow(
      {
        rawRowJson: src,
        transactionDate: transactionDate || null,
        transactionTime: cellToString(headerMap.transactionTime ? src[headerMap.transactionTime] : '') || null,
        amount,
        direction,
        depositorName,
        description,
        bankName: cellToString(headerMap.bankName ? src[headerMap.bankName] : ''),
        accountNumber: cellToString(headerMap.accountNumber ? src[headerMap.accountNumber] : ''),
        balanceAfter: headerMap.balanceAfter ? parseAmount(src[headerMap.balanceAfter]) : null,
      },
      gaId,
    )

    if (!mapped) {
      if (direction === 'deposit') {
        errors.push(`${i + 2}행: 필수값(거래일자·입금액·입금자명/적요) 누락`)
      }
      continue
    }
    rows.push(mapped)
  }

  return { rows, errors, bookType }
}
