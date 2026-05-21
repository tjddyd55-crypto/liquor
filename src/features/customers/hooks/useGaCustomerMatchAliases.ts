import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  fetchGaCustomerMatchAliases,
  saveGaCustomerMatchAliases,
} from '../api/gaCustomerMatchAliasesApi'
import {
  aliasesToCommaSeparatedInputValue,
  parseGaMatchAliasInput,
} from '../utils/gaCustomerMatchAliasInput'

export type UseGaCustomerMatchAliasesResult = {
  loading: boolean
  saving: boolean
  customerName: string
  inputText: string
  setInputText: (value: string) => void
  savedAliases: string[]
  error: string
  saveMessage: string
  onSave: () => Promise<boolean>
}

export function useGaCustomerMatchAliases(customerId: number): UseGaCustomerMatchAliasesResult {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [inputText, setInputText] = useState('')
  const [savedAliases, setSavedAliases] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  const load = useCallback(async () => {
    if (!token?.trim() || !Number.isFinite(customerId) || customerId < 1) {
      setLoading(false)
      return
    }
    setError('')
    setSaveMessage('')
    setLoading(true)
    try {
      const data = await fetchGaCustomerMatchAliases(token, customerId)
      setCustomerName(data.customerName ?? '')
      setSavedAliases(data.aliases ?? [])
      setInputText(aliasesToCommaSeparatedInputValue(data.aliases ?? []))
    } catch {
      setError('예외 매칭값을 불러오지 못했습니다.')
      setCustomerName('')
      setSavedAliases([])
      setInputText('')
    } finally {
      setLoading(false)
    }
  }, [token, customerId])

  useEffect(() => {
    void load()
  }, [load])

  const onSave = useCallback(async (): Promise<boolean> => {
    if (!token?.trim() || !Number.isFinite(customerId) || customerId < 1) {
      return false
    }
    setSaving(true)
    setError('')
    setSaveMessage('')
    try {
      const parsed = parseGaMatchAliasInput(inputText)
      const data = await saveGaCustomerMatchAliases(token, customerId, parsed)
      setCustomerName(data.customerName ?? '')
      setSavedAliases(data.aliases ?? [])
      setInputText(aliasesToCommaSeparatedInputValue(data.aliases ?? []))
      setSaveMessage('저장되었습니다.')
      return true
    } catch {
      setError('예외 매칭값 저장에 실패했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }, [token, customerId, inputText])

  return {
    loading,
    saving,
    customerName,
    inputText,
    setInputText,
    savedAliases,
    error,
    saveMessage,
    onSave,
  }
}
