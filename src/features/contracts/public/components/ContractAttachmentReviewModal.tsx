import { useEffect, useState, type ReactNode } from 'react'
import { FormButton } from '../../../../components/form'
import {
  postContractPublicAttachmentConfirm,
  resolveContractAttachmentViewAbsUrl,
  type ContractSendSessionAttachmentPublic,
} from '../contractPublicClient'
import { PublicPdfPreviewModal } from './PublicPdfPreviewModal'
import '../contract-public-sign.css'

function isPdfAttachment(mime: string | null | undefined, filename: string): boolean {
  const m = String(mime ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (m === 'application/pdf') {
    return true
  }
  return filename.toLowerCase().endsWith('.pdf')
}

function isImageAttachment(mime: string | null | undefined): boolean {
  const m = String(mime ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  return m.startsWith('image/')
}

export type ContractAttachmentReviewModalProps = {
  open: boolean
  onClose: () => void
  linkCode: string
  attachment: ContractSendSessionAttachmentPublic | null
  /** 모달이 열릴 때마다 증가시켜 PDF/이미지 다시 로드 */
  loadNonce?: number
  onConfirmed: (next: {
    attachmentId: string
    viewed: boolean
    confirmed: boolean
    confirmedAt: string | null
  }) => void
  onActionError: (message: string) => void
}

export function ContractAttachmentReviewModal({
  open,
  onClose,
  linkCode,
  attachment,
  loadNonce = 0,
  onConfirmed,
  onActionError,
}: ContractAttachmentReviewModalProps) {
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !attachment) {
      return
    }
    const pdf = isPdfAttachment(attachment.mimeType, attachment.displayFilename)
    if (pdf) {
      return
    }
    if (!isImageAttachment(attachment.mimeType)) {
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    const url = resolveContractAttachmentViewAbsUrl(linkCode, attachment.id)
    setImgError(null)
    setImgLoading(true)
    setImgUrl(null)
    ;(async () => {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const blob = await res.blob()
        createdUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(createdUrl)
          return
        }
        setImgUrl(createdUrl)
      } catch {
        if (!cancelled) {
          setImgError('첨부 이미지를 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) {
          setImgLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [open, attachment, linkCode, loadNonce])

  useEffect(() => {
    if (open) {
      return
    }
    setConfirmBusy(false)
    setImgUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return null
    })
    setImgLoading(false)
    setImgError(null)
  }, [open])

  const pdfOpen =
    open &&
    attachment != null &&
    isPdfAttachment(attachment.mimeType, attachment.displayFilename)

  useEffect(() => {
    if (!open || !attachment || pdfOpen) {
      return
    }
    const prevOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow
      document.body.style.overflow = prevOverflow
    }
  }, [open, attachment, pdfOpen])

  if (!open || !attachment) {
    return null
  }

  const viewUrl = resolveContractAttachmentViewAbsUrl(linkCode, attachment.id)
  const pdf = isPdfAttachment(attachment.mimeType, attachment.displayFilename)
  const image = isImageAttachment(attachment.mimeType)

  const footerButtons = (): ReactNode => {
    if (attachment.confirmed) {
      return (
        <>
          <span className="contract-public-sign-page__caption" style={{ marginRight: 'auto' }}>
            이미 확인한 첨부자료입니다.
          </span>
          <FormButton htmlType="button" variant="secondary" disabled>
            확인 완료
          </FormButton>
          <FormButton htmlType="button" variant="secondary" onClick={onClose}>
            닫기
          </FormButton>
        </>
      )
    }
    return (
      <>
        <FormButton htmlType="button" variant="secondary" onClick={onClose} disabled={confirmBusy}>
          닫기
        </FormButton>
        <FormButton
          htmlType="button"
          variant="primary"
          loading={confirmBusy}
          onClick={() => {
            setConfirmBusy(true)
            onActionError('')
            ;(async () => {
              try {
                const data = await postContractPublicAttachmentConfirm(linkCode, attachment.id)
                onConfirmed({
                  attachmentId: data.attachmentId,
                  viewed: data.viewed,
                  confirmed: data.confirmed,
                  confirmedAt: data.confirmedAt,
                })
                onClose()
              } catch (e) {
                const msg = e instanceof Error ? e.message : '확인 처리에 실패했습니다.'
                onActionError(msg)
              } finally {
                setConfirmBusy(false)
              }
            })()
          }}
        >
          이 첨부자료를 확인했습니다
        </FormButton>
      </>
    )
  }

  if (pdf) {
    return (
      <PublicPdfPreviewModal
        open
        onClose={onClose}
        title={attachment.displayFilename || '첨부 PDF'}
        pdfUrl={viewUrl}
        pageCount={1}
        loadNonce={loadNonce}
        documentInstanceId={attachment.id}
        footerSlot={footerButtons()}
      />
    )
  }

  if (image) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={attachment.displayFilename || '첨부 이미지'}
        className="public-pdf-preview-modal"
      >
        <header className="public-pdf-preview-modal__header">
          <div className="public-pdf-preview-modal__titles">
            <h2 className="public-pdf-preview-modal__title">{attachment.displayFilename || '첨부 이미지'}</h2>
          </div>
          <FormButton htmlType="button" variant="secondary" onClick={onClose}>
            닫기
          </FormButton>
        </header>
        <div className="public-pdf-preview-modal__scroll">
          {imgLoading ? <p className="public-pdf-preview-modal__scroll-loading">불러오는 중…</p> : null}
          {imgError ? (
            <div className="public-pdf-preview-modal__error">
              <p className="public-pdf-preview-modal__error-msg">{imgError}</p>
            </div>
          ) : null}
          {!imgLoading && !imgError && imgUrl ? (
            <div className="contract-attachment-review-modal__img-outer">
              <img
                className="contract-attachment-review-modal__img"
                src={imgUrl}
                alt={attachment.displayFilename || ''}
              />
            </div>
          ) : null}
        </div>
        <div className="public-pdf-preview-modal__footer">{footerButtons()}</div>
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" className="public-pdf-preview-modal">
      <header className="public-pdf-preview-modal__header">
        <div className="public-pdf-preview-modal__titles">
          <h2 className="public-pdf-preview-modal__title">{attachment.displayFilename || '첨부 파일'}</h2>
        </div>
        <FormButton htmlType="button" variant="secondary" onClick={onClose}>
          닫기
        </FormButton>
      </header>
      <div className="public-pdf-preview-modal__scroll">
        <p className="contract-public-sign-page__notice" style={{ padding: 16 }}>
          이 형식은 이 화면에서 미리볼 수 없습니다. 담당자에게 문의해 주세요.
        </p>
      </div>
      <div className="public-pdf-preview-modal__footer">
        <FormButton htmlType="button" variant="secondary" onClick={onClose}>
          닫기
        </FormButton>
      </div>
    </div>
  )
}
