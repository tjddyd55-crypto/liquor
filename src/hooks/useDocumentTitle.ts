import { useEffect } from 'react'

/**
 * 라우트·페이지별 document.title 설정. 언마운트 시 이전 title 복원.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
