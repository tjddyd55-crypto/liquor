/**
 * 전자서명 템플릿 관리 — SUPER_ADMIN / GA_ADMIN. 실제 고객 발송은 전자서명 발송 메뉴에서 진행.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../pdf-engine/pdf-engine.css'
import './government-signature-console.css'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import { FormButton } from '../../../components/form'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { GovernmentSignatureTemplatePanel } from './components/GovernmentSignatureTemplatePanel'
import type { PdfPickRow } from './components/PdfTemplateSelector'
import { PdfTemplateSelector } from './components/PdfTemplateSelector'
import {
  countPdfFieldStats,
  createGovernmentSignatureTemplateFromPdfTemplate,
  getPdfTemplateDetailForGovSignature,
  listGovernmentSignatureTemplates,
  listPdfTemplatesForGovSignature,
  type GovernmentSignatureTemplateListItem,
} from './governmentSignatureTemplateClient'

function resolveTenantGaId(role: string | undefined, ownerUserId: number): number | null {
  if (role === 'SUPER_ADMIN') {
    return null
  }
  return ownerUserId
}

export default function GovernmentSignatureTemplatesPage() {
  const { token, user } = useAuth()
  const t = token?.trim() ?? ''
  const role = user?.role
  const isAdminMobile = useMediaQuery('(max-width: 768px)')
  const tenantGaId = useMemo(() => resolveTenantGaId(role, user?.ownerUserId ?? 0), [role, user?.ownerUserId])

  const [bootError, setBootError] = useState<string | null>(null)
  const [pdfRows, setPdfRows] = useState<PdfPickRow[]>([])
  const [selectedPdfId, setSelectedPdfId] = useState<number | null>(null)
  const [governmentSignatureTemplates, setGovernmentSignatureTemplates] = useState<GovernmentSignatureTemplateListItem[]>([])
  const [contractPanelError, setContractPanelError] = useState<string | null>(null)
  const [contractBusy, setContractBusy] = useState(false)

  const selectedPdf = useMemo(
    () => (selectedPdfId == null ? null : pdfRows.find((r) => r.id === selectedPdfId) ?? null),
    [pdfRows, selectedPdfId],
  )

  const pdfSignatureCountByPdfId = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of pdfRows) {
      m.set(r.id, r.signatureCount)
    }
    return m
  }, [pdfRows])

  const visibleGovernmentSignatureTemplates = useMemo(() => {
    if (selectedPdfId == null) {
      return governmentSignatureTemplates
    }
    return governmentSignatureTemplates.filter((x) => x.pdfTemplateId === selectedPdfId)
  }, [governmentSignatureTemplates, selectedPdfId])

  const reloadContracts = useCallback(async () => {
    if (!t) {
      return
    }
    setContractPanelError(null)
    try {
      const list = await listGovernmentSignatureTemplates(t, role, tenantGaId)
      setGovernmentSignatureTemplates(list)
    } catch (e) {
      setContractPanelError(e instanceof ApiError ? e.message : '계약 템플릿 목록을 불러오지 못했습니다.')
    }
  }, [t, role, tenantGaId])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!t) {
        return
      }
      setBootError(null)
      try {
        const { templates } = await listPdfTemplatesForGovSignature(t, role)
        if (cancelled) {
          return
        }
        const initial: PdfPickRow[] = templates.map((s) => ({
          ...s,
          fieldCount: 0,
          signatureCount: 0,
          loadingDetail: true,
        }))
        setPdfRows(initial)
        const enriched = await Promise.all(
          templates.map(async (s) => {
            try {
              const detail = await getPdfTemplateDetailForGovSignature(t, role, s.id)
              const { fieldCount, signatureCount } = countPdfFieldStats(detail)
              return { ...s, fieldCount, signatureCount, loadingDetail: false } satisfies PdfPickRow
            } catch {
              return { ...s, fieldCount: 0, signatureCount: 0, loadingDetail: false } satisfies PdfPickRow
            }
          }),
        )
        if (!cancelled) {
          setPdfRows(enriched)
        }
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof ApiError ? e.message : 'PDF 템플릿 목록을 불러오지 못했습니다.')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [t, role])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void reloadContracts()
      }
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [reloadContracts])

  const createTemplateFromSelectedPdf = useCallback(async () => {
    if (!t || selectedPdfId == null || !selectedPdf) {
      return
    }
    const pdfTitle = selectedPdf.title ?? ''
    await createGovernmentSignatureTemplateFromPdfTemplate(t, role, {
      pdfTemplateId: selectedPdfId,
      pdfTitle,
      tenantGaId,
    })
  }, [t, role, selectedPdfId, selectedPdf, tenantGaId])

  const onSelectPdf = (id: number) => {
    setSelectedPdfId(id)
  }

  const resolveCoordinateEditorHref =
    role === 'SUPER_ADMIN' ? (pdfTemplateId: number) => `/government/signature-templates/pdf/${pdfTemplateId}` : undefined

  return (
    <main
      className={
        'insurance-dark-forms contract-signature-console' +
        (isAdminMobile ? ' contract-signature-console--admin-mobile' : '')
      }
    >
      <div className="contract-signature-console__container">
        <h1 className="contract-signature-console__title">전자서명 템플릿 관리</h1>
        <p className="contract-signature-console__lead">
          관리자는 PDF 좌표 템플릿을 전자서명 발송용 계약서 템플릿으로 등록하고 관리합니다. 실제 고객 발송은 유저/FC 화면의 「전자서명
          발송」 메뉴에서 진행합니다.
        </p>
        <div className="contract-signature-console__notice" role="status">
          <ul>
            <li>
              현재 기능은 지정 휴대폰 인증 기반 전자서명입니다. NICE/KCB 실명 본인확인은 아직 연결되어 있지 않습니다.
            </li>
            <li>발송·서명이 끝나면 담당자 화면에서 완료 문서 PDF와 증빙 PDF를 내려받을 수 있습니다.</li>
            <li>관리자용 임시 발송·세션 조회 API(`/api/government-support/signatures`)는 호환용으로 유지될 수 있습니다.</li>
          </ul>
        </div>

        {bootError ? (
          <div className="contract-signature-console__alert--danger" role="alert">
            {bootError}
          </div>
        ) : null}

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">1. PDF 템플릿 선택</h2>
          <PdfTemplateSelector
            rows={pdfRows}
            selectedId={selectedPdfId}
            onSelect={onSelectPdf}
            disabled={!t || contractBusy}
            resolveCoordinateEditorHref={resolveCoordinateEditorHref}
          />
          {selectedPdfId != null ? (
            <div className="contract-signature-console__toolbar" style={{ marginTop: 10 }}>
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                className="contract-signature-console__filter-btn"
                disabled={!t || contractBusy}
                onClick={() => setSelectedPdfId(null)}
              >
                PDF 선택 해제
              </FormButton>
            </div>
          ) : null}
        </section>

        <section className="contract-signature-console__section">
          <h2 className="contract-signature-console__section-title">2. 전자서명 템플릿 관리</h2>
          <GovernmentSignatureTemplatePanel
            token={t}
            role={role}
            tenantGaId={tenantGaId}
            pdfTemplateId={selectedPdfId}
            pdfTitle={selectedPdf?.title ?? null}
            pdfSignatureCountByPdfId={pdfSignatureCountByPdfId}
            templates={visibleGovernmentSignatureTemplates}
            busy={contractBusy}
            error={contractPanelError}
            onBusy={setContractBusy}
            onError={setContractPanelError}
            onReload={reloadContracts}
            onCreateTemplate={createTemplateFromSelectedPdf}
            onClearPdfFilter={() => setSelectedPdfId(null)}
          />
        </section>
      </div>
    </main>
  )
}
