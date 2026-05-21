import { useCallback, useEffect, useMemo, useState } from 'react'
import { FormDialog, useConfirmDialog } from '../../../../components/dialog'
import { EmptyState, LoadingState, StatusMessage } from '../../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormSelect, FormTextarea } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import {
  archiveGovernmentResource,
  fetchGovernmentResources,
  presignGovernmentResource,
  saveGovernmentResource,
  updateGovernmentResource,
  downloadGovernmentResource,
  type GovernmentResourceRow,
} from '../../api/governmentOperationsApi'
import { fetchGovAgencies } from '../../api/governmentProfilesApi'
import {
  GOVERNMENT_RESOURCE_CATEGORIES,
  GOVERNMENT_RESOURCE_STATUSES,
  GOVERNMENT_SCOPE_OPTIONS,
  formatFileSize,
  formatOpsDate,
  labelForResourceCategory,
  labelForStatus,
} from '../../constants/governmentOperations'
import { useGovernmentAccess } from '../../hooks/useGovernmentAccess'
import { canManageGovernmentNotices } from '../../lib/governmentHome'
import GovernmentAdminPageShell from '../../components/GovernmentAdminPageShell'
import type { GovAgencyRow } from '../../types/governmentProfile.types'

type ResourceForm = {
  title: string
  description: string
  category: string
  status: string
  scopeType: string
  tenantId: string
  file: File | null
}

const EMPTY_FORM: ResourceForm = {
  title: '',
  description: '',
  category: 'form',
  status: 'draft',
  scopeType: 'agency',
  tenantId: '',
  file: null,
}

