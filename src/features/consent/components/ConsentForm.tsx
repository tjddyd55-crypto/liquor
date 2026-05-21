import { FormButton, FormInput } from '../../../components/form'
import type { ConsentFormData } from '../domain/types'

export interface ConsentFormProps {
  gaId: number
  insuranceCompanyId: string
  insuranceCompanyName: string
  consentTemplateId: string
  formData: ConsentFormData
  onFormChange: (field: keyof ConsentFormData, value: string) => void
  signatureImageUrl: string | null
  onOpenSignature: () => void
  onSend: () => void
  isSending?: boolean
}

const PREVIEW_PAGE_LABELS = ['동의서 미리보기 · 1쪽', '동의서 미리보기 · 2쪽', '동의서 미리보기 · 3쪽']

export function ConsentForm({
  gaId,
  insuranceCompanyId,
  insuranceCompanyName,
  consentTemplateId,
  formData,
  onFormChange,
  signatureImageUrl,
  onOpenSignature,
  onSend,
  isSending = false,
}: ConsentFormProps) {
  return (
    <>
      <header className="consent-form-header">
        <h2 className="consent-form-header__company">{insuranceCompanyName}</h2>
        <p className="consent-form-header__meta">
          ga_id: {gaId} · insurance_company_id: {insuranceCompanyId} · consent_template_id:{' '}
          {consentTemplateId}
        </p>
      </header>

      <div className="consent-card">
        <div className="consent-field">
          <label className="consent-field__label" htmlFor="consent-name">
            이름
          </label>
          <FormInput
            id="consent-name"
            className="consent-field__input"
            autoComplete="name"
            placeholder="이름을 입력하세요"
            value={formData.name}
            onChange={(e) => onFormChange('name', e.target.value)}
          />
        </div>
        <div className="consent-field">
          <label className="consent-field__label" htmlFor="consent-ssn">
            주민등록번호
          </label>
          <FormInput
            id="consent-ssn"
            className="consent-field__input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="주민번호를 입력하세요"
            value={formData.ssn}
            onChange={(e) => onFormChange('ssn', e.target.value)}
          />
        </div>
        <div className="consent-field">
          <label className="consent-field__label" htmlFor="consent-phone">
            연락처
          </label>
          <FormInput
            id="consent-phone"
            className="consent-field__input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="연락처를 입력하세요"
            value={formData.phone}
            onChange={(e) => onFormChange('phone', e.target.value)}
          />
        </div>
      </div>

      <section className="consent-section consent-card">
        <h3 className="consent-section__label">서명</h3>
        <FormButton htmlType="button" className="consent-btn consent-btn--full" onClick={onOpenSignature}>
          {signatureImageUrl ? '다시 작성' : '서명하기'}
        </FormButton>
        {signatureImageUrl ? (
          <div className="consent-signature-preview-wrap">
            <img src={signatureImageUrl} alt="저장된 서명 미리보기" className="consent-signature-preview-image" />
          </div>
        ) : null}
        <p className="consent-signature-status">
          {signatureImageUrl ? '서명이 저장되었습니다.' : '서명이 없습니다.'}
        </p>
      </section>

      <section className="consent-section consent-card">
        <h3 className="consent-section__label">동의서 미리보기</h3>
        <div className="consent-preview-scroll">
          {PREVIEW_PAGE_LABELS.map((label) => (
            <div key={label} className="consent-preview-page" role="img" aria-label={label}>
              {label}
              <br />
              <span style={{ fontSize: '12px', opacity: 0.85 }}>이미지 placeholder (PDF 연동 예정)</span>
            </div>
          ))}
        </div>
      </section>

      <div className="consent-form-actions">
        <FormButton
          htmlType="button"
          className="consent-btn consent-btn--full"
          onClick={onSend}
          disabled={isSending}
        >
          {isSending ? 'PDF 생성 중...' : '발송하기'}
        </FormButton>
      </div>
    </>
  )
}
