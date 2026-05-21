import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { EmptyState, LoadingState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  fetchGaCustomerExcelSettings,
  saveGaCustomerExcelSettings,
  uploadGaCustomerExcelSample,
  type GaCustomerExcelSettingsDto,
} from '../api/gaCustomerExcelAdminApi'
import { listGaCompanies, type GaCompanyRow } from '../../auth/authApi'

type TabKey = 'excel' | 'customerDb'

const DB_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '(매칭 없음)' },
  { value: 'name', label: '이름' },
  { value: 'birth_date', label: '생년월일' },
  { value: 'ssn', label: '주민번호' },
  { value: 'phone', label: '연락처' },
]

export default function GaCompanyManagePage() {
  const { gaId: gaIdParam } = useParams()
  const gaId = Number(gaIdParam)
  const location = useLocation()
  const { token, user } = useAuth()
  const [tab, setTab] = useState<TabKey>('excel')
  const [gaMeta, setGaMeta] = useState<{ name: string; code: string } | null>(null)
  const [settings, setSettings] = useState<GaCustomerExcelSettingsDto | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [status, setStatus] = useState('')

  const stateMeta = location.state as { name?: string; code?: string } | undefined

  const loadGaMeta = useCallback(async () => {
    if (!token?.trim() || !Number.isFinite(gaId) || gaId < 1) {
      return
    }
    if (stateMeta?.name && stateMeta?.code) {
      setGaMeta({ name: stateMeta.name, code: stateMeta.code })
      return
    }
    try {
      const list = await listGaCompanies(token)
      const row = list.find((r: GaCompanyRow) => Number(r.id) === gaId)
      if (row) {
        setGaMeta({ name: row.name, code: row.code })
      }
    } catch {
      /* ignore */
    }
  }, [token, gaId, stateMeta?.name, stateMeta?.code])

  const loadSettings = useCallback(async () => {
    if (!token?.trim() || !Number.isFinite(gaId) || gaId < 1) {
      return
    }
    setLoadErr('')
    setLoading(true)
    try {
      const s = await fetchGaCustomerExcelSettings(token, gaId)
      setSettings(s)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.')
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [token, gaId])

  useEffect(() => {
    void loadGaMeta()
  }, [loadGaMeta])

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      return
    }
    void loadSettings()
  }, [user?.role, loadSettings])

  const [featureEnabled, setFeatureEnabled] = useState(false)
  const [matchByCol, setMatchByCol] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!settings) {
      return
    }
    setFeatureEnabled(settings.featureEnabled)
    const m: Record<string, string> = {}
    for (const c of settings.sampleColumns) {
      m[c.id] = ''
    }
    for (const r of settings.matchRules) {
      m[r.columnId] = r.dbField
    }
    setMatchByCol(m)
  }, [settings])

  const summaryText = useMemo(() => {
    if (!settings) {
      return ''
    }
    const parts = [
      `설정 완료: ${settings.configReady ? '예' : '아니오'}`,
      `DB 매칭: ${settings.matchRuleCount}개`,
    ]
    return parts.join(' · ')
  }, [settings])

  const onSample = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!token?.trim()) {
      return
    }
    const fd = new FormData(e.currentTarget)
    const file = fd.get('sample') as File | null
    if (!file || !file.size) {
      setStatus('파일을 선택해 주세요.')
      return
    }
    setSampleBusy(true)
    setStatus('')
    try {
      const r = await uploadGaCustomerExcelSample(token, gaId, file)
      setSettings(r.settings)
      setStatus('샘플 분석이 반영되었습니다. 조회·표시 설정 후 저장해 주세요.')
      e.currentTarget.reset()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '샘플 업로드에 실패했습니다.')
    } finally {
      setSampleBusy(false)
    }
  }

  const onSave = async () => {
    if (!token?.trim() || !settings) {
      return
    }
    const matchRules = Object.entries(matchByCol)
      .filter(([, db]) => db && db.trim())
      .map(([columnId, dbField]) => ({ columnId, dbField: dbField.trim() }))
    setSaving(true)
    setStatus('')
    try {
      const r = await saveGaCustomerExcelSettings(token, gaId, {
        featureEnabled,
        matchRules,
      })
      setSettings(r.settings)
      setStatus('저장되었습니다.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>GA 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  if (!Number.isFinite(gaId) || gaId < 1) {
    return (
      <main className="page page--with-back">
        <p>잘못된 GA입니다.</p>
        <Link to="/admin/ga">목록으로</Link>
      </main>
    )
  }

  return (
    <main className="page page--with-back admin-ga-management">
      <header className="page-header">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
          <Link to="/admin/ga" className="text-sm text-[var(--text-secondary)]">
            ← GA 목록
          </Link>
        </div>
        <h1 style={{ marginTop: 8 }}>GA 상세 관리</h1>
        <p>
          {gaMeta ? (
            <>
              <strong>{gaMeta.name}</strong> ({gaMeta.code}) · ID {gaId}
            </>
          ) : (
            <>GA #{gaId}</>
          )}
        </p>
      </header>

      <div className="card auth-card" style={{ maxWidth: 'none', margin: 0, padding: 12 }}>
        <div
          role="tablist"
          aria-label="GA-detail-tabs"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <FormButton
            htmlType="button"
            variant={tab === 'customerDb' ? 'primary' : 'secondary'}
            className={tab === 'customerDb' ? 'button button--primary' : 'button button--secondary'}
            onClick={(ev) => {
              ev.stopPropagation()
              setTab('customerDb')
            }}
          >
            고객 DB 관리
          </FormButton>
          <FormButton
            htmlType="button"
            variant={tab === 'excel' ? 'primary' : 'secondary'}
            className={tab === 'excel' ? 'button button--primary' : 'button button--secondary'}
            onClick={(ev) => {
              ev.stopPropagation()
              setTab('excel')
            }}
          >
            고객 엑셀 관리
          </FormButton>
        </div>

        {loadErr ? <StatusMessage message={loadErr} tone="error" className="mb-2" /> : null}

        {tab === 'customerDb' ? (
          <p className="text-sm text-[var(--text-secondary)]" style={{ lineHeight: 1.6 }}>
            고객 등록·검색·수정은 설계사 화면의 <strong>고객관리</strong> 메뉴에서 수행합니다. 이 탭은 GA별 안내용으로 두었으며,
            추후 GA 전용 고객 DB 기능이 생기면 이 영역에 연결할 수 있습니다.
          </p>
        ) : null}

        {tab === 'excel' ? (
          <>
            <StatusMessage message={status} tone="default" className="mb-2" />
            {loading ? (
              <LoadingState message="불러오는 중…" />
            ) : !settings ? (
              <EmptyState message="설정을 불러오지 못했습니다." />
            ) : (
              <div className="flex flex-col gap-4">
                <section className="border border-[var(--border-default)] rounded-md p-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">1. 기능 사용 여부</h2>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <FormInput
                      type="checkbox"
                      checked={featureEnabled}
                      onChange={(ev) => setFeatureEnabled(ev.target.checked)}
                      className="shrink-0"
                    />
                    고객 엑셀 기능 사용
                  </label>
                </section>

                <section className="border border-[var(--border-default)] rounded-md p-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">2. 설정 상태 요약</h2>
                  <p className="text-sm text-[var(--text-secondary)]">{summaryText}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    마지막 수정: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString('ko-KR') : '—'}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    샘플 파일: {settings.sampleOriginalFilename || '—'} (
                    {settings.sampleUploadedAt ? new Date(settings.sampleUploadedAt).toLocaleString('ko-KR') : '—'})
                  </p>
                </section>

                <section className="border border-[var(--border-default)] rounded-md p-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">3. 샘플 엑셀 업로드 (설정용)</h2>
                  <form onSubmit={(ev) => void onSample(ev)} className="flex flex-wrap items-end gap-2">
                    <FieldWrapper label="파일 (.xlsx / .xls)">
                      <FormInput type="file" name="sample" accept=".xlsx,.xls" className="block mt-1 text-sm" />
                    </FieldWrapper>
                    <FormButton htmlType="submit" variant="secondary" disabled={sampleBusy}>
                      업로드 후 분석
                    </FormButton>
                  </form>
                </section>

                <section className="border border-[var(--border-default)] rounded-md p-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">4. 조회 매핑 설정</h2>
                  {settings.sampleColumns.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">먼저 샘플 엑셀을 업로드하면 컬럼 목록이 표시됩니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="admin-data-table" style={{ minWidth: 480 }}>
                        <thead>
                          <tr>
                            <th>엑셀 컬럼명</th>
                            <th>고객 DB 매칭</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settings.sampleColumns.map((c) => (
                            <tr key={c.id}>
                              <td>{c.header}</td>
                              <td>
                                <FormSelect
                                  className="admin-form-input"
                                  value={matchByCol[c.id] ?? ''}
                                  onChange={(ev) =>
                                    setMatchByCol((prev) => ({
                                      ...prev,
                                      [c.id]: ev.target.value,
                                    }))
                                  }
                                  options={DB_FIELD_OPTIONS}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>


                <div className="flex gap-2">
                  <FormButton htmlType="button" variant="primary" disabled={saving} onClick={() => void onSave()}>
                    저장
                  </FormButton>
                  <FormButton htmlType="button" variant="secondary" disabled={saving} onClick={() => void loadSettings()}>
                    다시 불러오기
                  </FormButton>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}
