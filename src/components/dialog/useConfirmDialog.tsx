import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

type ConfirmRequest = {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type PendingConfirm = ConfirmRequest & {
  resolve: (value: boolean) => void
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const closeWith = useCallback((result: boolean) => {
    setPending((current) => {
      if (!current) {
        return null
      }
      current.resolve(result)
      return null
    })
  }, [])

  const confirm = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        ...request,
        resolve,
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      setPending((current) => {
        if (current) {
          current.resolve(false)
        }
        return null
      })
    }
  }, [])

  return {
    confirm,
    confirmDialog: (
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title}
        message={pending?.message ?? ''}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        tone={pending?.tone ?? 'default'}
        onConfirm={() => closeWith(true)}
        onCancel={() => closeWith(false)}
      />
    ),
  }
}
