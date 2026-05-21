import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useConfirmDialog } from '../../../../components/dialog'
import { useAuth } from '../../../auth/AuthProvider'
import {
  createCustomerNews,
  deleteCustomerNews,
  listAgentCustomerNews,
  listLinkedCustomers,
  updateCustomerNews,
  type AgentCustomerNewsItem,
  type LinkedCustomerItem,
} from '../../api/claimRequestsApi'
import { salutationHonorific } from '../../utils/personalMessageLabels'
import ClaimRequestsPersonalMobileView from './ClaimRequestsPersonalMobileView'

function parsePositiveInt(raw: string | null | undefined): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ClaimRequestsPersonalMobileStandalone() {
  const { token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const { customerId: customerIdParam } = useParams<{ customerId?: string }>()
  const [searchParams] = useSearchParams()
  const activeCustomerId = useMemo(() => {
    const fromQuery = parsePositiveInt(searchParams.get('customerId'))
    if (fromQuery != null) {
      return fromQuery
    }
    return parsePositiveInt(customerIdParam ?? null)
  }, [customerIdParam, searchParams])

  const [linkedCustomers, setLinkedCustomers] = useState<LinkedCustomerItem[]>([])
  const [resolvedCustomerName, setResolvedCustomerName] = useState('')
  const [history, setHistory] = useState<AgentCustomerNewsItem[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const targetCustomer = useMemo(
    () => linkedCustomers.find((item) => item.customerId === activeCustomerId) ?? null,
    [activeCustomerId, linkedCustomers],
  )

  const honorific = useMemo(() => salutationHonorific(resolvedCustomerName || targetCustomer?.customerName), [resolvedCustomerName, targetCustomer])

  const loadLinkedCustomers = useCallback(async () => {
    if (!token) {
      return
    }
    try {
      const customers = await listLinkedCustomers(token)
      setLinkedCustomers(customers)
    } catch {
      setLinkedCustomers([])
    }
  }, [token])

  const loadHistory = useCallback(async () => {
    if (!token || !activeCustomerId) {
      setHistory([])
      return
    }
    setLoading(true)
    try {
      const personal = await listAgentCustomerNews(token, {
        scope: 'personal',
        targetCustomerId: activeCustomerId,
      })
      setHistory(personal)
      const nameRow = personal.find((r) => r.targetCustomerName?.trim())
      if (nameRow?.targetCustomerName?.trim()) {
        setResolvedCustomerName(nameRow.targetCustomerName.trim())
      }
    } catch (loadError) {
      setHistory([])
      setError(loadError instanceof Error ? loadError.message : '개인메시지를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [activeCustomerId, token])

  useEffect(() => {
    void loadLinkedCustomers()
  }, [loadLinkedCustomers])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    setMessage('')
    setResult('')
    setError('')
    setDeletingId(null)
    setEditingId(null)
  }, [activeCustomerId])

  useEffect(() => {
    const fromLink = targetCustomer?.customerName?.trim()
    if (fromLink) {
      setResolvedCustomerName(fromLink)
    }
  }, [targetCustomer])

  const handleSendOrSave = async () => {
    if (!token) {
      return
    }
    if (!activeCustomerId) {
      setError('고객을 선택해 주세요.')
      return
    }
    const content = message.trim()
    if (!content) {
      setError('개인메시지 내용을 입력해 주세요.')
      return
    }
    setActionBusy(true)
    setError('')
    setResult('')
    try {
      if (editingId) {
        await updateCustomerNews(token, editingId, {
          title: honorific,
          content,
          sendPush: true,
        })
        setResult('개인메시지를 저장했습니다.')
        setEditingId(null)
      } else {
        await createCustomerNews(token, {
          title: honorific,
          content,
          scope: 'personal',
          targetCustomerId: activeCustomerId,
          sendPush: true,
        })
        setResult('개인메시지 발송했습니다.')
      }
      setMessage('')
      await loadHistory()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '처리에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleStartEdit = (item: AgentCustomerNewsItem) => {
    setEditingId(item.id)
    setMessage(String(item.content ?? ''))
    setError('')
    setResult('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setMessage('')
    setError('')
  }

  const handleDeleteMessage = async (item: AgentCustomerNewsItem) => {
    if (!token) {
      return
    }
    const ok = await confirm({
      title: '개인메시지 삭제',
      message: '이 개인메시지를 삭제할까요? 고객앱에서도 더 이상 보이지 않습니다.',
      tone: 'danger',
      confirmLabel: '삭제',
    })
    if (!ok) {
      return
    }
    setDeletingId(item.id)
    setError('')
    setResult('')
    try {
      await deleteCustomerNews(token, item.id, { targetCustomerId: item.targetCustomerId ?? activeCustomerId })
      setHistory((prev) => prev.filter((row) => row.id !== item.id))
      setResult('소식지를 삭제했습니다.')
      if (editingId === item.id) {
        setEditingId(null)
        setMessage('')
      }
      await loadHistory()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '소식지 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const targetHeading = honorific

  return (
    <>
      <ClaimRequestsPersonalMobileView
        targetHeading={targetHeading}
        targetCustomer={targetCustomer}
        targetCustomerId={activeCustomerId}
        message={message}
        history={history}
        loading={loading}
        actionBusy={actionBusy}
        deletingId={deletingId}
        editingId={editingId}
        resultMessage={result}
        errorMessage={error}
        onMessageChange={setMessage}
        onSend={() => void handleSendOrSave()}
        onStartEdit={(item) => handleStartEdit(item)}
        onCancelEdit={handleCancelEdit}
        onDeleteMessage={(item) => void handleDeleteMessage(item)}
        formatDateTime={formatDateTime}
      />
      {confirmDialog}
    </>
  )
}
