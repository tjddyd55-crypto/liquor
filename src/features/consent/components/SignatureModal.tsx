import { FormButton } from '../../../components/form'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'

export interface SignatureModalProps {
  open: boolean
  onClose: () => void
  onSave: (pngBlob: Blob) => Promise<void> | void
  /** 기본값: 서명 */
  title?: string
  /** 기본값: 저장 */
  saveLabel?: string
  /** 모달 본문 안내 (예: 손가락으로 서명) */
  description?: string
  /** 서명 필드(또는 세션)가 바뀔 때 패드를 초기화하기 위한 키 */
  padResetKey?: string
}

export function SignatureModal({ open, onClose, onSave, title, saveLabel, description, padResetKey }: SignatureModalProps) {
  const signaturePadRef = useRef<SignaturePadHandle | null>(null)
  const [hasStroke, setHasStroke] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleDirtyChange = useCallback((dirty: boolean) => setHasStroke(dirty), [])
  const titleText = title?.trim() || '서명'
  const saveText = saveLabel?.trim() || '저장'

  useEffect(() => {
    if (!open) {
      return
    }
    const prevHtmlOverflow = document.documentElement.style.overflow
    const prevBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow
      document.body.style.overflow = prevBodyOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    setSaving(false)
  }, [open])

  const handleClear = useCallback(() => {
    signaturePadRef.current?.clear()
    setHasStroke(false)
    setError(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!hasStroke || saving) {
      return
    }
    const pad = signaturePadRef.current
    if (!pad) {
      setError('서명 패드를 찾을 수 없습니다.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const pngBlob = await pad.exportPng()
      await onSave(pngBlob)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '서명 저장 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [hasStroke, onClose, onSave, saving])

  if (!open) {
    return null
  }

  return (
    <div
      className="consent-signature-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-signature-title"
    >
      <div
        className="consent-signature-dialog"
        onMouseDown={(ev) => ev.stopPropagation()}
        onTouchStart={(ev) => ev.stopPropagation()}
      >
        <header className="consent-signature-header">
          <span className="consent-signature-header__spacer" aria-hidden />
          <h2 id="consent-signature-title" className="consent-signature-header__title">
            {titleText}
          </h2>
          <button
            type="button"
            className="consent-signature-header__close"
            onClick={() => !saving && onClose()}
            disabled={saving}
            aria-label="닫기"
          >
            닫기
          </button>
        </header>
        {description?.trim() ? (
          <p className="consent-signature-modal-desc">{description.trim()}</p>
        ) : null}
        <div className="consent-signature-canvas-wrap">
          <div className="consent-signature-canvas-surface" key={padResetKey?.trim() ? padResetKey.trim() : 'signature-pad'}>
            <SignaturePad ref={signaturePadRef} className="consent-signature-canvas" onDirtyChange={handleDirtyChange} />
          </div>
        </div>
        {error ? <p className="consent-signature-error">{error}</p> : null}
        <footer className="consent-signature-footer">
          <FormButton htmlType="button" className="consent-btn consent-btn--secondary" onClick={handleClear}>
            지우기
          </FormButton>
          <FormButton htmlType="button" className="consent-btn consent-btn--secondary" onClick={onClose} disabled={saving}>
            취소
          </FormButton>
          <FormButton htmlType="button" className="consent-btn" onClick={() => void handleSave()} disabled={!hasStroke || saving}>
            {saving ? `${saveText} 중…` : saveText}
          </FormButton>
        </footer>
      </div>
    </div>
  )
}
