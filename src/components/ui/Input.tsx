import type { InputHTMLAttributes } from 'react'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`rounded-md border border-[var(--border-default)] bg-[var(--bg-main)] px-3 py-2 text-[var(--text-primary)] ${className}`.trim()}
    />
  )
}
