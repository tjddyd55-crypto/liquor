import { forwardRef, type ChangeEventHandler, type TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value?: string | null
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
}

const FormTextarea = forwardRef<HTMLTextAreaElement, Props>(function FormTextarea(
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
  const mergedClassName = ['form-textarea', toneClass, className].filter(Boolean).join(' ')

  return (
    <textarea
      ref={ref}
      {...props}
      value={value ?? ''}
      onChange={onChange}
      readOnly={readOnly}
      disabled={disabled}
      className={mergedClassName}
    />
  )
})

export default FormTextarea
