type LoadingStateProps = {
  message?: string
  className?: string
}

export function LoadingState({ message = '불러오는 중…', className = '' }: LoadingStateProps) {
  return (
    <p className={['dashboard-empty', className].filter(Boolean).join(' ')} role="status" aria-busy="true">
      {message}
    </p>
  )
}
