/**
 * 제휴사 엑셀(셀 배경색 fgColor) → 보험 구분·회사·담당자 구조 파싱.
 * SheetJS: readFile(path, { cellStyles: true }) 필수.
 */

/** @typedef {'LIFE'|'NON_LIFE'|'GENERAL'} InsuranceCategory */

/**
 * @param {import('xlsx').CellObject | undefined} cell
 * @returns {string | null} 대문자 6자리 RGB (ARGB면 끝 6자)
 */
export function getCellFgRgb(cell) {
  if (!cell?.s?.fgColor?.rgb) {
    return null
  }
  let s = String(cell.s.fgColor.rgb).toUpperCase().replace(/[^0-9A-F]/g, '')
  if (s.length === 8) {
    s = s.slice(2)
  }
  if (s.length === 6) {
    return s
  }
  return null
}

/**
 * @param {string | null} rgb getCellFgRgb 결과
 * @returns {'LIFE'|'NON_LIFE'|'GENERAL'|'UNKNOWN'}
 */
export function mapCategoryByColor(rgb) {
  if (!rgb) {
    return 'UNKNOWN'
  }
  const u = rgb.toUpperCase()
  // 노란 계열(순수 FFFF00 ~ 엑셀 기본 연노랑 FFFFCC 등)
  if (u === 'FFFF00' || u.includes('FFFF00') || u === 'FFFFCC' || u === 'FFF2CC' || u === 'FFEB9C') {
    return 'LIFE'
  }
  // 파란 계열 · 실무 엑셀 연하늘 CCFFFF
  if (u === '0000FF' || u.includes('0000FF') || u === 'CCFFFF' || u === '00B0F0') {
    return 'NON_LIFE'
  }
  // 초록 계열
  if (u === '00FF00' || u.includes('00FF00') || u === 'CCFFCC' || u === '92D050' || u === 'C6EFCE') {
    return 'GENERAL'
  }
  return 'UNKNOWN'
}

/** 엑셀/ARS(>3 등) 포함값 → 숫자만, 최대 11자리 */
export function cleanPhone(raw) {
  const head = String(raw ?? '').split(/[>＞]/)[0]
  const d = head.replace(/\D/g, '')
  if (d.length > 11) {
    return d.slice(0, 11)
  }
  return d
}

const TITLE_HINTS = new Set([
  '지점장',
  '부지점장',
  '총무',
  '설계매니저',
  '설계매니져',
  '교육매니저',
  '교육팀장',
  '매니저',
  '실장',
  '단장',
  '코치',
  '팀장',
  '영업실장',
  '지원실장',
  '설계실장',
  '업무지원문의',
  '업무담당',
  '영업코치',
])

/**
 * "이덕용 지점장" → name / position
 * "지점장 홍길동" (직책 앞, 단어 2개) → 같은 규칙
 * @param {string} raw
 */
export function parseManagerCell(raw) {
  const t = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) {
    return { name: '', position: '' }
  }
  const parts = t.split(' ')
  if (parts.length === 1) {
    return { name: parts[0], position: '' }
  }
  const first = parts[0]
  if (parts.length === 2) {
    if (
      TITLE_HINTS.has(first) ||
      first.endsWith('장') ||
      first.endsWith('무') ||
      first.endsWith('팀장') ||
      first === '문의'
    ) {
      return { name: parts[1], position: first }
    }
  }
  const last = parts[parts.length - 1]
  if (
    TITLE_HINTS.has(last) ||
    last.endsWith('장') ||
    last.endsWith('무') ||
    last.endsWith('팀장') ||
    last === '문의'
  ) {
    return { name: parts.slice(0, -1).join(' '), position: last }
  }
  return { name: t, position: '' }
}

function isPhoneOnlyText(val) {
  const t = String(val ?? '').trim()
  if (!t || t.length < 2) {
    return false
  }
  const digitCount = (t.match(/\d/g) || []).length
  if (digitCount < 5) {
    return false
  }
  const nonPhoneChars = t.replace(/[\d\-—–\s(),.>번내까지]+/g, '')
  return nonPhoneChars.length <= 2
}

function isHeaderishCompanyName(val) {
  const t = String(val ?? '').trim()
  if (!t) {
    return true
  }
  if (/^보험사|^담당|^연\s*락|^인콜|^전산|^방문일|^일반화재\s*설계/.test(t)) {
    return true
  }
  return false
}

/** E열 "ㅡ7911~22" + 이전 행 "02-6470" → 0264707911 */
function tryMergeIncallTildeFragment(co, eVal) {
  if (!co || !eVal || !String(eVal).includes('~')) {
    return false
  }
  const prefix = String(co.incall_number ?? '').trim()
  const bp = cleanPhone(prefix)
  if (!bp.startsWith('02') || bp.length < 5 || bp.length > 8) {
    return false
  }
  const head = String(eVal).split(/[~＞]/)[0]
  const ext = head.replace(/\D/g, '')
  if (ext.length < 3) {
    return false
  }
  co.incall_number = (bp + ext).slice(0, 11)
  if (co.customer_center === ext || co.customer_center === cleanPhone(eVal)) {
    co.customer_center = ''
  }
  return true
}

