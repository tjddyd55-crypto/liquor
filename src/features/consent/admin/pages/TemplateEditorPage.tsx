import { FormButton, FormInput, FormSelect } from '../../../../components/form'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthProvider'
import { listGaCompanies, type GaCompanyRow } from '../../../auth/authApi'
import { ApiError } from '../../../../lib/apiClient'
import { ALL_INSURER_OPTIONS, gaLabel, insurerLabel } from '../consentAdminMeta'
import {
  fetchAdminConsentTemplatePdf,
  getAdminConsentTemplate,
  saveAdminConsentTemplate,
} from '../consentTemplateAdminApi'
import { PdfCoordinateOverlay, type PdfCoordinatePick, type PdfMark } from '../components/PdfCoordinateOverlay'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import '../consent-admin.css'

interface EditorField {
  clientId: string
  type: 'text' | 'signature'
  key: string
  x: number
  y: number
  fontSize?: number
  width?: number
  height?: number
  page?: number
}

function toPayload(fields: EditorField[]): unknown[] {
  return fields.map((f) => {
    const page = f.page ?? 0
    if (f.type === 'text') {
      const out: Record<string, unknown> = {
        type: 'text',
        key: f.key,
        x: Math.round(f.x * 100) / 100,
        y: Math.round(f.y * 100) / 100,
        page,
      }
      if (f.fontSize != null) {
        out.fontSize = f.fontSize
      }
      return out
    }
    const out: Record<string, unknown> = {
      type: 'signature',
      key: f.key,
      x: Math.round(f.x * 100) / 100,
      y: Math.round(f.y * 100) / 100,
      page,
    }
    if (f.width != null) {
      out.width = f.width
    }
    if (f.height != null) {
      out.height = f.height
    }
    return out
  })
}

function normalizeLoadedField(raw: unknown, clientId: string): EditorField | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const type = o.type === 'signature' ? 'signature' : o.type === 'text' ? 'text' : null
  const key = typeof o.key === 'string' ? o.key : ''
  const x = Number(o.x)
  const y = Number(o.y)
  if (!type || !key || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  const page = Number.isFinite(Number(o.page)) ? Math.max(0, Number(o.page)) : 0
  const base: EditorField = { clientId, type, key, x, y, page }
  if (type === 'text' && Number.isFinite(Number(o.fontSize))) {
    base.fontSize = Number(o.fontSize)
  }
  if (type === 'signature') {
    if (Number.isFinite(Number(o.width))) {
      base.width = Number(o.width)
    }
    if (Number.isFinite(Number(o.height))) {
      base.height = Number(o.height)
    }
  }
  return base
}

