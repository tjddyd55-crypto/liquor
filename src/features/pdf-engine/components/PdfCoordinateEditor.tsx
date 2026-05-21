/**
 * 관리자 좌표 에디터.
 *
 * UX 원칙: "라벨 우선 + 박스 우선".
 *   1) 왼쪽 패널에서 라벨·타입·필수만 입력해 필드를 정의한다.
 *      (내부 식별자 `fieldKey` 는 라벨에서 자동 파생 — 관리자가 다룰 필요 없음.)
 *   2) 필드를 선택한 상태로 오른쪽 PDF 위를 "드래그" 하면 좌표 초안이 만들어진다.
 *      — 드래그 거리가 너무 짧으면(실수 클릭) 무시된다.
 *   3) radio: PDF에서 드래그한 뒤 "선택 옵션 좌표 저장"으로만 배치가 확정된다(옵션당 1좌표 upsert).
 *      checkbox·기타: 기존처럼 즉시 반영하거나 목록에서 수정할 placement 를 고른 뒤 덮어쓴다.
 *   4) 등록된 placement 를 좌측에서 골라 width/height/fontSize/align 을 바로 편집한다.
 *
 * 저장 형식:
 *   - 좌표·크기는 PDF 포인트(원점 좌하단). 해상도 무관.
 *   - 호출측(페이지 컴포넌트) 이 이 필드 배열을 서버 API 로 PUT 한다.
 *
 * 이 컴포넌트 자체는 I/O 를 하지 않는다 — 입력(fields)과 출력(onChange)만으로 동작.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfFieldSpec, PdfFieldType, PdfPlacement } from '../types'
import { DEFAULT_PDF_FIELD_DATA_MAPPING, PDF_FIELD_TYPE_LABELS, PDF_FIELD_TYPES } from '../types'
import {
  PdfFieldDataMappingControls,
  formatPdfFieldMappingSummary,
} from './PdfFieldDataMappingControls'
import { genPdfFieldKeyFromLabel } from '../pdfFieldKey'
import { PdfOverlayCanvas, type OverlayMark, type OverlayPick, type PdfOverlayDebugMeta } from './PdfOverlayCanvas'
import FormInput from '../../../components/form/FormInput'

/** 1차 UX: 좌표 숫자 편집 숨김. 고급 설정으로 되살릴 때 `true` 로 전환해 `PlacementMetaEditor` 를 연결. */
const SHOW_PLACEMENT_NUMERIC_EDITOR = false

interface Props {
  pdfBuffer: ArrayBuffer | null
  pageCount: number
  fields: PdfFieldSpec[]
  onChange: (next: PdfFieldSpec[]) => void
  onSaveFields: () => void
  savingFields: boolean
  fieldsDirty: boolean
  /** 좌표 화면 개발 로그용(스토리지 경로는 넣지 않음) */
  templateId?: number
}

type DraftField = {
  label: string
  fieldType: PdfFieldType
  required: boolean
}

const EMPTY_DRAFT: DraftField = {
  label: '',
  fieldType: 'text',
  required: false,
}

const MARK_ID_IDX = '@@idx@@'
const MARK_ID_PENDING = '@@pending@@'

/** 오버레이·목록 표시용: 라디오는 option당 마지막 placement 만(레거시 다중 불러오기 호환). */
function effectiveRadioPlacementsOrdered(placements: PdfPlacement[], options: string[]): PdfPlacement[] {
  const optsSet = new Set(options)
  const lastBy = new Map<string, PdfPlacement>()
  for (const p of placements) {
    const ov = p.optionValue != null ? String(p.optionValue).trim() : ''
    if (!ov || !optsSet.has(ov)) continue
    lastBy.set(ov, p)
  }
  const out: PdfPlacement[] = []
  for (const opt of options) {
    const kept = lastBy.get(opt)
    if (kept != null) out.push(kept)
  }
  return out
}

function lastPlacementIndexForOption(field: PdfFieldSpec, optionValue: string): number {
  let last = -1
  for (let i = 0; i < field.placements.length; i += 1) {
    if (field.placements[i].optionValue === optionValue) last = i
  }
  return last
}

/**
 * 필드의 "기본 텍스트 박스 크기" 가 없어 placement.width 가 null 인 경우(기존 점 배치)
 * 편집 UI 의 숫자 입력에 표시할 값은 빈 문자열이 되어야 한다. 0 을 보여주면
 * 관리자가 "0 이 할당됐다"고 착각할 여지가 생긴다.
 */
function numericInputValue(v: number | null | undefined): string {
  if (v == null) return ''
  return String(v)
}

/** 숫자 입력 문자열을 placement 용 숫자(|null) 로 파싱한다. 비어 있으면 null. */
function parseOptionalPositive(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return 'invalid'
  return Math.round(n * 100) / 100
}

