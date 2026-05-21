/**
 * 내 정보 > 데스크톱 앱 업데이트 섹션.
 *
 * 역할 (전역 모달과의 관계):
 *   - 전역 DesktopUpdateDialog 가 "업데이트 있을 때 자동으로 뜨는" 알림을 담당한다.
 *   - 이 섹션은 "사용자가 스스로 확인하러 온" 수동 진입점이다.
 *     (모달을 이미 "나중에" 로 닫았더라도 언제든 여기서 다시 확인/다운로드/설치 가능.)
 *
 * useDesktopUpdate 훅이 모든 상태·IPC 를 소유하므로 이 컴포넌트는 뷰만 그린다.
 * 중복 구독·상태 어긋남 걱정 없음.
 */

import { FormButton } from './form'
import { useEffect, useState } from 'react'
import { isElectronApp } from '../lib/isElectronApp'
import { useDesktopUpdate } from '../features/desktop-update/useDesktopUpdate'

function statusToMessage(
  status: ReturnType<typeof useDesktopUpdate>['status'],
  newVersion: string | null,
): string {
  switch (status) {
    case 'checking':
      return '확인 중…'
    case 'available':
      return newVersion ? `새 버전이 있습니다: ${newVersion}` : '새 버전이 있습니다.'
    case 'not-available':
      return '이미 최신 버전입니다.'
    case 'downloading':
      return '다운로드 중…'
    case 'downloaded':
      return '다운로드 완료. 아래 버튼으로 재시작하여 적용하세요.'
    case 'error':
      return '업데이트 중 오류가 발생했습니다.'
    default:
      return ''
  }
}

export function DesktopUpdateSection() {
  const update = useDesktopUpdate()
  const [appVersion, setAppVersion] = useState('')
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

  useEffect(() => {
    if (!isElectronApp() || typeof api?.getVersion !== 'function') return
    void api.getVersion().then(setAppVersion)
  }, [api])

  if (!isElectronApp() || typeof api?.checkForDesktopUpdates !== 'function') {
    return null
  }

  const canStart = update.status === 'available'
  const canInstall = update.status === 'downloaded'
  const statusLine =
    update.status === 'error'
      ? update.errorMessage ?? '업데이트 중 오류가 발생했습니다.'
      : statusToMessage(update.status, update.newVersion)

  return (
    <div className="desktop-update-section">
      <h2 className="desktop-update-section__title">데스크톱 앱 업데이트</h2>
      <p className="desktop-update-section__hint">
        GitHub 릴리스를 기준으로 업데이트를 확인합니다.
      </p>

      <div className="desktop-update-section__actions">
        <FormButton
          htmlType="button"
          className="button button--secondary"
          onClick={() => void update.checkNow()}
        >
          업데이트 확인
        </FormButton>

        {canStart ? (
          <FormButton
            htmlType="button"
            className="button"
            onClick={() => void update.startDownload()}
          >
            지금 다운로드 시작
          </FormButton>
        ) : null}

        {canInstall ? (
          <FormButton
            htmlType="button"
            className="button"
            onClick={() => void update.installNow()}
          >
            지금 재시작하여 업데이트
          </FormButton>
        ) : null}
      </div>

      {statusLine ? <p className="desktop-update-section__status">{statusLine}</p> : null}

      {update.status === 'downloading' ? (
        <p className="desktop-update-section__progress">
          {Math.round(update.percent)}%
        </p>
      ) : null}

      {appVersion ? (
        <p className="desktop-update-section__version">현재 버전: {appVersion}</p>
      ) : null}
    </div>
  )
}
