import { FormButton, FormInput, FormTextarea } from '../../../components/form'
import { type FormEvent, useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { createTeamPost, updateTeamPost } from '../api/teamApi'
import { uploadTeamPostFiles } from '../lib/uploadTeamPostAttachments'

export type TeamPostModalInitialData = {
  id: string
  title: string
  content: string
  is_notice: boolean
}

export type TeamPostFormModalProps = {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  initialData?: TeamPostModalInitialData
  token: string
  canSetNotice: boolean
  onSuccess: () => void | Promise<void>
}

export function TeamPostFormModal({
  open,
  onClose,
  mode,
  initialData,
  token,
  canSetNotice,
  onSuccess,
}: TeamPostFormModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    if (mode === 'edit' && initialData) {
      setTitle(initialData.title)
      setContent(initialData.content)
      setIsNotice(initialData.is_notice)
      setFiles([])
    } else {
      setTitle('')
      setContent('')
      setIsNotice(false)
      setFiles([])
    }
    setSubmitError('')
  }, [open, mode, initialData])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim()) {
      return
    }
    setSubmitError('')
    const titleTrim = title.trim()
    const contentTrim = content.trim()
    if (!titleTrim) {
      setSubmitError('제목을 입력해 주세요.')
      return
    }
    if (!contentTrim) {
      setSubmitError('내용을 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const isNoticePayload =
        mode === 'edit' && initialData && !canSetNotice
          ? initialData.is_notice
          : canSetNotice && isNotice

      if (mode === 'create') {
        let uploaded: { objectKey: string; fileName: string; fileUrl: string }[] = []
        if (files.length > 0) {
          uploaded = await uploadTeamPostFiles(token, files)
        }
        await createTeamPost(token, {
          title: titleTrim,
          content: contentTrim,
          isNotice: isNoticePayload,
          attachments: uploaded,
        })
      } else {
        if (!initialData?.id) {
          setSubmitError('수정할 글 정보가 없습니다.')
          return
        }
        await updateTeamPost(token, initialData.id, {
          title: titleTrim,
          content: contentTrim,
          isNotice: isNoticePayload,
        })
      }
      onClose()
      await onSuccess()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : mode === 'create' ? '등록에 실패했습니다.' : '수정에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={mode === 'edit' ? '팀 게시글 수정' : '팀 게시글 작성'}
      panelClassName="!max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <form className="space-y-3" onSubmit={(ev) => void handleSubmit(ev)}>
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {mode === 'edit' ? '글 수정' : '글 작성'}
        </div>
        <label className="block text-sm text-[var(--text-secondary)]">
          제목
          <FormInput
            className="mt-1 w-full box-border border border-[var(--border-default)] rounded-md p-2 text-sm bg-[var(--bg-soft)] text-[var(--text-primary)]"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            maxLength={200}
          />
        </label>
        <label className="block text-sm text-[var(--text-secondary)]">
          내용
          <FormTextarea
            className="mt-1 w-full min-h-[120px] box-border border border-[var(--border-default)] rounded-md p-2 text-sm bg-[var(--bg-soft)] text-[var(--text-primary)]"
            value={content}
            onChange={(ev) => setContent(ev.target.value)}
            maxLength={50000}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <FormInput
            type="checkbox"
            checked={isNotice}
            disabled={!canSetNotice}
            onChange={(ev) => setIsNotice(ev.target.checked)}
          />
          공지로 등록 {canSetNotice ? null : <span className="text-xs text-[var(--text-secondary)]">(팀장만)</span>}
        </label>
        {mode === 'create' ? (
          <label className="block text-sm text-[var(--text-secondary)]">
            첨부 (이미지·PDF, 최대 10개)
            <FormInput
              type="file"
              className="mt-1 w-full text-sm"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              multiple
              onChange={(ev) => setFiles(Array.from(ev.target.files ?? []))}
            />
          </label>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">첨부 파일은 수정 화면에서 변경할 수 없습니다.</p>
        )}
        {submitError ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={onClose} disabled={submitting}>
            취소
          </FormButton>
          <FormButton htmlType="submit" variant="action" className="cta-button" disabled={submitting}>
            {submitting ? (mode === 'edit' ? '저장 중…' : '등록 중…') : mode === 'edit' ? '저장' : '등록'}
          </FormButton>
        </div>
      </form>
    </Modal>
  )
}