function normalizeGeneralCompanyName(val) {
  return String(val ?? '')
    .replace(/\s+/g, ' ')
    .replace(/일\s*반/g, '일반')
    .trim()
}

function isGeneralSectionHeader(val) {
  const t = String(val ?? '').trim()
  return /^일반화재\s*설계의뢰/i.test(t)
}

/**
 * B–E(생명), F–I(손해/일반) 4열 블록 파싱
 * @param {import('xlsx').WorkSheet} sheet
 * @param {object} opts
 * @param {InsuranceCategory} opts.category
 * @param {(rgb: string | null) => boolean} opts.isCompanyFill
 * @param {number} opts.startRow 0-based incl.
 * @param {number} opts.endRow 0-based incl.
 * @param {number} opts.colBase company column (B=1, F=5)
 */
function parseFourColumnBlock(sheet, XLSX, opts) {
  const { category, isCompanyFill, startRow, endRow, colBase } = opts
  const out = []
  let cur = null

  function buildCompany(name) {
    return {
      category,
      name: name.trim(),
      customer_center: '',
      system_phone: '',
      incall_number: '',
      visit_info: '',
      contacts: [],
    }
  }

  function pushPhoneLine(co, raw) {
    const d = cleanPhone(raw)
    if (d) {
      if (!co.customer_center) {
        co.customer_center = d
      } else if (!co.system_phone) {
        co.system_phone = d
      } else if (!co.incall_number) {
        co.incall_number = d
      }
      return
    }
    const t = String(raw ?? '').trim()
    if (t) {
      co.visit_info = co.visit_info ? `${co.visit_info}, ${t}` : t
    }
  }

  for (let r = startRow; r <= endRow; r++) {
    const cComp = XLSX.utils.encode_cell({ r, c: colBase })
    const cName = XLSX.utils.encode_cell({ r, c: colBase + 1 })
    const cPhone = XLSX.utils.encode_cell({ r, c: colBase + 2 })
    const cExtra = XLSX.utils.encode_cell({ r, c: colBase + 3 })

    const cellB = sheet[cComp]
    const cellC = sheet[cName]
    const cellD = sheet[cPhone]
    const cellE = sheet[cExtra]

    const bVal = cellB?.v != null ? String(cellB.v).trim() : ''
    const bRgb = getCellFgRgb(cellB)

    const cVal = cellC?.v != null ? String(cellC.v).trim() : ''
    const dVal = cellD?.v != null ? String(cellD.v).trim() : ''
    const eVal = cellE?.v != null ? String(cellE.v).trim() : ''

    const companyFillOk = bVal && isCompanyFill(bRgb) && !isHeaderishCompanyName(bVal) && !isPhoneOnlyText(bVal)

    if (companyFillOk) {
      if (cur) {
        out.push(cur)
      }
      cur = buildCompany(bVal)
      if (cVal || dVal) {
        const { name, position } = parseManagerCell(cVal)
        const ph = cleanPhone(dVal)
        if (name || ph) {
          cur.contacts.push({ name: name || '담당자', position, phone: ph })
        }
      }
      if (eVal) {
        if (!tryMergeIncallTildeFragment(cur, eVal)) {
          const ed = cleanPhone(eVal)
          if (ed) {
            if (!cur.incall_number) {
              cur.incall_number = ed
            } else {
              pushPhoneLine(cur, eVal)
            }
          } else {
            cur.visit_info = cur.visit_info ? `${cur.visit_info}, ${eVal}` : eVal
          }
        }
      }
      continue
    }

    if (!cur) {
      continue
    }

    if (bVal && isPhoneOnlyText(bVal) && !cVal) {
      pushPhoneLine(cur, bVal)
    }

    if (cVal || dVal) {
      const { name, position } = parseManagerCell(cVal)
      const ph = cleanPhone(dVal)
      if (name || ph) {
        cur.contacts.push({ name: name || '담당자', position, phone: ph })
      }
    }

    if (eVal) {
      if (!tryMergeIncallTildeFragment(cur, eVal)) {
        const ed = cleanPhone(eVal)
        if (ed) {
          if (!cur.incall_number) {
            cur.incall_number = ed
          } else {
            pushPhoneLine(cur, eVal)
          }
        } else {
          cur.visit_info = cur.visit_info ? `${cur.visit_info}, ${eVal}` : eVal
        }
      }
    }
  }

  if (cur) {
    out.push(cur)
  }

  return out
}

/**
 * F열 CCFFCC 일반보험 블록 (보험사명 + 안내 문구 위주)
 */
