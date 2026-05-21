export function formatKoreanDateTime(isoText: string): string {
  if (!isoText) {
    return '-'
  }

  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
