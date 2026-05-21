import { useCallback, useEffect, useRef, useState } from 'react'
import { FieldWrapper, FormButton, FormInput, FormSelect, type FormSelectOption } from '../../../components/form'
import { Modal } from '../../../components/ui'
import { StatusMessage } from '../../../components/feedback'
import { useConfirmDialog } from '../../../components/dialog'
import { useAuth } from '../../auth/AuthProvider'
import type { InsurerSite, InsurerSiteCategory } from '../api/insurerSitesApi'
import {
  createAdminInsurerSite,
  deactivateAdminInsurerSite,
  fetchAdminInsurerSites,
  patchAdminInsurerSite,
  uploadAdminInsurerLogo,
} from '../api/insurerSitesApi'
import { InsurerSiteLogoMark } from '../components/InsurerSiteLogoMark'
import { normalizeOptionalUrl } from '../lib/normalizeOptionalUrl'
import './admin-insurer-sites-modal.css'

const CATEGORY_OPTIONS: FormSelectOption[] = [
  { value: '', label: '전체 구분' },
  { value: 'non_life', label: '손해보험' },
  { value: 'life', label: '생명보험' },
]

const CATEGORY_LABEL: Record<InsurerSiteCategory, string> = {
  non_life: '손해',
  life: '생명',
}

function AdminUrlCell({ url }: { url: string | undefined | null }) {
  const v = String(url ?? '').trim()
  if (!v) {
    return (
      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }} title="미입력">
        — · 미입력
      </span>
    )
  }
  return (
    <div
      style={{
        maxWidth: 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 12,
      }}
      title={v}
    >
      {v}
    </div>
  )
}

type FormState = {
  name: string
  category: InsurerSiteCategory
  logoPath: string
  salesUrl: string
  homepageUrl: string
  disclosureUrl: string
  claimUrl: string
  sortOrder: string
  isActive: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  category: 'non_life',
  logoPath: '',
  salesUrl: '',
  homepageUrl: '',
  disclosureUrl: '',
  claimUrl: '',
  sortOrder: '0',
  isActive: true,
})

function formFromSite(s: InsurerSite): FormState {
  return {
    name: s.name,
    category: s.category,
    logoPath: s.logoPath ?? '',
    salesUrl: s.salesUrl ?? '',
    homepageUrl: s.homepageUrl ?? '',
    disclosureUrl: s.disclosureUrl ?? '',
    claimUrl: s.claimUrl ?? '',
    sortOrder: String(s.sortOrder ?? 0),
    isActive: s.isActive !== false,
  }
}

function formDirtySnapshot(f: FormState, logoPicked: boolean): string {
  return JSON.stringify({
    name: f.name,
    category: f.category,
    logoPath: f.logoPath,
    salesUrl: f.salesUrl,
    homepageUrl: f.homepageUrl,
    disclosureUrl: f.disclosureUrl,
    claimUrl: f.claimUrl,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
    logoPicked,
  })
}

