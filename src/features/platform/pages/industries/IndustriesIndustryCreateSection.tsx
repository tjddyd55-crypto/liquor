import type { FormEvent } from 'react'
import { FormButton, FormInput, FormSelect, type FormSelectOption } from '../../../../components/form'
import type { IndustryStatus } from '../../platformAdmin.types'

const STATUS_OPTIONS: FormSelectOption[] = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
]

export type IndustriesIndustryCreateSectionProps = {
  code: string
  name: string
  status: IndustryStatus
  submitting: boolean
  disabled: boolean
  successMessage: string | null
  submitError: string | null
  codeFieldError: string | null
  nameFieldError: string | null
  statusFieldError: string | null
  onCodeChange: (value: string) => void
  onNameChange: (value: string) => void
  onStatusChange: (value: IndustryStatus) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

export default function IndustriesIndustryCreateSection({
  code,
  name,
  status,
  submitting,
  disabled,
  successMessage,
  submitError,
  codeFieldError,
  nameFieldError,
  statusFieldError,
  onCodeChange,
  onNameChange,
  onStatusChange,
  onSubmit,
}: IndustriesIndustryCreateSectionProps) {
  return (
    <section
      className="platform-admin-page__panel platform-admin-page__industry-create"
      aria-labelledby="platform-industry-create-title"
    >
      <h2 id="platform-industry-create-title" className="platform-admin-page__panel-title">
        Industry 생성
      </h2>
      <p className="platform-admin-page__muted platform-admin-page__field-hint">
        code는 저장 시 <strong>영문 소문자로 정규화</strong>됩니다. 첫 글자는 소문자 또는 숫자, 이후 소문자·숫자·
        <span className="platform-admin-page__mono">_</span>·
        <span className="platform-admin-page__mono">-</span> 만 허용(최대 64자)입니다.
      </p>
      {successMessage ? (
        <div
          className="platform-admin-page__panel platform-admin-page__panel--success platform-admin-page__industry-create-feedback"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
      {submitError ? (
        <div
          className="platform-admin-page__panel platform-admin-page__panel--error platform-admin-page__industry-create-feedback"
          role="alert"
        >
          {submitError}
        </div>
      ) : null}
      <form className="platform-admin-page__industry-create-form" onSubmit={onSubmit}>
        <div className="platform-admin-page__form-field">
          <label className="platform-admin-page__muted" htmlFor="platform-industry-create-code">
            code <span className="platform-admin-page__required">*</span>
          </label>
          <FormInput
            id="platform-industry-create-code"
            name="code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            disabled={disabled || submitting}
            autoComplete="off"
            spellCheck={false}
          />
          {codeFieldError ? (
            <p className="platform-admin-page__field-error" role="alert">
              {codeFieldError}
            </p>
          ) : null}
        </div>
        <div className="platform-admin-page__form-field">
          <label className="platform-admin-page__muted" htmlFor="platform-industry-create-name">
            name <span className="platform-admin-page__required">*</span>
          </label>
          <FormInput
            id="platform-industry-create-name"
            name="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={disabled || submitting}
            autoComplete="off"
          />
          {nameFieldError ? (
            <p className="platform-admin-page__field-error" role="alert">
              {nameFieldError}
            </p>
          ) : null}
        </div>
        <div className="platform-admin-page__form-field">
          <label className="platform-admin-page__muted" htmlFor="platform-industry-create-status">
            status
          </label>
          <FormSelect
            id="platform-industry-create-status"
            name="status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(e) => onStatusChange(e.target.value as IndustryStatus)}
            disabled={disabled || submitting}
          />
          {statusFieldError ? (
            <p className="platform-admin-page__field-error" role="alert">
              {statusFieldError}
            </p>
          ) : null}
        </div>
        <div className="platform-admin-page__form-actions">
          <FormButton htmlType="submit" variant="primary" loading={submitting} disabled={disabled}>
            생성
          </FormButton>
        </div>
      </form>
    </section>
  )
}
