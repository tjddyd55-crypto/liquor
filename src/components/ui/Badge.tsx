import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeVariant = 'success' | 'danger' | 'neutral'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  variant?: BadgeVariant
}

export function Badge({ children, className = '', variant = 'neutral', ...props }: BadgeProps) {
  const base = 'inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums'
  const skin =
    variant === 'success'
      ? 'badge-success'
      : variant === 'danger'
        ? 'badge-danger'
        : 'border border-border bg-elevated text-secondary'

  return (
    <span {...props} className={`${base} ${skin} ${className}`.trim()}>
      {children}
    </span>
  )
}
