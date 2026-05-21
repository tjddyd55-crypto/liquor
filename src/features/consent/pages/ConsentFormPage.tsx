import { FormButton } from '../../../components/form'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { getPublicOrigin } from '../../../lib/publicOrigin'
import { useAuth } from '../../auth/AuthProvider'
import { generateConsentPdf } from '../api/consentApi'
import { saveSignature } from '../api/signatureApi'
import { ConsentForm } from '../components/ConsentForm'
import { SignatureModal } from '../components/SignatureModal'
import type { ConsentCompanySelection, ConsentFormData } from '../domain/types'
import '../consent.css'

function resolvePdfOpenUrl(pdfUrl: string): string {
  if (/^https?:\/\//i.test(pdfUrl)) {
    return pdfUrl
  }
  if (typeof window !== 'undefined') {
    const base = getPublicOrigin() || window.location.origin
    return new URL(pdfUrl, base).href
  }
  return pdfUrl
}

function isConsentSelection(state: unknown): state is ConsentCompanySelection {
  if (!state || typeof state !== 'object') {
    return false
  }
  const s = state as Record<string, unknown>
  return (
    typeof s.gaId === 'number' &&
    Number.isFinite(s.gaId) &&
    typeof s.insuranceCompanyId === 'string' &&
    typeof s.insuranceCompanyName === 'string' &&
    typeof s.consentTemplateId === 'string'
  )
}

const EMPTY_FORM: ConsentFormData = {
  name: '',
  ssn: '',
  phone: '',
}

interface SavedSignature {
  id: string
  previewUrl: string
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('서명 데이터를 읽지 못했습니다.'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => {
      reject(new Error('서명 데이터를 읽는 중 오류가 발생했습니다.'))
    }
    reader.readAsDataURL(blob)
  })
}

export function ConsentFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, user } = useAuth()
  const selection = location.state

  const [formData, setFormData] = useState<ConsentFormData>(EMPTY_FORM)
  const [signature, setSignature] = useState<SavedSignature | null>(null)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [sendNotice, setSendNotice] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (!isConsentSelection(selection)) {
      navigate('/internal/consent', { replace: true })
    }
  }, [selection, navigate])

  if (!isConsentSelection(selection)) {
    return null
  }

  const { gaId, insuranceCompanyId, insuranceCompanyName, consentTemplateId } = selection

  const handleFormChange = (field: keyof ConsentFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveSignature = async (pngBlob: Blob) => {
    setSendError(null)
    setSendNotice(null)
    if (!token?.trim()) {
      throw new Error('로그인이 필요합니다.')
    }
    if (!user?.id) {
      throw new Error('사용자 정보가 올바르지 않습니다.')
    }
    const signatureDataUrl = await blobToDataUrl(pngBlob)
    const saved = await saveSignature(token, {
      signatureDataUrl,
      signerType: 'USER',
      signerId: user.id,
      customerId: null,
      relatedType: null,
      relatedId: null,
      replaceSignatureId: signature?.id ?? null,
    })
    setSignature({ id: saved.id, previewUrl: saved.previewUrl })
    setSendNotice('서명이 저장되었습니다.')
  }

  const handleSend = async () => {
    setSendError(null)
    setSendNotice(null)
    if (!token?.trim()) {
      setSendError('로그인이 필요합니다.')
      return
    }
    if (!formData.name.trim()) {
      setSendError('이름을 입력하세요.')
      return
    }
    setIsSending(true)
    try {
      const res = await generateConsentPdf(token, {
        consent_template_id: consentTemplateId,
        formData: {
          name: formData.name.trim(),
          ssn: formData.ssn.trim(),
          phone: formData.phone.trim(),
        },
        signature: null,
      })
      const openUrl = resolvePdfOpenUrl(res.pdfUrl)
      setLastPdfUrl(openUrl)
      setSendNotice('동의서 PDF가 생성되었습니다. 새 탭에서 열 수 있습니다.')
      window.open(openUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'PDF 생성에 실패했습니다.'
      setSendError(msg)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className="consent-flow">
      <div className="consent-flow__inner">
        <nav style={{ marginBottom: 16 }}>
          <FormButton
            htmlType="button"
            className="consent-btn consent-btn--secondary"
            onClick={() => navigate('/internal/consent')}
          >
            보험사 다시 선택
          </FormButton>
        </nav>

        <ConsentForm
          gaId={gaId}
          insuranceCompanyId={insuranceCompanyId}
          insuranceCompanyName={insuranceCompanyName}
          consentTemplateId={consentTemplateId}
          formData={formData}
          onFormChange={handleFormChange}
          signatureImageUrl={signature?.previewUrl ?? null}
          onOpenSignature={() => setSignatureOpen(true)}
          onSend={() => void handleSend()}
          isSending={isSending}
        />

        {sendNotice ? <p className="consent-mock-toast">{sendNotice}</p> : null}
        {sendError ? (
          <p className="consent-mock-toast" style={{ borderColor: 'var(--consent-border)', color: '#fca5a5' }}>
            {sendError}
          </p>
        ) : null}
        {lastPdfUrl ? (
          <p className="consent-mock-toast">
            <a href={lastPdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd' }}>
              PDF 다시 열기
            </a>
          </p>
        ) : null}
      </div>

      <SignatureModal open={signatureOpen} onClose={() => setSignatureOpen(false)} onSave={handleSaveSignature} />
    </main>
  )
}
