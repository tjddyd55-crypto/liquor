/**
 * 전역 데스크톱 업데이트 다이얼로그.
 *
 * 표시 규칙:
 *   - Electron 환경이 아니면 렌더하지 않는다 (웹 브라우저엔 무의미).
 *   - status === 'available' && !dismissedAvailable  → "지금 시작 / 나중에"
 *   - status === 'downloading'                        → 진행률 바 + %
 *   - status === 'downloaded' && !dismissedDownloaded → "지금 재시작 / 나중에"
 *   - status === 'error'                              → "다시 시도 / 닫기"
 *   - 그 외(idle, checking, not-available) → 숨김
 *
 * 설계:
 *   - 이 컴포넌트는 "상태 → 뷰" 매핑만 한다. 로직/IPC 는 useDesktopUpdate 가 전담.
 *   - 최상위 포털/overlay 가 불필요한 수준이라 단일 fixed 레이어로 충분.
 *   - 버튼 라벨은 "시작/나중에/재시작" 등 사용자가 언급한 용어를 그대로 채택.
 */

import { useDesktopUpdate } from './useDesktopUpdate'
import { isElectronApp } from '../../lib/isElectronApp'
import FormButton from '../../components/form/FormButton'
import './DesktopUpdateDialog.css'

function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ''
  const mbps = bytesPerSecond / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  const kbps = bytesPerSecond / 1024
  return `${Math.round(kbps)} KB/s`
}

export function DesktopUpdateDialog() {
  const state = useDesktopUpdate()

  if (!isElectronApp()) return null

  const showAvailable = state.status === 'available' && !state.dismissedAvailable
  const showDownloading = state.status === 'downloading'
  const showDownloaded = state.status === 'downloaded' && !state.dismissedDownloaded
  const showError = state.status === 'error'

  if (!showAvailable && !showDownloading && !showDownloaded && !showError) {
    return null
  }

  return (
    <div
      className="desktop-update-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-update-dialog-title"
    >
      <div className="desktop-update-dialog__backdrop" aria-hidden />
      <div className="desktop-update-dialog__panel">
        {showAvailable ? (
          <AvailableView
            version={state.newVersion}
            releaseNotes={state.releaseNotes}
            onStart={() => void state.startDownload()}
            onLater={state.dismissAvailable}
          />
        ) : null}

        {showDownloading ? (
          <DownloadingView
            percent={state.percent}
            bytesPerSecond={state.bytesPerSecond}
            version={state.newVersion}
          />
        ) : null}

        {showDownloaded ? (
          <DownloadedView
            version={state.newVersion}
            onInstall={() => void state.installNow()}
            onLater={state.dismissDownloaded}
          />
        ) : null}

        {showError ? (
          <ErrorView
            message={state.errorMessage}
            onRetry={() => void state.checkNow()}
            onClose={() => {
              state.dismissAvailable()
              state.dismissDownloaded()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function AvailableView({
  version,
  releaseNotes,
  onStart,
  onLater,
}: {
  version: string | null
  releaseNotes: string | null
  onStart: () => void
  onLater: () => void
}) {
  return (
    <>
      <h2 id="desktop-update-dialog-title" className="desktop-update-dialog__title">
        새 버전 업데이트가 있습니다
      </h2>
      {version ? (
        <p className="desktop-update-dialog__subtitle">버전 {version}</p>
      ) : null}
      <p className="desktop-update-dialog__body">
        지금 업데이트를 시작하시겠습니까? 다운로드가 완료되면 재시작 버튼이 나타납니다.
      </p>
      {releaseNotes ? (
        <details className="desktop-update-dialog__notes">
          <summary>업데이트 내용 보기</summary>
          <pre>{releaseNotes}</pre>
        </details>
      ) : null}
      <div className="desktop-update-dialog__actions">
        <FormButton htmlType="button" variant="secondary" onClick={onLater}>
          나중에
        </FormButton>
        <FormButton htmlType="button" variant="primary" onClick={onStart} autoFocus>
          지금 시작
        </FormButton>
      </div>
    </>
  )
}

function DownloadingView({
  percent,
  bytesPerSecond,
  version,
}: {
  percent: number
  bytesPerSecond: number
  version: string | null
}) {
  const rounded = Math.max(0, Math.min(100, Math.round(percent)))
  const speed = formatSpeed(bytesPerSecond)
  return (
    <>
      <h2 id="desktop-update-dialog-title" className="desktop-update-dialog__title">
        업데이트 다운로드 중…
      </h2>
      {version ? (
        <p className="desktop-update-dialog__subtitle">버전 {version}</p>
      ) : null}
      <div className="desktop-update-dialog__progress" aria-label={`다운로드 ${rounded}%`}>
        <div
          className="desktop-update-dialog__progress-fill"
          style={{ width: `${rounded}%` }}
          role="progressbar"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="desktop-update-dialog__progress-text">
        {rounded}%{speed ? ` · ${speed}` : ''}
      </p>
      <p className="desktop-update-dialog__hint">
        이 창을 닫아도 다운로드는 계속됩니다. 완료되면 다시 안내드릴게요.
      </p>
    </>
  )
}

function DownloadedView({
  version,
  onInstall,
  onLater,
}: {
  version: string | null
  onInstall: () => void
  onLater: () => void
}) {
  return (
    <>
      <h2 id="desktop-update-dialog-title" className="desktop-update-dialog__title">
        업데이트 다운로드 완료
      </h2>
      {version ? (
        <p className="desktop-update-dialog__subtitle">버전 {version}</p>
      ) : null}
      <p className="desktop-update-dialog__body">
        재시작하면 새 버전이 적용됩니다. 나중에를 선택하면 다음에 앱을 끌 때 자동으로 적용됩니다.
      </p>
      <div className="desktop-update-dialog__actions">
        <FormButton htmlType="button" variant="secondary" onClick={onLater}>
          나중에
        </FormButton>
        <FormButton htmlType="button" variant="primary" onClick={onInstall} autoFocus>
          지금 재시작하여 업데이트
        </FormButton>
      </div>
    </>
  )
}

function ErrorView({
  message,
  onRetry,
  onClose,
}: {
  message: string | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <>
      <h2 id="desktop-update-dialog-title" className="desktop-update-dialog__title">
        업데이트 중 오류가 발생했습니다
      </h2>
      <p className="desktop-update-dialog__body">
        {message ?? '잠시 후 다시 시도해 주세요.'}
      </p>
      <div className="desktop-update-dialog__actions">
        <FormButton htmlType="button" variant="secondary" onClick={onClose}>
          닫기
        </FormButton>
        <FormButton htmlType="button" variant="primary" onClick={onRetry} autoFocus>
          다시 시도
        </FormButton>
      </div>
    </>
  )
}
