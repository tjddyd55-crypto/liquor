import { useLayoutEffect, useRef } from 'react'
import { resolveCustomerScrollContainer } from '../utils/customerWorkspaceNavigation'

export function useCustomerExpandedCardScroll(params: {
  expandedId: number | null
  isMobile: boolean
  scrollRequestKey: number
}): void {
  const { expandedId, isMobile, scrollRequestKey } = params
  const observerRef = useRef<ResizeObserver | null>(null)
  const scrollCountRef = useRef(0)

  useLayoutEffect(() => {
    if (expandedId == null) {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      return
    }
    scrollCountRef.current = 0
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    let disposed = false
    let retry = 0
    let rafId = 0
    const pendingTimers: number[] = []
    // 모바일(WebView)에서는 카드/리스트 렌더 반영이 늦어 attach 재시도 여유를 더 준다.
    const maxRetry = isMobile ? 60 : 8

    const tryAttach = () => {
      if (disposed) {
        return
      }

      const target = document.querySelector<HTMLElement>(`[data-customer-id="${expandedId}"]`)
      if (!target) {
        if (retry < maxRetry) {
          retry += 1
          rafId = requestAnimationFrame(tryAttach)
        }
        return
      }

      // 모바일 전용 스크롤 전략.
      // 이전에 펼쳐져 있던 카드가 닫힘 애니메이션(≈320ms) 동안 높이가 줄면서
      // 타깃 카드의 실제 Y 좌표가 계속 변한다. ResizeObserver는 "대상 자신"의 크기 변화만 잡기 때문에
      // 주변 카드가 축소되는 케이스를 놓친다. 그래서 컨테이너 기준 Y 계산 대신
      // 네이티브 scrollIntoView(현재 위치 기준)를 애니메이션 구간 전·중·후에 여러 번 호출해
      // 최종 레이아웃에서 항상 최상단에 고정되도록 한다.
      if (isMobile) {
        const snap = () => {
          if (disposed || !target.isConnected) {
            return
          }
          // options-object 미지원 구형 WebView 호환을 위해 boolean 인자 사용(= block:'start').
          target.scrollIntoView(true)
        }
        rafId = requestAnimationFrame(snap)
        ;[120, 260, 380].forEach((ms) => {
          pendingTimers.push(window.setTimeout(snap, ms))
        })
        return
      }

      const container = resolveCustomerScrollContainer(target)

      const runScroll = () => {
        if (disposed || !target.isConnected) {
          return
        }
        if (scrollCountRef.current >= 1) {
          return
        }
        scrollCountRef.current += 1

        const containerRect = container.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()

        const y = targetRect.top - containerRect.top + container.scrollTop
        const stickyElements = container.querySelectorAll<HTMLElement>(
          '.sticky, .filter-bar, .search-bar',
        )
        let stickyHeight = 0
        stickyElements.forEach((el) => {
          const rect = el.getBoundingClientRect()
          // 컨테이너 상단 영역과 실제로 겹치는 요소만 높이에 합산
          const isOverlapping = rect.bottom >= containerRect.top && rect.top <= containerRect.top

          if (isOverlapping) {
            stickyHeight += rect.height
          }
        })

        container.scrollTo({
          top: Math.max(0, y - stickyHeight),
          behavior: 'auto',
        })
      }

      const observer = new ResizeObserver(() => {
        runScroll()
      })
      observer.observe(target)
      observerRef.current = observer

      requestAnimationFrame(runScroll)
    }

    rafId = requestAnimationFrame(tryAttach)

    return () => {
      disposed = true
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      pendingTimers.forEach((id) => window.clearTimeout(id))
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [expandedId, isMobile, scrollRequestKey])
}
