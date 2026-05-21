import { forwardRef, type ChangeEventHandler, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value?: string | number | null
  onChange?: ChangeEventHandler<HTMLInputElement>
}

const FormInput = forwardRef<HTMLInputElement, Props>(function FormInput(
  {
    value,
    onChange,
    readOnly = false,
    disabled = false,
    className = '',
    ...props
  },
  ref,
) {
  const toneClass = readOnly || disabled ? 'field--readonly' : 'field--editable'
  const mergedClassName = ['form-input', toneClass, className].filter(Boolean).join(' ')
  const inputType = String(props.type ?? '').toLowerCase()
  const isFileInput = inputType === 'file'
  const isCheckbox = inputType === 'checkbox'
  const omitValueProp = isCheckbox || isFileInput
  const normalizedValue = value ?? ''

  return (
    <input
      ref={ref}
      {...props}
      {...(!omitValueProp ? { value: normalizedValue } : {})}
      onChange={onChange}
      readOnly={readOnly}
      disabled={disabled}
      className={mergedClassName}
    />
  )
})

export default FormInput
