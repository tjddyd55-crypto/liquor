import { useMemo } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import Modal from '../../../../components/ui/Modal'
import type { GovernmentProfileWorkspaceLayoutViewProps } from './governmentProfileWorkspaceViewProps'

function resolveMobileSheetTitle(pathname: string): string {
  if (pathname.includes('/consultations')) {
    return '상담 이력'
  }
  if (pathname.includes('/memos')) {
    return '메모'
  }
  if (pathname.includes('/progress')) {
    return '진행상황'
  }
  if (pathname.includes('/signatures')) {
    return '전자서명'
  }
  if (pathname.includes('/files')) {
    return '서류/파일'
  }
  return '상세'
}

export default function GovernmentProfileWorkspaceLayoutMobile(props: GovernmentProfileWorkspaceLayoutViewProps) {
  const outlet = useOutlet()
  const navigate = useNavigate()
  const location = useLocation()

  const isMobileDetailRoute = useMemo(
    () =>
      /^\/government\/my-applications\/[^/]+\/(?:files|consultations|memos|progress|signatures)(?:\/|$)/.test(
        location.pathname,
      ),
    [location.pathname],
  )

  const handleClose = () => {
    if (props.selectedProfileId) {
      navigate('/government/my-applications', { replace: true })
      return
    }
    navigate('/government/my-applications', { replace: true })
  }

  if (isMobileDetailRoute && outlet) {
    const title = resolveMobileSheetTitle(location.pathname)
    return (
      <Modal open onClose={handleClose} ariaLabel={title} panelClassName="workspace-mobile-outlet-modal">
        <div className="workspace-mobile-outlet-modal__header">
          <span className="workspace-mobile-outlet-modal__spacer" aria-hidden />
          <h2 className="workspace-mobile-outlet-modal__title">{title}</h2>
          <button type="button" className="workspace-mobile-outlet-modal__close" onClick={handleClose}>
            닫기
          </button>
        </div>
        <div className="workspace-mobile-outlet-modal__body">{outlet}</div>
      </Modal>
    )
  }

  return null
}
