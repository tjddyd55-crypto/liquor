/**
 * 데스크톱 자동 업데이트 단일 진실 원천.
 *
 * 책임:
 *   - Electron main 에서 오는 IPC 이벤트를 React 상태로 누적한다.
 *   - 모달(전역) 과 설정 섹션(내 정보 > 업데이트) 이 동일한 상태를 공유하도록
 *     이 훅만 읽고 쓴다. 중복 구독 금지.
 *
 * 설계 원칙:
 *   - 상태는 유한 상태 머신: idle → checking → (available | not-available)
 *     · available → downloading(progress) → downloaded
 *     · 어떤 단계든 error 로 갈 수 있다.
 *   - IPC 는 네트워크/디스크 I/O 를 수반하므로 액션 함수는 throw 하지 않는다.
 *     실패는 상태(error) 로 반영한다.
 *   - renderer 환경이 브라우저(웹) 일 때는 전부 no-op — useEffect 가 early return.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DesktopUpdatePayload } from '../../electron-window'
import { isElectronApp } from '../../lib/isElectronApp'

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface DesktopUpdateState {
  status: DesktopUpdateStatus
  /** 감지된 새 버전 문자열 (available 이후 존재). */
  newVersion: string | null
  /** 릴리스 노트 원문(텍스트로만 사용). */
  releaseNotes: string | null
  /** 다운로드 진행률(0-100). downloading 단계에서만 유효. */
  percent: number
  /** 초당 바이트 — UX 힌트용. */
  bytesPerSecond: number
  /** 에러 메시지. */
  errorMessage: string | null
  /** 사용자가 수동으로 닫은 available 알림인지 — 재시작 전까지는 다시 자동 표시 안 함. */
  dismissedAvailable: boolean
  /** 사용자가 수동으로 닫은 downloaded 알림인지. */
  dismissedDownloaded: boolean
}

export interface DesktopUpdateActions {
  /** 수동으로 업데이트 확인 재시도 (설정 섹션의 "확인" 버튼 등). */
  checkNow: () => Promise<void>
  /** "지금 시작" — 다운로드 개시. */
  startDownload: () => Promise<void>
  /** "지금 재시작하여 업데이트". */
  installNow: () => Promise<void>
  /** "나중에" — 모달 닫기. autoInstallOnAppQuit 로 종료 시 적용. */
  dismissAvailable: () => void
  dismissDownloaded: () => void
}

const INITIAL_STATE: DesktopUpdateState = {
  status: 'idle',
  newVersion: null,
  releaseNotes: null,
  percent: 0,
  bytesPerSecond: 0,
  errorMessage: null,
  dismissedAvailable: false,
  dismissedDownloaded: false,
}

/**
 * IPC 페이로드 → 다음 상태.
 * 순수 함수로 분리해 테스트 대상이 된다 (훗날 단위 테스트 추가 가능).
 */
function reduce(prev: DesktopUpdateState, payload: DesktopUpdatePayload): DesktopUpdateState {
  switch (payload.phase) {
    case 'checking':
      /* 새 체크가 시작되면 "사용자가 닫았던" 플래그도 초기화해야, 더 최신 업데이트가 생겼을 때
         다시 모달이 뜬다. */
      return {
        ...prev,
        status: 'checking',
        errorMessage: null,
        dismissedAvailable: false,
        dismissedDownloaded: false,
      }
    case 'available':
      return {
        ...prev,
        status: 'available',
        newVersion: payload.version ?? null,
        releaseNotes: payload.releaseNotes ?? null,
        errorMessage: null,
      }
    case 'not-available':
      return {
        ...prev,
        status: 'not-available',
        errorMessage: null,
      }
    case 'progress':
      return {
        ...prev,
        status: 'downloading',
        percent: typeof payload.percent === 'number' ? payload.percent : prev.percent,
        bytesPerSecond:
          typeof payload.bytesPerSecond === 'number' ? payload.bytesPerSecond : prev.bytesPerSecond,
        errorMessage: null,
      }
    case 'downloaded':
      return {
        ...prev,
        status: 'downloaded',
        percent: 100,
        errorMessage: null,
      }
    case 'error':
      return {
        ...prev,
        status: 'error',
        errorMessage: payload.message ?? '업데이트 중 오류가 발생했습니다.',
      }
    default:
      return prev
  }
}

export function useDesktopUpdate(): DesktopUpdateState & DesktopUpdateActions {
  const [state, setState] = useState<DesktopUpdateState>(INITIAL_STATE)
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

  useEffect(() => {
    if (!isElectronApp() || typeof api?.onDesktopUpdate !== 'function') {
      return
    }
    /*
     * 마운트 시점에 main 프로세스가 이미 수신·캐시해 둔 최신 상태를 한 번 당겨온다.
     * 앱 실행 직후 "React 가 아직 리스너를 붙이기 전" 에 발생한 update-available 이벤트를
     * 렌더러가 놓치더라도, 여기서 스냅샷으로 복원되어 다이얼로그가 정상 표시된다.
     * 스냅샷 실패는 UX 치명적이지 않으므로 조용히 넘긴다(이벤트 스트림이 여전히 보조선).
     */
    let cancelled = false
    if (typeof api.getDesktopUpdateSnapshot === 'function') {
      void api
        .getDesktopUpdateSnapshot()
        .then((snapshot) => {
          if (cancelled || !snapshot) return
          setState((prev) => {
            let next = prev
            if (snapshot.desktopUpdate) {
              next = reduce(next, snapshot.desktopUpdate)
            }
            if (snapshot.updateDownloaded) {
              next = reduce(next, { phase: 'downloaded' })
            }
            return next
          })
        })
        .catch(() => {
          /* 스냅샷은 보조 경로 — 실패해도 이벤트 스트림이 살아있다. */
        })
    }

    const off = api.onDesktopUpdate((payload: DesktopUpdatePayload) => {
      setState((prev) => reduce(prev, payload))
    })
    return () => {
      cancelled = true
      off()
    }
  }, [api])

  const checkNow = useCallback(async () => {
    if (!isElectronApp() || typeof api?.checkForDesktopUpdates !== 'function') return
    setState((prev) => ({ ...prev, status: 'checking', errorMessage: null }))
    const res = await api.checkForDesktopUpdates()
    if (res && res.ok === false && res.code !== 'dev') {
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: res.message ?? '업데이트 확인에 실패했습니다.',
      }))
    }
  }, [api])

  const startDownload = useCallback(async () => {
    if (!isElectronApp() || typeof api?.downloadDesktopUpdate !== 'function') return
    setState((prev) => ({ ...prev, status: 'downloading', errorMessage: null }))
    const res = await api.downloadDesktopUpdate()
    if (res && res.ok === false && res.code !== 'dev') {
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: res.message ?? '다운로드에 실패했습니다.',
      }))
    }
  }, [api])

  const installNow = useCallback(async () => {
    if (!isElectronApp() || typeof api?.installDownloadedUpdate !== 'function') return
    await api.installDownloadedUpdate()
  }, [api])

  const dismissAvailable = useCallback(() => {
    setState((prev) => ({ ...prev, dismissedAvailable: true }))
  }, [])

  const dismissDownloaded = useCallback(() => {
    setState((prev) => ({ ...prev, dismissedDownloaded: true }))
  }, [])

  return useMemo(
    () => ({
      ...state,
      checkNow,
      startDownload,
      installNow,
      dismissAvailable,
      dismissDownloaded,
    }),
    [state, checkNow, startDownload, installNow, dismissAvailable, dismissDownloaded],
  )
}
