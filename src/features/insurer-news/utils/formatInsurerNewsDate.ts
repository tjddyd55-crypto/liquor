const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

const timeFmt = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** 상세·리스트 공통: 날짜+요일 + 시간 */
export function formatInsurerNewsDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`
}

/** 리스트 카드용 짧은 표현 */
export function formatInsurerNewsRelativeHint(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  return formatInsurerNewsDateTime(iso)
}
