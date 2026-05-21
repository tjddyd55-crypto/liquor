import type { TodoSourceType } from '../domain/todoTypes'

export function todoSourceLabel(st: TodoSourceType): string {
  switch (st) {
    case 'manual':
      return '직접 작성'
    case 'customer_memo':
      return '고객 메모'
    case 'consultation_note':
      return '상담 내역'
    case 'pdf_document':
      return 'PDF 문서'
    case 'e_document':
      return '전자문서'
    case 'system':
      return '시스템'
    default:
      return st
  }
}

export function todoPriorityLabel(pr: string): string {
  if (pr === 'low') return '낮음'
  if (pr === 'high') return '높음'
  return '보통'
}

export function todoStatusLabel(st: string): string {
  if (st === 'completed') return '완료'
  if (st === 'canceled') return '취소'
  return '미완료'
}

/** 본문에서 기본 할 일 제목(첫 줄) */
export function firstLineTodoTitle(text: string, maxLen = 120): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const trimmed = line.trim().slice(0, maxLen)
  return trimmed || '할 일'
}
