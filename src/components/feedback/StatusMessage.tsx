type StatusMessageProps = {
  message?: string
  tone?: 'default' | 'error'
  className?: string
}

export function StatusMessage({ message, tone = 'default', className = '' }: StatusMessageProps) {
  if (!message) {
    return null
  }
  const toneClassName = tone === 'error' ? 'status status--error' : 'status'
  return (
    <p className={[toneClassName, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  )
}
