import type { ReactNode } from 'react'
import { BaseDialog, type BaseDialogProps } from './BaseDialog'

type FormDialogProps = Omit<BaseDialogProps, 'children'> & {
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function FormDialog({ title, children, footer, ...dialogProps }: FormDialogProps) {
  return (
    <BaseDialog {...dialogProps} ariaLabel={title}>
      <h2 className="text-lg font-semibold text-[var(--text-main)]">{title}</h2>
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </BaseDialog>
  )
}
