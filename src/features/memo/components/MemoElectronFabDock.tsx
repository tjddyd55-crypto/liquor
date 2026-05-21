import { FormButton } from '../../../components/form'
import { useEffect, useRef, useState } from 'react'
import { useMemoWorkspace } from '../context/MemoWorkspaceContext'

export type MemoElectronFabDockProps = {
  onToggleMinimize: () => void
  onToggleFullscreen: () => void
  isMobile?: boolean
}

/**
 * 메모 워크스페이스 FAB.
 *
 * - PC/웹: 기존 방식 유지. 단일 `+` 원형 FAB + 클릭 시 메뉴(메모 추가 / 전체화면 / 최소화).
 * - 모바일: 메뉴를 열지 않고 "추가" / "정리" 두 개의 버튼을 같은 위치(오른쪽 하단) 에
 *   가로로 나란히 노출. 각 버튼은 클릭 즉시 해당 동작을 실행한다.
 *   - [추가] → addNote(): 새 메모 추가
 *   - [정리] → handleAutoArrange(): 자동 정리(= "정리하기")
 *
 * 리스트 영역의 "메모 목록" 헤더에서 "정리하기" 버튼을 걷어내는 대신 이 자리로
 * 옮겼다. 세로 공간은 리스트에 양보하고, 자주 쓰는 동작은 고정 위치에 둔다.
 */
export function MemoElectronFabDock({
  onToggleMinimize,
  onToggleFullscreen,
  isMobile = false,
}: MemoElectronFabDockProps) {
  const { addNote, handleAutoArrange, token } = useMemoWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  if (!token?.trim()) {
    return null
  }

  if (isMobile) {
    return (
      <div className="memo-electron-fab-dock memo-electron-fab-dock--mobile" ref={wrapRef}>
        <FormButton
          htmlType="button"
          className="memo-fab memo-fab--mobile-dual memo-fab--mobile-dual-add"
          aria-label="메모 추가"
          onClick={() => void addNote()}
        >
          추가
        </FormButton>
        <FormButton
          htmlType="button"
          className="memo-fab memo-fab--mobile-dual memo-fab--mobile-dual-arrange"
          aria-label="메모 정리하기"
          onClick={() => handleAutoArrange()}
        >
          정리
        </FormButton>
      </div>
    )
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="memo-electron-fab-dock" ref={wrapRef}>
      <FormButton
        htmlType="button"
        className="memo-fab memo-fab--electron-dock"
        aria-label={'\uBA54\uBAA8 \uB354\uBCF4\uAE30'}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        +
      </FormButton>
      {menuOpen ? (
        <div className="memo-fab-menu" role="menu">
          <FormButton
            htmlType="button"
            role="menuitem"
            className="memo-fab-menu__item"
            onClick={() => {
              closeMenu()
              void addNote()
            }}
          >
            메모 추가
          </FormButton>
          <FormButton
            htmlType="button"
            role="menuitem"
            className="memo-fab-menu__item"
            onClick={() => {
              closeMenu()
              onToggleFullscreen()
            }}
          >
            메모 전체화면 on/off
          </FormButton>
          <FormButton
            htmlType="button"
            role="menuitem"
            className="memo-fab-menu__item"
            onClick={() => {
              closeMenu()
              onToggleMinimize()
            }}
          >
            메모 최소화 on/off
          </FormButton>
        </div>
      ) : null}
    </div>
  )
}
