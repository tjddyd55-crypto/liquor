import { useCallback, useEffect, useState } from 'react'
import { useConfirmDialog } from '../../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../../components/form'
import { useMediaQuery } from '../../../../hooks/useMediaQuery'
import { ApiError } from '../../../../lib/apiClient'
import type { ContractTemplateDetail, ContractTemplateListItem } from '../contractSignatureTestConsoleClient'
import {
  createConfirmationOnlyContractTemplate,
  deleteContractTemplate,
  duplicateContractTemplate,
  fetchContractTemplateDetail,
  patchContractTemplate,
  patchContractTemplateFieldInputSettings,
  setContractTemplateStatus,
} from '../contractSignatureTestConsoleClient'
import { ContractTemplateConfirmationFieldsSection } from './ContractTemplateConfirmationFieldsSection'

type FieldSettingDraft = {
  fieldKey: string
  inputRole: 'customer' | 'sender' | 'fixed'
  fixedValue: string
}

const CONTRACT_FIELD_ROLE_OPTIONS: Array<{ value: FieldSettingDraft['inputRole']; label: string }> = [
  { value: 'customer', label: '고객 입력' },
  { value: 'sender', label: '발송자 입력' },
  { value: 'fixed', label: '고정 출력' },
]

type Props = {
  token: string
  role: string | undefined
  tenantGaId: number | null
  pdfTemplateId: number | null
  pdfTitle: string | null
  pdfSignatureCountByPdfId: ReadonlyMap<number, number>
  templates: ContractTemplateListItem[]
  busy: boolean
  error: string | null
  onBusy: (v: boolean) => void
  onError: (msg: string | null) => void
  onReload: () => Promise<void>
  onCreateTemplate: () => Promise<void>
  onClearPdfFilter: () => void
}

type ModalKind = 'detail' | 'edit' | 'status' | null

const MSG_DELETE_BLOCKED_HISTORY = '이미 발송 이력이 있어 삭제할 수 없습니다. 사용중지로 변경하세요.'
const MSG_DELETE_BLOCKED_PACKAGE =
  '패키지에 포함된 템플릿은 삭제할 수 없습니다. 패키지에서 제거한 뒤 다시 시도하세요.'

function templateDeleteEligibility(trow: ContractTemplateListItem): { canDelete: boolean; blockReason: string | null } {
  if (trow.documentInstanceCount >= 1) {
    return { canDelete: false, blockReason: MSG_DELETE_BLOCKED_HISTORY }
  }
  if (trow.packageItemCount >= 1) {
    return { canDelete: false, blockReason: MSG_DELETE_BLOCKED_PACKAGE }
  }
  return { canDelete: true, blockReason: null }
}

function formatTemplateIdShort(id: string): string {
  const s = String(id ?? '')
  if (s.length <= 16) {
    return s
  }
  return `${s.slice(0, 12)}…`
}

function statusLabelShort(status: string): string {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'active':
      return 'active'
    case 'archived':
      return 'archived'
    default:
      return status
  }
}

function statusDescription(status: string): string {
  switch (status) {
    case 'draft':
      return '아직 발송 불가'
    case 'active':
      return '발송 가능'
    case 'archived':
      return '사용 중지'
    default:
      return ''
  }
}

function statusLineForCard(status: string): string {
  return `${statusLabelShort(status)} · ${statusDescription(status)}`
}

function resolveTemplateMode(t: { templateMode?: string }): ContractTemplateMode {
  return t.templateMode === 'confirmation_only' ? 'confirmation_only' : 'coordinate_pdf'
}

function templateModeShortLabel(mode: ContractTemplateMode): string {
  return mode === 'confirmation_only' ? '확인서(무좌표)' : 'PDF 좌표형'
}

function formatUpdatedAt(iso: string | undefined): string {
  if (!iso || String(iso).trim() === '') {
    return '—'
  }
  return String(iso).slice(0, 19).replace('T', ' ')
}

function normalizeIncomingRole(raw: string | undefined): FieldSettingDraft['inputRole'] {
  const k = String(raw ?? '').trim().toLowerCase()
  if (k === 'sender' || k === 'fixed') {
    return k
  }
  if (k === 'disabled') {
    return 'fixed'
  }
  return 'customer'
}

