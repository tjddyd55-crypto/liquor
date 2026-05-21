import { useCallback, useMemo } from 'react'
import { useBlocker, useLocation, useNavigate, type BlockerFunction } from 'react-router'
import { useAuth } from '../features/auth/AuthProvider'
import { getBackNavigationBlock, isCustomerCreateMode } from '../navigation/backNavigationPolicy'
import { ExitConfirmDialog } from './ExitConfirmDialog'

export function AppExitConfirm() {
  const { isAuthenticated } = useAuth()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const searchStr = search ?? ''

  const shouldBlockExit: BlockerFunction = useCallback(
    ({ currentLocation, historyAction }) => {
      if (!isAuthenticated || historyAction !== 'POP') {
        return false
      }
      const path = currentLocation.pathname
      const search = currentLocation.search ?? ''
      return getBackNavigationBlock(path, search).shouldBlock
    },
    [isAuthenticated],
  )
  const blocker = useBlocker(shouldBlockExit)

  const message = useMemo(() => {
    if (blocker.state !== 'blocked') {
      return ''
    }
    return getBackNavigationBlock(pathname, searchStr).message
  }, [blocker.state, pathname, searchStr])

  if (blocker.state !== 'blocked') {
    return null
  }

  return (
    <ExitConfirmDialog
      message={message}
      title="뒤로 이동 확인"
      onCancel={() => blocker.reset()}
      onConfirm={() => {
        // customer create mode: do not POP; route policy decides list navigation.
        if (isCustomerCreateMode(pathname, searchStr)) {
          blocker.reset()
          navigate('/customers')
          return
        }
        blocker.proceed()
      }}
    />
  )
}
