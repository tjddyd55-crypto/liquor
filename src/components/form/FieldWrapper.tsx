import type { ReactNode } from 'react'

type FieldWrapperProps = {
  label: string
  required?: boolean
  helperText?: string
  errorText?: string
  children: ReactNode
  className?: string
}

export default function FieldWrapper({
  label,
  required = false,
  helperText,
  errorText,
  children,
  className = '',
}: FieldWrapperProps) {
  return (
    <label className={['field', className].filter(Boolean).join(' ')}>
      <span className="field__label">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
      {errorText ? <span className="field__hint field__hint--error">{errorText}</span> : null}
      {!errorText && helperText ? <span className="field__hint">{helperText}</span> : null}
    </label>
  )
}