export function TemplateEditorPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const isEdit = Boolean(routeId?.trim())
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [gaOptions, setGaOptions] = useState<GaCompanyRow[]>([])
  const [gaId, setGaId] = useState(user?.gaId ?? 1)
  const [insuranceCompanyId, setInsuranceCompanyId] = useState(ALL_INSURER_OPTIONS[0]?.id ?? '')
  const [faxNumber, setFaxNumber] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [numPages, setNumPages] = useState(1)

  const [pendingType, setPendingType] = useState<'text' | 'signature'>('text')
  const [pendingKey, setPendingKey] = useState('')
  const [pendingFontSize, setPendingFontSize] = useState(12)
  const [pendingSigW, setPendingSigW] = useState(120)
  const [pendingSigH, setPendingSigH] = useState(50)

  const [fields, setFields] = useState<EditorField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  const marks: PdfMark[] = fields.map((f) => ({
    clientId: f.clientId,
    x: f.x,
    y: f.y,
    key: f.key,
    type: f.type,
    page: f.page ?? 0,
  }))

  const loadDetail = useCallback(async () => {
    if (!isEdit || !routeId) {
      setLoading(false)
      return
    }
    if (!token?.trim()) {
      setError('로그인이 필요합니다.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const row = await getAdminConsentTemplate(token, routeId)
      setGaId(row.ga_id)
      setInsuranceCompanyId(row.insurance_company_id)
      setFaxNumber(row.fax_number ?? '')
      const arr = Array.isArray(row.fields) ? row.fields : []
      const next: EditorField[] = []
      for (const item of arr) {
        const f = normalizeLoadedField(item, crypto.randomUUID())
        if (f) {
          next.push(f)
        }
      }
      setFields(next)
      const buf = await fetchAdminConsentTemplatePdf(token, routeId)
      setPdfBuffer(buf.slice(0))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했습니다.')
      setPdfBuffer(null)
    } finally {
      setLoading(false)
    }
  }, [isEdit, routeId, token])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!token?.trim()) {
      return
    }
    let c = false
    ;(async () => {
      try {
        const list = await listGaCompanies(token)
        if (!c) {
          setGaOptions(list)
        }
      } catch {
        if (!c) {
          setError('GA 목록을 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      c = true
    }
  }, [token])

  useEffect(() => {
    if (isEdit || gaOptions.length === 0) {
      return
    }
    if (!isSuperAdmin && user?.gaId != null) {
      setGaId(user.gaId)
      return
    }
    setGaId(gaOptions[0].id)
  }, [gaOptions, isEdit, isSuperAdmin, user?.gaId])

  useEffect(() => {
    if (!pdfFile) {
      if (!isEdit) {
        setPdfBuffer(null)
      }
      return
    }
    let cancelled = false
    ;(async () => {
      const buf = await pdfFile.arrayBuffer()
      if (!cancelled) {
        setPdfBuffer(buf)
        setPageIndex(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfFile, isEdit])

  const onDocumentReady = useCallback((doc: PDFDocumentProxy) => {
    setNumPages(Math.max(1, doc.numPages))
  }, [])

  const handlePick = useCallback(
    (p: PdfCoordinatePick) => {
      const key = pendingKey.trim()
      if (!key) {
        setError('필드 key(예: name, ssn)를 입력한 뒤 PDF를 클릭하세요.')
        return
      }
      setError(null)
      setFields((prev) => [
        ...prev,
        {
          clientId: crypto.randomUUID(),
          type: pendingType,
          key,
          x: p.x,
          y: p.y,
          page: p.pageIndex,
          ...(pendingType === 'text'
            ? { fontSize: pendingFontSize }
            : { width: pendingSigW, height: pendingSigH }),
        },
      ])
    },
    [pendingFontSize, pendingKey, pendingSigH, pendingSigW, pendingType],
  )

  const removeField = (clientId: string) => {
    setFields((prev) => prev.filter((f) => f.clientId !== clientId))
  }

  const handleSave = async () => {
    setError(null)
    if (!token?.trim()) {
      setError('로그인이 필요합니다.')
      return
    }
    if (!Number.isInteger(gaId)) {
      setError('GA를 선택하세요.')
      return
    }
    if (!insuranceCompanyId.trim()) {
      setError('보험사를 선택하세요.')
      return
    }
    if (!isEdit && !pdfFile) {
      setError('신규 등록 시 PDF 파일이 필요합니다.')
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      if (pdfFile) {
        fd.append('pdf', pdfFile)
      }
      fd.append('ga_id', String(gaId))
      fd.append('insurance_company_id', insuranceCompanyId.trim())
      fd.append('fax_number', faxNumber.trim())
      fd.append('fields', JSON.stringify(toPayload(fields)))
      const res = await saveAdminConsentTemplate(token, fd)
      const newId = res.template?.id
      if (!isEdit && newId) {
        navigate(`/internal/admin/consent-template/edit/${newId}`, { replace: true })
      } else {
        navigate('/internal/admin/consent-template')
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="consent-admin">
      <div className="consent-admin__inner">
        <h1 className="consent-admin__title">{isEdit ? '템플릿 수정' : '템플릿 등록'}</h1>
        <div className="consent-admin__toolbar">
          <Link to="/internal/admin/consent-template" className="consent-admin__btn consent-admin__btn--ghost">
            목록으로
          </Link>
        </div>

        {error ? <div className="consent-admin__err">{error}</div> : null}
        {loading ? <p style={{ color: 'var(--consent-sub)' }}>불러오는 중…</p> : null}

        {!loading ? (
          <div className="consent-admin__form-grid">
            <fieldset className="consent-admin__fieldset">
              <legend>GA · 보험사</legend>
              <label>
                GA
                <FormSelect
                  value={String(gaId)}
                  disabled={isEdit || !isSuperAdmin}
                  onChange={(e) => setGaId(Number(e.target.value))}
                  options={gaOptions.map((g: GaCompanyRow) => ({
                    value: String(g.id),
                    label: `${g.name} (${g.code}) · ${gaLabel(g.id)}`,
                  }))}
                />
                {isEdit ? (
                  <span style={{ fontSize: 12, color: 'var(--consent-sub)' }}>
                    수정 시 GA는 고정됩니다. 조합을 바꾸려면 새로 등록하세요.
                  </span>
                ) : null}
              </label>
              <label>
                보험사
                <FormSelect
                  value={insuranceCompanyId}
                  disabled={isEdit}
                  onChange={(e) => setInsuranceCompanyId(e.target.value)}
                  options={ALL_INSURER_OPTIONS.map((c) => ({ value: c.id, label: c.name }))}
                />
              </label>
              <label>
                팩스번호 (보관용)
                <FormInput
                  type="text"
                  value={faxNumber}
                  onChange={(e) => setFaxNumber(e.target.value)}
                  placeholder="예: 02-0000-0000"
                  autoComplete="off"
                />
              </label>
            </fieldset>

            <fieldset className="consent-admin__fieldset">
              <legend>PDF</legend>
              <label>
                파일 {isEdit ? '(교체 시에만 선택)' : '(필수)'}
                <FormInput
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {isEdit ? (
                <p className="consent-admin__coord-hint" style={{ margin: 0 }}>
                  현재: {gaLabel(gaId)} / {insurerLabel(insuranceCompanyId)}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="consent-admin__fieldset">
              <legend>좌표 — 클릭으로 추가</legend>
              <p className="consent-admin__coord-hint">
                PDF 좌표는 <strong>좌하단 원점</strong>입니다. 화면 클릭 위치는 자동 변환됩니다. 필드 타입·key를
                고른 뒤 PDF 위를 클릭하세요.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                <label>
                  필드 타입
                  <FormSelect
                    value={pendingType}
                    onChange={(e) => setPendingType(e.target.value as 'text' | 'signature')}
                    options={[
                      { value: 'text', label: 'text' },
                      { value: 'signature', label: 'signature' },
                    ]}
                  />
                </label>
                <label>
                  key
                  <FormInput
                    type="text"
                    value={pendingKey}
                    onChange={(e) => setPendingKey(e.target.value)}
                    placeholder="name, ssn, phone, signature…"
                  />
                </label>
                {pendingType === 'text' ? (
                  <label>
                    fontSize
                    <FormInput
                      type="number"
                      min={6}
                      max={48}
                      value={pendingFontSize}
                      onChange={(e) => setPendingFontSize(Number(e.target.value) || 12)}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      서명 width
                      <FormInput
                        type="number"
                        min={20}
                        max={400}
                        value={pendingSigW}
                        onChange={(e) => setPendingSigW(Number(e.target.value) || 120)}
                      />
                    </label>
                    <label>
                      서명 height
                      <FormInput
                        type="number"
                        min={20}
                        max={300}
                        value={pendingSigH}
                        onChange={(e) => setPendingSigH(Number(e.target.value) || 50)}
                      />
                    </label>
                  </>
                )}
                <label>
                  페이지 (0부터)
                  <FormInput
                    type="number"
                    min={0}
                    max={Math.max(0, numPages - 1)}
                    value={pageIndex}
                    onChange={(e) => setPageIndex(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
              </div>

              <PdfCoordinateOverlay
                pdfArrayBuffer={pdfBuffer}
                pageIndex={pageIndex}
                marks={marks}
                clickEnabled={Boolean(pendingKey.trim()) && Boolean(pdfBuffer)}
                onPick={handlePick}
                onDocumentReady={onDocumentReady}
              />
            </fieldset>

            <fieldset className="consent-admin__fieldset">
              <legend>fields JSON ({fields.length}개)</legend>
              <ul className="consent-admin__field-list">
                {fields.length === 0 ? (
                  <li style={{ color: 'var(--consent-sub)' }}>필드가 없습니다.</li>
                ) : (
                  fields.map((f) => (
                    <li key={f.clientId}>
                      <strong>{f.type}</strong>
                      <code style={{ color: '#93c5fd' }}>{f.key}</code>
                      <span style={{ color: 'var(--consent-sub)', fontSize: 13 }}>
                        x={f.x.toFixed(1)}, y={f.y.toFixed(1)}, page={f.page ?? 0}
                        {f.type === 'text' && f.fontSize != null ? `, ${f.fontSize}pt` : null}
                        {f.type === 'signature' ? `, ${f.width ?? 120}×${f.height ?? 50}` : null}
                      </span>
                      <FormButton
                        htmlType="button"
                        className="consent-admin__btn consent-admin__btn--danger"
                        onClick={() => removeField(f.clientId)}
                      >
                        삭제
                      </FormButton>
                    </li>
                  ))
                )}
              </ul>
            </fieldset>

            <div>
              <FormButton
                htmlType="button"
                className="consent-admin__btn"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? '저장 중…' : '저장'}
              </FormButton>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