function parseGeneralFourColumnBlock(sheet, XLSX, startRow, endRow) {
  const category = 'GENERAL'
  /** @type {ReturnType<parseFourColumnBlock> extends infer U ? U : never} */
  const companies = []
  let cur = null

  for (let r = startRow; r <= endRow; r++) {
    const cComp = XLSX.utils.encode_cell({ r, c: 5 })
    const cellF = sheet[cComp]
    const fVal = cellF?.v != null ? String(cellF.v).trim() : ''
    const fRgb = getCellFgRgb(cellF)

    if (fRgb === 'CCFFCC' && fVal && !isGeneralSectionHeader(fVal)) {
      if (cur) {
        companies.push(cur)
      }
      cur = {
        category,
        name: normalizeGeneralCompanyName(fVal),
        customer_center: '',
        system_phone: '',
        incall_number: '',
        visit_info: '',
        contacts: [],
      }
      continue
    }

    if (!cur || !fVal) {
      continue
    }

    const gAddr = XLSX.utils.encode_cell({ r, c: 6 })
    const hAddr = XLSX.utils.encode_cell({ r, c: 7 })
    const gVal = sheet[gAddr]?.v != null ? String(sheet[gAddr].v).trim() : ''
    const hVal = sheet[hAddr]?.v != null ? String(sheet[hAddr].v).trim() : ''

    const merged = [fVal, gVal, hVal].filter(Boolean).join(' ')
    const ph = cleanPhone(merged)
    if (ph.length >= 8 && /연락처|FAX|MAIL|대표코드|010|02/i.test(merged)) {
      cur.visit_info = cur.visit_info ? `${cur.visit_info}; ${merged.slice(0, 200)}` : merged.slice(0, 400)
    } else if (merged.length > 3) {
      cur.visit_info = cur.visit_info ? `${cur.visit_info}; ${merged.slice(0, 160)}` : merged.slice(0, 400)
    }
  }
  if (cur) {
    companies.push(cur)
  }
  return companies
}

/**
 * @param {import('xlsx').WorkSheet} sheet
 * @param {typeof import('xlsx')} XLSX
 */
export function parsePartnerWorkbookSheet(sheet, XLSX) {
  const ref = sheet['!ref']
  if (!ref) {
    return { companies: [] }
  }
  const range = XLSX.utils.decode_range(ref)
  const maxRow = range.e.r

  const lifeEnd = maxRow
  const nonLifeEnd = Math.min(39, maxRow)

  const life = parseFourColumnBlock(sheet, XLSX, {
    category: 'LIFE',
    isCompanyFill: (rgb) => rgb === 'FFFFCC',
    startRow: 4,
    endRow: lifeEnd,
    colBase: 1,
  })

  const nonLife = parseFourColumnBlock(sheet, XLSX, {
    category: 'NON_LIFE',
    isCompanyFill: (rgb) => rgb === 'CCFFFF',
    startRow: 4,
    endRow: nonLifeEnd,
    colBase: 5,
  })

  const generalStart = Math.min(40, maxRow)
  const general =
    generalStart <= maxRow
      ? parseGeneralFourColumnBlock(sheet, XLSX, generalStart, maxRow)
      : []

  return { companies: [...life, ...nonLife, ...general] }
}

function uniqueByName(list) {
  const m = new Map()
  for (const item of list) {
    const k = item.name
    if (!m.has(k)) {
      m.set(k, item)
    }
  }
  return [...m.values()]
}

function pickMapTelFromCompany(co) {
  const parts = [co.incall_number, co.customer_center, co.system_phone]
    .map((x) => cleanPhone(String(x ?? '')))
    .filter((d) => d.length >= 8)
  if (parts.length > 0) {
    return parts[0]
  }
  const soft = [co.customer_center, co.system_phone, co.incall_number]
    .map((x) => cleanPhone(String(x ?? '')))
    .filter((d) => d.length >= 9 || /^1[5-9]\d{6,}/.test(d))
  return soft[0] || ''
}

/**
 * @param {{ category: InsuranceCategory, name: string, customer_center?: string, system_phone?: string, incall_number?: string }[]} companies
 */
export function buildInsuranceCompanyMap(companies) {
  /** @type {Record<InsuranceCategory, { name: string, tel: string }[]>} */
  const map = {
    LIFE: [],
    NON_LIFE: [],
    GENERAL: [],
  }
  for (const row of companies) {
    if (!row.name || !row.category || row.category === 'UNKNOWN') {
      continue
    }
    map[row.category].push({
      name: row.name,
      tel: pickMapTelFromCompany(row),
    })
  }
  map.LIFE = uniqueByName(map.LIFE).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  map.NON_LIFE = uniqueByName(map.NON_LIFE).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  map.GENERAL = uniqueByName(map.GENERAL).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return map
}
