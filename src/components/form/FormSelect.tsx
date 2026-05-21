import { forwardRef, type ChangeEventHandler, type SelectHTMLAttributes } from 'react'

export type FormSelectOption = {
  value: string
  label: string
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'> & {
  value?: string | null
  onChange?: ChangeEventHandler<HTMLSelectElement>
  options?: FormSelectOption[]
}

const FormSelect = forwardRef<HTMLSelectElement, Props>(function FormSelect(
  {
    value,
    onChange,
    options = [],
    disabled = false,
    className = '',
    ...props
  },
  ref,
) {
  const toneClass = disabled ? 'field--readonly' : 'field--editable'
  const mergedClassName = ['form-select', toneClass, className].filter(Boolean).join(' ')

  return (
    <select
      ref={ref}
      {...props}
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      className={mergedClassName}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
})

export default FormSelect
