import { useCallback, useState } from 'react'
import type { LocalAttachmentDraft, UploadStatus } from '../types'
import { validateInsurerNewsFile } from '../utils/validateInsurerNewsFile'

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useAttachmentUploadQueue(initial: LocalAttachmentDraft[] = []) {
  const [items, setItems] = useState<LocalAttachmentDraft[]>(initial)

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    const next: LocalAttachmentDraft[] = []
    for (const file of arr) {
      const v = validateInsurerNewsFile(file)
      if (!v.ok) {
        next.push({
          localId: newLocalId(),
          file,
          kind: 'image',
          previewUrl: null,
          status: 'failed',
          errorMessage: v.message,
        })
        continue
      }
      const previewUrl = v.kind === 'image' ? URL.createObjectURL(file) : null
      next.push({
        localId: newLocalId(),
        file,
        kind: v.kind,
        previewUrl,
        status: 'pending',
      })
    }
    setItems((prev) => [...prev, ...next])
  }, [])

  const remove = useCallback((localId: string) => {
    setItems((prev) => {
      const row = prev.find((x) => x.localId === localId)
      if (row?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(row.previewUrl)
      }
      return prev.filter((x) => x.localId !== localId)
    })
  }, [])

  const setStatus = useCallback((localId: string, status: UploadStatus, errorMessage?: string) => {
    setItems((prev) =>
      prev.map((x) => (x.localId === localId ? { ...x, status, errorMessage } : x)),
    )
  }, [])

  const replaceAll = useCallback((next: LocalAttachmentDraft[]) => {
    setItems((prev) => {
      for (const x of prev) {
        if (x.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(x.previewUrl)
        }
      }
      return next
    })
  }, [])

  return { items, addFiles, remove, setStatus, replaceAll, setItems }
}
