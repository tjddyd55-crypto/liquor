import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'

type Props = {
  imageUrls: string[]
  altBase?: string
  /** 상위에서 주입하는 추가 클래스 (예: 모달 전용 여백) */
  className?: string
  /** true면 이미지 1장일 때도 1/N·dot 표시 (홈·미리보기) */
  alwaysShowPager?: boolean
  /** false면 "1 / N" 숫자 숨김·dot만 (고객앱 홈 등) */
  showSlideCounter?: boolean
  /** 슬라이드 이미지 탭 시 (전체화면 등). 지정 시 슬라이드가 버튼으로 감싸짐 */
  onRequestFullscreen?: (index: number) => void
}

const SWIPE_PX = 48

export default function CustomerAppNewsImageGallery({
  imageUrls,
  altBase = '소식 이미지',
  className = '',
  alwaysShowPager = false,
  showSlideCounter = true,
  onRequestFullscreen,
}: Props) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const urls = imageUrls.filter(Boolean)
  const n = urls.length
  const urlsSignature = urls.join('|')

  useEffect(() => {
    setIndex(0)
  }, [urlsSignature])

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

  if (n === 0) {
    return null
  }

  const rootClass = `customer-app-news-gallery${className ? ` ${className}` : ''}`
  const showArrows = n > 1
  const showMeta = alwaysShowPager ? n >= 1 : n > 1

  return (
    <div className={rootClass} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="customer-app-news-gallery__viewport">
        <div
          className="customer-app-news-gallery__track"
          style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        >
          {urls.map((url, idx) => (
            <div key={`${url}-${idx}`} className="customer-app-news-gallery__slide">
              {onRequestFullscreen ? (
                <button
                  type="button"
                  className="customer-app-news-gallery__slide-btn"
                  aria-label={`${altBase} 전체 화면으로 보기 ${idx + 1}`}
                  onClick={() => onRequestFullscreen(idx)}
                >
                  <img
                    src={url}
                    alt={`${altBase} ${idx + 1}`}
                    loading={idx === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </button>
              ) : (
                <img src={url} alt={`${altBase} ${idx + 1}`} loading={idx === 0 ? 'eager' : 'lazy'} decoding="async" />
              )}
            </div>
          ))}
        </div>
      </div>

      {showArrows ? (
        <>
          <button
            type="button"
            className="customer-app-news-gallery__nav customer-app-news-gallery__nav--prev"
            aria-label="이전 이미지"
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="customer-app-news-gallery__nav customer-app-news-gallery__nav--next"
            aria-label="다음 이미지"
            onClick={() => go(1)}
          >
            ›
          </button>
        </>
      ) : null}

      {showMeta ? (
        <div className="customer-app-news-gallery__meta" aria-live="polite">
          {showSlideCounter ? (
            <span className="customer-app-news-gallery__counter">
              {index + 1} / {n}
            </span>
          ) : null}
          <div className="customer-app-news-gallery__dots" role="tablist" aria-label="이미지 선택">
            {urls.map((_, i) => (
              <button
                key={String(i)}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}번째 이미지 보기`}
                className={`customer-app-news-gallery__dot${i === index ? ' is-active' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