function pdfFieldTypeLabel(fieldType: string): string {
  switch (fieldType) {
    case 'text':
      return '텍스트'
    case 'textarea':
      return '텍스트영역'
    case 'checkbox':
      return '체크박스'
    case 'radio':
      return '라디오'
    case 'signature':
      return '손사인'
    default:
      return fieldType
  }
}

export function ContractTemplatePanel({
  token,
  role,
  tenantGaId,
  pdfTemplateId,
  pdfTitle,
  pdfSignatureCountByPdfId,
  templates,
  busy,
  error,
  onBusy,
  onError,
  onReload,
  onCreateTemplate,
  onClearPdfFilter,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const isAdminMobile = useMediaQuery('(max-width: 768px)')
  const [modal, setModal] = useState<{ kind: ModalKind; templateId: string } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<ContractTemplateDetail | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [fieldSettingsDraft, setFieldSettingsDraft] = useState<FieldSettingDraft[]>([])
  const [statusDraft, setStatusDraft] = useState<'draft' | 'active' | 'archived'>('draft')
  const [confirmOnlyCreateOpen, setConfirmOnlyCreateOpen] = useState(false)
  const [confirmOnlyTitle, setConfirmOnlyTitle] = useState('')

  const runOp = useCallback(
    async (fn: () => Promise<void>) => {
      onError(null)
      onBusy(true)
      try {
        await fn()
        await onReload()
      } catch (e) {
        onError(e instanceof ApiError ? e.message : '요청 처리에 실패했습니다.')
      } finally {
        onBusy(false)
      }
    },
    [onBusy, onError, onReload],
  )

  useEffect(() => {
    if (!modal || (modal.kind !== 'detail' && modal.kind !== 'edit')) {
      setDetail(null)
      setFieldSettingsDraft([])
      return
    }
    let cancelled = false
    const id = modal.templateId
    setDetailLoading(true)
    setDetail(null)
    void (async () => {
      try {
        const d = await fetchContractTemplateDetail(token, role, id, tenantGaId)
        if (!cancelled) {
          setDetail(d)
        }
      } catch (e) {
        if (!cancelled) {
          onError(e instanceof ApiError ? e.message : '상세를 불러오지 못했습니다.')
          setModal(null)
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modal, token, role, tenantGaId, onError])

  useEffect(() => {
    if (modal?.kind !== 'edit' || !detail || detail.id !== modal.templateId) {
      return
    }
    setFieldSettingsDraft(
      detail.fieldInputSettings.map((r) => {
        const role: FieldSettingDraft['inputRole'] =
          r.fieldType === 'signature' ? 'customer' : normalizeIncomingRole(r.inputRole)
        return {
          fieldKey: r.fieldKey,
          inputRole: role,
          fixedValue: role === 'fixed' ? String(r.fixedValue ?? '') : '',
        }
      }),
    )
  }, [detail, modal])

  const openEdit = (row: ContractTemplateListItem) => {
    setEditTitle(row.title)
    setEditDescription(row.description ?? '')
    setModal({ kind: 'edit', templateId: row.id })
  }

  const openStatus = (row: ContractTemplateListItem) => {
    const s = row.status
    if (s === 'draft' || s === 'active' || s === 'archived') {
      setStatusDraft(s)
    } else {
      setStatusDraft('draft')
    }
    setModal({ kind: 'status', templateId: row.id })
  }

  const closeModal = () => setModal(null)

  return (
    <>
      {confirmDialog}
      {error ? (
        <div className="contract-signature-console__inline-error" role="alert">
          {error}
        </div>
      ) : null}
      <p className="contract-signature-console__body-text" style={{ marginTop: 0, marginBottom: '0.65rem' }}>
        전자서명 발송용 계약서 템플릿 목록입니다. 각 행의 동작 버튼으로 상세 확인, 수정, 상태 변경을 할 수 있습니다.
      </p>
      <div className="contract-signature-console__filter-row">
        {pdfTemplateId != null ? (
          <>
            <span className="contract-signature-console__body-text">
              현재 &lsquo;{pdfTitle?.trim() ? pdfTitle : `PDF #${pdfTemplateId}`}&rsquo; PDF 기반 템플릿만 표시 중입니다.
            </span>
            <FormButton
              htmlType="button"
              variant="secondary"
              size="sm"
              className="contract-signature-console__filter-btn"
              disabled={busy}
              onClick={() => onClearPdfFilter()}
            >
              필터 해제
            </FormButton>
          </>
        ) : (
          <span className="contract-signature-console__body-text">전체 전자서명 템플릿을 표시 중입니다.</span>
        )}
      </div>

      {pdfTemplateId != null &&
      (pdfSignatureCountByPdfId.get(pdfTemplateId) ?? 0) < 1 &&
      templates.some(
        (t) => resolveTemplateMode(t) === 'coordinate_pdf' && t.pdfTemplateId === pdfTemplateId,
      ) ? (
        <div className="contract-signature-console__alert--danger" role="alert" style={{ marginBottom: 10 }}>
          이 PDF에는 서명(signature) 필드가 없습니다. 전자서명 절차에서 고객 서명 단계가 제한되거나 진행 불가할 수 있습니다. PDF
          좌표 편집기에서 손사인 필드를 추가해 주세요.
        </div>
      ) : null}

      <div
        className="contract-signature-console__toolbar"
        style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
      >
        <FormButton
          htmlType="button"
          variant="primary"
          size="sm"
          disabled={busy || pdfTemplateId == null}
          title={pdfTemplateId == null ? '먼저 원본 PDF 템플릿을 선택하세요.' : undefined}
          onClick={() => void runOp(onCreateTemplate)}
        >
          선택한 PDF로 템플릿 만들기
        </FormButton>
        <FormButton
          htmlType="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setConfirmOnlyTitle('')
            setConfirmOnlyCreateOpen(true)
          }}
        >
          무좌표 확인서 템플릿 추가
        </FormButton>
      </div>
      <p className="contract-signature-console__hint" style={{ margin: '0 0 10px', fontSize: 12 }}>
        무좌표 확인서 템플릿은 PDF와 연결되지 않습니다. 목록에서 보려면 1번 영역에서 「PDF 선택 해제」로 전체 목록을 표시하세요.
      </p>

      <ul
        className={
          'contract-signature-console__hint' +
          (isAdminMobile ? ' contract-signature-console__template-legend' : '')
        }
        style={isAdminMobile ? { margin: '0 0 10px', fontSize: 12 } : { margin: '0 0 10px', paddingLeft: 18, fontSize: 12 }}
      >
        <li>
          <strong>draft</strong>: 아직 발송 불가
        </li>
        <li>
          <strong>active</strong>: 발송 가능
        </li>
        <li>
          <strong>archived</strong>: 사용 중지
        </li>
      </ul>

      {isAdminMobile ? (
        <div className="contract-signature-console__template-cards">
          {templates.length === 0 ? (
            <p className="contract-signature-console__empty-state-text" style={{ padding: '0.75rem 0' }}>
              표시할 템플릿이 없습니다. PDF 좌표형은 1번에서 PDF 선택 후 만들기, 무좌표 확인서는 「무좌표 확인서 템플릿 추가」로 만든 뒤 PDF
              필터를 해제하면 목록에 표시됩니다.
            </p>
          ) : (
            templates.map((trow) => {
              const tMode = resolveTemplateMode(trow)
              const pid = trow.pdfTemplateId
              const sigN = pid != null ? (pdfSignatureCountByPdfId.get(pid) ?? 0) : 0
              const noSig = tMode === 'coordinate_pdf' && pid != null && sigN < 1
              const { canDelete, blockReason } = templateDeleteEligibility(trow)
              const deleteTitle = canDelete ? '템플릿 영구 삭제' : (blockReason ?? '삭제할 수 없습니다.')
              return (
                <article key={trow.id} className="contract-signature-console__template-card">
                  <h3 className="contract-signature-console__template-card-title">{trow.title}</h3>
                  <div className="contract-signature-console__template-card-meta">
                    <span className="contract-signature-console__template-card-label">상태</span>
                    <span className="contract-signature-console__status-badge" title={statusDescription(trow.status)}>
                      {statusLineForCard(trow.status)}
                    </span>
                  </div>
                  <div className="contract-signature-console__template-card-meta">
                    <span className="contract-signature-console__template-card-label">모드</span>
                    <span className="contract-signature-console__template-card-value">{templateModeShortLabel(tMode)}</span>
                  </div>
                  <div className="contract-signature-console__template-card-meta">
                    <span className="contract-signature-console__template-card-label">PDF</span>
                    <span className="contract-signature-console__template-card-value">
                      {tMode === 'confirmation_only' ? (
                        <span className="contract-signature-console__muted">— (무좌표)</span>
                      ) : pid == null ? (
                        <span className="contract-signature-console__muted">—</span>
                      ) : (
                        <>
                          {trow.pdfEngineTitle ?? `PDF #${pid}`}
                          {noSig ? (
                            <div className="contract-signature-console__hint--warning" style={{ marginTop: 6 }}>
                              서명(signature) 필드 없음 — 발송 단계에서 제한될 수 있습니다.
                            </div>
                          ) : null}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="contract-signature-console__template-card-meta">
                    <span className="contract-signature-console__template-card-label">ID</span>
                    <code className="contract-signature-console__template-card-code">{formatTemplateIdShort(trow.id)}</code>
                  </div>
                  <div className="contract-signature-console__template-card-meta">
                    <span className="contract-signature-console__template-card-label">수정일</span>
                    <span>{formatUpdatedAt(trow.updatedAt)}</span>
                  </div>
                  <div className="contract-signature-console__template-card-actions">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      className="contract-signature-console__template-card-btn"
                      disabled={busy}
                      onClick={() => setModal({ kind: 'detail', templateId: trow.id })}
                    >
                      상세
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      className="contract-signature-console__template-card-btn"
                      disabled={busy}
                      onClick={() => openEdit(trow)}
                    >
                      수정
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      className="contract-signature-console__template-card-btn"
                      disabled={busy}
                      onClick={() => openStatus(trow)}
                    >
                      상태변경
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      className="contract-signature-console__template-card-btn"
                      disabled={busy}
                      onClick={() =>
                        void runOp(async () => {
                          await duplicateContractTemplate(token, role, trow.id, tenantGaId)
                        })
                      }
                    >
                      복제
                    </FormButton>
                    {trow.status !== 'archived' ? (
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        size="sm"
                        className="contract-signature-console__template-card-btn contract-signature-console__template-card-btn--span2"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            const ok = await confirm({
                              message: '이 템플릿을 사용중지(archived)로 변경할까요?',
                              confirmLabel: '사용중지',
                              cancelLabel: '취소',
                            })
                            if (!ok) {
                              return
                            }
                            await runOp(async () => {
                              await setContractTemplateStatus(token, role, trow.id, 'archived', tenantGaId)
                            })
                          })()
                        }
                      >
                        사용중지
                      </FormButton>
                    ) : null}
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      className="contract-signature-console__template-card-btn contract-signature-console__template-card-btn--span2"
                      disabled={busy || !canDelete}
                      title={deleteTitle}
                      aria-describedby={!canDelete && blockReason ? `tpl-del-hint-${trow.id}` : undefined}
                      onClick={() =>
                        void (async () => {
                          if (!canDelete) {
                            return
                          }
                          const ok = await confirm({
                            message:
                              '이 전자서명 템플릿을 삭제하시겠습니까? 발송 이력이 없는 템플릿만 삭제할 수 있습니다.',
                            confirmLabel: '삭제',
                            cancelLabel: '취소',
                            tone: 'danger',
                          })
                          if (!ok) {
                            return
                          }
                          await runOp(async () => {
                            await deleteContractTemplate(token, role, trow.id, tenantGaId)
                          })
                        })()
                      }
                    >
                      삭제
                    </FormButton>
                  </div>
                  {!canDelete && blockReason ? (
                    <p id={`tpl-del-hint-${trow.id}`} className="contract-signature-console__template-card-delete-hint">
                      {blockReason}
                    </p>
                  ) : null}
                </article>
              )
            })
          )}
        </div>
      ) : (
        <div className="contract-signature-console__template-table-wrap">
          <table className="contract-signature-console__template-table pdf-engine-table">
            <colgroup>
              <col className="contract-signature-console__col-title" />
              <col className="contract-signature-console__col-status" />
              <col className="contract-signature-console__col-mode" />
              <col className="contract-signature-console__col-pdf" />
              <col className="contract-signature-console__col-id" />
              <col className="contract-signature-console__col-date" />
              <col className="contract-signature-console__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">제목</th>
                <th scope="col">상태</th>
                <th scope="col">모드</th>
                <th scope="col">연결 PDF</th>
                <th scope="col">계약 템플릿 ID</th>
                <th scope="col">수정일</th>
                <th scope="col">동작</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="contract-signature-console__empty-state-text" style={{ padding: '1rem' }}>
                    표시할 템플릿이 없습니다. PDF 좌표형은 1번에서 PDF 선택 후 만들기, 무좌표 확인서는 「무좌표 확인서 템플릿 추가」로 만든 뒤 PDF
                    필터를 해제하면 목록에 표시됩니다.
                  </td>
                </tr>
              ) : (
                templates.map((trow) => {
                  const tMode = resolveTemplateMode(trow)
                  const pid = trow.pdfTemplateId
                  const sigN = pid != null ? (pdfSignatureCountByPdfId.get(pid) ?? 0) : 0
                  const noSig = tMode === 'coordinate_pdf' && pid != null && sigN < 1
                  const { canDelete, blockReason } = templateDeleteEligibility(trow)
                  const deleteTitle = canDelete ? '템플릿 영구 삭제' : (blockReason ?? '삭제할 수 없습니다.')
                  return (
                    <tr key={trow.id} className="contract-signature-console__template-row">
                      <td>{trow.title}</td>
                      <td>
                        <span className="contract-signature-console__status-badge" title={statusDescription(trow.status)}>
                          {statusLabelShort(trow.status)}
                        </span>
                        <div className="contract-signature-console__hint--flush" style={{ marginTop: 4 }}>
                          {statusDescription(trow.status)}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{templateModeShortLabel(tMode)}</td>
                      <td>
                        {tMode === 'confirmation_only' ? (
                          <span className="contract-signature-console__muted">—</span>
                        ) : pid == null ? (
                          <span className="contract-signature-console__muted">—</span>
                        ) : (
                          <>
                            <span>{trow.pdfEngineTitle ?? `PDF #${pid}`}</span>
                            {noSig ? (
                              <div className="contract-signature-console__hint--warning" style={{ marginTop: 4 }}>
                                signature 필드 없음
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{trow.id}</code>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatUpdatedAt(trow.updatedAt)}</td>
                      <td>
                        <div className="contract-signature-console__template-actions">
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => setModal({ kind: 'detail', templateId: trow.id })}
                          >
                            상세
                          </FormButton>
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => openEdit(trow)}
                          >
                            수정
                          </FormButton>
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => openStatus(trow)}
                          >
                            상태변경
                          </FormButton>
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void runOp(async () => {
                                await duplicateContractTemplate(token, role, trow.id, tenantGaId)
                              })
                            }
                          >
                            복제
                          </FormButton>
                          {trow.status !== 'archived' ? (
                            <FormButton
                              htmlType="button"
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              title="보관(archived)로 전환하면 발송 목록에서 쓰지 않을 수 있습니다."
                              onClick={() =>
                                void (async () => {
                                  const ok = await confirm({
                                    message: '이 템플릿을 사용중지(archived)로 변경할까요?',
                                    confirmLabel: '사용중지',
                                    cancelLabel: '취소',
                                  })
                                  if (!ok) {
                                    return
                                  }
                                  await runOp(async () => {
                                    await setContractTemplateStatus(token, role, trow.id, 'archived', tenantGaId)
                                  })
                                })()
                              }
                            >
                              사용중지
                            </FormButton>
                          ) : null}
                          <FormButton
                            htmlType="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy || !canDelete}
                            title={deleteTitle}
                            aria-describedby={!canDelete && blockReason ? `tpl-del-dt-${trow.id}` : undefined}
                            onClick={() =>
                              void (async () => {
                                if (!canDelete) {
                                  return
                                }
                                const ok = await confirm({
                                  message:
                                    '이 전자서명 템플릿을 삭제하시겠습니까? 발송 이력이 없는 템플릿만 삭제할 수 있습니다.',
                                  confirmLabel: '삭제',
                                  cancelLabel: '취소',
                                  tone: 'danger',
                                })
                                if (!ok) {
                                  return
                                }
                                await runOp(async () => {
                                  await deleteContractTemplate(token, role, trow.id, tenantGaId)
                                })
                              })()
                            }
                          >
                            삭제
                          </FormButton>
                        </div>
                        {!canDelete && blockReason ? (
                          <p id={`tpl-del-dt-${trow.id}`} className="contract-signature-console__inline-warning" style={{ marginTop: 8 }}>
                            {blockReason}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === 'detail' ? (
        <div
          className="contract-signature-console__detail-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal()
            }
          }}
        >
          <div className="contract-signature-console__detail-dialog" role="dialog" aria-modal="true" aria-label="템플릿 상세">
            <h3 className="contract-signature-console__subsection-title" style={{ marginTop: 0 }}>
              전자서명 템플릿 상세
            </h3>
            {detailLoading ? (
              <p className="contract-signature-console__body-text">불러오는 중…</p>
            ) : detail ? (
              <dl className="contract-signature-console__detail-dl">
                <dt>템플릿 모드</dt>
                <dd>{templateModeShortLabel(resolveTemplateMode(detail))}</dd>
                <dt>제목</dt>
                <dd>{detail.title}</dd>
                <dt>상태</dt>
                <dd>
                  {statusLabelShort(detail.status)} — {statusDescription(detail.status)}
                </dd>
                <dt>계약 템플릿 ID</dt>
                <dd>
                  <code>{detail.id}</code>
                </dd>
                <dt>연결 PDF</dt>
                <dd>
                  {detail.pdfEngine?.title ?? (detail.pdfTemplateId != null ? `PDF #${detail.pdfTemplateId}` : '—')}
                </dd>
                <dt>필드 수(계약 템플릿 필드)</dt>
                <dd>{detail.contractTemplateFieldsCount}</dd>
                <dt>설명</dt>
                <dd>{detail.description?.trim() ? detail.description : '—'}</dd>
                <dt>수정일</dt>
                <dd>{formatUpdatedAt(detail.updatedAt)}</dd>
              </dl>
            ) : (
              <p className="contract-signature-console__body-text">표시할 데이터가 없습니다.</p>
            )}
            <div className="contract-signature-console__detail-actions">
              <FormButton htmlType="button" variant="secondary" size="sm" onClick={closeModal}>
                닫기
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.kind === 'edit' ? (
        <div
          className="contract-signature-console__detail-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal()
            }
          }}
        >
          <div
            className="contract-signature-console__detail-dialog"
            style={{ maxHeight: '92vh', overflowY: 'auto' }}
            role="dialog"
            aria-modal="true"
            aria-label="템플릿 수정"
          >
            <h3 className="contract-signature-console__subsection-title" style={{ marginTop: 0 }}>
              전자서명 템플릿 수정
            </h3>
            <p className="contract-signature-console__body-text" style={{ marginBottom: 12 }}>
              {detail && resolveTemplateMode(detail) === 'confirmation_only'
                ? '무좌표 전자확인서 템플릿입니다. 확인서에 표시할 동적 항목만 편집합니다. PDF 좌표 필드는 사용하지 않습니다.'
                : '선택한 PDF 템플릿의 필드별 입력 방식을 설정합니다. 고객 입력은 고객이 작성하고, 발송자 입력은 발송자가 보내기 전에 작성하며, 고정 출력은 모든 발송 건에 동일하게 출력됩니다.'}
            </p>
            <div style={{ marginBottom: 10 }}>
              <div className="contract-signature-console__body-text" style={{ marginBottom: 6 }}>
                템플릿 제목
              </div>
              <FormInput value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={busy} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="contract-signature-console__body-text" style={{ marginBottom: 6 }}>
                설명
              </div>
              <FormTextarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} disabled={busy} rows={4} />
            </div>
            {detailLoading ? (
              <p className="contract-signature-console__body-text">불러오는 중…</p>
            ) : detail ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div className="contract-signature-console__body-text" style={{ marginBottom: 6 }}>
                    템플릿 모드(변경 불가)
                  </div>
                  <FormInput value={templateModeShortLabel(resolveTemplateMode(detail))} readOnly disabled />
                </div>
                {resolveTemplateMode(detail) === 'confirmation_only' ? (
                  <ContractTemplateConfirmationFieldsSection
                    token={token}
                    role={role}
                    tenantGaId={tenantGaId}
                    templateId={detail.id}
                    disabled={busy}
                    onError={onError}
                  />
                ) : (
                  <>
                <div style={{ marginBottom: 10 }}>
                  <div className="contract-signature-console__body-text" style={{ marginBottom: 6 }}>
                    연결 PDF 템플릿
                  </div>
                  <FormInput
                    value={detail.pdfEngine?.title ?? (detail.pdfTemplateId != null ? `PDF #${detail.pdfTemplateId}` : '—')}
                    readOnly
                    disabled={busy}
                  />
                </div>
                <h4 className="contract-signature-console__subsection-title" style={{ fontSize: '1rem', marginTop: 16 }}>
                  필드 입력 방식 설정
                </h4>
                <ul className="contract-signature-console__hint" style={{ fontSize: 12, margin: '0 0 8px', paddingLeft: 18 }}>
                  <li>
                    <strong>고객 입력</strong>: 고객이 전자서명 화면에서 직접 입력합니다.
                  </li>
                  <li>
                    <strong>발송자 입력</strong>: 발송자가 고객에게 보내기 전에 입력하며, 고객은 수정할 수 없습니다.
                  </li>
                  <li>
                    <strong>고정 출력</strong>: 모든 발송 건에 동일하게 출력되는 값입니다.
                  </li>
                </ul>
                <p className="contract-signature-console__hint" style={{ marginBottom: 8 }}>
                  손사인 필드는 고객 입력으로 고정됩니다.
                </p>
                <p className="contract-signature-console__hint" style={{ marginBottom: 8 }}>
                  고정 출력 값은 모든 고객에게 동일하게 문서에 반영됩니다. 발송자 입력 값은 유저/FC가 전자서명을 발송할 때
                  입력합니다. 고객 입력 값은 고객이 전자서명 링크에서 직접 입력합니다.
                </p>
                {detail.pdfTemplateId == null ? (
                  <p className="contract-signature-console__inline-warning">연결된 PDF가 없어 필드 입력 방식을 설정할 수 없습니다.</p>
                ) : fieldSettingsDraft.length === 0 ? (
                  <p className="contract-signature-console__hint">연결 PDF에 좌표 필드가 없습니다.</p>
                ) : (
                  <div className="contract-signature-console__scroll-x" style={{ marginBottom: 12 }}>
                    <table className="pdf-engine-table contract-signature-console__template-table">
                      <thead>
                        <tr>
                          <th>필드명</th>
                          <th>타입</th>
                          <th>필수</th>
                          <th>입력 방식</th>
                          <th>고정 출력값</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldSettingsDraft.map((row) => {
                          const meta = detail.fieldInputSettings.find((x) => x.fieldKey === row.fieldKey)
                          const isSig = meta?.fieldType === 'signature'
                          return (
                            <tr key={row.fieldKey}>
                              <td>{meta?.label ?? row.fieldKey}</td>
                              <td>{pdfFieldTypeLabel(meta?.fieldType ?? '')}</td>
                              <td>{meta?.required ? 'Y' : '—'}</td>
                              <td style={{ minWidth: 180 }}>
                                {isSig ? (
                                  <div>
                                    <span className="contract-signature-console__body-text">고객 입력</span>
                                    <p className="contract-signature-console__hint" style={{ marginTop: 4, marginBottom: 0 }}>
                                      손사인 필드는 고객이 직접 입력합니다.
                                    </p>
                                  </div>
                                ) : (
                                  <FormSelect
                                    value={row.inputRole}
                                    disabled={busy}
                                    options={CONTRACT_FIELD_ROLE_OPTIONS}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      if (v !== 'customer' && v !== 'sender' && v !== 'fixed') {
                                        return
                                      }
                                      setFieldSettingsDraft((prev) =>
                                        prev.map((r) =>
                                          r.fieldKey === row.fieldKey
                                            ? {
                                                ...r,
                                                inputRole: v,
                                                fixedValue: v === 'fixed' ? r.fixedValue : '',
                                              }
                                            : r,
                                        ),
                                      )
                                    }}
                                  />
                                )}
                              </td>
                              <td style={{ minWidth: 160 }}>
                                {!isSig && row.inputRole === 'fixed' ? (
                                  <FormInput
                                    value={row.fixedValue}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setFieldSettingsDraft((prev) =>
                                        prev.map((r) =>
                                          r.fieldKey === row.fieldKey ? { ...r, fixedValue: e.target.value } : r,
                                        ),
                                      )
                                    }
                                    placeholder="고정 출력 내용"
                                  />
                                ) : (
                                  <span className="contract-signature-console__muted">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                  </>
                )}
              </>
            ) : (
              <p className="contract-signature-console__body-text">표시할 데이터가 없습니다.</p>
            )}
            <div className="contract-signature-console__detail-actions">
              <FormButton htmlType="button" variant="secondary" size="sm" disabled={busy} onClick={closeModal}>
                취소
              </FormButton>
              <FormButton
                htmlType="button"
                variant="primary"
                size="sm"
                disabled={busy || detailLoading}
                onClick={() =>
                  void (async () => {
                    const title = editTitle.trim()
                    if (!title) {
                      onError('제목을 입력하세요.')
                      return
                    }
                    await runOp(async () => {
                      await patchContractTemplate(
                        token,
                        role,
                        modal.templateId,
                        { title, description: editDescription || null },
                        tenantGaId,
                      )
                      const d = detail
                      if (
                        d &&
                        resolveTemplateMode(d) === 'coordinate_pdf' &&
                        d.pdfTemplateId != null &&
                        fieldSettingsDraft.length > 0
                      ) {
                        const fieldSettings = fieldSettingsDraft.map((row) => {
                          const meta = d.fieldInputSettings.find((x) => x.fieldKey === row.fieldKey)
                          const isSig = meta?.fieldType === 'signature'
                          const inputRole = isSig ? 'customer' : row.inputRole
                          return {
                            fieldKey: row.fieldKey,
                            inputRole,
                            ...(inputRole === 'fixed' ? { fixedValue: row.fixedValue } : { fixedValue: null }),
                          }
                        })
                        await patchContractTemplateFieldInputSettings(
                          token,
                          role,
                          modal.templateId,
                          { fieldSettings },
                          tenantGaId,
                        )
                      }
                      closeModal()
                    })
                  })()
                }
              >
                저장
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.kind === 'status' ? (
        <div
          className="contract-signature-console__detail-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal()
            }
          }}
        >
          <div className="contract-signature-console__detail-dialog" role="dialog" aria-modal="true" aria-label="상태 변경">
            <h3 className="contract-signature-console__subsection-title" style={{ marginTop: 0 }}>
              상태 변경
            </h3>
            <p className="contract-signature-console__footnote" style={{ marginBottom: 8 }}>
              {templates.find((x) => x.id === modal.templateId) &&
              resolveTemplateMode(templates.find((x) => x.id === modal.templateId)!) === 'confirmation_only'
                ? 'active는 확인서 항목이 1개 이상 있어야 하며, archived는 사용 중지입니다.'
                : 'active는 발송 가능, archived는 사용 중지입니다. active(PDF 좌표형)로 두려면 PDF에 좌표 필드가 있어야 합니다.'}
            </p>
            <FormSelect
              value={statusDraft}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'draft' || v === 'active' || v === 'archived') {
                  setStatusDraft(v)
                }
              }}
              options={[
                { value: 'draft', label: 'draft (아직 발송 불가)' },
                { value: 'active', label: 'active (발송 가능)' },
                { value: 'archived', label: 'archived (사용 중지)' },
              ]}
            />
            <div className="contract-signature-console__detail-actions">
              <FormButton htmlType="button" variant="secondary" size="sm" disabled={busy} onClick={closeModal}>
                취소
              </FormButton>
              <FormButton
                htmlType="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runOp(async () => {
                    await setContractTemplateStatus(token, role, modal.templateId, statusDraft, tenantGaId)
                    closeModal()
                  })
                }
              >
                적용
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOnlyCreateOpen ? (
        <div
          className="contract-signature-console__detail-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmOnlyCreateOpen(false)
            }
          }}
        >
          <div
            className="contract-signature-console__detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="무좌표 확인서 템플릿 추가"
            style={{ maxWidth: 480 }}
          >
            <h3 className="contract-signature-console__subsection-title" style={{ marginTop: 0 }}>
              무좌표 확인서 템플릿 추가
            </h3>
            <p className="contract-signature-console__body-text" style={{ marginBottom: 12 }}>
              PDF 없이 초안(draft)으로 만듭니다. 목록에서는 PDF 필터를 해제해야 보일 수 있습니다.
            </p>
            <div style={{ marginBottom: 14 }}>
              <div className="contract-signature-console__body-text" style={{ marginBottom: 6 }}>
                템플릿 제목
              </div>
              <FormInput
                value={confirmOnlyTitle}
                onChange={(e) => setConfirmOnlyTitle(e.target.value)}
                disabled={busy}
                placeholder="예: 약관 확인서"
              />
            </div>
            <div className="contract-signature-console__detail-actions">
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmOnlyCreateOpen(false)}
              >
                취소
              </FormButton>
              <FormButton
                htmlType="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const title = confirmOnlyTitle.trim()
                  if (!title) {
                    onError('제목을 입력하세요.')
                    return
                  }
                  void runOp(async () => {
                    await createConfirmationOnlyContractTemplate(token, role, {
                      title,
                      tenantGaId,
                    })
                    setConfirmOnlyCreateOpen(false)
                    setConfirmOnlyTitle('')
                  })
                }}
              >
                만들기
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