export default function AdminInsurerSitesPage() {
  const { user, token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [items, setItems] = useState<InsurerSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const baselineSnapshotRef = useRef<string | null>(null)
  const nestedConfirmBlockingRef = useRef(false)

  const closeModalCompletely = useCallback(() => {
    setModalOpen(false)
    baselineSnapshotRef.current = null
  }, [])

  const requestClose = useCallback(async () => {
    if (saving || nestedConfirmBlockingRef.current) {
      return
    }
    const baseline = baselineSnapshotRef.current
    const dirty =
      baseline !== null && formDirtySnapshot(form, logoFile !== null) !== baseline
    if (!dirty) {
      closeModalCompletely()
      return
    }
    nestedConfirmBlockingRef.current = true
    try {
      const ok = await confirm({
        title: '확인',
        message: '변경사항이 저장되지 않았습니다. 닫으시겠습니까?',
        confirmLabel: '확인',
        cancelLabel: '취소',
      })
      if (ok) {
        closeModalCompletely()
      }
    } finally {
      nestedConfirmBlockingRef.current = false
    }
  }, [saving, form, logoFile, confirm, closeModalCompletely])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      return
    }
    const u = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [logoFile])

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') return
    setError('')
    setLoading(true)
    try {
      const c =
        catFilter === 'life' || catFilter === 'non_life' ? (catFilter as InsurerSiteCategory) : ''
      const res = await fetchAdminInsurerSites(token, { category: c, q: searchQ })
      setItems(Array.isArray(res.items) ? res.items : [])
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, user?.role, catFilter, searchQ])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    const next = emptyForm()
    setEditingId(null)
    setForm(next)
    setLogoFile(null)
    setLogoPreviewUrl(null)
    baselineSnapshotRef.current = formDirtySnapshot(next, false)
    setModalOpen(true)
  }

  const openEdit = (s: InsurerSite) => {
    const next = formFromSite(s)
    setEditingId(s.id)
    setForm(next)
    setLogoFile(null)
    setLogoPreviewUrl(null)
    baselineSnapshotRef.current = formDirtySnapshot(next, false)
    setModalOpen(true)
  }

  const save = async () => {
    if (!token?.trim()) return
    const name = form.name.trim()
    if (!name) {
      setError('보험사명을 입력해 주세요.')
      return
    }

    const normLabel = (label: string, raw: string) => {
      const r = normalizeOptionalUrl(raw)
      if (!r.ok) {
        setError(`${label}: ${r.message}`)
        return null
      }
      return r.value
    }

    const salesUrl = normLabel('설계사이트 URL', form.salesUrl)
    if (salesUrl === null) return
    const homepageUrl = normLabel('공식홈 URL', form.homepageUrl)
    if (homepageUrl === null) return
    const disclosureUrl = normLabel('공시실 URL', form.disclosureUrl)
    if (disclosureUrl === null) return
    const claimUrl = normLabel('보상홈 URL', form.claimUrl)
    if (claimUrl === null) return

    setSaving(true)
    setError('')
    try {
      const sortOrder = Number(form.sortOrder)
      const sort = Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0
      if (editingId == null) {
        await createAdminInsurerSite(token, {
          category: form.category,
          name,
          logoPath: form.logoPath.trim(),
          salesUrl,
          homepageUrl,
          disclosureUrl,
          claimUrl,
          sortOrder: sort,
          isActive: form.isActive,
        })
      } else {
        await patchAdminInsurerSite(token, editingId, {
          category: form.category,
          name,
          logoPath: form.logoPath.trim(),
          salesUrl,
          homepageUrl,
          disclosureUrl,
          claimUrl,
          sortOrder: sort,
          isActive: form.isActive,
        })
        if (logoFile) {
          const up = await uploadAdminInsurerLogo(token, editingId, logoFile)
          if (up.item?.logoPath) {
            setForm((f) => ({ ...f, logoPath: up.item.logoPath }))
          }
          setLogoFile(null)
        }
      }
      baselineSnapshotRef.current = null
      setModalOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const deactivateRow = async (s: InsurerSite) => {
    if (!token?.trim()) return
    const ok = await confirm({
      title: '보험사 비활성화',
      message: `${s.name} 항목을 비활성화할까요? 일반 사용자 화면에서 숨겨집니다.`,
      confirmLabel: '비활성화',
      tone: 'danger',
    })
    if (!ok) return
    setError('')
    try {
      await deactivateAdminInsurerSite(token, s.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '비활성화에 실패했습니다.')
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>보험사 설계사이트 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>보험사 설계사이트 관리</h1>
        <p>전체 GA/FC에게 공통으로 노출되는 보험사 설계사이트 정보를 관리합니다.</p>
      </header>

      {confirmDialog}

      <section
        className="card auth-card"
        style={{ maxWidth: 'none', margin: '0 0 12px', padding: 16, display: 'grid', gap: 12 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <FormButton htmlType="button" variant="primary" onClick={openCreate}>
            보험사 추가
          </FormButton>
          <div style={{ minWidth: 140 }}>
            <FieldWrapper label="구분 필터">
              <FormSelect value={catFilter} options={CATEGORY_OPTIONS} onChange={(e) => setCatFilter(e.target.value)} />
            </FieldWrapper>
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <FieldWrapper label="검색(보험사명)">
              <FormInput value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            </FieldWrapper>
          </div>
          <FormButton htmlType="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            새로고침
          </FormButton>
        </div>
        {error ? <StatusMessage tone="error" message={error} /> : null}
        {loading ? <p style={{ margin: 0 }}>불러오는 중…</p> : null}
      </section>

      <section
        className="card auth-card"
        style={{ maxWidth: 'none', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>정렬</th>
                <th>로고</th>
                <th>보험사명</th>
                <th>구분</th>
                <th>설계사이트 URL</th>
                <th>공식홈 URL</th>
                <th>공시실 URL</th>
                <th>보상홈 URL</th>
                <th>노출 여부</th>
                <th>수정</th>
                <th>비활성화</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>{s.sortOrder}</td>
                  <td>
                    <InsurerSiteLogoMark name={s.name} logoPath={s.logoPath} variant="adminThumb" />
                  </td>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td>{CATEGORY_LABEL[s.category]}</td>
                  <td>
                    <AdminUrlCell url={s.salesUrl} />
                  </td>
                  <td>
                    <AdminUrlCell url={s.homepageUrl} />
                  </td>
                  <td>
                    <AdminUrlCell url={s.disclosureUrl} />
                  </td>
                  <td>
                    <AdminUrlCell url={s.claimUrl} />
                  </td>
                  <td>{s.isActive ? 'Y' : 'N'}</td>
                  <td>
                    <FormButton htmlType="button" variant="secondary" onClick={() => openEdit(s)}>
                      수정
                    </FormButton>
                  </td>
                  <td>
                    <FormButton
                      htmlType="button"
                      variant="danger"
                      onClick={() => void deactivateRow(s)}
                      disabled={!s.isActive}
                    >
                      비활성화
                    </FormButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => void requestClose()}
        ariaLabel={editingId == null ? '보험사 추가' : '보험사 수정'}
        panelClassName="insurer-site-form-modal-panel"
        panelPreset="largeForm"
        closeOnBackdrop={false}
        closeOnEsc={false}
        onEscapeRequest={() => void requestClose()}
      >
        <header className="insurer-site-form-modal__header">
          <h2 className="insurer-site-form-modal__title">{editingId == null ? '보험사 추가' : '보험사 수정'}</h2>
          <button
            type="button"
            className="insurer-site-form-modal__close"
            aria-label="닫기"
            disabled={saving}
            onClick={() => void requestClose()}
          >
            ×
          </button>
        </header>
        <div className="insurer-site-form-modal__body">
          <div className="insurer-site-form-modal__grid">
            <div className="insurer-site-form-modal__col" aria-labelledby="insurer-modal-col-basic">
              <h3 id="insurer-modal-col-basic" className="insurer-site-form-modal__col-title">
                기본 정보
              </h3>
              <FieldWrapper label="보험사명" required>
                <FormInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="카테고리">
                <FormSelect
                  value={form.category}
                  options={[
                    { value: 'non_life', label: '손해보험' },
                    { value: 'life', label: '생명보험' },
                  ]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value === 'life' ? 'life' : 'non_life',
                    }))
                  }
                />
              </FieldWrapper>
              {editingId != null ? (
                <>
                  <FieldWrapper
                    label="로고 업로드"
                    helperText="저장 시 서버에 저장되며 DB의 logo_path가 갱신됩니다. 파일을 고르면 아래에 바로 미리보기됩니다."
                  >
                    <FormInput
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    />
                  </FieldWrapper>
                  <div>
                    <span style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>현재 로고 미리보기</span>
                    <InsurerSiteLogoMark
                      name={form.name.trim() || '보험사'}
                      logoPath={form.logoPath}
                      overrideSrc={logoPreviewUrl}
                      variant="preview"
                    />
                  </div>
                </>
              ) : (
                <FieldWrapper label="logo_path (선택)">
                  <FormInput
                    value={form.logoPath}
                    onChange={(e) => setForm((f) => ({ ...f, logoPath: e.target.value }))}
                  />
                </FieldWrapper>
              )}
              <FieldWrapper label="정렬 순서">
                <FormInput value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="노출 여부">
                <FormInput
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              </FieldWrapper>
            </div>
            <div className="insurer-site-form-modal__col" aria-labelledby="insurer-modal-col-urls">
              <h3 id="insurer-modal-col-urls" className="insurer-site-form-modal__col-title">
                URL 정보
              </h3>
              <FieldWrapper label="설계사이트 URL" helperText="비우면 일반 화면에서 설계사이트 버튼이 비활성됩니다.">
                <FormInput value={form.salesUrl} onChange={(e) => setForm((f) => ({ ...f, salesUrl: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper
                label="공식홈 URL"
                helperText="비우면 일반 화면에서 비활성. http(s) 없으면 저장 시 https:// 를 붙입니다."
              >
                <FormInput value={form.homepageUrl} onChange={(e) => setForm((f) => ({ ...f, homepageUrl: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="공시실 URL" helperText="비우면 일반 화면에서 공시실 버튼이 준비중 처리됩니다.">
                <FormInput
                  value={form.disclosureUrl}
                  onChange={(e) => setForm((f) => ({ ...f, disclosureUrl: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="보상홈 URL" helperText="비우면 일반 화면에서 비활성.">
                <FormInput value={form.claimUrl} onChange={(e) => setForm((f) => ({ ...f, claimUrl: e.target.value }))} />
              </FieldWrapper>
            </div>
          </div>
        </div>
        <footer className="insurer-site-form-modal__footer">
          <FormButton htmlType="button" variant="secondary" onClick={() => void requestClose()} disabled={saving}>
            취소
          </FormButton>
          <FormButton htmlType="button" variant="primary" onClick={() => void save()} disabled={saving}>
            저장
          </FormButton>
        </footer>
      </Modal>
    </main>
  )
}
