import type { PdfFieldSpec, PdfPlacement } from './types'

/**
 * 라디오: 동일 optionValue placement 가 여러 개면 **마지막 것만** 유지.
 * 로드만으로 데이터를 지우지 않고, 사용자가 저장할 때 또는 편집기에서 명시 확인할 때 정리한다.
 */
export function dedupeRadioPlacementsInFields(fields: PdfFieldSpec[]): PdfFieldSpec[] {
  return fields.map((f) => {
    if (f.fieldType !== 'radio') return f
    const opts = f.options ?? []
    const optsSet = new Set(opts)

    /** optionValue별 마지막 placement(배열 순서상 뒤쪽이 우선) */
    const lastByOpt = new Map<string, PdfPlacement>()
    for (const p of f.placements) {
      const ov = p.optionValue != null ? String(p.optionValue).trim() : ''
      if (!ov || !optsSet.has(ov)) continue
      lastByOpt.set(ov, p)
    }

    /** 옵션 목록 순서대로 재배치 — 유효 옵션 키만 남김(제거된 옵션 배치는 제외) */
    const ordered: PdfPlacement[] = []
    for (const opt of opts) {
      const kept = lastByOpt.get(opt)
      if (kept != null) {
        ordered.push({ ...kept, optionValue: opt })
      }
    }

    return { ...f, placements: ordered }
  })
}

/**
 * 관리자 PDF 템플릿 "필드/좌표 저장" 직전 검증.
 * 서버 `normalizeFieldSpec` 와 맞추되, 라디오 옵션 중복·빈 라벨 등 UX 상 먼저 막을 항목을 둔다.
 */
export function validatePdfTemplateFieldsForSave(fields: PdfFieldSpec[]): string | null {
  for (const f of fields) {
    if (f.fieldType !== 'radio') continue
    const opts = f.options ?? []
    if (opts.length === 0) {
      return `라디오 필드 "${f.label}" 은 옵션을 최소 1개 이상 추가해야 저장할 수 있습니다.`
    }
    const seen = new Set<string>()
    for (const raw of opts) {
      const t = String(raw ?? '').trim()
      if (!t) {
        return `라디오 필드 "${f.label}" 에 빈 옵션 라벨이 있습니다. 옵션 이름을 입력하거나 삭제해 주세요.`
      }
      if (seen.has(t)) {
        return `라디오 필드 "${f.label}" 에 중복된 옵션 "${t}" 이(가) 있습니다.`
      }
      seen.add(t)
    }
  }
  return null
}
