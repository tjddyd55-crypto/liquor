import FormInput from '../../../components/form/FormInput'

export type CustomerDrivingRadioGroupProps = {
  /** 미선택 시 null — 두 라디오 모두 해제 */
  value: boolean | null
  onChange: (next: boolean) => void
  name: string
  disabled?: boolean
}

export function CustomerDrivingRadioGroup({
  value,
  onChange,
  name,
  disabled,
}: CustomerDrivingRadioGroupProps) {
  return (
    <div className="customer-driving-radio-group" role="radiogroup" aria-label="운전 여부">
      <label className="customer-driving-radio-option">
        <FormInput
          type="radio"
          name={name}
          className="customer-driving-radio-option__input"
          checked={value === true}
          disabled={disabled}
          onChange={() => onChange(true)}
        />
        <span className="customer-driving-radio-option__label">운전함</span>
      </label>
      <label className="customer-driving-radio-option">
        <FormInput
          type="radio"
          name={name}
          className="customer-driving-radio-option__input"
          checked={value === false}
          disabled={disabled}
          onChange={() => onChange(false)}
        />
        <span className="customer-driving-radio-option__label">운전 안함</span>
      </label>
    </div>
  )
}
