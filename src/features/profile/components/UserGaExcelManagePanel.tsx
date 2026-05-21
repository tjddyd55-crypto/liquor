import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { FormButton, FormInput } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import {
  fetchGaCustomerExcelCapability,
  fetchUserExcelData,
  patchUserExcelColumns,
  uploadUserExcelData,
  type GaCustomerExcelCapability,
} from '../../customers/api/gaCustomerExcelApi'

const L = {
  label: 'GA 데이터 업로드',
  loadFail: '\uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  pickFile: '\uD30C\uC77C\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.',
  uploadFail: '\uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  parseFail: '엑셀 파일을 읽을 수 없습니다.',
  saveFail: '\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  noFeature: '\uC774 GA\uC5D0\uC11C\uB294 \uC774 \uAE30\uB2A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  intro:
    'GA\uC5D0 \uC124\uC815\uB41C \uC0D8\uD50C\uACFC \uB3D9\uC77C\uD55C \uC5F4 \uAD6C\uC870\uC758 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC5C5\uB85C\uB4DC \uC2DC \uAE30\uC874 \uB370\uC774\uD130\uB294 \uC0AD\uC81C \uD6C4 \uB300\uCE58\uB429\uB2C8\uB2E4.',
  fileTypes: '\uD30C\uC77C (.xlsx / .xls)',
  upload: '\uC5C5\uB85C\uB4DC',
  displayTitle: '컬럼 노출 설정',
  allColumnsTitle: '전체 컬럼',
  previewTitle: '엑셀 데이터 미리보기',
  previewGuide: '업로드된 데이터의 상위 10행을 표시합니다.',
  previewEmpty: '업로드된 데이터가 없습니다.',
  emptyCols: '\uC0D8\uD50C \uC5D1\uC140 \uC124\uC815 \uD6C4 \uC5EC\uAE30\uC5D0 \uCEEC\uB7FC \uBAA9\uB85D\uC774 \uD45C\uC2DC\uB429\uB2C8\uB2E4.',
}

type Props = {
  token: string
}