export function PdfCoordinateEditor({
  pdfBuffer,
  pageCount,
  fields,
  onChange,
  onSaveFields,
  savingFields,
  fieldsDirty,
  templateId,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  /**
   * 같은 필드 안의 여러 placement 중 "어느 것을 편집 중" 인지.
   * 필드가 바뀌면 자동으로 리셋된다. 여러 placement 가 있으면 마지막에 추가된 것을 기본 선택.
   */
  const [selectedPlacementIndex, setSelectedPlacementIndex] = useState<number | null>(null)
  /**
   * radio 필드에서 "지금 캔버스에 추가할 placement 가 대표할 옵션".
   * 새 placement 가 생길 때 이 값이 optionValue 로 박힌다.
   * 필드가 바뀌면 해당 필드의 첫 옵션으로 자동 동기화된다.
   */
  const [activeOptionValue, setActiveOptionValue] = useState<string | null>(null)
  /**
   * radio: PDF 위에서 드래그한 미확정 배치. "선택 옵션 좌표 저장" 시에만 placements 로 반영된다.
   */
  const [pendingRadioPlacement, setPendingRadioPlacement] = useState<PdfPlacement | null>(null)
  const [draft, setDraft] = useState<DraftField>(EMPTY_DRAFT)
  const [pageIndex, setPageIndex] = useState(0)
  const [numPages, setNumPages] = useState(pageCount > 0 ? pageCount : 1)

  useEffect(() => {
    if (pageCount > 0) setNumPages(pageCount)
  }, [pageCount])

  const overlayDebugMeta = useMemo((): PdfOverlayDebugMeta | undefined => {
    if (templateId == null) return undefined
    return {
      pdfTemplateId: templateId,
      serverPageCount: pageCount > 0 ? pageCount : undefined,
      fetchUrlPath: `/api/admin/pdf-templates/${templateId}/file`,
    }
  }, [templateId, pageCount])

  useEffect(() => {
    /* 서버 pageCount 와 pdfjs 실제 페이지 수가 어긋나면, 열람 중 페이지가 범위를 벗어나지 않게 한다. */
    setPageIndex((i) => Math.min(i, Math.max(0, numPages - 1)))
  }, [numPages])

  /**
   * 부모가 fieldKey 를 정규화(예: `2` → `field_2`)하면 선택 상태가 고아가 되므로 동기화한다.
   */
  useEffect(() => {
    setSelectedKey((cur) => {
      if (cur == null) return null
      return fields.some((f) => f.fieldKey === cur) ? cur : null
    })
  }, [fields])

  useEffect(() => {
    const f = fields.find((x) => x.fieldKey === selectedKey)
    if (f?.fieldType !== 'radio') {
      setPendingRadioPlacement(null)
    }
  }, [fields, selectedKey])

  useEffect(() => {
    setPendingRadioPlacement(null)
  }, [selectedKey, activeOptionValue])

  const existingKeys = useMemo(() => new Set(fields.map((f) => f.fieldKey)), [fields])

  /** 왼쪽 필드 목록의 placement 들을 overlay 마커로 변환.
      박스 placement 는 width/height 를 같이 넘겨 사각형 마커로 그려진다. */
  const marks: OverlayMark[] = useMemo(() => {
    const out: OverlayMark[] = []
    for (const f of fields) {
      const isActiveField = f.fieldKey === selectedKey

      if (f.fieldType === 'radio') {
        const opts = f.options ?? []
        let rowPlacements = effectiveRadioPlacementsOrdered(f.placements, opts)
        const pendingForRow =
          isActiveField &&
          pendingRadioPlacement != null &&
          activeOptionValue != null &&
          pendingRadioPlacement.optionValue === activeOptionValue
        if (pendingForRow) {
          rowPlacements = rowPlacements.filter((p) => p.optionValue !== activeOptionValue)
          rowPlacements = [...rowPlacements, pendingRadioPlacement]
        }
        for (let i = 0; i < rowPlacements.length; i += 1) {
          const p = rowPlacements[i]
          const isPendingOverlay =
            pendingForRow && i === rowPlacements.length - 1 && p === pendingRadioPlacement
          const storageIdx =
            !isPendingOverlay && p.optionValue ? lastPlacementIndexForOption(f, p.optionValue) : -1
          const markId = isPendingOverlay
            ? `${f.fieldKey}${MARK_ID_PENDING}`
            : `${f.fieldKey}${MARK_ID_IDX}${storageIdx}`
          const baseLabel = f.label || `필드 ${f.orderIndex + 1}`
          const pendingSuffix = isPendingOverlay ? ' · 미저장' : ''
          const composedLabel = p.optionValue
            ? `${baseLabel} · ${p.optionValue}${pendingSuffix}`
            : baseLabel
          const placementSelected =
            isActiveField &&
            (isPendingOverlay ||
              (selectedPlacementIndex != null &&
                storageIdx >= 0 &&
                selectedPlacementIndex === storageIdx))

          out.push({
            id: markId,
            pageIndex: p.page,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            label: composedLabel,
            selected: placementSelected,
            stampRadioOutline: true,
          })
        }
        continue
      }

      /* checkbox · text 등 */
      for (let i = 0; i < f.placements.length; i += 1) {
        const p = f.placements[i]
        const isActivePlacement = isActiveField && i === selectedPlacementIndex
        const baseLabel = f.label || `필드 ${f.orderIndex + 1}`
        const composedLabel = p.optionValue ? `${baseLabel} · ${p.optionValue}` : baseLabel
        out.push({
          id: `${f.fieldKey}${MARK_ID_IDX}${i}`,
          pageIndex: p.page,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          label: composedLabel,
          selected: isActiveField && (isActivePlacement || f.placements.length === 1),
        })
      }
    }
    return out
  }, [fields, selectedKey, selectedPlacementIndex, pendingRadioPlacement, activeOptionValue])

  const handleAddField = () => {
    const labelTrim = draft.label.trim()
    if (!labelTrim) return
    /* 내부 식별자는 라벨에서 자동 파생. 같은 템플릿 내 충돌은 genPdfFieldKeyFromLabel 이
       suffix 로 회피하므로 사용자는 식별자를 의식할 필요가 없다. */
    const key = genPdfFieldKeyFromLabel(labelTrim, existingKeys)
    /* 신규 radio 는 옵션 목록 비어 시작 — 사용자가 "옵션 추가" 후 좌표를 찍는다. */
    const options = draft.fieldType === 'radio' ? [] : null
    const next: PdfFieldSpec = {
      fieldKey: key,
      label: labelTrim,
      fieldType: draft.fieldType,
      required: draft.required,
      orderIndex: fields.length,
      /** PDF 저장 시 서버가 비서명 필드는 모두 customer 로 정규화 — 여기서는 위치만 정의 */
      inputRole: 'customer',
      dataMapping: { ...DEFAULT_PDF_FIELD_DATA_MAPPING },
      options,
      placements: [],
    }
    onChange([...fields, next])
    setSelectedKey(key)
    setSelectedPlacementIndex(null)
    setActiveOptionValue(null)
    setPendingRadioPlacement(null)
    setDraft(EMPTY_DRAFT)
  }

  const handleRemoveField = (key: string) => {
    if (!window.confirm('해당 필드를 삭제할까요? 모든 좌표도 함께 제거됩니다.')) return
    const next = fields.filter((f) => f.fieldKey !== key).map((f, i) => ({ ...f, orderIndex: i }))
    onChange(next)
    if (selectedKey === key) {
      setSelectedKey(null)
      setSelectedPlacementIndex(null)
      setPendingRadioPlacement(null)
    }
  }

  const handlePatchField = (key: string, patch: Partial<PdfFieldSpec>) => {
    onChange(
      fields.map((f) => {
        if (f.fieldKey !== key) return f
        const nextBase: PdfFieldSpec = { ...f, ...patch }

        /* 타입 전환 규칙만 분리 처리 — 라벨/필수 등 일반 패치는 그대로 다음으로 유지된다. */
        if (!patch.fieldType) return nextBase

        const prevType = f.fieldType
        const newType = patch.fieldType
        let next: PdfFieldSpec = nextBase

        if (newType !== 'radio' && newType !== 'checkbox') {
          next.options = null
          next.placements = next.placements.map((p) => ({ ...p, optionValue: null }))
        } else if (newType === 'radio' && prevType !== 'radio') {
          /* checkbox → radio: 옵션/placement 는 유지하되 optionValue 가 없는 항목은 제거 */
          if (prevType === 'checkbox' && Array.isArray(next.options) && next.options.length > 0) {
            const allow = new Set(next.options)
            next.placements = next.placements.filter(
              (p) => p.optionValue != null && allow.has(p.optionValue),
            )
          } else {
            next.options = []
            next.placements = []
          }
        } else if (newType === 'checkbox' && prevType !== 'checkbox') {
          if (!next.options?.length) next.options = ['옵션1', '옵션2']
          const allow = new Set(next.options)
          next.placements = next.placements.filter(
            (p) => p.optionValue != null && allow.has(p.optionValue),
          )
        }

        return next
      }),
    )
  }

  const addSelectableOption = useCallback(
    (key: string, trimmed: string): boolean => {
      const t = trimmed.trim()
      if (!t) return false
      const target = fields.find((f) => f.fieldKey === key)
      if (!target || (target.fieldType !== 'radio' && target.fieldType !== 'checkbox')) return false
      const opts = [...(target.options ?? [])]
      if (opts.some((o) => o.trim() === t)) {
        window.alert('같은 필드 안에 이미 같은 이름의 옵션이 있습니다.')
        return false
      }
      onChange(
        fields.map((f) => (f.fieldKey === key ? { ...f, options: [...opts, t] } : f)),
      )
      setActiveOptionValue(t)
      return true
    },
    [fields, onChange],
  )

  const renameSelectableOptionAt = useCallback(
    (key: string, index: number, raw: string) => {
      const f = fields.find((x) => x.fieldKey === key)
      if (!f || (f.fieldType !== 'radio' && f.fieldType !== 'checkbox')) {
        return
      }
      const opts = [...(f.options ?? [])]
      const anchor = opts[index]
      if (anchor === undefined) return

      const trimmed = raw.trim()
      const nextLabel = trimmed === '' ? anchor : trimmed

      if (trimmed !== '' && opts.some((o, j) => j !== index && String(o ?? '').trim() === nextLabel)) {
        window.alert('다른 옵션과 같은 이름은 사용할 수 없습니다.')
        return
      }

      opts[index] = raw

      const placements = f.placements.map((p) =>
        p.optionValue === anchor ? { ...p, optionValue: nextLabel } : p,
      )

      onChange(fields.map((ff) => (ff.fieldKey === key ? { ...ff, options: opts, placements } : ff)))

      if (activeOptionValue === anchor) {
        setActiveOptionValue(nextLabel)
      }
    },
    [fields, onChange, activeOptionValue],
  )

  const removeSelectableOptionAt = useCallback(
    (key: string, index: number) => {
      const f = fields.find((x) => x.fieldKey === key)
      if (!f || (f.fieldType !== 'radio' && f.fieldType !== 'checkbox')) return
      const opts = [...(f.options ?? [])]
      const anchor = opts[index]
      if (anchor === undefined) return

      if (f.fieldType === 'checkbox' && opts.length <= 1) {
        window.alert('체크박스 필드는 최소 1개의 옵션이 필요합니다.')
        return
      }

      opts.splice(index, 1)
      const nextPlacements = f.placements.filter((p) => p.optionValue !== anchor)

      onChange(
        fields.map((ff) => (ff.fieldKey === key ? { ...ff, options: opts, placements: nextPlacements } : ff)),
      )

      /* radio: 활성 해제 두어 "옵션을 고른 뒤 드래그" 흐름 유지 · checkbox 는 남은 첫 옵션으로 */
      if (activeOptionValue === anchor) {
        if (f.fieldType === 'radio') setActiveOptionValue(null)
        else setActiveOptionValue(opts[0] ?? null)
      }
    },
    [fields, onChange, activeOptionValue],
  )

  const handleRemovePlacement = (key: string, index: number) => {
    onChange(
      fields.map((f) =>
        f.fieldKey === key
          ? {
              ...f,
              placements: f.placements.filter((_, i) => i !== index),
            }
          : f,
      ),
    )
    /* 삭제 대상이 현재 선택된 placement 면 선택 해제. 이후 인덱스는 바뀌므로
       단순히 null 로 돌려 놓는 편이 예측 가능하다. */
    if (selectedKey === key && selectedPlacementIndex === index) {
      setSelectedPlacementIndex(null)
    } else if (
      selectedKey === key &&
      selectedPlacementIndex != null &&
      selectedPlacementIndex > index
    ) {
      setSelectedPlacementIndex(selectedPlacementIndex - 1)
    }
  }

  /** 선택된 필드의 특정 placement 를 부분 갱신한다. */
  const handlePatchPlacement = useCallback(
    (key: string, index: number, patch: Partial<PdfPlacement>) => {
      onChange(
        fields.map((f) =>
          f.fieldKey === key
            ? {
                ...f,
                placements: f.placements.map((p, i) => (i === index ? { ...p, ...patch } : p)),
              }
            : f,
        ),
      )
    },
    [fields, onChange],
  )

  const handlePick = useCallback(
    (pick: OverlayPick) => {
      if (!selectedKey) {
        window.alert('먼저 왼쪽에서 필드를 선택한 뒤 PDF 위를 드래그하세요.')
        return
      }
      const target = fields.find((f) => f.fieldKey === selectedKey) ?? null
      let optionValue: string | null = null

      if (target?.fieldType === 'radio') {
        const opts = target.options ?? []
        if (opts.length === 0) {
          window.alert('라디오 필드에 아직 옵션이 없습니다. 먼저 옵션을 추가해 주세요.')
          return
        }
        if (!activeOptionValue || !opts.includes(activeOptionValue)) {
          window.alert('먼저 라디오 옵션을 추가하거나 선택해 주세요.')
          return
        }
        optionValue = activeOptionValue
      } else if (target?.fieldType === 'checkbox') {
        const opts = target.options ?? []
        if (opts.length === 0) {
          window.alert('선택형 필드에 옵션이 없습니다. 먼저 옵션을 1개 이상 추가해 주세요.')
          return
        }
        optionValue = activeOptionValue && opts.includes(activeOptionValue) ? activeOptionValue : opts[0]
      }
      /* 드래그(박스) 결과가 오면 그 치수를, 단일 클릭이면 width/height = null 로 저장.
         서버는 null 일 때 단일 라인 렌더로 폴백하므로 양쪽 모두 안전. */
      const placement: PdfPlacement = {
        page: pick.pageIndex,
        x: pick.x,
        y: pick.y,
        width: pick.width != null ? pick.width : null,
        height: pick.height != null ? pick.height : null,
        fontSize: null,
        align: 'center',
        optionValue,
      }

      if (target?.fieldType === 'radio') {
        setPendingRadioPlacement(placement)
        setSelectedPlacementIndex(null)
        return
      }

      let nextIndex = 0
      const nextFields = fields.map((f) => {
        if (f.fieldKey !== selectedKey) return f
        /*
         * non-radio 필드는 좌표를 1개만 유지한다.
         * 잘못 찍은 경우 다시 찍으면 기존 박스를 즉시 교체해 화면/결과물이 일치하도록 한다.
         */
        if (f.fieldType !== 'radio' && f.fieldType !== 'checkbox') {
          nextIndex = 0
          return { ...f, placements: [placement] }
        }
        /*
         * 체크박스: "선택된 좌표 수정(덮어쓰기)" 또는 선택 해제 상태에서 새 placement 추가.
         * 새 좌표를 더하려면 좌표 목록의 "새 좌표 추가" 로 선택을 해제한 뒤 드래그한다.
         */
        if (selectedPlacementIndex != null && f.placements[selectedPlacementIndex]) {
          nextIndex = selectedPlacementIndex
          return {
            ...f,
            placements: f.placements.map((p, i) => (i === selectedPlacementIndex ? placement : p)),
          }
        }
        nextIndex = f.placements.length
        return { ...f, placements: [...f.placements, placement] }
      })
      onChange(nextFields)
      /* 방금 추가/수정한 placement 를 자동 선택한다. */
      setSelectedPlacementIndex(nextIndex)
    },
    [fields, onChange, selectedKey, activeOptionValue, selectedPlacementIndex],
  )

  const handleCommitRadioPlacement = useCallback(() => {
    if (!selectedKey) return
    const target = fields.find((f) => f.fieldKey === selectedKey)
    if (!target || target.fieldType !== 'radio') return
    const opts = target.options ?? []
    if (!activeOptionValue || !opts.includes(activeOptionValue)) {
      window.alert('좌표를 저장할 옵션을 먼저 선택해 주세요.')
      return
    }
    if (!pendingRadioPlacement) {
      window.alert('PDF 위에서 영역을 먼저 드래그해 주세요.')
      return
    }
    const finalPlacement: PdfPlacement = {
      ...pendingRadioPlacement,
      optionValue: activeOptionValue,
    }
    const nextPlacements = target.placements.filter((p) => p.optionValue !== activeOptionValue)
    const merged = [...nextPlacements, finalPlacement]
    onChange(fields.map((f) => (f.fieldKey === selectedKey ? { ...f, placements: merged } : f)))
    setPendingRadioPlacement(null)
    setSelectedPlacementIndex(merged.length - 1)
  }, [activeOptionValue, fields, onChange, pendingRadioPlacement, selectedKey])

  const handleDocumentReady = useCallback((doc: PDFDocumentProxy) => {
    setNumPages(Math.max(1, doc.numPages))
  }, [])

  const selectedField = fields.find((f) => f.fieldKey === selectedKey) ?? null
  const selectedPlacement =
    selectedField && selectedPlacementIndex != null
      ? selectedField.placements[selectedPlacementIndex] ?? null
      : null

  /* 선택형 필드: checkbox 는 첫 옵션으로 활성 폴백 · radio 는 목록 변경 시 활성 값만 무효면 해제한다. */
  useEffect(() => {
    if (
      !selectedField ||
      (selectedField.fieldType !== 'radio' && selectedField.fieldType !== 'checkbox')
    ) {
      if (activeOptionValue != null) {
        setActiveOptionValue(null)
      }
      return
    }

    const opts = selectedField.options ?? []

    if (selectedField.fieldType === 'checkbox') {
      if (activeOptionValue == null || !opts.includes(activeOptionValue)) {
        setActiveOptionValue(opts[0] ?? null)
      }
      return
    }

    if (activeOptionValue != null && !opts.includes(activeOptionValue)) {
      setActiveOptionValue(null)
    }
  }, [selectedKey, selectedField?.fieldType, JSON.stringify(selectedField?.options ?? null), activeOptionValue])

  const radioPlacementBlocked =
    selectedField?.fieldType === 'radio' &&
    ((selectedField.options ?? []).length === 0 ||
      activeOptionValue == null ||
      !(selectedField.options ?? []).includes(activeOptionValue))

  /** 박스 모드로 드래그 픽을 받는다. 라디오는 활성 옵션이 있을 때만 허용한다. */
  const canvasClickEnabled = Boolean(selectedKey) && !radioPlacementBlocked

  return (
    <div className="pdf-engine-editor">
      <aside className="pdf-engine-editor__panel pdf-engine-editor__panel--fields">
        <h3 className="pdf-engine-editor__panel-title">등록된 필드 ({fields.length})</h3>
        {fields.length > 0 ? (
          <div className="pdf-engine-editor__mapping-table" role="table" aria-label="필드별 고객 데이터 매핑">
            <div className="pdf-engine-editor__mapping-table-head" role="row">
              <span role="columnheader">필드명</span>
              <span role="columnheader">매핑</span>
            </div>
            {fields.map((f) => (
              <div
                key={`map-${f.fieldKey}`}
                role="row"
                className={
                  'pdf-engine-editor__mapping-table-row' +
                  (f.fieldKey === selectedKey ? ' pdf-engine-editor__mapping-table-row--active' : '')
                }
                onClick={() => {
                  setSelectedKey(f.fieldKey)
                  setSelectedPlacementIndex(f.placements.length > 0 ? 0 : null)
                }}
              >
                <span role="cell" className="pdf-engine-editor__mapping-table-label">
                  {f.label}
                </span>
                <span role="cell" className="pdf-engine-editor__mapping-table-summary">
                  {formatPdfFieldMappingSummary(f.dataMapping)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {fields.length === 0 ? (
          <p className="pdf-engine-editor__hint">아직 필드가 없습니다.</p>
        ) : (
          <div className="pdf-engine-editor__field-cards">
            {fields.map((f) => {
              const active = f.fieldKey === selectedKey
              const pickField = () => {
                setSelectedKey(f.fieldKey)
                if (f.fieldType === 'radio') {
                  setSelectedPlacementIndex(null)
                } else {
                  setSelectedPlacementIndex(f.placements.length > 0 ? 0 : null)
                }
              }
              const placementDisplayCount =
                f.fieldType === 'radio'
                  ? effectiveRadioPlacementsOrdered(f.placements, f.options ?? []).length
                  : f.placements.length
              return (
                <div
                  key={f.fieldKey}
                  role="button"
                  tabIndex={0}
                  className={
                    'pdf-engine-editor__field-card' +
                    (active ? ' pdf-engine-editor__field-card--active' : '')
                  }
                  onClick={pickField}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      pickField()
                    }
                  }}
                >
                  <div className="pdf-engine-editor__field-card-main">
                    <div className="pdf-engine-editor__field-card-title">{f.label}</div>
                    <div className="pdf-engine-editor__field-card-meta">
                      {PDF_FIELD_TYPE_LABELS[f.fieldType]} · {f.required ? '필수' : '선택'} · 좌표{' '}
                      {placementDisplayCount}개 · {formatPdfFieldMappingSummary(f.dataMapping)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pdf-engine-editor__btn pdf-engine-editor__btn--danger pdf-engine-editor__field-card-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveField(f.fieldKey)
                    }}
                  >
                    삭제
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </aside>

      <aside className="pdf-engine-editor__panel pdf-engine-editor__panel--config">
        <section
          className="pdf-engine-editor__config-block pdf-engine-editor__config-block--add-field"
          aria-label="새 필드 추가"
        >
          <h3 className="pdf-engine-editor__panel-title">새 필드 추가</h3>
          <div className="pdf-engine-editor__row">
            <label className="pdf-engine-editor__label">
              라벨 (사용자에게 보이는 이름)
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="예: 성명"
              />
            </label>
          </div>
          <div className="pdf-engine-editor__row pdf-engine-editor__row--type-required">
            <label className="pdf-engine-editor__label pdf-engine-editor__label--field-type">
              타입
              <select
                value={draft.fieldType}
                onChange={(e) => setDraft({ ...draft, fieldType: e.target.value as PdfFieldType })}
              >
                {PDF_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PDF_FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="pdf-engine-editor__label pdf-engine-editor__label--checkbox-inline">
              필수
              <input
                type="checkbox"
                className="pdf-engine-editor__input--checkbox-inline"
                checked={draft.required}
                onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
              />
            </label>
          </div>
          <div className="pdf-engine-editor__define-actions pdf-engine-editor__define-actions--add-only">
            <button
              type="button"
              className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
              onClick={handleAddField}
              disabled={!draft.label.trim()}
            >
              필드 추가
            </button>
          </div>
        </section>

        <div className="pdf-engine-editor__config-divider" role="presentation" />

        <section
          className="pdf-engine-editor__config-block pdf-engine-editor__config-block--selected-field"
          aria-label="선택한 필드 설정"
        >
          {selectedField ? (
            <>
              <h3 className="pdf-engine-editor__panel-title">선택한 필드 설정</h3>
              <p className="pdf-engine-editor__config-selected-name">{selectedField.label}</p>
              <div className="pdf-engine-editor__selected-save-row">
                <button
                  type="button"
                  className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
                  onClick={onSaveFields}
                  disabled={savingFields || !fieldsDirty}
                >
                  {savingFields ? '좌표 저장 중…' : '좌표 저장'}
                </button>
              </div>
              <p className="pdf-engine-editor__hint">
                {selectedField.fieldType === 'radio'
                  ? '라디오: PDF 에 드래그한 뒤 좌표 목록 위의 「선택 옵션 좌표 저장」으로 확정해야 서버 저장과 발급 PDF 에 반영됩니다. 다른 필드 타입은 드래그만으로 즉시 반영됩니다.'
                  : 'PDF 미리보기에서 드래그해 박스를 그리면 위치와 크기가 반영됩니다. 좌표 숫자는 PDF 위 박스로만 확인합니다.'}
              </p>
              <label className="pdf-engine-editor__label">
                라벨
                <input
                  type="text"
                  value={selectedField.label}
                  onChange={(e) => handlePatchField(selectedField.fieldKey, { label: e.target.value })}
                />
              </label>
              {selectedField.fieldType === 'text' || selectedField.fieldType === 'textarea' ? (
                <div className="pdf-engine-editor__mapping-block">
                  <h4 className="pdf-engine-editor__panel-title" style={{ fontSize: 13, marginTop: 8 }}>
                    고객 데이터 매핑
                  </h4>
                  <PdfFieldDataMappingControls
                    mapping={selectedField.dataMapping}
                    onChange={(dataMapping) =>
                      handlePatchField(selectedField.fieldKey, { dataMapping })
                    }
                  />
                  <label className="pdf-engine-editor__label" style={{ marginTop: 8 }}>
                    값 없을 때 기본 문구 (선택)
                    <input
                      type="text"
                      value={selectedField.dataMapping.fallbackText ?? ''}
                      onChange={(e) =>
                        handlePatchField(selectedField.fieldKey, {
                          dataMapping: {
                            ...selectedField.dataMapping,
                            fallbackText: e.target.value.trim() || null,
                          },
                        })
                      }
                      placeholder="고객 데이터가 비어 있을 때"
                    />
                  </label>
                </div>
              ) : (
                <p className="pdf-engine-editor__hint">
                  체크·라디오·서명 필드는 고객 데이터 자동 매핑을 지원하지 않습니다.
                </p>
              )}
              <div className="pdf-engine-editor__row pdf-engine-editor__row--type-required">
                <label className="pdf-engine-editor__label pdf-engine-editor__label--field-type">
                  타입
                  <select
                    value={selectedField.fieldType}
                    onChange={(e) =>
                      handlePatchField(selectedField.fieldKey, {
                        fieldType: e.target.value as PdfFieldType,
                      })
                    }
                  >
                    {PDF_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PDF_FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pdf-engine-editor__label pdf-engine-editor__label--checkbox-inline">
                  필수
                  <input
                    type="checkbox"
                    className="pdf-engine-editor__input--checkbox-inline"
                    checked={selectedField.required}
                    onChange={(e) =>
                      handlePatchField(selectedField.fieldKey, { required: e.target.checked })
                    }
                  />
                </label>
              </div>

              {selectedField.fieldType === 'signature' ? (
                <p className="pdf-engine-editor__hint" style={{ marginTop: 6 }}>
                  손사인 위치만 지정합니다. 실제 서명은 전자서명 링크에서 작성합니다.
                </p>
              ) : null}

              {selectedField.fieldType === 'text' || selectedField.fieldType === 'textarea' ? (
                <p className="pdf-engine-editor__hint" style={{ marginTop: 6 }}>
                  여기에서는 필드명·타입·PDF 위 박스 영역 중심으로 지정하면 됩니다. 글자 크기는 신청 입력
                  화면에서 필드별로 조절하며, 기본은 11pt 입니다.
                </p>
              ) : null}

              {selectedField.fieldType === 'radio' ? (
                <p className="pdf-engine-editor__hint" style={{ marginTop: 6 }}>
                  옵션을 선택한 뒤 PDF 에서 영역을 드래그하고, 아래「선택 옵션 좌표 저장」으로 확정합니다. 옵션
                  하나당 저장 좌표는 1개입니다(다시 저장하면 교체).
                </p>
              ) : null}

              {selectedField.fieldType === 'radio' || selectedField.fieldType === 'checkbox' ? (
                <RadioOptionsEditor
                  options={selectedField.options ?? []}
                  activeOption={activeOptionValue}
                  onActiveChange={setActiveOptionValue}
                  onAdd={(label) => addSelectableOption(selectedField.fieldKey, label)}
                  onRenameAt={(index, raw) => renameSelectableOptionAt(selectedField.fieldKey, index, raw)}
                  onRemoveAt={(index) => removeSelectableOptionAt(selectedField.fieldKey, index)}
                  mode={selectedField.fieldType}
                />
              ) : null}

              {selectedField.fieldType === 'radio' &&
              ((selectedField.options ?? []).length === 0 ||
                activeOptionValue == null ||
                !(selectedField.options ?? []).includes(activeOptionValue)) ? (
                <p className="pdf-engine-editor__hint" style={{ marginTop: 8, color: '#fdba74' }}>
                  먼저 라디오 옵션을 추가하거나 목록에서 선택한 뒤, PDF 에서 영역을 드래그하고「선택 옵션
                  좌표 저장」으로 반영해 주세요.
                </p>
              ) : null}

              <h4 className="pdf-engine-editor__panel-title" style={{ marginTop: 8, fontSize: 13 }}>
                좌표 목록
              </h4>
              {selectedField.fieldType === 'checkbox' ? (
                <div className="pdf-engine-editor__row" style={{ marginTop: -4 }}>
                  <button
                    type="button"
                    className="pdf-engine-editor__btn"
                    onClick={() => setSelectedPlacementIndex(null)}
                  >
                    새 좌표 추가
                  </button>
                  <span className="pdf-engine-editor__field-meta">
                    체크박스는 옵션별로 여러 좌표가 필요할 때 선택을 해제한 뒤 드래그하면 추가됩니다.
                  </span>
                </div>
              ) : null}

              {selectedField.fieldType === 'radio' &&
              (selectedField.options ?? []).length > 0 &&
              activeOptionValue != null &&
              (selectedField.options ?? []).includes(activeOptionValue) ? (
                <div
                  className="pdf-engine-editor__row"
                  style={{ marginTop: -4, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
                >
                  <button
                    type="button"
                    className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
                    onClick={handleCommitRadioPlacement}
                  >
                    선택 옵션 좌표 저장
                  </button>
                  <span className="pdf-engine-editor__field-meta">
                    PDF 에서 드래그한 뒤 누르면 선택한 옵션 좌표가 확정되며, 기존 좌표는 교체됩니다.
                  </span>
                </div>
              ) : null}

              {selectedField.fieldType === 'radio' && pendingRadioPlacement ? (
                <p className="pdf-engine-editor__hint" style={{ marginTop: 6 }} role="status">
                  미저장 드래그가 있습니다. 「선택 옵션 좌표 저장」으로 반영하거나, 다른 옵션을 고르면
                  초안이 지워집니다.
                </p>
              ) : null}

              {selectedField.fieldType === 'radio' ? (
                effectiveRadioPlacementsOrdered(
                  selectedField.placements,
                  selectedField.options ?? [],
                ).length === 0 && !pendingRadioPlacement ? (
                  <p className="pdf-engine-editor__hint">
                    아직 저장된 좌표가 없습니다. 옵션을 선택하고 PDF 에서 드래그한 뒤「선택 옵션 좌표
                    저장」을 누르세요.
                  </p>
                ) : (
                  <ul className="pdf-engine-editor__fields">
                    {effectiveRadioPlacementsOrdered(
                      selectedField.placements,
                      selectedField.options ?? [],
                    ).map((p) => {
                      const storageIdx =
                        p.optionValue != null
                          ? lastPlacementIndexForOption(selectedField, String(p.optionValue))
                          : -1
                      const isActive = storageIdx >= 0 && storageIdx === selectedPlacementIndex
                      const geomKind =
                        p.width != null && p.height != null ? '영역 박스' : '위치 표시'
                      const metaBits = [`페이지 ${p.page + 1}`, geomKind]
                      if (p.optionValue) metaBits.push(`"${p.optionValue}"`)
                      return (
                        <li
                          key={`${selectedField.fieldKey}-r-${String(p.optionValue ?? '')}`}
                          className={
                            'pdf-engine-editor__field-item' +
                            (isActive ? ' pdf-engine-editor__field-item--active' : '')
                          }
                          onClick={() => {
                            if (storageIdx >= 0) setSelectedPlacementIndex(storageIdx)
                          }}
                        >
                          <div className="pdf-engine-editor__field-item-row">
                            <span className="pdf-engine-editor__field-meta">{metaBits.join(' · ')}</span>
                            {storageIdx >= 0 ? (
                              <button
                                type="button"
                                className="pdf-engine-editor__btn pdf-engine-editor__btn--danger pdf-engine-editor__btn--sm pdf-engine-editor__btn--ghost-danger"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemovePlacement(selectedField.fieldKey, storageIdx)
                                }}
                              >
                                삭제
                              </button>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : selectedField.placements.length === 0 ? (
                <p className="pdf-engine-editor__hint">
                  아직 좌표가 없습니다. 오른쪽 PDF 위를 드래그해 추가하세요.
                </p>
              ) : (
                <ul className="pdf-engine-editor__fields">
                  {selectedField.placements.map((p, i) => {
                    const isActive = i === selectedPlacementIndex
                    const geomKind =
                      p.width != null && p.height != null ? '영역 박스' : '위치 표시'
                    const metaBits = [`페이지 ${p.page + 1}`, geomKind]
                    if (p.optionValue) metaBits.push(`"${p.optionValue}"`)
                    return (
                      <li
                        key={`${selectedField.fieldKey}-p-${i}`}
                        className={
                          'pdf-engine-editor__field-item' +
                          (isActive ? ' pdf-engine-editor__field-item--active' : '')
                        }
                        onClick={() => setSelectedPlacementIndex(i)}
                      >
                        <div className="pdf-engine-editor__field-item-row">
                          <span className="pdf-engine-editor__field-meta">
                            {metaBits.join(' · ')}
                          </span>
                          <button
                            type="button"
                            className="pdf-engine-editor__btn pdf-engine-editor__btn--danger pdf-engine-editor__btn--sm pdf-engine-editor__btn--ghost-danger"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemovePlacement(selectedField.fieldKey, i)
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {SHOW_PLACEMENT_NUMERIC_EDITOR && selectedPlacement ? (
                <PlacementMetaEditor
                  placement={selectedPlacement}
                  onPatch={(patch) =>
                    handlePatchPlacement(
                      selectedField.fieldKey,
                      selectedPlacementIndex as number,
                      patch,
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              {fieldsDirty ? (
                <div className="pdf-engine-editor__selected-save-row">
                  <button
                    type="button"
                    className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
                    onClick={onSaveFields}
                    disabled={savingFields}
                  >
                    {savingFields ? '좌표 저장 중…' : '좌표 저장'}
                  </button>
                </div>
              ) : null}
              <p className="pdf-engine-editor__hint pdf-engine-editor__hint--muted-block">
                왼쪽에서 필드를 선택하면 세부 설정과 좌표 저장을 할 수 있습니다.
              </p>
            </>
          )}
        </section>
      </aside>

      <section className="pdf-engine-editor__panel pdf-engine-editor__panel--preview">
        <p className="pdf-engine-editor__hint pdf-engine-editor__preview-hint">
          필드를 고른 뒤 PDF 위에서 드래그하면 박스가 생깁니다. 좌표는 박스 위치로만 확인합니다.
        </p>
        <p className="pdf-engine-editor__hint pdf-engine-editor__preview-hint" style={{ marginTop: 6 }}>
          페이지가 여러 장이면 아래 미리보기를 스크롤하며 작업하세요. A4에 가까운 크기로 표시됩니다.
        </p>
        <div className="pdf-engine-editor__row">
          <label className="pdf-engine-editor__label" style={{ flex: '0 0 160px' }}>
            페이지 (1~{numPages})
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageIndex + 1}
              onChange={(e) => {
                const raw = Number(e.target.value)
                const pageNo =
                  Number.isFinite(raw) && !Number.isNaN(raw) ? Math.trunc(raw) : 1
                const clamped = Math.max(1, Math.min(numPages, pageNo || 1))
                setPageIndex(clamped - 1)
              }}
            />
          </label>
          <span className="pdf-engine-editor__field-meta">
            {selectedField
              ? selectedField.fieldType === 'radio'
                ? `선택됨: ${selectedField.label} — 드래그 후 「선택 옵션 좌표 저장」으로 확정`
                : `선택됨: ${selectedField.label} — PDF 위를 드래그해 박스를 지정하세요`
              : '먼저 왼쪽에서 필드를 선택해 주세요.'}
          </span>
        </div>
        {radioPlacementBlocked ? (
          <p className="pdf-engine-editor__hint pdf-engine-editor__preview-hint" style={{ color: '#fdba74' }}>
            먼저 라디오 옵션을 추가하거나 목록에서 선택해 주세요. (활성 옵션을 고른 뒤 PDF 에서 영역을
            드래그하고 패널에서 확정 저장합니다.)
          </p>
        ) : null}
        <div className="pdf-engine-editor__preview-scroll">
          <PdfOverlayCanvas
            pdfBuffer={pdfBuffer}
            pageIndex={pageIndex}
            marks={marks}
            clickEnabled={canvasClickEnabled}
            onPick={handlePick}
            onSelectMark={(markId) => {
              if (markId.endsWith(MARK_ID_PENDING)) {
                const key = markId.slice(0, -MARK_ID_PENDING.length)
                setSelectedKey(key)
                setSelectedPlacementIndex(null)
                return
              }
              const ix = markId.indexOf(MARK_ID_IDX)
              if (ix < 0) return
              const key = markId.slice(0, ix)
              const rawIndex = Number(markId.slice(ix + MARK_ID_IDX.length))
              if (!Number.isInteger(rawIndex) || rawIndex < 0) return
              setSelectedKey(key)
              setSelectedPlacementIndex(rawIndex)
            }}
            onDocumentReady={handleDocumentReady}
            debugMeta={overlayDebugMeta}
            mode="pick-box"
          />
        </div>
      </section>
    </div>
  )
}

/**
 * 선택된 placement 의 박스 메타(width/height/fontSize/align) 편집 패널.
 *
 * 이 서브컴포넌트를 분리한 이유:
 *   - 편집 로직은 "입력 문자열 → 숫자 파싱 → patch" 라는 하나의 책임만 가진다.
 *   - PdfCoordinateEditor 본체는 필드 단위 상태 관리에 집중한다.
 *   - 후속 PR 에서 드래그 핸들/리사이즈를 붙일 때도 이 패널을 그대로 유지한다.
 */
interface PlacementMetaEditorProps {
  placement: PdfPlacement
  onPatch: (patch: Partial<PdfPlacement>) => void
}

function PlacementMetaEditor({ placement, onPatch }: PlacementMetaEditorProps) {
  const handleNumericChange = (key: 'width' | 'height' | 'fontSize') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseOptionalPositive(e.target.value)
    if (parsed === 'invalid') return
    onPatch({ [key]: parsed } as Partial<PdfPlacement>)
  }

  return (
    <div style={{ marginTop: 4 }}>
      <h4 className="pdf-engine-editor__panel-title" style={{ marginTop: 8, fontSize: 13 }}>
        선택된 좌표 설정
      </h4>
      <div className="pdf-engine-editor__row">
        <label className="pdf-engine-editor__label">
          너비 (pt)
          <FormInput
            type="number"
            min={0}
            step={1}
            value={numericInputValue(placement.width)}
            onChange={handleNumericChange('width')}
            placeholder="비워두면 자동"
          />
        </label>
        <label className="pdf-engine-editor__label">
          높이 (pt)
          <FormInput
            type="number"
            min={0}
            step={1}
            value={numericInputValue(placement.height)}
            onChange={handleNumericChange('height')}
            placeholder="비워두면 자동"
          />
        </label>
      </div>
      <div className="pdf-engine-editor__row">
        <label className="pdf-engine-editor__label">
          글자 크기 (pt, 선택 입력)
          <FormInput
            type="number"
            min={0}
            step={1}
            value={numericInputValue(placement.fontSize)}
            onChange={handleNumericChange('fontSize')}
            placeholder="비우면 기본값(신청 입력 11pt)"
          />
        </label>
      </div>
      <p className="pdf-engine-editor__hint" style={{ margin: '4px 0 0' }}>
        텍스트는 좌표 박스 중앙 정렬로 출력됩니다.
      </p>
    </div>
  )
}

/**
 * radio/checkbox 필드의 옵션 목록 편집 + "현재 편집 중 옵션" 선택 UI.
 *
 * 선택지 추가/삭제/이름변경과 placement 의 optionValue 정합성은 부모(PdfCoordinateEditor)가 책임진다.
 */
interface RadioOptionsEditorProps {
  options: string[]
  activeOption: string | null
  onActiveChange: (next: string | null) => void
  onAdd: (trimmedLabel: string) => boolean
  onRenameAt: (index: number, rawLabel: string) => void
  onRemoveAt: (index: number) => void
  mode: 'radio' | 'checkbox'
}

function RadioOptionsEditor({
  options,
  activeOption,
  onActiveChange,
  onAdd,
  onRenameAt,
  onRemoveAt,
  mode,
}: RadioOptionsEditorProps) {
  const [draft, setDraft] = useState('')

  const duplicateTrimmedLabels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of options) {
      const t = o.trim()
      if (!t) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([label]) => label)
  }, [options])

  const blankOptionRows = useMemo(
    () => options.map((o) => o.trim() === ''),
    [options],
  )

  const handleAdd = () => {
    const v = draft.trim()
    if (!v) return
    const ok = onAdd(v)
    if (ok) setDraft('')
  }

  return (
    <div style={{ marginTop: 8 }}>
      <h4 className="pdf-engine-editor__panel-title" style={{ marginTop: 8, fontSize: 13 }}>
        {mode === 'radio' ? '라디오 옵션' : '체크박스 옵션'} ({options.length})
      </h4>
      <p className="pdf-engine-editor__hint" style={{ margin: '0 0 6px' }}>
        {mode === 'radio'
          ? '라디오는 옵션을 추가하고 목록에서 선택한 뒤 PDF 에서 영역을 드래그하고, 좌표 목록의「선택 옵션 좌표 저장」으로 확정해야 합니다.'
          : '옵션을 선택하고 PDF 위를 드래그하면, 해당 라벨 전용 좌표가 추가됩니다.'}
      </p>
      {duplicateTrimmedLabels.length > 0 ? (
        <p className="pdf-engine-editor__hint" style={{ color: '#fca5a5', margin: '0 0 6px' }}>
          중복된 옵션 이름이 있습니다 ({duplicateTrimmedLabels.join(', ')}). 수정하거나 저장이 거절될 수
          있습니다.
        </p>
      ) : null}
      {blankOptionRows.some(Boolean) ? (
        <p className="pdf-engine-editor__hint" style={{ color: '#fca5a5', margin: '0 0 6px' }}>
          이름이 비어 있는 옵션이 있습니다. 저장 전에 작성하거나 삭제해 주세요.
        </p>
      ) : null}
      {options.length === 0 ? (
        <p className="pdf-engine-editor__hint">아직 옵션이 없습니다.</p>
      ) : (
        <ul className="pdf-engine-editor__fields">
          {options.map((opt, i) => (
            // eslint-disable-next-line react/no-array-index-key -- 문자열 라벨만 저장해 노드별 안정적 id 부재
            <li
              key={`opt-${i}`}
              className={
                'pdf-engine-editor__field-item' +
                (opt === activeOption ? ' pdf-engine-editor__field-item--active' : '')
              }
              onClick={() => onActiveChange(opt)}
            >
              <div className="pdf-engine-editor__field-item-row">
                <FormInput
                  type="text"
                  value={opt}
                  onChange={(e) => onRenameAt(i, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  className="pdf-engine-editor__btn pdf-engine-editor__btn--danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveAt(i)
                  }}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pdf-engine-editor__row" style={{ marginTop: 4 }}>
        <FormInput
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="새 옵션 이름"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <button
          type="button"
          className="pdf-engine-editor__btn pdf-engine-editor__btn--primary"
          onClick={handleAdd}
          disabled={!draft.trim()}
        >
          옵션 추가
        </button>
      </div>
    </div>
  )
}