export default function GovernmentAdminResourcesPage() {
  const { token } = useAuth()
  const { summary } = useGovernmentAccess(token)
  const { confirm, confirmDialog } = useConfirmDialog()
  const canGlobal = Boolean(summary?.isSuperAdmin || summary?.isGovernmentIndustryAdmin)
  const defaultTenantId =
    summary?.governmentAgencyAdminTenantIds[0] ??
    summary?.governmentStaffTenantIds[0] ??
    ''

  const [agencies, setAgencies] = useState<GovAgencyRow[]>([])
  const [rows, setRows] = useState<GovernmentResourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterQ, setFilterQ] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<GovernmentResourceRow | null>(null)
  const [form, setForm] = useState<ResourceForm>({ ...EMPTY_FORM, tenantId: defaultTenantId })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const agencyOptions = useMemo(
    () => agencies.map((a) => ({ value: a.id, label: `${a.name} (${a.agencyCode})` })),
    [agencies],
  )

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setRows(
        await fetchGovernmentResources(token, {
          managerView: true,
          status: filterStatus || undefined,
          category: filterCategory || undefined,
          q: filterQ.trim() || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '자료 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, filterStatus, filterCategory, filterQ])

  useEffect(() => {
    if (!token) return
    void fetchGovAgencies(token).then(setAgencies).catch(() => setAgencies([]))
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (!canManageGovernmentNotices(summary)) {
    return (
      <GovernmentAdminPageShell title="접근할 수 없습니다" description="자료실/서식함은 대행사 운영 계정만 이용할 수 있습니다.">
        <EmptyState message="권한이 없습니다." />
      </GovernmentAdminPageShell>
    )
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, tenantId: defaultTenantId })
    setFormError(null)
    setEditorOpen(true)
  }

  const openEdit = (row: GovernmentResourceRow) => {
    setEditing(row)
    setForm({
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      scopeType: row.scopeType,
      tenantId: row.tenantId ?? defaultTenantId,
      file: null,
    })
    setFormError(null)
    setEditorOpen(true)
  }

  const submit = async () => {
    if (!token) return
    setSaving(true)
    setFormError(null)
    try {
      const meta = {
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        status: form.status,
        scopeType: form.scopeType,
        tenantId: form.scopeType === 'global' ? null : form.tenantId,
      }
      if (editing && !form.file) {
        await updateGovernmentResource(token, editing.id, meta)
      } else {
        if (!form.file && !editing) {
          setFormError('파일을 선택하세요.')
          return
        }
        const presign = await presignGovernmentResource(token, {
          ...meta,
          fileName: form.file!.name,
          contentType: form.file!.type || 'application/octet-stream',
          sizeBytes: form.file!.size,
          resourceId: editing?.id,
        })
        await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': form.file!.type || 'application/octet-stream',
            ...presign.putHeaders,
          },
          body: form.file!,
        })
        await saveGovernmentResource(token, {
          ...meta,
          resourceId: presign.resourceId,
          fileKey: presign.objectKey,
          fileName: form.file!.name,
          fileSize: form.file!.size,
          mimeType: form.file!.type || 'application/octet-stream',
        })
      }
      setEditorOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (row: GovernmentResourceRow) => {
    if (!token) return
    const ok = await confirm({
      title: '자료 보관',
      message: `「${row.title}」 자료를 보관 처리하시겠습니까?`,
      tone: 'danger',
    })
    if (!ok) return
    await archiveGovernmentResource(token, row.id)
    await load()
  }

  return (
    <GovernmentAdminPageShell
      title="자료실/서식함"
      description="신청 서식·안내문 등 대행사 이용자용 자료를 관리합니다."
      toolbar={
        <>
          <FormButton htmlType="button" variant="primary" className="button button--primary" onClick={openCreate}>
            자료 등록
          </FormButton>
          <FieldWrapper label="검색">
            <FormInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="제목·설명" />
          </FieldWrapper>
          <FieldWrapper label="카테고리">
            <FormSelect
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              options={[{ value: '', label: '전체' }, ...GOVERNMENT_RESOURCE_CATEGORIES]}
            />
          </FieldWrapper>
          <FieldWrapper label="상태">
            <FormSelect
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[{ value: '', label: '전체' }, ...GOVERNMENT_RESOURCE_STATUSES]}
            />
          </FieldWrapper>
        </>
      }
    >
      {error ? <StatusMessage message={error} tone="error" className="m-0 mb-3" /> : null}
      {loading ? <LoadingState message="불러오는 중…" /> : null}
      {!loading && rows.length === 0 ? <EmptyState message="등록된 자료가 없습니다." /> : null}

      {!loading && rows.length > 0 ? (
        <div className="table-container table-container--desktop">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>카테고리</th>
                <th>파일</th>
                <th>상태</th>
                <th>등록일</th>
                <th className="admin-table-cell--actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{labelForResourceCategory(row.category)}</td>
                  <td>
                    {row.fileName} ({formatFileSize(row.fileSize)})
                  </td>
                  <td>{labelForStatus(row.status)}</td>
                  <td>{formatOpsDate(row.publishedAt ?? row.createdAt)}</td>
                  <td className="admin-table-cell--actions">
                    <div className="admin-table-actions">
                      {row.status === 'published' ? (
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          className="button button--secondary"
                          onClick={() => void downloadGovernmentResource(token!, row.id)}
                        >
                          다운로드
                        </FormButton>
                      ) : null}
                      <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => openEdit(row)}>
                        수정
                      </FormButton>
                      {row.status !== 'archived' ? (
                        <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void handleArchive(row)}>
                          보관
                        </FormButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <FormDialog
        open={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        title={editing ? '자료 수정' : '자료 등록'}
        closeOnBackdrop={false}
        closeOnEsc={!saving}
        panelPreset="largeForm"
      >
        <StatusMessage message={formError} tone="error" className="m-0 mb-3" />
        <div className="government-ops-form-grid">
          <FieldWrapper label="제목">
            <FormInput value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FieldWrapper>
          <FieldWrapper label="카테고리">
            <FormSelect
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              options={[...GOVERNMENT_RESOURCE_CATEGORIES]}
            />
          </FieldWrapper>
          <FieldWrapper label="상태">
            <FormSelect
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              options={[...GOVERNMENT_RESOURCE_STATUSES]}
            />
          </FieldWrapper>
          {canGlobal ? (
            <FieldWrapper label="노출 범위">
              <FormSelect
                value={form.scopeType}
                onChange={(e) => setForm((f) => ({ ...f, scopeType: e.target.value }))}
                options={[...GOVERNMENT_SCOPE_OPTIONS]}
              />
            </FieldWrapper>
          ) : null}
          {form.scopeType === 'agency' ? (
            <FieldWrapper label="대행사">
              <FormSelect
                value={form.tenantId}
                onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                options={agencyOptions}
              />
            </FieldWrapper>
          ) : null}
          <FieldWrapper label="파일" className="government-ops-form-grid__full">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.zip,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
            />
            {editing?.fileName ? (
              <p className="government-page__muted">현재 파일: {editing.fileName}</p>
            ) : null}
          </FieldWrapper>
          <FieldWrapper label="설명" className="government-ops-form-grid__full">
            <FormTextarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
            />
          </FieldWrapper>
        </div>
        <div className="government-admin-users-page__dialog-actions">
          <FormButton htmlType="button" variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
            취소
          </FormButton>
          <FormButton htmlType="button" variant="primary" onClick={() => void submit()} disabled={saving}>
            저장
          </FormButton>
        </div>
      </FormDialog>
      {confirmDialog}
    </GovernmentAdminPageShell>
  )
}
