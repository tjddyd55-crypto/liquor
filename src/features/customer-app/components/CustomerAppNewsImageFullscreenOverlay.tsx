import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'

type Props = {
  open: boolean
  imageUrls: string[]
  initialIndex?: number
  onClose: () => void
  altBase?: string
}

const SWIPE_PX = 48

export default function CustomerAppNewsImageFullscreenOverlay({
  open,
  imageUrls,
  initialIndex = 0,
  onClose,
  altBase = '이미지',
}: Props) {
  const urls = imageUrls.filter(Boolean)
  const n = urls.length
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      const safe = n <= 0 ? 0 : Math.min(Math.max(0, initialIndex), n - 1)
      setIndex(safe)
    }
  }, [open, initialIndex, n])

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const go = useCallback(
    (dir: -1 | 1) => {
      if (n <= 1) {
        return
      }
      setIndex((prev) => {
        const next = prev + dir
        if (next < 0) {
          return n - 1
        }
        if (next >= n) {
          return 0
        }
        return next
      })
    },
    [n],
  )

  const onTouchStart = useCallback((event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX
  }, [])

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (touchStartX.current == null || n <= 1) {
        touchStartX.current = null
        return
      }
      const dx = event.changedTouches[0].clientX - touchStartX.current
      touchStartX.current = null
      if (dx > SWIPE_PX) {
        go(-1)
      } else if (dx < -SWIPE_PX) {
        go(1)
      }
    },
    [go, n],
  )

  if (!open || n === 0) {
    return null
  }

  return (
    <div className="customer-app-news-fs" role="dialog" aria-modal="true" aria-label="이미지 전체 보기">
      <button
        type="button"
        className="customer-app-news-fs__backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <button type="button" className="customer-app-news-fs__close" onClick={onClose}>
        닫기
      </button>
      {n > 1 ? (
        <>
          <button
            type="button"
            className="customer-app-news-fs__nav customer-app-news-fs__nav--prev"
            aria-label="이전"
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="customer-app-news-fs__nav customer-app-news-fs__nav--next"
            aria-label="다음"
            onClick={() => go(1)}
          >
            ›
          </button>
        </>
      ) : null}
      <div
        className="customer-app-news-fs__stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img src={urls[index]} alt={`${altBase} ${index + 1}`} className="customer-app-news-fs__img" decoding="async" />
      </div>
      <div className="customer-app-news-fs__meta" aria-live="polite">
        <span className="customer-app-news-fs__counter">
          {index + 1} / {n}
        </span>
        <div className="customer-app-news-fs__dots" role="tablist" aria-label="이미지 선택">
          {urls.map((_, i) => (
            <button
              key={String(i)}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}번째 이미지`}
              className={`customer-app-news-fs__dot${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
