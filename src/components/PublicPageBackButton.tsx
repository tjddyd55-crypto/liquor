import { FormButton } from './form'
import { useLocation, useNavigate } from 'react-router-dom'
import { resolveBackRoute } from '../navigation/backNavigationPolicy'

const BACK_LABEL = '\u2190 \uB4A4\uB85C\uAC00\uAE30'

type PublicPageBackButtonProps = {
  className?: string
  /** When there is no history entry to go back to */
  fallbackTo?: string
}

export function PublicPageBackButton({
  className,
  fallbackTo = '/',
}: PublicPageBackButtonProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <FormButton
      htmlType="button"
      className={className}
      aria-label={BACK_LABEL}
      onClick={() => {
        const resolved = resolveBackRoute(location.pathname, location.search ?? '')
        if (resolved == null) {
          navigate(fallbackTo)
          return
        }
        if (resolved.kind === 'customer-create-exit') {
          navigate('/customers')
          return
        }
        navigate(resolved.path, resolved.replace ? { replace: true } : undefined)
      }}
    >
      {BACK_LABEL}
    </FormButton>
  )
}
