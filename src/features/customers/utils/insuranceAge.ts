/**
 * 보험나이·상령일(올해 생일 + 6개월) 계산 — 만 나이 후 6개월 경과 시 보험나이 +1
 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 로컬 기준 YYYY-MM-DD */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function calculateInsuranceAgeFromBirthDate(
  birthDate: Date,
  today: Date = new Date(),
): { insuranceAge: number; maturityDate: Date } {
  const birth = startOfDay(birthDate)
  const todayNorm = startOfDay(today)

  let age = todayNorm.getFullYear() - birth.getFullYear()
  const thisYearBirthday = new Date(todayNorm.getFullYear(), birth.getMonth(), birth.getDate())

  if (todayNorm < thisYearBirthday) {
    age -= 1
  }

  const maturityDate = new Date(thisYearBirthday.getFullYear(), thisYearBirthday.getMonth() + 6, thisYearBirthday.getDate())

  const insuranceAge = todayNorm >= startOfDay(maturityDate) ? age + 1 : age

  return { insuranceAge, maturityDate }
}

/** 주민번호 앞 7자리로 생년월일 파싱 (1,2 → 19xx / 3,4 → 20xx) */
export function parseBirthDateFromRrn(rrn: string): Date | null {
  const clean = String(rrn ?? '').replace(/[^0-9]/g, '')

  if (clean.length < 7) {
    return null
  }

  const birth = clean.substring(0, 6)
  const genderCode = clean[6]

  let yearPrefix: string | null = null
  if (genderCode === '1' || genderCode === '2') {
    yearPrefix = '19'
  }
  if (genderCode === '3' || genderCode === '4') {
    yearPrefix = '20'
  }

  if (!yearPrefix) {
    return null
  }

  const year = Number(yearPrefix + birth.substring(0, 2))
  const month = Number(birth.substring(2, 4))
  const day = Number(birth.substring(4, 6))

  const birthDate = new Date(year, month - 1, day)
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return null
  }

  return birthDate
}

export function calculateInsuranceAgeFromRrn(
  rrn: string,
  today: Date = new Date(),
): { insuranceAge: number; maturityDate: Date; birthDate: Date } | null {
  const birthDate = parseBirthDateFromRrn(rrn)
  if (!birthDate) {
    return null
  }
  const { insuranceAge, maturityDate } = calculateInsuranceAgeFromBirthDate(birthDate, today)
  return { insuranceAge, maturityDate, birthDate }
}
