import { useRef, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput } from '../../../components/form'

import type { CustomerExcelPrepareResult, CustomerUploadBatchResult } from '../utils/customerExcelUpload'
import {
  CUSTOMER_EXCEL_UPLOAD_MAX_BATCH,
  downloadExcludedRowsExcel,
  downloadFailedApiRowsExcel,
  downloadFailedPayloadsJson,
  downloadCustomerUploadSampleXlsx,
  prepareCustomerExcelImport,
  uploadCustomers,
} from '../utils/customerExcelUpload'

export type CustomerExcelImportPanelProps = {
  token: string
  onUploadsFinished: () => void | Promise<void>
}

export function CustomerExcelImportPanel({ token, onUploadsFinished }: CustomerExcelImportPanelProps) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [parsePhase, setParsePhase] = useState(false)
  const [prepare, setPrepare] = useState<CustomerExcelPrepareResult | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [result, setResult] = useState<CustomerUploadBatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function resetStatus() {
    setResult(null)
    setError(null)
    setProgress(null)
    setPrepare(null)
    setPreviewOpen(false)
  }

  function runPreview() {
    void (async () => {
      if (!file || !token) {
        return
      }
      setBusy(true)
      setError(null)
      setResult(null)
      setPrepare(null)
      setPreviewOpen(false)
      setParsePhase(true)
      try {
        const prep = await prepareCustomerExcelImport(file)
        setPrepare(prep)
        setPreviewOpen(true)
        if (prep.payloads.length === 0) {
          setError(
            `업로드할 유효한 행이 없습니다. (시트 ${prep.stats.totalSheetRows}행 중 주민번호 오류 제외 ${prep.stats.skippedInvalidSsnCount}건, 기타 제외 ${prep.stats.skippedOtherCount}건)`,
          )
          setPreviewOpen(false)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리에 실패했습니다.')
      } finally {
        setParsePhase(false)
        setBusy(false)
      }
    })()
  }

  function runUploadConfirmed() {
    if (!prepare || prepare.payloads.length === 0 || !token) {
      return
    }
    if (prepare.payloads.length > CUSTOMER_EXCEL_UPLOAD_MAX_BATCH) {
      setError(
        `한 번에 ${CUSTOMER_EXCEL_UPLOAD_MAX_BATCH}건까지만 업로드 가능합니다. (현재 ${prepare.payloads.length}건)`,
      )
      return
    }
    void (async () => {
      setBusy(true)
      setError(null)
      setResult(null)
      setPreviewOpen(false)
      setProgress(null)
      try {
        const batch = await uploadCustomers(token, prepare.payloads, (done, total) => {
          setProgress({ done, total })
        })
        setResult(batch)
        if (batch.success > 0) {
          await onUploadsFinished()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '업로드에 실패했습니다.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const prepStats = prepare?.stats
  const showExcludedDownload = prepare && prepare.excludedRows.length > 0
  const overBatchLimit =
    prepare != null && prepare.payloads.length > CUSTOMER_EXCEL_UPLOAD_MAX_BATCH
  const confirmMessage =
    prepare && prepare.payloads.length > 0 && !overBatchLimit
      ? `${prepare.payloads.length}건을 서버에 등록합니다. 계속할까요?`
      : ''


  return (
    <div className="customers-excel-import-panel" aria-label="고객 엑셀 업로드">
      <FormButton
        htmlType="button"
        variant="action"
        className="link-btn link-btn--compact"
        onClick={() => {
          downloadCustomerUploadSampleXlsx()
        }}
      >
        샘플 다운로드
      </FormButton>

      <div className="customers-excel-import-panel__row">
        <FormInput
          ref={fileInputRef}
          type="file"
          className="customers-excel-import-panel__file-input"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            resetStatus()
          }}
        />
        <FormButton
          htmlType="button"
          variant="action"
          className="link-btn link-btn--compact"
          onClick={() => fileInputRef.current?.click()}
        >
          파일 선택
        </FormButton>
        {file ? <span className="customers-excel-import-panel__fname">{file.name}</span> : null}
        <FormButton
          htmlType="button"
          variant="action"
          className="filter-button customers-excel-import-panel__upload-btn"
          disabled={!file || busy}
          onClick={runPreview}
        >
          미리보기
        </FormButton>
      </div>

      {busy && parsePhase ? (
        <p className="customers-excel-import-panel__status" aria-busy="true">
          로딩 중… 파일 분석 중
        </p>
      ) : null}
      {busy && !parsePhase && progress && progress.total > 0 ? (
        <div className="customers-excel-import-panel__progress" aria-busy="true">
          <p className="customers-excel-import-panel__status">
            로딩 중… 업로드 {progress.done}/{progress.total} (
            {Math.round((progress.done / progress.total) * 100)}%)
          </p>
          <div
            className="customers-excel-import-panel__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress.done / progress.total) * 100)}
          >
            <div
              className="customers-excel-import-panel__progress-fill"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {previewOpen && prepare && prepare.payloads.length > 0 ? (
        <div className="customers-excel-import-panel__preview card" role="region" aria-label="업로드 미리보기">
          <p className="customers-excel-import-panel__preview-title">업로드 전 확인</p>
          <ul className="customers-excel-import-panel__preview-list">
            <li>시트 데이터 총 {prepare.stats.totalSheetRows}행</li>
            <li>업로드 예정 {prepare.stats.uploadReadyCount}건</li>
            {prepare.stats.mergedAbsorbedRowCount > 0 ? (
              <li>
                중복 병합: {prepare.stats.mergedAbsorbedRowCount}건 (주민번호 기준, 동일 고객 데이터가 병합되었습니다
                {prepare.stats.duplicateSsnGroupCount > 0
                  ? ` · 중복 그룹 ${prepare.stats.duplicateSsnGroupCount}개`
                  : ''}
                )
              </li>
            ) : null}
            <li className={prepare.stats.skippedInvalidSsnCount > 0 ? 'customers-excel-import-panel__warn' : undefined}>
              주민번호 오류로 제외: {prepare.stats.skippedInvalidSsnCount}건
            </li>
            {prepare.stats.skippedOtherCount > 0 ? (
              <li>기타 제외(이름 없음 등): {prepare.stats.skippedOtherCount}건</li>
            ) : null}
            {overBatchLimit ? (
              <li className="customers-excel-import-panel__warn">
                1회 업로드는 {CUSTOMER_EXCEL_UPLOAD_MAX_BATCH}건까지 가능합니다. (현재 {prepare.payloads.length}건) 파일을
                나누어 업로드해 주세요.
              </li>
            ) : null}
          </ul>
          {showExcludedDownload ? (
            <FormButton
              htmlType="button"
              variant="action"
              className="link-btn link-btn--compact customers-excel-import-panel__download"
              onClick={() => downloadExcludedRowsExcel(prepare.excludedRows)}
            >
              제외 데이터 다운로드 (엑셀)
            </FormButton>
          ) : null}
          <div className="customers-excel-import-panel__preview-actions">
            <FormButton
              htmlType="button"
              variant="action"
              className="filter-button"
              disabled={busy}
              onClick={() => {
                setPreviewOpen(false)
              }}
            >
              취소
            </FormButton>
            <FormButton
              htmlType="button"
              variant="action"
              className="cta-button"
              disabled={busy || overBatchLimit}
              onClick={() => {
                if (overBatchLimit) {
                  return
                }
                void (async () => {
                  const confirmed = await confirm({
                    title: '엑셀 업로드',
                    message: confirmMessage,
                    confirmLabel: '업로드',
                  })
                  if (!confirmed) {
                    return
                  }
                  runUploadConfirmed()
                })()
              }}
            >
              {prepare.payloads.length}건 업로드 진행
            </FormButton>
          </div>
        </div>
      ) : null}

      {!busy && result && result.total > 0 ? (
        <p className="customers-excel-import-panel__status customers-excel-import-panel__status--done">
          진행 완료 ({result.total}건, 100%)
        </p>
      ) : null}

      {prepStats && !previewOpen && (prepStats.skippedInvalidSsnCount > 0 || prepStats.mergedAbsorbedRowCount > 0) ? (
        <p className="customers-excel-import-panel__meta" role="status">
          직전 분석: 시트 {prepStats.totalSheetRows}행 · 병합 {prepStats.mergedAbsorbedRowCount}건 · 주민번호 제외{' '}
          {prepStats.skippedInvalidSsnCount}건
          {showExcludedDownload ? (
            <>
              {' · '}
              <FormButton
                htmlType="button"
                variant="action"
                className="link-btn link-btn--compact"
                onClick={() => prepare && downloadExcludedRowsExcel(prepare.excludedRows)}
              >
                제외 데이터 다운로드
              </FormButton>
            </>
          ) : null}
        </p>
      ) : null}

      {result ? (
        <div className="customers-excel-import-panel__result" role="status">
          <p className="customers-excel-import-panel__summary">
            총 {result.total}건 · 성공 {result.success}건 · 실패 {result.failed}건
          </p>
          {result.failed > 0 && result.failedPayloads.length > 0 ? (
            <div className="customers-excel-import-panel__fail-downloads">
              <FormButton
                htmlType="button"
                variant="action"
                className="link-btn link-btn--compact"
                onClick={() =>
                  downloadFailedApiRowsExcel(result.failedPayloads, result.failures)
                }
              >
                실패 데이터 다운로드 (엑셀)
              </FormButton>
              <FormButton
                htmlType="button"
                variant="action"
                className="link-btn link-btn--compact"
                onClick={() => downloadFailedPayloadsJson(result.failedPayloads)}
              >
                실패 데이터 다운로드 (JSON)
              </FormButton>
            </div>
          ) : null}
          {result.failures.length > 0 ? (
            <ul className="customers-excel-import-panel__failures">
              {result.failures.slice(0, 30).map((f, idx) => (
                <li key={`${f.ssn}-${idx}`}>
                  {f.name} ({f.ssn}): {f.message}
                </li>
              ))}
              {result.failures.length > 30 ? (
                <li className="customers-excel-import-panel__failures-more">… 외 {result.failures.length - 30}건</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="customers-excel-import-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {error && prepare && prepare.excludedRows.length > 0 ? (
        <FormButton
          htmlType="button"
          variant="action"
          className="link-btn link-btn--compact customers-excel-import-panel__download"
          onClick={() => downloadExcludedRowsExcel(prepare.excludedRows)}
        >
          제외 데이터 다운로드 (주민번호 오류 등)
        </FormButton>
      ) : null}
      {confirmDialog}
    </div>
  )
}
