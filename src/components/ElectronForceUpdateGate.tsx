/**
 * 서버 정책(minVersion) 기반 강제 업데이트 게이트.
 *
 * 일반 업데이트 모달(DesktopUpdateDialog) 과의 관계:
 *   - 강제 업데이트가 발동되면(blocked=true) 이 게이트가 전체 화면을 덮는다.
 *     같은 곳에서 children 을 렌더하지 않으므로, children 에 함께 배치된
 *     DesktopUpdateDialog 도 자연스럽게 숨는다. (이중 모달 방지)
 *   - 다운로드 진행 상태는 공통 훅(useDesktopUpdate) 을 재사용해 중복 구독을 없앴다.
 */

import { FormButton } from './form'
import { useEffect, useState, type ReactNode } from 'react'
import { isElectronApp } from '../lib/isElectronApp'
import { useDesktopUpdate } from '../features/desktop-update/useDesktopUpdate'

export function ElectronForceUpdateGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false)
  const [serverMessage, setServerMessage] = useState('')
  const update = useDesktopUpdate()
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

  useEffect(() => {
    if (!isElectronApp() || typeof api?.onForceUpdate !== 'function') return
    const off = api.onForceUpdate((payload) => {
      const msg = typeof payload?.message === 'string' ? payload.message.trim() : ''
      setServerMessage(msg)
      setBlocked(true)
      /* 강제 업데이트 시에는 사용자 확인 없이 즉시 다운로드를 시작한다.
         autoDownload=false 이므로 명시적으로 트리거해야 한다. */
      void update.startDownload()
    })
    return off
    /* update 는 매 렌더 새 객체지만 startDownload 는 안정적이므로 deps 에서 제외.
       (의도적으로 api 만 의존 — 잘못된 리렌더 방어선) */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  if (!isElectronApp() || !blocked) {
    return <>{children}</>
  }

  const updateReady = update.status === 'downloaded'
  const onCheck = () => void update.checkNow()
  const onInstall = () => void update.installNow()

  return (
    <div className="electron-force-update-gate">
      <div className="electron-force-update-gate__panel">
        <h2 className="electron-force-update-gate__title">
          업데이트 후 사용 가능합니다
        </h2>
        {serverMessage ? (
          <p className="electron-force-update-gate__message">{serverMessage}</p>
        ) : null}
        <p className="electron-force-update-gate__hint">
          최신 버전을 받은 후 재시작하세요.
        </p>

        {update.status === 'downloading' ? (
          <p className="electron-force-update-gate__progress">
            다운로드 중 · {Math.round(update.percent)}%
          </p>
        ) : null}

        {update.status === 'error' && update.errorMessage ? (
          <p className="electron-force-update-gate__error">{update.errorMessage}</p>
        ) : null}

        <div className="electron-force-update-gate__actions">
          <FormButton htmlType="button" className="button button--secondary" onClick={onCheck}>
            업데이트 확인
          </FormButton>
          {updateReady ? (
            <FormButton htmlType="button" className="button" onClick={onInstall}>
              지금 재시작하여 업데이트
            </FormButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}
