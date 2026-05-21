import { useCallback, useEffect, useState } from 'react'
import { listCustomerCars, type CustomerCarRecord } from '../api/customerCarsApi'

export function useCustomerCars(params: {
  token: string | null
  customerId: number
  enabled?: boolean
}): {
  cars: CustomerCarRecord[]
  isLoading: boolean
  errorMessage: string | null
  reload: () => Promise<void>
} {
  const { token, customerId, enabled = true } = params
  const [cars, setCars] = useState<CustomerCarRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const tok = token?.trim() ?? ''
    if (!enabled || !tok || !Number.isFinite(customerId) || customerId < 1) {
      setCars([])
      setErrorMessage(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const rows = await listCustomerCars(tok, customerId)
      setCars(rows)
    } catch (e) {
      setCars([])
      setErrorMessage(e instanceof Error ? e.message : '자동차 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, token, customerId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { cars, isLoading, errorMessage, reload }
}
