import { type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import { InsuranceInline } from '../../../components/customer/CustomerForm'
import {
  AddressSearchField,
  FormButton,
  FormInput,
  FormTextarea,
  type AddressSearchValue,
} from '../../../components/form'
import {
  CUSTOMER_INSURANCE_HISTORY_PLACEHOLDER,
  CUSTOMER_MEDICAL_HISTORY_PLACEHOLDER,
  CUSTOMER_MEDICAL_QUESTION_TEXT,
} from '../utils/customerDisplayFormat'
import { resolveGenderAfterSsnInput } from '../utils/inferGenderFromResidentNumberDigits'
import type { CustomerEditFormState } from '../types/customerEditForm'
import { CustomerCarsEditor } from './CustomerCarsEditor'
import { CustomerDrivingRadioGroup } from './CustomerDrivingRadioGroup'
import CustomerIndustryTemplateFields from './CustomerIndustryTemplateFields'
import { CustomerFormSection } from './CustomerFormSection'

type CustomerEditFormProps = {
  customerId: number
  editForm: CustomerEditFormState
  setEditForm: Dispatch<SetStateAction<CustomerEditFormState | null>>
  /** PC·모바일 공통: Enter 등으로 폼 submit 시 부모가 `preventDefault` 등을 쓸 때 호출(레거시 경로 유지). */
  onEditSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>
  /** 저장 요청 — submit 이벤트와 분리된 직접 저장 경로(모바일 터치 안정화). */
  onEditSaveRequest: () => void | Promise<void>
  saving?: boolean
  statusText?: string
  onCancelEdit: () => void
  isInsuranceLayout: boolean
  crmIndustryTemplate: CustomerIndustryTemplate
}

export default function CustomerEditForm({
  customerId,
  editForm,
  setEditForm,
  onEditSubmit: _onEditSubmit,
  onEditSaveRequest,
  saving = false,
  statusText,
  onCancelEdit,
  isInsuranceLayout,
  crmIndustryTemplate,
}: CustomerEditFormProps) {
  return (
    <>
      <div className="customer-edit-banner" role="status">
        ✏ 고객 정보 수정 중
      </div>
      <form
        className="customer-edit-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void onEditSaveRequest()
        }}
      >
        {isInsuranceLayout ? (
          <div className="field-grid-customers">
            <div className="customer-form-compact-grid field--wide">
          <label className="field">
            <span className="field__label">이름</span>
            <FormInput
              className="field__control"
              name="customer-name"
              autoComplete="name"
              value={editForm.name ?? ''}
              onChange={(e) =>
                setEditForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
              }
            />
          </label>
          <div className="field customer-form-field--gender">
            <span className="field__label">성별</span>
            <div className="customer-form-gender-options" role="radiogroup" aria-label="성별">
              <label>
                <FormInput
                  type="radio"
                  name={`gender-edit-${customerId}`}
                  checked={editForm.gender === 'male'}
                  onChange={() =>
                    setEditForm((prev) => (prev ? { ...prev, gender: 'male' } : prev))
                  }
                />{' '}
                남
              </label>
              <label>
                <FormInput
                  type="radio"
                  name={`gender-edit-${customerId}`}
                  checked={editForm.gender === 'female'}
                  onChange={() =>
                    setEditForm((prev) => (prev ? { ...prev, gender: 'female' } : prev))
                  }
                />{' '}
                여
              </label>
            </div>
          </div>
          <label className="field">
            <span className="field__label">주민번호</span>
            <FormInput
              className="field__control"
              name="customer-ssn"
              autoComplete="off"
              value={editForm.ssn ?? ''}
              onChange={(e) => {
                const next = e.target.value
                setEditForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        ssn: next,
                        gender: resolveGenderAfterSsnInput(prev.gender, next),
                      }
                    : prev,
                )
              }}
            />
          </label>
          <label className="field">
            <span className="field__label">전화번호</span>
            <FormInput
              className="field__control"
              name="customer-phone"
              autoComplete="tel"
              value={editForm.phone ?? ''}
              onChange={(e) =>
                setEditForm((prev) => (prev ? { ...prev, phone: e.target.value } : prev))
              }
            />
          </label>
          <InsuranceInline ssn={editForm.ssn ?? ''} />
          <label className="field">
            <span className="field__label">키</span>
            <FormInput
              className="field__control"
              value={editForm.height ?? ''}
              onChange={(e) =>
                setEditForm((prev) => (prev ? { ...prev, height: e.target.value } : prev))
              }
            />
          </label>
          <label className="field">
            <span className="field__label">몸무게</span>
            <FormInput
              className="field__control"
              value={editForm.weight ?? ''}
              onChange={(e) =>
                setEditForm((prev) => (prev ? { ...prev, weight: e.target.value } : prev))
              }
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">직업 / 회사명 / 하는 일 / 지역</span>
            <FormInput
              className="field__control"
              value={editForm.job ?? ''}
              onChange={(e) =>
                setEditForm((prev) => (prev ? { ...prev, job: e.target.value } : prev))
              }
            />
          </label>
          <div className="field field--wide customer-form-field--driving">
            <span className="field__label">운전 여부</span>
            <CustomerDrivingRadioGroup
              name={`driver-edit-${customerId}`}
              value={editForm.isDriver ?? null}
              onChange={(next) =>
                setEditForm((prev) => (prev ? { ...prev, isDriver: next } : prev))
              }
            />
          </div>
          </div>
          <div className="field field--wide">
            <span className="field__label">주소</span>
            <AddressSearchField
              className="address-search-field"
              value={{
                zonecode: editForm.zonecode ?? '',
                baseAddress: editForm.address ?? '',
                detailAddress: editForm.addressDetail ?? '',
              }}
              onChange={(next: AddressSearchValue) =>
                setEditForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        zonecode: next.zonecode,
                        address: next.baseAddress,
                        addressDetail: next.detailAddress,
                      }
                    : prev,
                )
              }
            />
          </div>
          <CustomerCarsEditor
            cars={editForm.cars}
            onChange={(next) =>
              setEditForm((prev) => (prev ? { ...prev, cars: next } : prev))
            }
          />
          <CustomerFormSection
            title={CUSTOMER_MEDICAL_QUESTION_TEXT}
            className="field field--wide"
            description="입력 형식은 아래 칸의 예시(placeholder)를 참고하세요."
          >
            <label className="customer-form-section__solo">
              <FormTextarea
                className="field__control customer-form-textarea customer-form-textarea--large customer-textarea--medical-history"
                rows={4}
                name="customer-medical"
                placeholder={CUSTOMER_MEDICAL_HISTORY_PLACEHOLDER}
                aria-label={CUSTOMER_MEDICAL_QUESTION_TEXT}
                value={editForm.medical ?? ''}
                onChange={(e) =>
                  setEditForm((prev) => (prev ? { ...prev, medical: e.target.value } : prev))
                }
              />
            </label>
          </CustomerFormSection>
          <CustomerFormSection title="보험가입내역" className="field field--wide">
            <label className="customer-form-section__solo">
              <FormTextarea
                className="field__control customer-form-textarea customer-form-textarea--large customer-textarea--insurance-history"
                rows={4}
                name="customer-insurance-history"
                placeholder={CUSTOMER_INSURANCE_HISTORY_PLACEHOLDER}
                aria-label="보험가입내역"
                value={editForm.insuranceHistory ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, insuranceHistory: e.target.value } : prev,
                  )
                }
              />
            </label>
          </CustomerFormSection>
        </div>
        ) : (
          <CustomerIndustryTemplateFields
            template={crmIndustryTemplate}
            variant="edit"
            radioSuffix={`edit-${customerId}`}
            value={editForm}
            onPatch={(patch) => setEditForm((prev) => (prev ? { ...prev, ...patch } : prev))}
          />
        )}
        {statusText?.trim() ? (
          <p className="customer-edit-form__status" role="status" aria-live="polite">
            {statusText}
          </p>
        ) : null}
        <div className="customer-edit-actions">
          <FormButton
            className="button-save"
            htmlType="button"
            variant="primary"
            disabled={saving}
            loading={saving}
            loadingText="저장 중…"
            onClick={() => {
              void onEditSaveRequest()
            }}
          >
            수정 저장
          </FormButton>
          <FormButton
            className="button-cancel"
            htmlType="button"
            variant="secondary"
            onClick={onCancelEdit}
          >
            취소
          </FormButton>
        </div>
      </form>
    </>
  )
}