export function UserGaExcelManagePanel({ token }: Props) {
  const [cap, setCap] = useState<GaCustomerExcelCapability | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [sampleColumns, setSampleColumns] = useState<{ id: string; header: string }[]>([])
  const [rows, setRows] = useState<{ rowIndex: number; cells: Record<string, string> }[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [localPreview, setLocalPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!token?.trim()) {
      return
    }
    setLoadErr('')
    try {
      const c = await fetchGaCustomerExcelCapability(token)
      setCap(c)
      if (!c.showDesignerUi) {
        setRowCount(null)
        setSampleColumns([])
        setRows([])
        setVisibility({})
        return
      }
      const d = await fetchUserExcelData(token)
      setRowCount(d.sourceRowCount)
      setSampleColumns(d.sampleColumns.map((x) => ({ id: x.id, header: x.header })))
      setRows(d.rows)
      const vis: Record<string, boolean> = {}
      for (const col of d.sampleColumns) {
        vis[col.id] = true
      }
      for (const s of d.columnSettings) {
        vis[s.column_name] = s.is_visible
      }
      setVisibility(vis)
    } catch (e) {
      setCap(null)
      setLoadErr(e instanceof Error ? e.message : L.loadFail)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    if (!cap?.showDesignerUi) {
      return ''
    }
    if (rowCount == null) {
      return ''
    }
    return `\uC5C5\uB85C\uB4DC\uB41C \uD589: ${rowCount}\uAC74`
  }, [cap?.showDesignerUi, rowCount])

  const previewRows = useMemo(() => rows.slice(0, 10), [rows])

  const serverPreview = useMemo(() => {
    const headers = sampleColumns.map((c) => c.header)
    const tableRows = previewRows.map((r) => sampleColumns.map((c) => String(r.cells[c.id] ?? '')))
    return { headers, rows: tableRows }
  }, [previewRows, sampleColumns])

  const previewTable = useMemo(() => {
    if (localPreview?.headers?.length) {
      return localPreview
    }
    return serverPreview
  }, [localPreview, serverPreview])

  const previewColumns = useMemo(() => {
    const headers = previewTable.headers.length > 0 ? previewTable.headers : sampleColumns.map((c) => c.header)
    return headers.map((header, idx) => {
      const mappedColumn = sampleColumns[idx] ?? null
      return {
        key: mappedColumn?.id ?? `col-${idx}`,
        header,
        sampleId: mappedColumn?.id ?? null,
        checked: mappedColumn ? visibility[mappedColumn.id] !== false : false,
      }
    })
  }, [previewTable.headers, sampleColumns, visibility])

  const parseLocalPreview = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      throw new Error('EMPTY_WORKBOOK')
    }
    const sheet = wb.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: '' })
    const headerRow = Array.isArray(matrix[0]) ? matrix[0] : []
    const headers = headerRow.map((v) => String(v ?? '').trim())
    const dataRows = matrix
      .slice(1, 11)
      .map((row) =>
        Array.from({ length: headers.length }, (_, i) => {
          const cell = Array.isArray(row) ? row[i] : ''
          return String(cell ?? '')
        }),
      )
    setLocalPreview({ headers, rows: dataRows })
  }, [])

  const onUpload = async () => {
    if (!token?.trim() || !cap?.showDesignerUi) {
      return
    }
    const file = selectedFile
    if (!file?.size) {
      setInfo('')
      setLoadErr(L.pickFile)
      return
    }
    setBusy(true)
    setLoadErr('')
    setInfo('')
    try {
      const r = await uploadUserExcelData(token, file)
      setInfo(`\uC5C5\uB85C\uB4DC \uC644\uB8CC (${r.rowCount}\uD589).`)
      await load()
      setSelectedFile(null)
      setLocalPreview(null)
      setFileInputKey((prev) => prev + 1)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : L.uploadFail)
    } finally {
      setBusy(false)
    }
  }

  const onToggleColumn = async (colId: string, next: boolean) => {
    if (!token?.trim() || !cap?.showDesignerUi) {
      return
    }
    setVisibility((prev) => ({ ...prev, [colId]: next }))
    setLoadErr('')
    try {
      await patchUserExcelColumns(token, [{ column_name: colId, is_visible: next }])
    } catch (e) {
      setVisibility((prev) => ({ ...prev, [colId]: !next }))
      setLoadErr(e instanceof Error ? e.message : L.saveFail)
    }
  }

  if (loadErr && !cap) {
    return (
      <div className="field">
        <span className="field__label">{L.label}</span>
        <StatusMessage message={loadErr} tone="error" />
      </div>
    )
  }

  if (!cap?.featureEnabled) {
    return null
  }

  if (!cap.showDesignerUi) {
    return (
      <div className="field">
        <span className="field__label">{L.label}</span>
        <p className="text-sm text-[var(--text-secondary)]">{cap.message || L.noFeature}</p>
      </div>
    )
  }

  return (
    <div className="field">
      <span className="field__label">{L.label}</span>
      <p className="text-sm text-[var(--text-secondary)] mb-2">{L.intro}</p>
      {summary ? <p className="text-sm text-[var(--text-primary)] mb-2">{summary}</p> : null}
      <StatusMessage message={loadErr} tone="error" />
      <StatusMessage message={info} tone="default" />

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-sm text-[var(--text-secondary)]">
          {L.fileTypes}
          <FormInput
            key={`ga-user-excel-file-${fileInputKey}`}
            type="file"
            name="gaUserExcel"
            accept=".xlsx,.xls"
            className="block mt-1 text-sm"
            onChange={(ev) => {
              const file = ev.target.files?.[0] ?? null
              setSelectedFile(file)
              setLoadErr('')
              if (!file) {
                setLocalPreview(null)
                return
              }
              void parseLocalPreview(file).catch(() => {
                setLocalPreview(null)
                setLoadErr(L.parseFail)
              })
            }}
          />
        </label>
        <FormButton htmlType="button" variant="secondary" disabled={busy} onClick={() => void onUpload()}>
          {L.upload}
        </FormButton>
      </div>

      {sampleColumns.length > 0 ? (
        <div>
          <div className="mt-4">
            <span className="field__label block mb-1">{L.previewTitle}</span>
            <p className="text-sm text-[var(--text-secondary)] mb-1">{L.previewGuide}</p>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              {L.displayTitle}: {L.allColumnsTitle} 체크를 각 컬럼 헤더 위에서 바로 설정할 수 있습니다.
            </p>
            {previewColumns.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">{L.previewEmpty}</p>
            ) : (
              <div className="table-wrapper profile-page__excel-preview-scroll">
                <table className="admin-data-table profile-page__excel-preview-table">
                  <thead>
                    <tr className="profile-page__excel-preview-toggle-row">
                      {previewColumns.map((col) => {
                        const sampleId = col.sampleId
                        return (
                          <th key={`preview-toggle-${col.key}`} className="profile-page__excel-preview-toggle-cell">
                            {sampleId ? (
                              <FormInput
                                type="checkbox"
                                id={`ga-col-preview-${sampleId}`}
                                checked={col.checked}
                                onChange={(ev) => void onToggleColumn(sampleId, ev.target.checked)}
                                className="shrink-0"
                              />
                            ) : (
                              <span className="text-[var(--text-secondary)]">-</span>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                    <tr>
                      {previewColumns.map((col) => (
                        <th key={`preview-head-${col.key}`}>
                          {col.sampleId ? (
                            <label htmlFor={`ga-col-preview-${col.sampleId}`} className="profile-page__excel-preview-head-label">
                              {col.header}
                            </label>
                          ) : (
                            col.header
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewTable.rows.map((r, rowIdx) => (
                      <tr key={`preview-row-${rowIdx}`}>
                        {previewColumns.map((_, colIdx) => (
                          <td key={`preview-cell-${rowIdx}-${colIdx}`}>{r[colIdx] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">{L.emptyCols}</p>
      )}
    </div>
  )
}
