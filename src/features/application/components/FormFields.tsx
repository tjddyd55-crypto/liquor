import type { HTMLAttributes, KeyboardEventHandler } from 'react'
import { FieldWrapper, FormInput, FormSelect, FormTextarea } from '../../../components/form'

interface BaseFieldProps {
  label: string
  required?: boolean
  helperText?: string
}

interface TextInputProps extends BaseFieldProps {
  value: string
  onChange: (nextValue: string) => void
  placeholder?: string
  type?: 'text' | 'date'
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  disabled?: boolean
  readOnly?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}

interface TextAreaProps extends BaseFieldProps {
  value: string
  onChange: (nextValue: string) => void
  placeholder?: string
  disabled?: boolean
}

interface SelectInputProps extends BaseFieldProps {
  value: string
  options: readonly string[]
  onChange: (nextValue: string) => void
  placeholder?: string
  disabled?: boolean
}

interface CheckboxProps extends BaseFieldProps {
  checked: boolean
  onChange: (nextChecked: boolean) => void
  disabled?: boolean
}

export function TextInput({
  label,
  required,
  helperText,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  disabled,
  readOnly = false,
  onKeyDown,
}: TextInputProps) {
  return (
    <FieldWrapper label={label} required={required} helperText={helperText}>
      <FormInput
        className="field__control"
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
      />
    </FieldWrapper>
  )
}

export function TextAreaInput({
  label,
  required,
  helperText,
  value,
  onChange,
  placeholder,
  disabled,
}: TextAreaProps) {
  return (
    <FieldWrapper label={label} required={required} helperText={helperText}>
      <FormTextarea
        className="field__control field__control--textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </FieldWrapper>
  )
}

export function SelectInput({
  label,
  required,
  helperText,
  value,
  options,
  onChange,
  placeholder = '선택',
  disabled,
}: SelectInputProps) {
  return (
    <FieldWrapper label={label} required={required} helperText={helperText}>
      <FormSelect
        className="field__control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        options={[
          { value: '', label: placeholder },
          ...options.map((option) => ({ value: option, label: option })),
        ]}
      />
    </FieldWrapper>
  )
}

export function CheckboxInput({
  label,
  helperText,
  checked,
  onChange,
  disabled,
}: CheckboxProps) {
  return (
    <label className="checkbox-field">
      <FormInput
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="checkbox-field__content">
        <strong>{label}</strong>
        {helperText ? <small>{helperText}</small> : null}
      </span>
    </label>
  )
}
