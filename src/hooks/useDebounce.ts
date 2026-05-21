import { useEffect, useState } from 'react'

/** 값이 비워지면 지연 없이 반영하고, 그 외에는 지연 후 반영한다. */
export function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (value === '') {
      queueMicrotask(() => {
        setDebounced('')
      })
      return
    }
    const id = window.setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
