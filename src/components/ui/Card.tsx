import type { HTMLAttributes, ReactNode } from 'react'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-[var(--text-primary)] ${className}`.trim()}
    >
      {children}
    </div>
  )
}
